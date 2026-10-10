using System.Globalization;
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
    ///
    /// <para><b>Conta do texto, ou do ultimo arquivo do mesmo envio</b> — pedido,
    /// confirmado ou descartado. Os arquivos sobem um de cada vez, e cada um pede a
    /// permissao quando o anterior termina: com dez arquivos grandes numa conexao
    /// lenta, os ultimos pedem depois dos quinze minutos, e seriam recusados sem a
    /// pessoa ter errado nada. Um envio que continua chegando continua aberto — ate
    /// <see cref="SendingCeiling"/>.</para>
    /// </summary>
    private static readonly TimeSpan AttachmentWindow = TimeSpan.FromMinutes(15);

    /// <summary>
    /// Ate quando um envio que continua chegando aceita arquivo, contado do texto.
    ///
    /// <para><b>O teto que o prazo andando precisa ter.</b> Sem ele, pedir uma
    /// permissao a cada catorze minutos manteria o envio aberto para sempre, e o
    /// arquivo de semanas depois entraria como se tivesse vindo com o texto. Uma hora
    /// e o prazo da confirmacao (<see cref="ConfirmWindow"/>): cabe o maior envio que
    /// a tela de Anexos permite numa conexao lenta.</para>
    /// </summary>
    private static readonly TimeSpan SendingCeiling = TimeSpan.FromHours(1);

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

    /// <summary>
    /// Os formatos da miniatura. <b>WebP e o padrao</b>, e o mais leve; <b>JPEG e o de
    /// quem nao gera WebP</b> — o Safari, inclusive o do iPhone, que sem ele mandaria
    /// todo arquivo sem miniatura. Nos videos antigos, ela e o quadro de capa.
    /// </summary>
    private static readonly string[] ThumbnailContentTypes = ["image/webp", "image/jpeg"];

    /// <summary>O formato da miniatura quando o pedido nao diz — o do quadro antigo.</summary>
    private const string DefaultThumbnailContentType = "image/webp";

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

    // O zip saiu do catalogo, e a frase diz por que — para ninguem achar que e o
    // projeto. Como a do video, a mesma nos tres lugares.
    private const string ZipRefused = "Zip nao e mais aceito como anexo: ele pode trazer qualquer coisa dentro.";

    private const string SemArmazenamento = "Nao ha armazenamento configurado nesta instalacao para guardar ou ler midia.";

    private readonly IUnitOfWork _unitOfWork;
    private readonly IMediaStorage _mediaStorage;

    /// <summary>O anexo confirmado muda o contador da frente do card e o card aberto dos outros.</summary>
    private readonly IWorkNotifier _notifier;

    public ReportAttachmentService(IUnitOfWork unitOfWork, IMediaStorage mediaStorage, IWorkNotifier notifier)
    {
        _unitOfWork = unitOfWork;
        _mediaStorage = mediaStorage;
        _notifier = notifier;
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

        // **Duas recusas, e a tela trata cada uma de um jeito.** 400 fica para o pedido
        // mal formado — o que so um cliente com defeito manda, e que ele mesmo corrige.
        // Tudo o que a regra do projeto, o produto ou o proprio arquivo recusam e 409: o
        // pedido estava certo, e mandar o mesmo arquivo de novo levaria a mesma
        // resposta. E a tela, com o 409, diz "nao enviado" com o motivo, em vez de
        // oferecer um "Tentar de novo" que nunca daria certo.
        var kind = dto.Kind ?? throw new ArgumentException("Informe de que tipo e o arquivo.");

        // **Antes de olhar o projeto, porque nao depende dele.** O video saiu do
        // produto por pesar demais no armazenamento e na entrega, e nenhuma
        // configuracao o traz de volta. Sem esta linha a recusa sairia do mesmo
        // jeito, mais adiante, como "esse tipo de arquivo" — e quem chama a rota na
        // mao nao saberia que e o video que deixou de existir.
        if (kind == MediaKindEnum.Video)
            throw new ConflictException($"{VideoRefused} Envie uma imagem.");

        // Um arquivo vai com um envio so. Escolher um dos dois por conta propria
        // esconderia o erro de quem chamou, e o arquivo apareceria no lugar que ele
        // nao pediu.
        if (dto.ForReply == true && dto.ForReopen == true)
            throw new ArgumentException("Um arquivo vai com um envio so: a resposta ou a reabertura.");

        var contentType = (dto.ContentType ?? string.Empty).Trim().ToLowerInvariant();
        var tamanho = dto.SizeBytes ?? throw new ArgumentException("Informe o tamanho do arquivo.");

        // O formato da miniatura e do navegador, e nao da regra do projeto: um que nao
        // esteja na lista so vem de cliente com defeito. 400, e nao 409.
        var tipoMiniatura = string.IsNullOrWhiteSpace(dto.ThumbnailContentType)
            ? DefaultThumbnailContentType
            : dto.ThumbnailContentType.Trim().ToLowerInvariant();

        if (dto.WithThumbnail == true && !ThumbnailContentTypes.Contains(tipoMiniatura))
            throw new ArgumentException("A miniatura vai em WebP ou JPEG.");

        // Arquivo nao tem miniatura: nao ha o que desenhar de um PDF ou de um log, e a
        // permissao de uma seria um endereco a mais para gravar o que ninguem confere.
        if (kind == MediaKindEnum.File && dto.WithThumbnail == true)
            throw new ArgumentException("Arquivo nao tem miniatura.");

        // O tamanho e a posicao sao do quadro, e nao da regra do projeto: fora da lista
        // so vem de cliente com defeito. 400, como o formato da miniatura. O numero que
        // nao e de nenhum tamanho passa pela leitura do JSON — por isso o IsDefined.
        var exibicao = dto.DisplaySize ?? ReportAttachment.DefaultDisplaySize;

        if (!Enum.IsDefined(exibicao))
            throw new ArgumentException("O tamanho da imagem nao e um dos que o relato mostra.");

        var posicao = dto.DisplayOrder ?? 0;

        // A posicao conta dentro da categoria: as imagens de 0 em diante, e os arquivos
        // tambem. O teto e o de quantos de um tipo cabem num envio.
        if (posicao < 0 || posicao >= ProjectMediaKind.MaxCountCeiling)
            throw new ArgumentException(
                $"A posicao no envio vai de 0 a {ProjectMediaKind.MaxCountCeiling - 1}.");

        // **A extensao conferida e a do nome que fica gravado**, ja limpo e cortado — e
        // nao a do nome que veio: conferir antes do corte deixaria gravar um nome que
        // termina em outra extensao, e o painel baixaria com ela. Ver NomeOriginal.
        var nomeOriginal = NomeOriginal(dto.FileName);

        // **O zip, antes do projeto**, como o video: saiu do produto, e nenhuma
        // configuracao o traz de volta. Mais adiante ele cairia em "esse formato de
        // arquivo" — ou, com o arquivo desligado, em "esse tipo de arquivo" —, e quem
        // mandou nao saberia que foi o zip que deixou de ser aceito.
        if (kind == MediaKindEnum.File && FileFormats.IsRetired(nomeOriginal, contentType))
            throw new ConflictException($"{ZipRefused} Envie os arquivos sem compactar.");

        var vigente = MediaSettingsDefaults.Resolve(
            await _unitOfWork.ProjectMediaSettings.FindByProjectWithoutSessionAsync(
                report.ProjectId, cancellationToken));

        if (!vigente.IsEnabled)
            throw new ConflictException("Este projeto nao aceita anexo.");

        // O envio a que este arquivo pertence: a criacao do relato, a resposta que a
        // pessoa acabou de mandar, ou a reabertura que ela acabou de fazer. Cada um
        // com a sua cota, e cada um com o seu prazo. Prazo vencido e 409, como a regra:
        // o pedido estava certo, o que fechou foi o envio.
        long? respostaId = null;
        long? reaberturaId = null;
        var agora = DateTime.UtcNow;
        var desde = agora - AttachmentWindow;

        // O envio e procurado ate o teto, e nao so no prazo: ele pode estar aberto
        // pelos arquivos que continuam chegando. Ver AttachmentWindow.
        var teto = agora - SendingCeiling;

        if (dto.ForReply == true)
        {
            if (!vigente.AllowsOnInfoRequest)
                throw new ConflictException("Este projeto nao aceita anexo nas respostas.");

            var resposta = await _unitOfWork.ReportPublicComments.FindLatestFromReporterWithoutSessionAsync(
                report.Id, teto, cancellationToken);

            if (resposta is null
                || !await EnvioAbertoAsync(report.Id, resposta.Id, null, resposta.CreatedAt, desde, cancellationToken))
                throw new ConflictException(
                    $"Nao ha resposta sua dos ultimos {AttachmentWindow.TotalMinutes:0} minutos neste relato para prender o arquivo.");

            respostaId = resposta.Id;
        }
        else if (dto.ForReopen == true)
        {
            if (!vigente.AllowsOnReopen)
                throw new ConflictException("Este projeto nao aceita anexo na reabertura.");

            // A reabertura e achada aqui, e nao informada de fora: ver ForReopen. O
            // motivo pode ter ficado em branco, e o arquivo vai do mesmo jeito — o
            // envio e a reabertura, e nao o texto dela.
            var reabertura = await _unitOfWork.ReportClosures.FindLatestReopenedWithoutSessionAsync(
                report.Id, teto, cancellationToken);

            if (reabertura is null
                || !await EnvioAbertoAsync(report.Id, null, reabertura.Id, reabertura.ReopenedAt!.Value, desde, cancellationToken))
                throw new ConflictException(
                    $"Nao ha reabertura sua neste relato nos ultimos {AttachmentWindow.TotalMinutes:0} minutos para prender o arquivo.");

            reaberturaId = reabertura.Id;
        }
        else if (report.CreatedAt < teto
                 || !await EnvioAbertoAsync(report.Id, null, null, report.CreatedAt, desde, cancellationToken))
        {
            throw new ConflictException("O prazo para anexar arquivos a este relato terminou.");
        }

        var limite = vigente.For(kind);

        if (limite is null || !limite.IsEnabled)
            throw new ConflictException("Este projeto nao aceita esse tipo de arquivo.");

        // O tipo e conferido antes de assinar para a recusa chegar antes do envio.
        // Quem escolheu um arquivo e esperou o envio terminar para ouvir "nao serve"
        // esperou a toa — e gastou a banda dele e o espaco do nosso balde.
        //
        // **O arquivo e reconhecido pela extensao, com o tipo que o catalogo da a ela** —
        // e so entre os formatos que o dono marcou. Extensao e tipo que nao casam sao
        // recusados como formato: o quadro manda sempre o tipo do catalogo, e so outro
        // cliente mandaria diferente.
        var aceito = kind == MediaKindEnum.File
            ? FileFormats.Accepted(limite.Formats, nomeOriginal, contentType) is not null
            : MediaSignatures.IsAccepted(kind, contentType);

        if (!aceito)
            throw new ConflictException("Esse formato de arquivo nao e aceito.");

        // Cada um com a sua frase: "passa do limite" dita de um arquivo vazio mandaria
        // a pessoa procurar um arquivo menor.
        if (tamanho < 1)
            throw new ConflictException("O arquivo esta vazio.");

        if (tamanho > limite.MaxBytes)
            throw new ConflictException($"O arquivo passa do limite deste projeto, que e de {FormatLimit(limite.MaxBytes)}.");

        // Conferido aqui para recusar antes do envio, e nao para garantir o limite:
        // quem garante e a confirmacao, que conta de novo com a cota travada. 409,
        // como na confirmacao: o pedido esta certo, o envio e que ja esta cheio.
        if (await RoomRefusalAsync(report.Id, respostaId, reaberturaId, kind, limite, cancellationToken) is { } semVaga)
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
            OriginalName = nomeOriginal,
            DisplaySize = exibicao,
            DisplayOrder = posicao,
        };

        await _unitOfWork.ReportAttachments.AddAsync(attachment, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);

        // O arquivo que nao e imagem nasce so para baixar. Ver AssinarLeituraAsync.
        var arquivo = await _mediaStorage.CreateUploadTicketAsync(
            chave, contentType, limite.MaxBytes,
            downloadOnly: kind == MediaKindEnum.File,
            cancellationToken: cancellationToken);

        SignedUploadViewModel? miniatura = null;

        if (comMiniatura)
        {
            var assinada = await _mediaStorage.CreateUploadTicketAsync(
                attachment.ThumbnailObjectKey!, tipoMiniatura, ThumbnailMaxBytes,
                cancellationToken: cancellationToken);

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
            publicId, report.Id, cancellationToken);

        // **Confirmar o que ja foi confirmado responde o que aconteceu.** A resposta da
        // primeira confirmacao pode se perder na rede de quem relata, e a tela tenta de
        // novo: sem isto, ouviria que o arquivo nao existe — e recomecaria o envio,
        // pondo o mesmo print duas vezes no relato.
        if (attachment is null)
            return await JaConfirmadoAsync(publicId, report.Id, cancellationToken)
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
            // clique duplo, e ouve o que ouviria depois dela — "nao chegou" mentiria
            // sobre um arquivo que acabou de ser aceito.
            if (await _unitOfWork.ReportAttachments.FindPendingWithoutSessionAsync(
                    publicId, report.Id, cancellationToken) is null)
                return await JaConfirmadoAsync(publicId, report.Id, cancellationToken)
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
        // e de um formato aceito" — uma recusa que mente sobre um arquivo que e
        // exatamente o que disse ser. A recusa certa e a da regra.
        //
        // A frase fala do conteudo, e nao de uma "declaracao": quem relata so escolheu
        // um arquivo, e quem disse o tipo foi o navegador, pela extensao.
        //
        // **O tipo gravado tambem e conferido**, e nao so o declarado. Quem garante que o
        // armazenamento gravou o tipo pedido e a condicao da politica de envio — e o
        // produto nao quer depender de todo provedor aplica-la: um que nao aplique
        // gravaria uma imagem como pagina, servida como pagina.
        //
        // **O formato que saiu do catalogo tambem nao e conferido**, pelo mesmo motivo: o
        // zip pendente, pedido antes de sair, e recusado pela regra — e nem chega a ser
        // copiado para o nome final.
        var foraDoCatalogo = attachment.Kind == MediaKindEnum.File
                             && FileFormats.IsRetiredContentType(attachment.ContentType);

        var arquivoRecusado =
            objeto is not null && limite is not null && !foraDoCatalogo
                               && (!MesmoTipo(objeto.ContentType, attachment.ContentType)
                                   || !MediaSignatures.Matches(attachment.ContentType, objeto.Leading))
                ? "O conteudo do arquivo nao e de um formato aceito."
                : null;

        // Os nomes de envio, guardados antes de qualquer mudanca: confirmado, o anexo
        // passa a apontar para o nome final, e estes saem do armazenamento.
        var chaveEnvio = attachment.ObjectKey;
        var miniaturaEnvio = attachment.ThumbnailObjectKey;

        var arquivoAceito = objeto is not null && limite is not null && !foraDoCatalogo && arquivoRecusado is null;

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
                    motivo = new ConfirmRefusal("O prazo para anexar este arquivo terminou.", Retryable: false);
                else if (arquivoRecusado is not null)
                    motivo = new ConfirmRefusal(arquivoRecusado, Retryable: false);
                else if (copiaRecusada)
                    motivo = new ConfirmRefusal("O arquivo mudou depois de conferido.", Retryable: true);
                else if ((limite is null
                             ? NoLongerOffered(attachment.Kind)
                             : foraDoCatalogo
                                 ? ZipRefused
                                 : RuleRefusal(vigente, limite, attachment, objeto.SizeBytes)
                               ?? await RoomRefusalAsync(
                                   report.Id, attachment.PublicCommentId, attachment.ReopenedClosureId,
                                   attachment.Kind, limite, ct))
                         is { } regra)
                    motivo = new ConfirmRefusal(regra, Retryable: false);

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
        catch (Exception falha)
        {
            // Outra confirmacao terminou antes, a copia falhou, a pessoa fechou a aba, ou
            // a gravacao falhou. As copias finais saem — menos quando o banco gravou a
            // confirmacao e so a resposta dele se perdeu: ai elas sao o anexo.
            //
            // **E ai a resposta e o sucesso.** O banco disse que o anexo esta confirmado
            // e aponta para elas; responder erro faria a tela oferecer "Tentar de novo"
            // para um arquivo que o time ja ve.
            if (await DescartarCopiasFinaisAsync(destino, miniaturaEnvio is not null, chaveEnvio, miniaturaEnvio))
                return new ConfirmedAttachmentViewModel(attachment.PublicId, attachment.Kind, objeto!.SizeBytes);

            // Outra confirmacao do mesmo anexo terminou enquanto esta esperava a trava:
            // o clique duplo. As copias desta ja sairam acima; a resposta e a daquela.
            if (falha is KeyNotFoundException
                && await JaConfirmadoAsync(publicId, report.Id, CancellationToken.None) is { } confirmado)
                return confirmado;

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
            // **A recusa ja foi gravada, e e ela que a pessoa precisa ouvir.** Uma falha
            // do armazenamento aqui trocaria o motivo por "erro ao processar" — e a tela
            // ofereceria tentar de novo o que foi recusado. Cada copia sai por conta
            // propria: a primeira que falha nao segura as outras. O que sobrar em
            // uploads/ expira; o que sobrar em media/ e raro, e fica.
            await ApagarSemFalharAsync(chaveFinal);
            await ApagarSemFalharAsync(miniaturaFinal);
            await ApagarSemFalharAsync(attachment.ObjectKey);
            await ApagarSemFalharAsync(attachment.ThumbnailObjectKey);

            // 409 quando mandar o mesmo arquivo de novo levaria a mesma recusa: o envio
            // encheu ou venceu, a regra do projeto mudou, ou o conteudo nao e de um
            // formato aceito — o mesmo sentido do 409 no pedido. 400 so quando subir de
            // novo resolve: o arquivo trocado no meio da conferencia. Nos dois a mensagem
            // diz que ele foi apagado, para ninguem esperar que ele apareca depois.
            var mensagem = $"{recusa.Reason} O arquivo foi descartado.";

            if (recusa.Retryable)
                throw new ArgumentException(mensagem);

            throw new ConflictException(mensagem);
        }

        await _notifier.CardChangedAsync(report.PublicId);

        return new ConfirmedAttachmentViewModel(attachment.PublicId, attachment.Kind, attachment.SizeBytes);
    }

    public async Task<List<PanelAttachmentViewModel>> ListForPanelAsync(
        Guid projectPublicId,
        Guid reportPublicId,
        CancellationToken cancellationToken = default)
    {
        // **Autoriza antes de assinar, sempre.** O filtro global ja limita projeto e
        // relato aos projetos que a pessoa enxerga: de outro projeto, nada volta, e
        // nenhuma assinatura chega a ser gerada. Assinar primeiro e conferir depois seria entregar a
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
            var (arquivo, miniatura, vence) = await AssinarLeituraAsync(anexo, doPainel: true, cancellationToken);

            lista.Add(new PanelAttachmentViewModel(
                anexo.PublicId,
                anexo.Kind,
                anexo.DisplaySize,
                anexo.ContentType,
                arquivo.Url.ToString(),
                miniatura?.Url.ToString(),
                vence,
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

        return await ListarParaQuemRelatouAsync(report, cancellationToken);
    }

    public async Task<List<PublicAttachmentViewModel>> ListForReporterCodeAsync(
        OpenByReporterCodeDto dto,
        CancellationToken cancellationToken = default)
    {
        // A porta da abertura pelo codigo, com a mesma recusa unica. So le: ver
        // ReporterCodeGate.
        var report = await ReporterCodeGate.RequireAsync(
            _unitOfWork, dto.Key, dto.Code, dto.TrackingCode, cancellationToken);

        return await ListarParaQuemRelatouAsync(report, cancellationToken);
    }

    /// <summary>
    /// Os arquivos confirmados do relato, como quem o escreveu os ve — pelo link ou
    /// pelo codigo, a mesma lista.
    /// </summary>
    private async Task<List<PublicAttachmentViewModel>> ListarParaQuemRelatouAsync(
        Report report,
        CancellationToken cancellationToken)
    {
        var anexos = await _unitOfWork.ReportAttachments.ListConfirmedWithoutSessionAsync(
            report.Id, cancellationToken);

        var lista = new List<PublicAttachmentViewModel>(anexos.Count);

        foreach (var anexo in anexos)
        {
            var (arquivo, miniatura, vence) = await AssinarLeituraAsync(anexo, doPainel: false, cancellationToken);

            // Campo a campo, e sem o nome original. Ver o comentario do tipo.
            lista.Add(new PublicAttachmentViewModel(
                anexo.PublicId,
                anexo.Kind,
                anexo.DisplaySize,
                anexo.ContentType,
                anexo.SizeBytes,
                arquivo.Url.ToString(),
                miniatura?.Url.ToString(),
                vence,
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
    ///
    /// <para><b>O vencimento que sai e o primeiro dos dois.</b> A tela renova a lista
    /// pouco antes dele: com o do video, que dura mais, a capa venceria antes da
    /// renovacao, e o video aberto nesse meio tempo ficaria sem ela.</para>
    /// </summary>
    private async Task<(SignedReadUrl Arquivo, SignedReadUrl? Miniatura, DateTime Vence)> AssinarLeituraAsync(
        ReportAttachment anexo,
        bool doPainel,
        CancellationToken cancellationToken)
    {
        // O armazenamento foi tirado depois de os arquivos entrarem. Dizer isso e
        // melhor que devolver a lista vazia: vazia, o time acharia que o relato
        // nunca teve anexo.
        if (!_mediaStorage.IsAvailable)
            throw new ConflictException(SemArmazenamento);

        // **O arquivo que nao e imagem so baixa.** O endereco dele sai com o anexo e o
        // tipo generico na propria assinatura: nem o navegador de quem relatou nem o do
        // time abre um PDF, um log ou uma planilha na pagina — o que ha dentro nao roda em
        // lugar nenhum.
        var arquivo = await _mediaStorage.CreateReadUrlAsync(
            anexo.ObjectKey,
            forPlayback: anexo.Kind == MediaKindEnum.Video,
            downloadAs: anexo.Kind == MediaKindEnum.File ? NomeDoDownload(anexo, doPainel) : null,
            cancellationToken: cancellationToken);

        var miniatura = anexo.ThumbnailObjectKey is { } thumb
            ? await _mediaStorage.CreateReadUrlAsync(thumb, forPlayback: false, cancellationToken: cancellationToken)
            : null;

        var vence = miniatura is not null && miniatura.ExpiresAt < arquivo.ExpiresAt
            ? miniatura.ExpiresAt
            : arquivo.ExpiresAt;

        return (arquivo, miniatura, vence);
    }

    /// <summary>
    /// O nome com que o arquivo baixa. **No painel, o que a pessoa deu a ele**; do lado
    /// de fora, <c>anexo</c> com a extensao — o nome original nunca sai, nem no
    /// download: ver <see cref="ReportAttachment.OriginalName"/>.
    /// </summary>
    private static string NomeDoDownload(ReportAttachment anexo, bool doPainel)
    {
        var extensao = ExtensaoDoArquivo(anexo);

        if (!doPainel || string.IsNullOrWhiteSpace(anexo.OriginalName))
            return $"anexo{extensao}";

        // **O nome baixado termina sempre numa extensao do catalogo.** O nome e o que a
        // pessoa escreveu; a extensao e a que o tipo conferido tem. Um nome gravado que
        // termine em outra — cortado antes desta regra, ou escrito para isso — ganha a
        // do catalogo no fim, e o time nunca baixa um ".hta" com selo de texto.
        return FileFormats.ExtensionOf(anexo.OriginalName) == extensao
            ? anexo.OriginalName
            : $"{anexo.OriginalName}{extensao}";
    }

    /// <summary>
    /// A extensao do arquivo, do catalogo: a do nome original quando e uma das do tipo
    /// gravado (o <c>.log</c> e o <c>.txt</c> gravam o mesmo tipo), e senao a primeira.
    /// </summary>
    private static string ExtensaoDoArquivo(ReportAttachment anexo)
    {
        // Os formatos que sairam do catalogo entram so aqui: o zip ja guardado continua
        // baixando como .zip.
        var tipos = FileFormats.All
            .Concat(FileFormats.Retired)
            .SelectMany(formato => formato.Types)
            .Where(tipo => tipo.ContentType == anexo.ContentType)
            .ToList();
        var original = FileFormats.ExtensionOf(anexo.OriginalName);

        return tipos.FirstOrDefault(tipo => tipo.Extension == original)?.Extension
               ?? tipos.FirstOrDefault()?.Extension
               ?? string.Empty;
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

        // O tipo e o que a assinatura fixou no envio — o armazenamento o guarda junto do
        // objeto. Os bytes tem de ser desse tipo, e o tipo, um dos aceitos.
        var tipo = miniatura.ContentType.Trim().ToLowerInvariant();
        if (!ThumbnailContentTypes.Contains(tipo) || !MediaSignatures.Matches(tipo, miniatura.Leading))
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
    /// Apaga as copias finais de uma confirmacao que falhou no meio, e diz se elas
    /// ja sao o arquivo de um anexo.
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
    ///
    /// <para>Devolve verdadeiro so quando o banco respondeu que o anexo aponta para
    /// elas — a confirmacao entrou, e quem chamou responde o sucesso.</para>
    /// </summary>
    private async Task<bool> DescartarCopiasFinaisAsync(
        string? destino,
        bool comMiniatura,
        string chaveEnvio,
        string? miniaturaEnvio)
    {
        if (destino is null)
            return false;

        bool emUso;

        try
        {
            emUso = await _unitOfWork.ReportAttachments.IsObjectKeyInUseWithoutSessionAsync(
                destino, CancellationToken.None);
        }
        catch
        {
            return false;
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

        return emUso;
    }

    /// <summary>
    /// Apaga do armazenamento um arquivo de um anexo ja descartado no banco — e
    /// engole a falha.
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
    ///
    /// <para><b>A falha fica aqui</b> porque a recusa ja foi gravada, e a resposta
    /// precisa ser ela.</para>
    /// </summary>
    private async Task ApagarSemFalharAsync(string? objectKey)
    {
        if (objectKey is null)
            return;

        try
        {
            await _mediaStorage.DeleteAsync(objectKey, CancellationToken.None);
        }
        catch
        {
            // Ver o resumo acima.
        }
    }

    /// <summary>
    /// O anexo com esse identificador, se ele ja foi confirmado neste relato, como a
    /// confirmacao o responde. Nulo quando nao foi — pendente, descartado ou de
    /// outro relato.
    /// </summary>
    private async Task<ConfirmedAttachmentViewModel?> JaConfirmadoAsync(
        Guid publicId,
        long reportId,
        CancellationToken cancellationToken)
        => await _unitOfWork.ReportAttachments.FindConfirmedWithoutSessionAsync(publicId, reportId, cancellationToken)
            is { } confirmado
            ? new ConfirmedAttachmentViewModel(confirmado.PublicId, confirmado.Kind, confirmado.SizeBytes)
            : null;

    /// <summary>
    /// O envio ainda aceita arquivo: o texto dele e dos ultimos minutos, ou os
    /// arquivos dele continuam chegando. Ver <see cref="AttachmentWindow"/>.
    ///
    /// <para>O teto (<see cref="SendingCeiling"/>) fica com quem chama: e ele que
    /// procura o envio, e o procura so ate la.</para>
    /// </summary>
    private async Task<bool> EnvioAbertoAsync(
        long reportId,
        long? respostaId,
        long? reaberturaId,
        DateTime feitoEm,
        DateTime desde,
        CancellationToken cancellationToken)
        => feitoEm >= desde
           || await _unitOfWork.ReportAttachments.HasActivitySinceWithoutSessionAsync(
               reportId, respostaId, reaberturaId, desde, cancellationToken);

    /// <summary>
    /// Apaga do armazenamento um arquivo e a miniatura dele, os que houver.
    ///
    /// <para>Sem o token da requisicao, pelo motivo de <see cref="ApagarSemFalharAsync"/>:
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
    /// <para><b>So o limite do tipo.</b> Nao ha total por envio: imagem e arquivo tem
    /// cada um o seu, e imagem cheia ainda deixa anexar arquivo.</para>
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
        EffectiveMediaKind limite,
        CancellationToken cancellationToken)
    {
        var (_, doTipo) = await _unitOfWork.ReportAttachments.CountConfirmedWithoutSessionAsync(
            reportId, respostaId, reaberturaId, kind, cancellationToken);

        var onde = respostaId is not null
            ? "Esta resposta"
            : reaberturaId is not null
                ? "Esta reabertura"
                : "Este relato";

        // Sem total por envio: cada categoria tem o seu limite. Ver MaxFilesPerReport.
        if (doTipo >= limite.MaxCount)
            return $"{onde} ja tem o maximo desse tipo que o projeto permite, que e {limite.MaxCount}.";

        return null;
    }

    /// <summary>
    /// Por que a confirmacao recusou, e se subir o arquivo de novo pode passar (400)
    /// ou levaria a mesma recusa (409).
    /// </summary>
    private sealed record ConfirmRefusal(string Reason, bool Retryable);

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

        // O formato desmarcado depois da permissao. Pelo tipo gravado, que e do catalogo
        // e aponta um formato so — o nome original pode ter sido cortado ao gravar.
        if (attachment.Kind == MediaKindEnum.File
            && !limite.Formats
                .Select(FileFormats.Find)
                .OfType<FileFormat>()
                .Any(formato => formato.Types.Any(tipo => tipo.ContentType == attachment.ContentType)))
            return "Este projeto deixou de aceitar esse formato de arquivo.";

        if (attachment.PublicCommentId is not null && !vigente.AllowsOnInfoRequest)
            return "Este projeto deixou de aceitar anexo nas respostas.";

        if (attachment.ReopenedClosureId is not null && !vigente.AllowsOnReopen)
            return "Este projeto deixou de aceitar anexo na reabertura.";

        // O tamanho e o real, lido do armazenamento. Ele ja recusa o que passa do teto
        // assinado, entao isto so pega o limite que baixou depois da permissao — e e a
        // segunda tranca: se um dia a assinatura sair sem o teto, o furo nao chega a
        // virar arquivo guardado.
        if (tamanhoReal > limite.MaxBytes)
            return $"O arquivo passa do limite deste projeto, que e de {FormatLimit(limite.MaxBytes)}.";

        return null;
    }

    /// <summary>
    /// O limite escrito como a tela de Anexos o mostra: "2.5 MB", "512 KB".
    ///
    /// <para><b>A mesma conta do formatBytes da web</b>, porque a pessoa le as duas
    /// frases lado a lado. A tela grava limites com uma casa decimal, e o MB inteiro
    /// cortado mostraria 2 MB para um limite de 2.5 — menor do que o configurado.</para>
    /// </summary>
    private static string FormatLimit(long bytes)
    {
        if (bytes < 1024 * 1024)
            // Meio para cima, como o Math.round da web: o padrao daqui arredonda o meio
            // para o par, e 2.5 KB sairia 2 aqui e 3 la.
            return $"{Math.Max(1, (long)Math.Round(bytes / 1024d, MidpointRounding.AwayFromZero))} KB";

        var mb = bytes / (1024d * 1024);

        return mb == Math.Floor(mb)
            ? $"{mb.ToString("0", CultureInfo.InvariantCulture)} MB"
            : $"{mb.ToString("0.0", CultureInfo.InvariantCulture)} MB";
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

    /// <summary>
    /// Corta o que veio de fora no tamanho da coluna, em vez de derrubar a gravacao.
    ///
    /// <para><b>Nunca no meio de um emoji.</b> Fora do basico, um caractere ocupa duas
    /// posicoes; cortado entre elas, sobra meio caractere, o banco recusa o texto, e
    /// aquele arquivo nunca mais seria anexado sem mudar de nome.</para>
    /// </summary>
    /// <summary>O tipo gravado pelo armazenamento e o declarado sao o mesmo, sem os parametros (<c>; charset=...</c>).</summary>
    private static bool MesmoTipo(string gravado, string declarado)
        => string.Equals(
            gravado.Split(';')[0].Trim(),
            declarado,
            StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// O nome do arquivo como ele fica gravado: sem caractere de controle nem de formato,
    /// e cortado no miolo — <b>nunca na extensao</b>.
    ///
    /// <para><b>Sem controle nem formato</b> (categorias Cc e Cf): a quebra de linha
    /// escreveria na legenda do painel, e os caracteres invisiveis de direcao fazem
    /// "fatura<c>U+202E</c>fdp.txt" aparecer como "faturatxt.pdf".</para>
    ///
    /// <para><b>Cortado no miolo</b>: o corte no fim trocaria a extensao — um nome de 204
    /// caracteres terminado em ".hta.txt" ficaria ".hta" —, e a extensao conferida seria
    /// outra que a gravada.</para>
    /// </summary>
    private static string? NomeOriginal(string? value)
    {
        var limpo = new string((value ?? string.Empty)
            .Where(c => !char.IsControl(c) && CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.Format)
            .ToArray()).Trim();

        var max = ReportAttachment.MaxOriginalNameLength;

        if (limpo.Length == 0)
            return null;

        if (limpo.Length <= max)
            return limpo;

        var ponto = limpo.LastIndexOf('.');
        var extensao = ponto > 0 && limpo.Length - ponto <= 10 ? limpo[ponto..] : string.Empty;
        var corte = max - extensao.Length;

        if (char.IsHighSurrogate(limpo[corte - 1]))
            corte--;

        return limpo[..corte] + extensao;
    }

}
