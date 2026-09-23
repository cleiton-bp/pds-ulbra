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
    /// Por quanto tempo depois de responder a pessoa ainda prende arquivo a resposta.
    ///
    /// <para>Quinze minutos cobrem mandar quatro arquivos numa conexao ruim e tentar
    /// de novo o que falhou. Mais do que isso, o arquivo deixaria de ser parte da
    /// resposta e viraria acrescimo a uma fala antiga, que o time ja pode ter
    /// lido.</para>
    /// </summary>
    private static readonly TimeSpan ReplyAttachmentWindow = TimeSpan.FromMinutes(15);

    /// <summary>A miniatura e sempre imagem, mesmo quando o anexo e video — ali ela e o quadro de capa.</summary>
    private const string ThumbnailContentType = "image/webp";

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
        var contentType = (dto.ContentType ?? string.Empty).Trim().ToLowerInvariant();
        var tamanho = dto.SizeBytes ?? throw new ArgumentException("Informe o tamanho do arquivo.");

        var vigente = MediaSettingsDefaults.Resolve(
            await _unitOfWork.ProjectMediaSettings.FindByProjectWithoutSessionAsync(
                report.ProjectId, cancellationToken));

        if (!vigente.IsEnabled)
            throw new ArgumentException("Este projeto nao aceita anexo.");

        // O envio a que este arquivo pertence: a criacao do relato, ou a resposta
        // que a pessoa acabou de mandar. Cada um com a sua cota.
        long? respostaId = null;

        if (dto.ForReply == true)
        {
            if (!vigente.AllowsOnInfoRequest)
                throw new ArgumentException("Este projeto nao aceita anexo nas respostas.");

            var resposta = await _unitOfWork.ReportPublicComments.FindLatestFromReporterWithoutSessionAsync(
                               report.Id, DateTime.UtcNow - ReplyAttachmentWindow, cancellationToken)
                           ?? throw new ArgumentException(
                               "Nao ha resposta recente sua neste relato para prender o arquivo. Responda primeiro.");

            respostaId = resposta.Id;
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

        if (limite.MaxDurationSeconds is { } maxDuracao)
        {
            var duracao = dto.DurationSeconds
                          ?? throw new ArgumentException("Informe a duracao do video.");

            if (duracao < 1 || duracao > maxDuracao)
                throw new ArgumentException($"O video passa do limite deste projeto, que e de {maxDuracao} segundos.");
        }

        await RequireRoomAsync(report, respostaId, kind, vigente, limite, cancellationToken);

        // O nome no armazenamento e sorteado, e nunca derivado do que veio de fora:
        // um nome escolhido por quem envia permitiria escrever por cima do arquivo
        // de outra pessoa, ou sair da pasta onde os arquivos deste projeto moram.
        var chave = $"media/{report.ProjectId}/{Guid.NewGuid():N}";
        var comMiniatura = dto.WithThumbnail == true;

        var attachment = new ReportAttachment
        {
            ReportId = report.Id,
            PublicCommentId = respostaId,
            Kind = kind,
            Status = AttachmentStatusEnum.Pending,
            ObjectKey = chave,
            ThumbnailObjectKey = comMiniatura ? $"{chave}-thumb" : null,
            ContentType = contentType,

            // O que o navegador disse, ate a confirmacao ler o numero de verdade.
            SizeBytes = tamanho,
            DurationSeconds = dto.DurationSeconds,
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

        var publicId = dto.AttachmentPublicId
                       ?? throw new ArgumentException("Informe qual anexo esta sendo confirmado.");

        var attachment = await _unitOfWork.ReportAttachments.FindPendingWithoutSessionAsync(
                             publicId, report.Id, cancellationToken)
                         ?? throw new KeyNotFoundException("Nao ha anexo pendente com esse identificador neste relato.");

        var objeto = await _mediaStorage.InspectAsync(
                         attachment.ObjectKey, MediaSignatures.LeadingBytes, cancellationToken)
                     ?? throw new ArgumentException("O arquivo nao chegou ao armazenamento.");

        // **A conferencia que a assinatura nao faz.** Ela garante que o objeto seja
        // gravado com o rotulo que pedimos, e nada mais: quem obteve a permissao
        // pode ter posto bytes de qualquer coisa la dentro.
        if (!MediaSignatures.Matches(attachment.ContentType, objeto.Leading))
        {
            await DescartarAsync(attachment, cancellationToken);
            throw new ArgumentException("O arquivo enviado nao e do formato que foi declarado.");
        }

        var vigente = MediaSettingsDefaults.Resolve(
            await _unitOfWork.ProjectMediaSettings.FindByProjectWithoutSessionAsync(
                report.ProjectId, cancellationToken));

        // O limite e conferido de novo contra o tamanho real. O armazenamento ja
        // recusa o que passa do teto assinado, e esta e a segunda tranca: se um dia
        // a assinatura sair sem o teto, o furo nao chega a virar arquivo guardado.
        if (vigente.For(attachment.Kind) is { } limite && objeto.SizeBytes > limite.MaxBytes)
        {
            await DescartarAsync(attachment, cancellationToken);
            throw new ArgumentException("O arquivo passa do limite deste projeto.");
        }

        if (attachment.ThumbnailObjectKey is { } thumb)
            await ConferirMiniaturaAsync(attachment, thumb, cancellationToken);

        attachment.Status = AttachmentStatusEnum.Confirmed;
        attachment.SizeBytes = objeto.SizeBytes;
        attachment.ConfirmedAt = DateTime.UtcNow;

        _unitOfWork.ReportAttachments.Update(attachment);
        await _unitOfWork.CommitAsync(cancellationToken);

        return new ConfirmedAttachmentViewModel(
            attachment.PublicId, attachment.Kind, attachment.SizeBytes, attachment.DurationSeconds);
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
    /// </summary>
    private async Task ConferirMiniaturaAsync(
        ReportAttachment attachment,
        string thumbnailObjectKey,
        CancellationToken cancellationToken)
    {
        var miniatura = await _mediaStorage.InspectAsync(
            thumbnailObjectKey, MediaSignatures.LeadingBytes, cancellationToken);

        if (miniatura is null)
        {
            attachment.ThumbnailObjectKey = null;
            return;
        }

        if (!MediaSignatures.Matches(ThumbnailContentType, miniatura.Leading))
        {
            await _mediaStorage.DeleteAsync(thumbnailObjectKey, cancellationToken);
            attachment.ThumbnailObjectKey = null;
        }
    }

    /// <summary>
    /// Joga fora o que foi recusado, no armazenamento e no banco.
    ///
    /// <para><b>Sem isto, cada recusa deixaria um arquivo guardado para sempre.</b>
    /// A conta cresce com o que foi aceito; ela nao pode crescer tambem com o que
    /// foi recusado.</para>
    /// </summary>
    private async Task DescartarAsync(ReportAttachment attachment, CancellationToken cancellationToken)
    {
        await _mediaStorage.DeleteAsync(attachment.ObjectKey, cancellationToken);

        if (attachment.ThumbnailObjectKey is { } thumb)
            await _mediaStorage.DeleteAsync(thumb, cancellationToken);

        // Apaga logicamente, como o resto do produto. A linha fica dizendo que
        // houve uma tentativa recusada — o que sumiu de verdade foi o arquivo, e
        // ele sumiu porque nele a exclusao precisa ser fisica.
        await _unitOfWork.ReportAttachments.SoftDeleteAsync(attachment, cancellationToken);
        await _unitOfWork.CommitAsync(cancellationToken);
    }

    /// <summary>
    /// Ha vaga para mais um arquivo deste tipo neste envio — a criacao do relato, ou
    /// uma resposta. Cada envio tem a sua cota.
    ///
    /// <para><b>Os dois limites sao conferidos, e nao um deles.</b> So o do tipo
    /// deixaria tres imagens mais um video passarem num projeto que so queria dois
    /// arquivos no total; so o total deixaria quatro videos num projeto que queria
    /// um.</para>
    ///
    /// <para><b>So os confirmados contam.</b> O que ficou pendente e permissao que
    /// alguem pediu e nao usou — faze-lo ocupar vaga deixaria quem tentou tres vezes
    /// e falhou sem conseguir anexar nada.</para>
    /// </summary>
    private async Task RequireRoomAsync(
        Report report,
        long? respostaId,
        MediaKindEnum kind,
        EffectiveMediaSettings vigente,
        EffectiveMediaKind limite,
        CancellationToken cancellationToken)
    {
        var (total, doTipo) = await _unitOfWork.ReportAttachments.CountConfirmedWithoutSessionAsync(
            report.Id, respostaId, kind, cancellationToken);

        var onde = respostaId is null ? "Este relato" : "Esta resposta";

        if (total >= vigente.MaxFilesPerReport)
            throw new ArgumentException($"{onde} ja tem o maximo de arquivos que o projeto permite, que e {vigente.MaxFilesPerReport}.");

        if (doTipo >= limite.MaxCount)
            throw new ArgumentException($"{onde} ja tem o maximo desse tipo que o projeto permite, que e {limite.MaxCount}.");
    }

    /// <summary>Corta o que veio de fora no tamanho da coluna, em vez de derrubar a gravacao.</summary>
    private static string? Trim(string? value, int maxLength)
    {
        var limpo = (value ?? string.Empty).Trim();

        if (limpo.Length == 0)
            return null;

        return limpo.Length <= maxLength ? limpo : limpo[..maxLength];
    }
}
