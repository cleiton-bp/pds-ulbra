using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

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

        RequireIdentityForIdentifiedVisibility(mode, visibility);

        var settings = await _unitOfWork.ProjectIdentitySettings.GetByProjectAsync(project.Id, cancellationToken);

        var novo = settings is null;
        settings ??= new ProjectIdentitySettings { ProjectId = project.Id };

        settings.Mode = mode;
        settings.Visibility = visibility;

        if (novo)
            await _unitOfWork.ProjectIdentitySettings.AddAsync(settings, cancellationToken);
        else
            _unitOfWork.ProjectIdentitySettings.Update(settings);

        await _unitOfWork.CommitAsync(cancellationToken);

        return Map(settings);
    }

    /// <summary>
    /// Traduz a entidade — ou a ausencia dela — para a resposta.
    /// </summary>
    private static IdentitySettingsViewModel Map(ProjectIdentitySettings? settings)
        => new(
            settings?.Mode ?? IdentitySettingsDefaults.Mode,
            settings?.Visibility ?? IdentitySettingsDefaults.Visibility);

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
    /// identificar tem o anonimo, e quem quer identificar tem o codigo
    /// pessoal.</para>
    /// </summary>
    private static void RequireIdentityForIdentifiedVisibility(ReporterIdentityModeEnum mode, ReportVisibilityEnum visibility)
    {
        if (visibility == ReportVisibilityEnum.PublicIdentified && mode == ReporterIdentityModeEnum.Protocol)
            throw new ArgumentException(
                "Publico identificado exige um projeto que identifique quem relata. Escolha o codigo pessoal, ou publique como anonimo.");
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
    /// O projeto da sessao atual. O filtro global ja limita a consulta a conta que
    /// esta usando o painel, entao projeto de outra conta simplesmente nao volta.
    /// </summary>
    private async Task<Project> RequireOwnProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
