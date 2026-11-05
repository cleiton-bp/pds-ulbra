using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Service.Security;

namespace Pds.Service.Services;

/// <summary>
/// O modo de identificacao e a visibilidade, lidos e trocados juntos.
///
/// <para><b>Ler nunca devolve vazio.</b> Projeto sem linha responde com o padrao de
/// fabrica, e a resposta e indistinguivel da de quem salvou aquele mesmo valor —
/// quem le precisa saber como o projeto se comporta, e nao se existe linha no
/// banco.</para>
///
/// <para><b>Gravar "publico" aqui nao publica nada.</b> Nenhuma rota publica le a
/// visibilidade hoje — ela existe para a moderacao ler, e o relato so aparece em
/// lista publica depois de liberado. A ordem e de seguranca: lista publica antes
/// de moderacao seria publicar texto livre sem ninguem ter olhado.</para>
/// </summary>
public class ProjectIdentitySettingsService : IProjectIdentitySettingsService
{
    private readonly IUnitOfWork _unitOfWork;

    public ProjectIdentitySettingsService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task<IdentitySettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectIdentitySettings.GetByProjectAsync(project.Id, cancellationToken);

        return Map(settings);
    }

    public async Task<IdentitySettingsViewModel> ReplaceAsync(Guid projectPublicId, IdentitySettingsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        // **Confere antes de tocar na entidade.** A que ja existe vem rastreada
        // pelo contexto: escrever nela e so entao recusar deixaria o objeto sujo
        // ate o fim da requisicao, e bastaria alguem commitar por outro motivo
        // para a configuracao recusada ir ao banco assim mesmo.
        var mode = Required(dto.Mode, "Informe como quem relata e identificado.");
        var visibility = Required(dto.Visibility, "Informe quem pode ver os relatos.");
        var asksForName = Required(dto.AsksForName, "Informe se a ferramenta pergunta o nome.");

        RequireIdentityForIdentifiedVisibility(mode, visibility);

        // A chave do sistema do cliente: limpa (PEM ou base64 numa linha) e conferida
        // como ECDSA P-256 sempre que vier — e exigida no modo herdado, que sem ela
        // nao confere token nenhum. Fora do modo ela fica guardada: trocar de modo e
        // voltar nao pode obrigar a colar a chave de novo.
        var chave = InheritedIdentity.NormalizePublicKey(dto.IdentityPublicKey);
        if (chave is not null && chave.Length > ProjectIdentitySettings.MaxIdentityPublicKeyLength)
            throw new ArgumentException("A chave publica e grande demais.");
        if (chave is not null)
            InheritedIdentity.ImportPublicKey(chave).Dispose();

        var atual = await _unitOfWork.ProjectIdentitySettings.GetByProjectAsync(project.Id, cancellationToken);

        // O formato ausente fica o que estava: trocar de formato e trocar o que o servidor
        // do cliente faz, e isso nao acontece por um campo que faltou.
        var formato = dto.IdentityFormat ?? atual?.IdentityFormat ?? IdentitySettingsDefaults.IdentityFormat;
        if (!Enum.IsDefined(formato))
            throw new ArgumentException("Escolha como o seu sistema assina: assinatura simples ou JWT.");

        // Cada formato pede o seu: o JWT, a chave publica; o HMAC, a chave mestra da
        // instalacao. Sem eles o modo gravado nao conferiria cracha nenhum.
        if (mode == ReporterIdentityModeEnum.InheritedIdentity)
        {
            if (formato == IdentityFormatEnum.Jwt && chave is null)
                throw new ArgumentException("Informe a chave publica do seu sistema.");
            if (formato == IdentityFormatEnum.Hmac && !InheritedIdentity.IsHmacAvailable)
                throw new ArgumentException(
                    "A assinatura simples fica indisponivel nesta instalacao. Use o JWT, com a chave publica do seu sistema.");
        }

        var tetoDoToken = dto.IdentityTokenMaxMinutes ?? IdentitySettingsDefaults.IdentityTokenMaxMinutes;
        if (tetoDoToken is < ProjectIdentitySettings.MinIdentityTokenMinutes or > ProjectIdentitySettings.MaxIdentityTokenMinutes)
            throw new ArgumentException(
                $"A validade do token precisa ficar entre {ProjectIdentitySettings.MinIdentityTokenMinutes} e {ProjectIdentitySettings.MaxIdentityTokenMinutes} minutos.");

        var identidadeObrigatoria = dto.IdentityRequired ?? IdentitySettingsDefaults.IdentityRequired;

        var settings = atual;

        var novo = settings is null;
        settings ??= new ProjectIdentitySettings { ProjectId = project.Id };

        settings.Mode = mode;
        settings.Visibility = visibility;
        settings.AsksForName = asksForName;
        settings.IdentityPublicKey = chave;
        settings.IdentityTokenMaxMinutes = tetoDoToken;
        settings.IdentityRequired = identidadeObrigatoria;
        settings.IdentityFormat = formato;

        // O sal nasce com a primeira chave, ou com o modo herdado no HMAC, e nunca muda:
        // trocar o sal faria toda pessoa virar outra, e a lista dela sumiria.
        if ((chave is not null || mode == ReporterIdentityModeEnum.InheritedIdentity)
            && settings.IdentitySubjectSalt is null)
            settings.IdentitySubjectSalt = InheritedIdentity.NewSalt();

        if (novo)
            await _unitOfWork.ProjectIdentitySettings.AddAsync(settings, cancellationToken);
        else
            _unitOfWork.ProjectIdentitySettings.Update(settings);

        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(settings);
    }

    public async Task<IdentitySecretViewModel> GetSecretAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectIdentitySettings.GetByProjectAsync(project.Id, cancellationToken);

        return new IdentitySecretViewModel(RequireSecret(project.Id, settings?.IdentitySecretVersion ?? 1));
    }

    public async Task<IdentitySecretViewModel> RotateSecretAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);

        // Confere antes de mexer: sem a chave mestra nao ha chave nova para devolver.
        if (!InheritedIdentity.IsHmacAvailable)
            throw new ArgumentException(SemHmac);

        var settings = await _unitOfWork.ProjectIdentitySettings.GetByProjectAsync(project.Id, cancellationToken);

        // Projeto que nunca salvou ganha a linha com o padrao de fabrica: e assim que ele
        // ja se comporta, e a versao da chave precisa morar em algum lugar.
        var novo = settings is null;
        settings ??= new ProjectIdentitySettings
        {
            ProjectId = project.Id,
            Mode = IdentitySettingsDefaults.Mode,
            Visibility = IdentitySettingsDefaults.Visibility,
            AsksForName = IdentitySettingsDefaults.AsksForName,
            IdentityRequired = IdentitySettingsDefaults.IdentityRequired,
        };

        // Subir a versao troca a chave: todo cracha assinado com a anterior deixa de valer.
        // A troca entra no historico, so com a data, e o historico guarda as ultimas.
        settings.IdentitySecretVersion++;
        settings.IdentitySecretRotations =
        [
            DateTime.UtcNow,
            .. settings.IdentitySecretRotations.Take(ProjectIdentitySettings.MaxIdentitySecretHistory - 1),
        ];

        if (novo)
            await _unitOfWork.ProjectIdentitySettings.AddAsync(settings, cancellationToken);
        else
            _unitOfWork.ProjectIdentitySettings.Update(settings);

        await _unitOfWork.CommitAsync(cancellationToken);

        return new IdentitySecretViewModel(RequireSecret(project.Id, settings.IdentitySecretVersion));
    }

    public async Task<IReadOnlyList<IdentitySecretHistoryItemViewModel>> GetSecretHistoryAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectIdentitySettings.GetByProjectAsync(project.Id, cancellationToken);

        if (settings is null)
            return [];

        // A troca mais recente aposentou a versao anterior a de agora, a seguinte a anterior
        // a ela, e assim por diante: a chave antiga sai da mesma conta, sem ser guardada.
        return settings.IdentitySecretRotations
            .Take(ProjectIdentitySettings.MaxIdentitySecretHistory)
            .Select((trocadaEm, indice) => (trocadaEm, versao: settings.IdentitySecretVersion - 1 - indice))
            .Where(item => item.versao >= 1)
            .Select(item => new IdentitySecretHistoryItemViewModel(
                Prefixo(InheritedIdentity.ProjectSecret(project.Id, item.versao)),
                DateTime.SpecifyKind(item.trocadaEm, DateTimeKind.Utc)))
            .ToList();
    }

    /// <summary>O comeco da chave: `rfs_` e oito caracteres, o bastante para reconhecer.</summary>
    private static string? Prefixo(string? segredo)
        => segredo is null ? null : segredo[..Math.Min(segredo.Length, 12)];

    private const string SemHmac =
        "A assinatura simples fica indisponivel nesta instalacao. Use o JWT, com a chave publica do seu sistema.";

    /// <summary>A chave secreta do projeto, ou a recusa que diz por que ela nao existe aqui.</summary>
    private static string RequireSecret(long projectId, int version)
        => InheritedIdentity.ProjectSecret(projectId, version) ?? throw new ArgumentException(SemHmac);

    /// <summary>
    /// Traduz a entidade — ou a ausencia dela — para a resposta.
    /// </summary>
    private static IdentitySettingsViewModel Map(ProjectIdentitySettings? settings)
        => new(
            settings?.Mode ?? IdentitySettingsDefaults.Mode,
            settings?.Visibility ?? IdentitySettingsDefaults.Visibility,
            settings?.AsksForName ?? IdentitySettingsDefaults.AsksForName,
            settings?.IdentityPublicKey,
            settings?.IdentityTokenMaxMinutes ?? IdentitySettingsDefaults.IdentityTokenMaxMinutes,
            settings?.IdentityRequired ?? IdentitySettingsDefaults.IdentityRequired,
            settings?.IdentityFormat ?? IdentitySettingsDefaults.IdentityFormat,
            InheritedIdentity.IsHmacAvailable);

    /// <summary>
    /// Confere o par, e nao cada campo sozinho.
    ///
    /// <para><b>A regra e a mesma nos dois sentidos</b>: escolher "publico
    /// identificado" num projeto sem identidade, ou voltar para o protocolo com
    /// "publico identificado" ja gravado, chegam aqui pelo mesmo caminho. Conferir
    /// campo a campo deixaria a segunda passar — e o projeto ficaria prometendo
    /// mostrar uma identidade que deixou de existir.</para>
    ///
    /// <para>A recusa <b>diz a saida</b>, e nao so o erro: quem quer publicar sem
    /// identificar tem o anonimo, e quem quer identificar tem o codigo pessoal ou a
    /// identidade do proprio sistema.</para>
    /// </summary>
    private static void RequireIdentityForIdentifiedVisibility(ReporterIdentityModeEnum mode, ReportVisibilityEnum visibility)
    {
        if (visibility == ReportVisibilityEnum.PublicIdentified && mode == ReporterIdentityModeEnum.Protocol)
            throw new ArgumentException(
                "Publico identificado exige um projeto que identifique quem relata. Escolha o codigo pessoal ou a identidade do seu sistema, ou publique como anonimo.");
    }

    /// <summary>
    /// Recusa o campo ausente em vez de assumir um valor.
    ///
    /// <para>Aqui isso pesa mais do que nas outras telas: assumir o padrao faria uma
    /// requisicao incompleta <b>trocar o modo de identificacao</b> do projeto sem
    /// ninguem ter escolhido — e um projeto que identificava passaria a nao
    /// identificar, em silencio.</para>
    /// </summary>
    private static T Required<T>(T? value, string message) where T : struct
        => value ?? throw new ArgumentException(message);

    /// <summary>
    /// O projeto da sessao atual. O filtro global ja limita a consulta aos projetos que
    /// a pessoa da sessao enxerga, entao projeto em que ela nao esta simplesmente nao volta.
    /// </summary>
    private async Task<Project> RequireOwnProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
