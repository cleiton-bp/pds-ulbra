using Pds.Domain.Dtos;
using Pds.Domain.Exceptions;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Origins;
using Pds.Service.Security;

namespace Pds.Service.Services;

/// <summary>
/// O que o projeto aceita receber junto do relato, lido e gravado inteiro.
///
/// <para><b>Ler nunca devolve vazio.</b> Projeto sem linha responde com o padrao de
/// fabrica, e a resposta e indistinguivel da de quem salvou aquele mesmo valor —
/// quem le precisa saber como o projeto se comporta, e nao se existe linha no
/// banco.</para>
///
/// <para><b>Sem armazenamento configurado, o anexo esta desligado e salvar e
/// recusado.</b> Nao e zelo: ligado sem armazenamento, o quadro mostraria o botao e
/// o envio falharia depois de a pessoa ja ter escolhido o arquivo. Recusar aqui e a
/// mesma escolha que a configuracao do ciclo faz com a fila ausente.</para>
/// </summary>
public class ProjectMediaSettingsService : IProjectMediaSettingsService
{
    // Quem ve esta recusa e uma aba do painel aberta antes do video sair que ja sabe
    // da chave da reabertura: ela devolve a linha de video que leu, mesmo desligada.
    // A aba mais antiga que isso cai antes em ReopenKeyMissing, que tambem pede para
    // recarregar. Dizer so "nao e aceito" faria a pessoa desmarcar o video e bater
    // na mesma recusa. O comeco e o mesmo do pedido de envio e da confirmacao: e a
    // mesma noticia nos tres.
    private const string VideoRefused =
        "Video nao e mais aceito como anexo. Recarregue a pagina e salve de novo.";

    // O unico cliente que deixa este campo de fora e uma aba do painel aberta antes
    // de a chave existir — e a tela dela nao tem a opcao que a mensagem pede. Sem o
    // "recarregue", a pessoa tentaria de novo e bateria na mesma recusa.
    private const string ReopenKeyMissing =
        "Informe se da para anexar ao reabrir. Recarregue a pagina e salve de novo.";

    private readonly IUnitOfWork _unitOfWork;
    private readonly IMediaStorage _mediaStorage;

    public ProjectMediaSettingsService(IUnitOfWork unitOfWork, IMediaStorage mediaStorage)
    {
        _unitOfWork = unitOfWork;
        _mediaStorage = mediaStorage;
    }

    public async Task<MediaSettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectMediaSettings.GetByProjectAsync(project.Id, cancellationToken);

