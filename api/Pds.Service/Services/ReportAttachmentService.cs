using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Security;

namespace Pds.Service.Services;

/// <summary>
/// Os arquivos que vem com um relato.
///
/// <para><b>Tudo passa pela API, menos os bytes.</b> Pedir a permissao, decidir se
/// aquela pessoa pode, aplicar os limites do projeto e gravar que o anexo existe
/// sao chamadas nossas. O arquivo vai do navegador direto para o armazenamento
/// porque passar por aqui custaria carregar megabytes na memoria do servidor duas
/// vezes, sem ganhar nada — e ele viaja sob regras que esta classe assinou.</para>
///
/// <para><b>O relato vem antes do arquivo.</b> So quem tem o protocolo e o token
/// pede permissao, e isso fecha a unica rota publica do sistema que gera custo em
/// dinheiro: sem essa porta, qualquer um assinaria um envio.</para>
///
/// <para><b>A assinatura garante o rotulo, e a confirmacao garante o conteudo.</b>
/// Sao duas coisas diferentes, e e por isso que existem dois passos nossos: nada
/// impede quem enviou de pos bytes de qualquer coisa num objeto marcado como
/// imagem, e so lendo o comeco do arquivo da para saber.</para>
/// </summary>
public class ReportAttachmentService : IReportAttachmentService
{
    /// <summary>
    /// Teto da miniatura, em bytes.
    ///
    /// <para>Ela e feita no navegador e serve para caber numa lista — 256 KB e
    /// muito mais do que uma miniatura precisa, e pouco o bastante para nao valer a
    /// pena usa-la como porta dos fundos para guardar arquivo grande.</para>
    /// </summary>
    private const long ThumbnailMaxBytes = 256 * 1024;

    /// <summary>
    /// Por quanto tempo depois do envio a pessoa ainda prende arquivo a ele — a
    /// criacao do relato, a resposta ou a reabertura.
    ///
    /// <para><b>Anexo tem hora: vai junto do envio, e nao depois.</b> O texto sai
    /// sem esperar os arquivos, que viajam em seguida; o prazo existe so para eles
    /// chegarem. Sem prazo, quem tem o link anexaria ao relato semanas depois, e o
    /// time veria o arquivo como se tivesse vindo com ele.</para>
    ///
    /// <para><b>E tolerancia de transporte, e nao regra do projeto</b> — por isso
    /// nao e configuracao. Quinze minutos cobrem pedir a permissao de cada arquivo
    /// numa conexao ruim e tentar de novo o que falhou; menos quebraria envio lento,
    /// mais reabriria o furo. A permissao assinada (MEDIA_STORAGE_UPLOAD_URL_MINUTES,
    /// 2 minutos por padrao) so diz ate quando o envio comeca, e precisa ficar bem
    /// abaixo deste prazo.</para>
    /// </summary>
    private static readonly TimeSpan AttachmentWindow = TimeSpan.FromMinutes(15);

    /// <summary>
    /// Por quanto tempo uma permissao pedida ainda pode ser confirmada.
    ///
    /// <para><b>Maior que o prazo do envio, de proposito.</b> O envio tem de comecar
    /// em minutos — a assinatura garante isso —, mas terminar depende da conexao: um
    /// arquivo grande numa rede ruim chega depois dos 15 minutos, e recusa-lo seria
    /// apagar o que chegou inteiro. O que este prazo barra e outra coisa: a permissao
    /// antiga, confirmada semanas depois.</para>
    /// </summary>
    private static readonly TimeSpan ConfirmWindow = TimeSpan.FromHours(1);

    /// <summary>A miniatura e sempre imagem. Nos videos antigos, ela e o quadro de capa.</summary>
    private const string ThumbnailContentType = "image/webp";

    /// <summary>
    /// Onde o navegador grava: a unica pasta que uma permissao de envio assina.
    ///
    /// <para><b>A permissao continua valendo depois de usada</b> — alguns minutos,
    /// reenviavel —, e reenvia-la trocaria um arquivo ja conferido. Por isso o
    /// arquivo aceito sai daqui, na confirmacao, para <see cref="MediaPrefix"/>, que
    /// nenhuma permissao alcanca.</para>
    ///
    /// <para><b>Tudo o que fica aqui e descartavel</b>: envio abandonado, envio
    /// recusado que falhou ao apagar, reenvio depois da confirmacao. O balde pode
    /// apagar esta pasta por idade sem risco para anexo nenhum.</para>
    ///
    /// <para><b>O projeto entra pelo identificador publico.</b> O nome aparece no
    /// endereco que o navegador usa, e o id interno nao sai da API.</para>
    /// </summary>
    private const string UploadPrefix = "uploads/";

    /// <summary>Onde mora o arquivo conferido. Nenhuma permissao de envio assina esta pasta.</summary>
    private const string MediaPrefix = "media/";