        return Map(settings);
    }

    public async Task<MediaSettingsViewModel> ReplaceAsync(Guid projectPublicId, MediaSettingsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        RequireStorage();

        // **Confere antes de tocar na entidade.** A que ja existe vem rastreada pelo
        // contexto: escrever nela e so entao recusar deixaria o objeto sujo ate o
        // fim da requisicao, e bastaria alguem commitar por outro motivo para a
        // configuracao recusada ir ao banco assim mesmo.
        var isEnabled = Required(dto.IsEnabled, "Informe se a ferramenta aceita anexo.");
        var allowsScreenCapture = Required(dto.AllowsScreenCapture, "Informe se o botao de capturar a tela aparece.");
        var allowsOnInfoRequest = Required(dto.AllowsOnInfoRequest, "Informe se da para anexar respondendo ao time.");
        var allowsOnReopen = Required(dto.AllowsOnReopen, ReopenKeyMissing);
        var maxFiles = Required(dto.MaxFilesPerReport, "Informe quantos arquivos cabem em cada envio.");

        RequireInRange(maxFiles, 1, ProjectMediaSettings.MaxFilesPerReportCeiling,
            $"O total de arquivos por envio precisa ficar entre 1 e {ProjectMediaSettings.MaxFilesPerReportCeiling}.");

        var limites = ReadKinds(dto.Kinds);
        RequireSomethingToAccept(isEnabled, limites);

        var settings = await _unitOfWork.ProjectMediaSettings.GetByProjectAsync(project.Id, cancellationToken);

        var novo = settings is null;
        settings ??= new ProjectMediaSettings { ProjectId = project.Id };

        settings.IsEnabled = isEnabled;
        settings.AllowsScreenCapture = allowsScreenCapture;
        settings.AllowsOnInfoRequest = allowsOnInfoRequest;
        settings.AllowsOnReopen = allowsOnReopen;
        settings.MaxFilesPerReport = maxFiles;

        ApplyKinds(settings, limites);

        if (novo)
            await _unitOfWork.ProjectMediaSettings.AddAsync(settings, cancellationToken);
        else
            _unitOfWork.ProjectMediaSettings.Update(settings);

        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(settings);
    }

    public async Task<PublicMediaSettingsViewModel> GetByPublicKeyAsync(
        string? key,
        string? origin,
        CancellationToken cancellationToken = default)
    {
        var value = (key ?? string.Empty).Trim();

        // Chave ausente, desconhecida, revogada ou secreta recebem a mesma recusa,
        // com a mesma mensagem — a mesma regra da rota que recebe o relato.
        var found = value.Length > 0
            ? await _unitOfWork.ProjectKeys.FindActivePublicAsync(value, cancellationToken)
            : null;

        if (found is null)
            throw new UnauthorizedAccessException("Chave publica invalida.");

        var project = found.Project;

        // Endereco declarado fora da lista do projeto: a ferramenta nao abre ali, e
        // portanto nao ha anexo nenhum a descrever.
        if (OriginAllowList.Declares(origin))
        {
            var origins = await _unitOfWork.ProjectOrigins.ListByProjectWithoutSessionAsync(project.Id, cancellationToken);

            if (!OriginAllowList.Allows(origins, origin))
                throw new ForbiddenException("Este endereco nao esta autorizado a abrir a ferramenta deste projeto.");
        }

        return ToPublic(MediaSettingsDefaults.Resolve(
            await _unitOfWork.ProjectMediaSettings.FindByProjectWithoutSessionAsync(project.Id, cancellationToken)));
    }

    public async Task<PublicMediaSettingsViewModel> GetForTrackingAsync(
        OpenReportTrackingDto dto,
        CancellationToken cancellationToken = default)
    {
        // A mesma porta das rotas publicas do relato. Nada do projeto e lido antes
        // de ela aceitar o protocolo e o token.
        var report = await TrackedReportGate.RequireAsync(
            _unitOfWork, dto.TrackingCode, dto.Token, cancellationToken);

        return ToPublic(MediaSettingsDefaults.Resolve(
            await _unitOfWork.ProjectMediaSettings.FindByProjectWithoutSessionAsync(report.ProjectId, cancellationToken)));
    }

    /// <summary>
    /// O que o lado de fora pode ver da configuracao. Uma funcao so para as duas
    /// portas publicas, para as duas nunca responderem coisas diferentes.
    ///
    /// <para><b>Video nunca sai daqui</b>, nem para o projeto que tinha limite
    /// gravado para ele: os tipos vem de <see cref="MediaSettingsDefaults.Resolve"/>,
    /// que so conhece os que o produto oferece.</para>
    /// </summary>
    private PublicMediaSettingsViewModel ToPublic(EffectiveMediaSettings vigente)
    {
        return new PublicMediaSettingsViewModel(
            IsOffered(vigente),
            vigente.AllowsScreenCapture,
            vigente.AllowsOnInfoRequest,
            vigente.AllowsOnReopen,
            vigente.MaxFilesPerReport,
            vigente.Kinds
                .Where(kind => kind.IsEnabled)
                .Select(kind => new PublicMediaKindViewModel(
                    kind.Kind,
                    kind.MaxCount,
                    kind.MaxBytes,
                    // Nulo sempre, e presente de proposito: o quadro antigo trata
                    // campo ausente como "tem duracao" e recusaria todo print.
                    MaxDurationSeconds: null,
                    MediaSignatures.Accepted[kind.Kind]))
                .ToList());
    }

    /// <summary>
    /// Escreve os limites na configuracao, criando o que falta e mexendo no que ja
    /// existe.
    ///
    /// <para><b>Tipo que a tela nao mandou fica como esta.</b> Some-lo seria deixar
    /// uma versao antiga da tela, que nao conhece um tipo novo, apagar a
    /// configuracao dele sem ninguem ter pedido. E por isso tambem que a linha de
    /// video de um projeto antigo continua gravada: ninguem a apaga, e nenhuma
    /// leitura a enxerga.</para>
    /// </summary>
    private static void ApplyKinds(ProjectMediaSettings settings, List<MediaKindLimitViewModel> limites)
    {
        foreach (var limite in limites)
        {
            var kind = settings.Kinds.FirstOrDefault(existente => existente.Kind == limite.Kind);

            if (kind is null)
            {
                settings.Kinds.Add(new ProjectMediaKind
                {
                    Kind = limite.Kind,
                    IsEnabled = limite.IsEnabled,
                    MaxCount = limite.MaxCount,
                    MaxBytes = limite.MaxBytes,
                });

                continue;
            }

            kind.IsEnabled = limite.IsEnabled;
            kind.MaxCount = limite.MaxCount;
            kind.MaxBytes = limite.MaxBytes;
        }
    }

    /// <summary>
    /// Le e confere os limites que vieram, um tipo por vez.
    ///
    /// <para><b>So imagem e aceita.</b> O video saiu do produto por pesar demais no
    /// armazenamento e na entrega. Grava-lo aqui seria prometer, na tela, um envio
    /// que o pedido de permissao recusa — e por isso a recusa e 400, e nao um
    /// silencio que deixaria a tela antiga achar que salvou.</para>
    /// </summary>
    private static List<MediaKindLimitViewModel> ReadKinds(List<MediaKindLimitDto>? kinds)
    {
        if (kinds is null || kinds.Count == 0)
            throw new ArgumentException("Informe os limites de cada tipo de midia.");

        var lidos = new List<MediaKindLimitViewModel>();

        foreach (var kind in kinds)
        {
            // A desserializacao aceita null dentro da lista, e ler o tipo dele
            // estouraria como falha do servidor, e nao como pedido mal formado.
            if (kind is null)
                throw new ArgumentException("Informe os limites de cada tipo de midia.");

            var tipo = Required(kind.Kind, "Informe de que tipo e o limite.");

            // O enum chega como texto, mas a desserializacao tambem aceita numero, e
            // um numero fora da lista passaria direto para o banco como uma linha
            // que nenhuma leitura enxerga.
            if (!Enum.IsDefined(tipo))
                throw new ArgumentException(
                    $"Tipo de midia desconhecido. Use {string.Join(" ou ", MediaSignatures.Accepted.Keys)}.");

            if (tipo == MediaKindEnum.Video)
                throw new ArgumentException(VideoRefused);

            // Tipo repetido nao e detalhe: gravar os dois deixaria o banco com duas
            // respostas para a mesma pergunta, e qual valeria dependeria da ordem.
            if (lidos.Any(lido => lido.Kind == tipo))
                throw new ArgumentException($"O tipo {tipo} apareceu mais de uma vez.");

            var habilitado = Required(kind.IsEnabled, $"Informe se {tipo} e aceito.");
            var quantidade = Required(kind.MaxCount, $"Informe a quantidade maxima de {tipo}.");
            var bytes = Required(kind.MaxBytes, $"Informe o tamanho maximo de {tipo}.");

            RequireInRange(quantidade, 1, ProjectMediaKind.MaxCountCeiling,
                $"A quantidade de {tipo} precisa ficar entre 1 e {ProjectMediaKind.MaxCountCeiling}.");
            RequireInRange(bytes, 1, ProjectMediaKind.ImageMaxBytesCeiling,
                $"O tamanho de {tipo} precisa ficar entre 1 byte e {ProjectMediaKind.ImageMaxBytesCeiling / (1024 * 1024)} MB.");

            lidos.Add(new MediaKindLimitViewModel(tipo, habilitado, quantidade, bytes, MaxDurationSeconds: null));
        }

        return lidos;
    }

    /// <summary>
    /// Recusa salvar sem armazenamento configurado.
    ///
    /// <para><b>O estado do armazenamento e da instalacao, e nao do projeto</b> — e
    /// e por isso que a recusa mora aqui e nao numa coluna. Ligado sem ele, o quadro
    /// mostraria o botao e o envio falharia depois de a pessoa escolher o arquivo.</para>
    ///
    /// <para><b>Recusa tambem o desligado, e nao so o ligado.</b> Sem armazenamento,
    /// a leitura responde o anexo desligado. Quem le, muda um limite e devolve a
    /// configuracao inteira gravaria esse desligado por cima da escolha do projeto,
    /// e ela nao voltaria a valer quando houver armazenamento. E o mesmo que a tela
    /// ja faz.</para>
    ///
    /// <para><b>409, e nao 400.</b> O pedido esta bem formado; o que falta e da
    /// instalacao. E a mesma resposta do ciclo quando a espera pede uma fila que nao
    /// existe.</para>
    /// </summary>
    private void RequireStorage()
    {
        if (!_mediaStorage.IsAvailable)
            throw new ConflictException(
                "Nao ha armazenamento configurado nesta instalacao, entao a configuracao de midia nao pode ser salva.");
    }

    /// <summary>
    /// O anexo existe de fato: o projeto ligou, e ha onde guardar.
    ///
    /// <para><b>Uma regra so para o painel e para as portas publicas.</b> Sem
    /// armazenamento, as duas leituras dizem desligado, mesmo com o projeto tendo
    /// ligado — a tela nao mostra ligado o que a ferramenta esconde. A escolha
    /// gravada continua intacta, porque salvar e recusado, e volta a valer no dia
    /// em que houver armazenamento.</para>
    /// </summary>
    private bool IsOffered(EffectiveMediaSettings vigente)
        => vigente.IsEnabled && _mediaStorage.IsAvailable;

    /// <summary>
    /// Recusa anexo ligado sem imagem aceita.
    ///
    /// <para>A configuracao ficaria dizendo que aceita anexo e recusando todos eles.
    /// Quem quer isso ja tem o caminho certo, que e desligar o anexo. A mensagem fala
    /// de imagem porque e o unico tipo que se pode ligar.</para>
    /// </summary>
    private static void RequireSomethingToAccept(bool isEnabled, List<MediaKindLimitViewModel> limites)
    {
        if (isEnabled && limites.TrueForAll(limite => !limite.IsEnabled))
            throw new ArgumentException(
                "Anexo ligado sem imagem aceita nao aceita nada. Aceite imagem, ou desligue o anexo.");
    }

    /// <summary>
    /// Traduz a entidade — ou a ausencia dela — para a resposta.
    ///
    /// <para>Quem resolve o padrao e <see cref="MediaSettingsDefaults.Resolve"/>, e
    /// nao esta tela: a rota que assina o envio le pela mesma funcao, e duas
    /// resolucoes seriam duas verdades.</para>
    ///
    /// <para><b>Sem armazenamento, o anexo sai desligado</b>, e o resto sai como esta
    /// gravado. Ligado ali, a tela diria uma coisa e a ferramenta faria outra; o resto
    /// intacto e o que mostra a escolha do projeto, que volta a valer quando houver
    /// armazenamento.</para>
    /// </summary>
    private MediaSettingsViewModel Map(ProjectMediaSettings? settings)
    {
        var vigente = MediaSettingsDefaults.Resolve(settings);

        return new MediaSettingsViewModel(
            _mediaStorage.IsAvailable,
            IsOffered(vigente),
            vigente.AllowsScreenCapture,
            vigente.AllowsOnInfoRequest,
            vigente.AllowsOnReopen,
            vigente.MaxFilesPerReport,
            vigente.Kinds
                .Select(kind => new MediaKindLimitViewModel(
                    // Nulo sempre, e presente de proposito: a tela antiga trata campo
                    // ausente como "tem duracao" e desenharia o campo na imagem.
                    kind.Kind, kind.IsEnabled, kind.MaxCount, kind.MaxBytes, MaxDurationSeconds: null))
                .ToList());
    }

    /// <summary>
    /// Recusa o campo ausente em vez de assumir um valor.
    ///
    /// <para>Aqui um numero assumido e dinheiro gasto sem ninguem ter decidido: cada
    /// limite destes e o que o projeto vai guardar, e guardar custa.</para>
    /// </summary>
    private static T Required<T>(T? value, string message) where T : struct
        => value ?? throw new ArgumentException(message);

    /// <summary>
    /// O teto do sistema, acima do que qualquer projeto escolhe.
    ///
    /// <para>Existe porque o limite do projeto protege a conta de quem configurou, e
    /// este protege a nossa de quem configurou errado.</para>
    /// </summary>
    private static void RequireInRange<T>(T value, T minimum, T maximum, string message) where T : IComparable<T>
    {
        if (value.CompareTo(minimum) < 0 || value.CompareTo(maximum) > 0)
            throw new ArgumentException(message);
    }

    /// <summary>
    /// O projeto da sessao atual. O filtro global ja limita a consulta a conta que
    /// esta usando o painel, entao projeto de outra conta simplesmente nao volta.
    /// </summary>
    private async Task<Project> RequireOwnProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