    private const string PendingNotFound = "Nao ha anexo pendente com esse identificador neste relato.";

    // A mesma frase no pedido, na confirmacao e na tela de configuracao: cada um
    // so acrescenta o que a pessoa faz em seguida. "Mais" diz que ja foi aceito.
    private const string VideoRefused = "Video nao e mais aceito como anexo.";

    private const string SemArmazenamento = "Nao ha armazenamento configurado nesta instalacao para guardar ou ler midia.";

    private readonly IUnitOfWork _unitOfWork;
    private readonly IMediaStorage _mediaStorage;

    public ReportAttachmentService(IUnitOfWork unitOfWork, IMediaStorage mediaStorage)
    {
        _unitOfWork = unitOfWork;
        _mediaStorage = mediaStorage;
    }

    public async Task<AttachmentUploadTicketViewModel> RequestUploadAsync(
        RequestAttachmentUploadDto dto,
        CancellationToken cancellationToken = default)
    {
        var report = await TrackedReportGate.RequireAsync(
            _unitOfWork, dto.TrackingCode, dto.Token, cancellationToken);

        // 409, e nao 500: nao e falha do servidor, e o estado da instalacao. A
        // ferramenta nem mostra o botao nesse caso — chegar aqui e chamar a rota na
        // mao, e a resposta precisa dizer o que ha, e nao "erro ao processar".
        if (!_mediaStorage.IsAvailable)
            throw new ConflictException(SemArmazenamento);

        var kind = dto.Kind ?? throw new ArgumentException("Informe de que tipo e o arquivo.");

        // **Antes de olhar o projeto, porque nao depende dele.** O video saiu do
        // produto por pesar demais no armazenamento e na entrega, e nenhuma
        // configuracao o traz de volta. Sem esta linha a recusa sairia do mesmo
        // jeito, mais adiante, como "esse tipo de arquivo" — e quem chama a rota na
        // mao nao saberia que e o video que deixou de existir.
        if (kind == MediaKindEnum.Video)
            throw new ArgumentException($"{VideoRefused} Envie uma imagem.");

        // Um arquivo vai com um envio so. Escolher um dos dois por conta propria
        // esconderia o erro de quem chamou, e o arquivo apareceria no lugar que ele
        // nao pediu.
        if (dto.ForReply == true && dto.ForReopen == true)
            throw new ArgumentException("Um arquivo vai com um envio so: a resposta ou a reabertura.");

        var contentType = (dto.ContentType ?? string.Empty).Trim().ToLowerInvariant();
        var tamanho = dto.SizeBytes ?? throw new ArgumentException("Informe o tamanho do arquivo.");

        var vigente = MediaSettingsDefaults.Resolve(
            await _unitOfWork.ProjectMediaSettings.FindByProjectWithoutSessionAsync(
                report.ProjectId, cancellationToken));

        if (!vigente.IsEnabled)
            throw new ArgumentException("Este projeto nao aceita anexo.");

        // O envio a que este arquivo pertence: a criacao do relato, a resposta que a
        // pessoa acabou de mandar, ou a reabertura que ela acabou de fazer. Cada um
        // com a sua cota, e cada um com o seu prazo. Prazo vencido e 409, e nao 400:
        // o pedido estava certo, o que fechou foi o envio — e a tela nao deve
        // oferecer tentar de novo.
        long? respostaId = null;
        long? reaberturaId = null;
        var desde = DateTime.UtcNow - AttachmentWindow;

        if (dto.ForReply == true)
        {
            if (!vigente.AllowsOnInfoRequest)
                throw new ArgumentException("Este projeto nao aceita anexo nas respostas.");

            var resposta = await _unitOfWork.ReportPublicComments.FindLatestFromReporterWithoutSessionAsync(
                               report.Id, desde, cancellationToken)
                           ?? throw new ConflictException(
                               $"Nao ha resposta sua dos ultimos {AttachmentWindow.TotalMinutes:0} minutos neste relato para prender o arquivo.");

            respostaId = resposta.Id;
        }
        else if (dto.ForReopen == true)
        {
            if (!vigente.AllowsOnReopen)
                throw new ArgumentException("Este projeto nao aceita anexo na reabertura.");

            // A reabertura e achada aqui, e nao informada de fora: ver ForReopen. O
            // motivo pode ter ficado em branco, e o arquivo vai do mesmo jeito — o
            // envio e a reabertura, e nao o texto dela.
            var reabertura = await _unitOfWork.ReportClosures.FindLatestReopenedWithoutSessionAsync(
                                 report.Id, desde, cancellationToken)
                             ?? throw new ConflictException(
                                 $"Nao ha reabertura sua neste relato nos ultimos {AttachmentWindow.TotalMinutes:0} minutos para prender o arquivo.");

            reaberturaId = reabertura.Id;
        }
        else if (report.CreatedAt < desde)
        {
            throw new ConflictException("O prazo para anexar arquivos a este relato terminou.");
        }

        var limite = vigente.For(kind);

        if (limite is null || !limite.IsEnabled)
            throw new ArgumentException("Este projeto nao aceita esse tipo de arquivo.");

        // O tipo e conferido antes de assinar para a recusa chegar antes do envio.
        // Quem escolheu um arquivo e esperou o envio terminar para ouvir "nao serve"
        // esperou a toa — e gastou a banda dele e o espaco do nosso balde.
        if (!MediaSignatures.IsAccepted(kind, contentType))
            throw new ArgumentException("Esse formato de arquivo nao e aceito.");

        if (tamanho < 1 || tamanho > limite.MaxBytes)
            throw new ArgumentException($"O arquivo passa do limite deste projeto, que e de {limite.MaxBytes / (1024 * 1024)} MB.");

        // Conferido aqui para recusar antes do envio, e nao para garantir o limite:
        // quem garante e a confirmacao, que conta de novo com a cota travada. 409,
        // como na confirmacao: o pedido esta certo, o envio e que ja esta cheio.
        if (await RoomRefusalAsync(report.Id, respostaId, reaberturaId, kind, vigente, limite, cancellationToken) is { } semVaga)
            throw new ConflictException(semVaga);

        // O nome no armazenamento e sorteado, e nunca derivado do que veio de fora:
        // um nome escolhido por quem envia permitiria escrever por cima do arquivo
        // de outra pessoa, ou sair da pasta onde os arquivos deste projeto moram. E
        // e um nome de ENVIO: o arquivo conferido vai para outro, na confirmacao —
        // ver UploadPrefix.
        var chave = $"{UploadPrefix}{report.Project.PublicId:N}/{Guid.NewGuid():N}";
        var comMiniatura = dto.WithThumbnail == true;

        var attachment = new ReportAttachment
        {
            ReportId = report.Id,
            PublicCommentId = respostaId,
            ReopenedClosureId = reaberturaId,
            Kind = kind,
            Status = AttachmentStatusEnum.Pending,
            ObjectKey = chave,
            ThumbnailObjectKey = comMiniatura ? $"{chave}-thumb" : null,
            ContentType = contentType,

            // O que o navegador disse, ate a confirmacao ler o numero de verdade.
            SizeBytes = tamanho,
            OriginalName = Trim(dto.FileName, ReportAttachment.MaxOriginalNameLength),
        };

        await _unitOfWork.ReportAttachments.AddAsync(attachment, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        var arquivo = await _mediaStorage.CreateUploadTicketAsync(
            chave, contentType, limite.MaxBytes, cancellationToken);

        SignedUploadViewModel? miniatura = null;

        if (comMiniatura)
        {
            var assinada = await _mediaStorage.CreateUploadTicketAsync(
                attachment.ThumbnailObjectKey!, ThumbnailContentType, ThumbnailMaxBytes, cancellationToken);

            miniatura = new SignedUploadViewModel(assinada.Url.ToString(), assinada.Fields, assinada.MaxBytes);
        }

        return new AttachmentUploadTicketViewModel(
            attachment.PublicId,
            new SignedUploadViewModel(arquivo.Url.ToString(), arquivo.Fields, arquivo.MaxBytes),
            miniatura,
            arquivo.ExpiresAt);
    }

    public async Task<ConfirmedAttachmentViewModel> ConfirmAsync(
        ConfirmAttachmentDto dto,
        CancellationToken cancellationToken = default)
    {
        var report = await TrackedReportGate.RequireAsync(
            _unitOfWork, dto.TrackingCode, dto.Token, cancellationToken);

        // O mesmo 409 do pedido de permissao. Sem isto, o armazenamento tirado entre a
        // permissao e a confirmacao estourava na leitura dos bytes, como erro 500.
        if (!_mediaStorage.IsAvailable)
            throw new ConflictException(SemArmazenamento);

        var publicId = dto.AttachmentPublicId
                       ?? throw new ArgumentException("Informe qual anexo esta sendo confirmado.");

        var attachment = await _unitOfWork.ReportAttachments.FindPendingWithoutSessionAsync(
                             publicId, report.Id, cancellationToken)
                         ?? throw new KeyNotFoundException(PendingNotFound);

        // O pendente tambem vence, contado de quando a permissao foi pedida: um envio
        // lento ainda termina, mas uma permissao antiga nao vira anexo semanas depois.
        // Vencido, nem se le o armazenamento — a resposta e o prazo, e nao "o arquivo
        // nao chegou".
        var vencido = attachment.CreatedAt < DateTime.UtcNow - ConfirmWindow;

        var objeto = vencido
            ? null
            : await _mediaStorage.InspectAsync(
                attachment.ObjectKey, MediaSignatures.LeadingBytes, cancellationToken);

        if (!vencido && objeto is null)
        {
            // Nada no nome de envio: ou o arquivo nunca chegou, ou outra confirmacao do
            // mesmo anexo terminou antes e ja o levou para o nome final. A segunda e o
            // clique duplo, e ouve o mesmo 404 que ouviria depois da trava — "nao
            // chegou" mentiria sobre um arquivo que acabou de ser aceito.
            _ = await _unitOfWork.ReportAttachments.FindPendingWithoutSessionAsync(
                    publicId, report.Id, cancellationToken)
                ?? throw new KeyNotFoundException(PendingNotFound);

            throw new ArgumentException("O arquivo nao chegou ao armazenamento.");
        }

        var vigente = MediaSettingsDefaults.Resolve(
            await _unitOfWork.ProjectMediaSettings.FindByProjectWithoutSessionAsync(
                report.ProjectId, cancellationToken));

        // Nulo quando o produto deixou de oferecer o tipo: e o video pendente, cuja
        // permissao foi assinada antes de ele sair. A recusa dele e da regra, e sai
        // la dentro, com a trava e o descarte.
        var limite = vigente.For(attachment.Kind);

        // O que ha de errado com o proprio arquivo e decidido aqui, com os bytes que o
        // armazenamento devolveu — mas o descarte so acontece la dentro, com a trava,
        // como qualquer outra escrita no anexo.
        //
        // **A conferencia que a assinatura nao faz.** Ela garante que o objeto seja
        // gravado com o rotulo que pedimos, e nada mais: quem obteve a permissao
        // pode ter posto bytes de qualquer coisa la dentro.
        //
        // **Tipo sem limite nao tem os bytes conferidos.** A lista de formatos so
        // conhece o que o produto aceita, e o video pendente sairia daqui como "nao
        // e do formato declarado" — um 400 que mente sobre um arquivo que e
        // exatamente o que disse ser. A recusa certa e a da regra, com 409.
        var arquivoRecusado =
            objeto is not null && limite is not null
                               && !MediaSignatures.Matches(attachment.ContentType, objeto.Leading)
                ? "O arquivo enviado nao e do formato que foi declarado."
                : null;

        // Os nomes de envio, guardados antes de qualquer mudanca: confirmado, o anexo
        // passa a apontar para o nome final, e estes saem do armazenamento.
        var chaveEnvio = attachment.ObjectKey;
        var miniaturaEnvio = attachment.ThumbnailObjectKey;

        var arquivoAceito = objeto is not null && limite is not null && arquivoRecusado is null;

        var miniatura = arquivoAceito && miniaturaEnvio is not null
            ? await ConferirMiniaturaAsync(miniaturaEnvio, cancellationToken)
            : null;

        // **O arquivo conferido sai do alcance da permissao antes de virar anexo.** A
        // permissao de envio continua valendo alguns minutos, e reenvia-la grava
        // outro conteudo no mesmo nome. A copia exige o ETag lido na conferencia:
        // trocado depois dela, o armazenamento recusa copiar, e o anexo e recusado
        // junto — o que entraria nao seria o que foi conferido.
        //
        // Fora da trava, como a leitura: e o passo que fala com o armazenamento. Uma
        // regra que recuse la dentro apaga as copias depois.
        //
        // **O nome final e guardado antes de copiar**, e nao so quando a copia volta:
        // a pessoa fechando a aba cancela a chamada, e o armazenamento pode ter gravado
        // a copia mesmo assim. E esse nome que o tratamento de falha abaixo apaga.
        string? destino = null;
        string? chaveFinal = null;
        string? miniaturaFinal = null;
        var copiaRecusada = false;

        // **A cota e contada de novo aqui, e e esta contagem que vale.** A do pedido
        // de permissao so conta os confirmados, entao quem pede cinco permissoes
        // antes de confirmar a primeira ve cinco vezes a mesma vaga. E conta com a
        // cota do relato travada: sem a trava, duas confirmacoes ao mesmo tempo
        // contariam juntas, e as duas entrariam.
        //
        // Os bytes foram lidos antes, fora da trava: ler o armazenamento e o passo
        // demorado, e segura-lo com a trava faria cada arquivo esperar o anterior.
        ConfirmRefusal? recusa;

        try
        {
            if (arquivoAceito)
            {
                destino = $"{MediaPrefix}{report.Project.PublicId:N}/{Guid.NewGuid():N}";

                if (await _mediaStorage.CopyAsync(chaveEnvio, destino, objeto!.ETag, cancellationToken))
                {
                    chaveFinal = destino;

                    // A miniatura trocada so perde a miniatura: o arquivo vale sem ela.
                    if (miniatura is not null
                        && await _mediaStorage.CopyAsync(
                            miniaturaEnvio!, $"{destino}-thumb", miniatura.ETag, cancellationToken))
                        miniaturaFinal = $"{destino}-thumb";
                }
                else
                {
                    copiaRecusada = true;
                }
            }

            recusa = await _unitOfWork.InTransactionAsync(async ct =>
            {
                await _unitOfWork.ReportAttachments.LockUploadQuotaAsync(report.Id, ct);

                // Lido de novo, ja com a trava: um clique duplo manda duas confirmacoes do
                // mesmo anexo, e a primeira pode ter terminado enquanto esta esperava. Sem
                // isto a segunda contaria o proprio anexo como ocupando a vaga, e o
                // descartaria — apagando um arquivo que acabou de ser aceito. O filtro roda
                // no banco: mesmo devolvendo o objeto ja carregado, a resposta diz o estado
                // de agora.
                _ = await _unitOfWork.ReportAttachments.FindPendingWithoutSessionAsync(publicId, report.Id, ct)
                    ?? throw new KeyNotFoundException(PendingNotFound);

                ConfirmRefusal? motivo = null;

                if (objeto is null)
                    motivo = new ConfirmRefusal("O prazo para anexar este arquivo terminou.", IsAboutTheFile: false);
                else if (arquivoRecusado is not null)
                    motivo = new ConfirmRefusal(arquivoRecusado, IsAboutTheFile: true);
                else if (copiaRecusada)
                    motivo = new ConfirmRefusal("O arquivo mudou depois de conferido.", IsAboutTheFile: true);
                else if ((limite is null
                             ? NoLongerOffered(attachment.Kind)
                             : RuleRefusal(vigente, limite, attachment, objeto.SizeBytes)
                               ?? await RoomRefusalAsync(
                                   report.Id, attachment.PublicCommentId, attachment.ReopenedClosureId,
                                   attachment.Kind, vigente, limite, ct))
                         is { } regra)
                    motivo = new ConfirmRefusal(regra, IsAboutTheFile: false);

                if (motivo is not null)
                {
                    // Devolve, e nao lanca: lancando, a transacao desfaria o descarte, e o
                    // anexo recusado continuaria pendente. O arquivo sai do armazenamento
                    // so depois, fora da trava.
                    await MarcarDescartadoAsync(attachment, ct);
                    return motivo;
                }

                // Aqui o arquivo foi lido e copiado: sem isso, o anexo ja saiu acima.
                attachment.Status = AttachmentStatusEnum.Confirmed;
                attachment.SizeBytes = objeto!.SizeBytes;
                attachment.ConfirmedAt = DateTime.UtcNow;
                attachment.ObjectKey = chaveFinal!;
                attachment.ThumbnailObjectKey = miniaturaFinal;

                _unitOfWork.ReportAttachments.Update(attachment);
                await _unitOfWork.CommitAsync(ct);
                return null;
            }, cancellationToken);
        }
        catch
        {
            // Outra confirmacao terminou antes, a copia falhou, a pessoa fechou a aba, ou
            // a gravacao falhou. As copias finais saem — menos quando o banco gravou a
            // confirmacao e so a resposta dele se perdeu: ai elas sao o anexo.
            await DescartarCopiasFinaisAsync(destino, miniaturaEnvio is not null, chaveEnvio, miniaturaEnvio);
            throw;
        }

        if (recusa is null)
        {
            // O que foi aceito ja mora no nome final. A copia de envio sobra, e sai.
            // Falhar aqui nao desfaz a confirmacao: o que sobrar fica na pasta de
            // envio, que o balde apaga por idade.
            try
            {
                await ApagarAsync(chaveEnvio, miniaturaEnvio);
            }
            catch
            {
                // Ver o paragrafo acima.
            }
        }
        else
        {
            await ApagarAsync(chaveFinal, miniaturaFinal);
            await ApagarObjetosAsync(attachment);

            // 400 quando o problema e o proprio arquivo, como sempre foi. 409 quando o
            // arquivo estava certo e o que mudou foi o envio — que encheu ou venceu — ou
            // a regra do projeto: o mesmo sentido do 409 de "sem armazenamento". Nos
            // dois a mensagem diz que ele foi apagado, para ninguem esperar que ele
            // apareca depois.
            var mensagem = $"{recusa.Reason} O arquivo foi descartado.";

            if (recusa.IsAboutTheFile)
                throw new ArgumentException(mensagem);

            throw new ConflictException(mensagem);
        }

        return new ConfirmedAttachmentViewModel(attachment.PublicId, attachment.Kind, attachment.SizeBytes);
    }

    public async Task<List<PanelAttachmentViewModel>> ListForPanelAsync(
        Guid projectPublicId,
        Guid reportPublicId,
        CancellationToken cancellationToken = default)
    {
        // **Autoriza antes de assinar, sempre.** O filtro global ja limita projeto e
        // relato a conta do painel: de outra conta, nada volta, e nenhuma assinatura
        // chega a ser gerada. Assinar primeiro e conferir depois seria entregar a
        // chave e perguntar em seguida.
        var project = await _unitOfWork.Projects.GetByPublicIdAsync(projectPublicId, cancellationToken)
                      ?? throw new KeyNotFoundException("Projeto nao encontrado.");

        var report = await _unitOfWork.Reports.GetByPublicIdWithContextsAsync(
                         project.Id, reportPublicId, cancellationToken)
                     ?? throw new KeyNotFoundException("Relato nao encontrado.");

        var anexos = await _unitOfWork.ReportAttachments.ListConfirmedAsync(report.Id, cancellationToken);
        var lista = new List<PanelAttachmentViewModel>(anexos.Count);

        foreach (var anexo in anexos)
        {
            var (arquivo, miniatura) = await AssinarLeituraAsync(anexo, cancellationToken);

            lista.Add(new PanelAttachmentViewModel(
                anexo.PublicId,
                anexo.Kind,
                arquivo.Url.ToString(),
                miniatura?.Url.ToString(),
                arquivo.ExpiresAt,
                anexo.SizeBytes,
                anexo.DurationSeconds,
                anexo.OriginalName,
                anexo.PublicCommentId is not null,
                anexo.PublicComment?.PublicId,
                anexo.ReopenedClosureId is not null,
                anexo.ReopenedClosure?.PublicId,
                anexo.CreatedAt));
        }

        return lista;
    }

    public async Task<List<PublicAttachmentViewModel>> ListForTrackingAsync(
        OpenReportTrackingDto dto,
        CancellationToken cancellationToken = default)
    {
        // A mesma porta das outras cinco rotas publicas do relato. Protocolo sem
        // token, token errado ou relato inexistente recebem a mesma recusa.
        var report = await TrackedReportGate.RequireAsync(
            _unitOfWork, dto.TrackingCode, dto.Token, cancellationToken);

        var anexos = await _unitOfWork.ReportAttachments.ListConfirmedWithoutSessionAsync(
            report.Id, cancellationToken);

        var lista = new List<PublicAttachmentViewModel>(anexos.Count);

        foreach (var anexo in anexos)
        {
            var (arquivo, miniatura) = await AssinarLeituraAsync(anexo, cancellationToken);

            // Campo a campo, e sem o nome original. Ver o comentario do tipo.
            lista.Add(new PublicAttachmentViewModel(
                anexo.PublicId,
                anexo.Kind,
                arquivo.Url.ToString(),
                miniatura?.Url.ToString(),
                arquivo.ExpiresAt,
                anexo.DurationSeconds,
                anexo.PublicComment?.PublicId,
                anexo.ReopenedClosure?.PublicId,
                anexo.CreatedAt));
        }

        return lista;
    }

    /// <summary>
    /// Assina a leitura do arquivo e da miniatura.
    ///
    /// <para><b>O video le por mais tempo, e a miniatura nunca.</b> O video e lido em
    /// pedacos enquanto toca, e cada pedaco confere a assinatura — com a validade
    /// da imagem, pausar quebraria a reproducao. A miniatura e uma imagem pequena
    /// que carrega de uma vez.</para>
    ///
    /// <para><b>Continua valendo sem video novo.</b> Os que foram confirmados antes
    /// de o video sair do produto seguem na lista, e precisam tocar do mesmo
    /// jeito.</para>
    /// </summary>
    private async Task<(SignedReadUrl Arquivo, SignedReadUrl? Miniatura)> AssinarLeituraAsync(
        ReportAttachment anexo,
        CancellationToken cancellationToken)
    {
        // O armazenamento foi tirado depois de os arquivos entrarem. Dizer isso e
        // melhor que devolver a lista vazia: vazia, o time acharia que o relato
        // nunca teve anexo.
        if (!_mediaStorage.IsAvailable)
            throw new ConflictException(SemArmazenamento);

        var arquivo = await _mediaStorage.CreateReadUrlAsync(
            anexo.ObjectKey, forPlayback: anexo.Kind == MediaKindEnum.Video, cancellationToken);

        var miniatura = anexo.ThumbnailObjectKey is { } thumb
            ? await _mediaStorage.CreateReadUrlAsync(thumb, forPlayback: false, cancellationToken)
            : null;

        return (arquivo, miniatura);
    }

    /// <summary>
    /// A miniatura tambem vem de fora, entao ela tambem e conferida.
    ///
    /// <para><b>Aceita-la sem olhar abriria pelo lado de tras a porta que o arquivo
    /// principal tem fechada</b> — e ela e o que o painel vai mostrar numa lista,
    /// logo e a que mais gente ve.</para>
    ///
    /// <para>Miniatura que nao chegou nao derruba o anexo: o arquivo esta la e vale.
    /// O que nao pode e guardar uma que nao e imagem.</para>
    ///
    /// <para>Devolve o que foi conferido — e o ETag que a copia para o nome final
    /// exige —, ou nulo quando nao ha miniatura que sirva. Nao mexe no anexo: quem
    /// decide o que ele guarda e a confirmacao, com a trava.</para>
    /// </summary>
    private async Task<MediaObjectInfo?> ConferirMiniaturaAsync(
        string thumbnailObjectKey,
        CancellationToken cancellationToken)
    {
        var miniatura = await _mediaStorage.InspectAsync(
            thumbnailObjectKey, MediaSignatures.LeadingBytes, cancellationToken);

        if (miniatura is null)
            return null;

        if (!MediaSignatures.Matches(ThumbnailContentType, miniatura.Leading))
        {
            await _mediaStorage.DeleteAsync(thumbnailObjectKey, cancellationToken);
            return null;
        }

        return miniatura;
    }

    /// <summary>
    /// Tira do banco o anexo recusado.
    ///
    /// <para><b>So e chamado com a cota travada, depois de reler o anexo.</b> A
    /// gravacao reescreve a linha inteira com o que estava na memoria; fora da
    /// trava, ela poderia desfazer uma confirmacao do mesmo anexo que terminou no
    /// meio do caminho.</para>
    ///
    /// <para>Apaga logicamente, como o resto do produto: a linha fica dizendo que
    /// houve uma tentativa recusada, e qual arquivo ela deixou no armazenamento.</para>
    /// </summary>
    private async Task MarcarDescartadoAsync(ReportAttachment attachment, CancellationToken cancellationToken)
    {
        await _unitOfWork.ReportAttachments.SoftDeleteAsync(attachment, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Apaga do armazenamento o arquivo e a miniatura de um anexo ja descartado no
    /// banco.
    ///
    /// <para><b>Sem isto, cada recusa deixaria um arquivo guardado para sempre.</b>
    /// A conta cresce com o que foi aceito; ela nao pode crescer tambem com o que
    /// foi recusado — e nele a exclusao precisa ser fisica.</para>
    ///
    /// <para><b>Depois do banco, e fora da trava.</b> Na ordem inversa, uma queda
    /// entre os dois passos — a aba fechada no meio — deixaria o anexo pendente
    /// apontando para um arquivo que ja saiu. Nesta ordem, o pior caso e um arquivo
    /// sobrando no balde, com a linha apagada dizendo qual e. E sem o token da
    /// requisicao pelo mesmo motivo: o descarte ja foi decidido e gravado, e quem
    /// fechou a aba nao desfaz a limpeza.</para>
    /// </summary>
    /// <summary>
    /// Apaga as copias finais de uma confirmacao que falhou no meio.
    ///
    /// <para><b>Apaga pelo nome tentado, e nao so pelo que a copia confirmou</b>: a
    /// chamada cancelada pode ter sido gravada do lado de la. Apagar o que nao existe
    /// nao e erro.</para>
    ///
    /// <para><b>Menos quando um anexo ja aponta para elas.</b> O commit pode ter
    /// entrado e a resposta do banco se perdido — e ai elas sao o arquivo de um anexo
    /// confirmado, e quem sobra sao as copias de envio. Sem conseguir perguntar ao
    /// banco, nada e apagado: uma copia a mais custa armazenamento, e uma a menos
    /// custa o arquivo.</para>
    /// </summary>
    private async Task DescartarCopiasFinaisAsync(
        string? destino,
        bool comMiniatura,
        string chaveEnvio,
        string? miniaturaEnvio)
    {
        if (destino is null)
            return;

        bool emUso;

        try
        {
            emUso = await _unitOfWork.ReportAttachments.IsObjectKeyInUseWithoutSessionAsync(
                destino, CancellationToken.None);
        }
        catch
        {
            return;
        }

        try
        {
            if (emUso)
                await ApagarAsync(chaveEnvio, miniaturaEnvio);
            else
                await ApagarAsync(destino, comMiniatura ? $"{destino}-thumb" : null);
        }
        catch
        {
            // A falha que importa e a de cima, que segue para quem chamou. O que sobrar
            // em media/ e raro e fica; o que sobrar em uploads/ expira.
        }
    }

    private Task ApagarObjetosAsync(ReportAttachment attachment)
        => ApagarAsync(attachment.ObjectKey, attachment.ThumbnailObjectKey);

    /// <summary>
    /// Apaga do armazenamento um arquivo e a miniatura dele, os que houver.
    ///
    /// <para>Sem o token da requisicao, pelo motivo de <see cref="ApagarObjetosAsync"/>:
    /// quando se chega aqui, o que apagar ja foi decidido.</para>
    /// </summary>
    private async Task ApagarAsync(string? objectKey, string? thumbnailObjectKey)
    {
        if (objectKey is not null)
            await _mediaStorage.DeleteAsync(objectKey, CancellationToken.None);

        if (thumbnailObjectKey is not null)
            await _mediaStorage.DeleteAsync(thumbnailObjectKey, CancellationToken.None);
    }

    /// <summary>
    /// Ha vaga para mais um arquivo deste tipo neste envio — a criacao do relato, uma
    /// resposta ou uma reabertura. Cada envio tem a sua cota.
    ///
    /// <para><b>Os dois limites sao conferidos, e nao um deles.</b> Com um tipo so,
    /// vence o menor; com mais de um, so o do tipo deixaria a soma passar do total
    /// que o projeto quer, e so o total deixaria um tipo ocupar a cota inteira.</para>
    ///
    /// <para><b>So os confirmados contam.</b> O que ficou pendente e permissao que
    /// alguem pediu e nao usou — faze-lo ocupar vaga deixaria quem tentou tres vezes
    /// e falhou sem conseguir anexar nada.</para>
    ///
    /// <para>Devolve o motivo da recusa, ou nulo quando ha vaga. Quem chama decide
    /// o que fazer com ele: o pedido de permissao recusa, a confirmacao descarta o
    /// arquivo antes de recusar.</para>
    /// </summary>
    private async Task<string?> RoomRefusalAsync(
        long reportId,
        long? respostaId,
        long? reaberturaId,
        MediaKindEnum kind,
        EffectiveMediaSettings vigente,
        EffectiveMediaKind limite,
        CancellationToken cancellationToken)
    {
        var (total, doTipo) = await _unitOfWork.ReportAttachments.CountConfirmedWithoutSessionAsync(
            reportId, respostaId, reaberturaId, kind, cancellationToken);

        var onde = respostaId is not null
            ? "Esta resposta"
            : reaberturaId is not null
                ? "Esta reabertura"
                : "Este relato";

        if (total >= vigente.MaxFilesPerReport)
            return $"{onde} ja tem o maximo de arquivos que o projeto permite, que e {vigente.MaxFilesPerReport}.";

        if (doTipo >= limite.MaxCount)
            return $"{onde} ja tem o maximo desse tipo que o projeto permite, que e {limite.MaxCount}.";

        return null;
    }

    /// <summary>
    /// Por que a confirmacao recusou, e se a culpa e do proprio arquivo (400) ou do
    /// envio e da regra do projeto (409).
    /// </summary>
    private sealed record ConfirmRefusal(string Reason, bool IsAboutTheFile);

    /// <summary>
    /// A regra do projeto ainda aceita este anexo.
    ///
    /// <para><b>Ela pode ter mudado entre a permissao e a confirmacao.</b> O dono
    /// que desliga a midia, um tipo, ou o anexo na resposta ou na reabertura espera
    /// que nada mais entre dali em diante — e uma permissao assinada um minuto antes
    /// nao pode valer mais do que a decisao dele.</para>
    /// </summary>
    private static string? RuleRefusal(
        EffectiveMediaSettings vigente,
        EffectiveMediaKind limite,
        ReportAttachment attachment,
        long tamanhoReal)
    {
        if (!vigente.IsEnabled)
            return "Este projeto deixou de aceitar anexo.";

        if (!limite.IsEnabled)
            return "Este projeto deixou de aceitar esse tipo de arquivo.";

        if (attachment.PublicCommentId is not null && !vigente.AllowsOnInfoRequest)
            return "Este projeto deixou de aceitar anexo nas respostas.";

        if (attachment.ReopenedClosureId is not null && !vigente.AllowsOnReopen)
            return "Este projeto deixou de aceitar anexo na reabertura.";

        // O tamanho e o real, lido do armazenamento. Ele ja recusa o que passa do teto
        // assinado, entao isto so pega o limite que baixou depois da permissao — e e a
        // segunda tranca: se um dia a assinatura sair sem o teto, o furo nao chega a
        // virar arquivo guardado.
        if (tamanhoReal > limite.MaxBytes)
            return $"O arquivo passa do limite deste projeto, que e de {limite.MaxBytes / (1024 * 1024)} MB.";

        return null;
    }

    /// <summary>
    /// A recusa do tipo que o produto deixou de oferecer, e que por isso nao tem
    /// limite nenhum a conferir.
    ///
    /// <para>Hoje e so o video, e a mensagem diz o nome dele: "esse tipo de arquivo"
    /// faria quem mandou achar que o projeto e que mudou de ideia.</para>
    /// </summary>
    private static string NoLongerOffered(MediaKindEnum kind)
        => kind == MediaKindEnum.Video
            ? VideoRefused
            : "Esse tipo de arquivo deixou de ser aceito.";

    /// <summary>Corta o que veio de fora no tamanho da coluna, em vez de derrubar a gravacao.</summary>
    private static string? Trim(string? value, int maxLength)
    {
        var limpo = (value ?? string.Empty).Trim();

        if (limpo.Length == 0)
            return null;

        return limpo.Length <= maxLength ? limpo : limpo[..maxLength];
    }
}
