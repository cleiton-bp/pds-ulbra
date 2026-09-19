using Pds.Domain.Dtos;
using Pds.Domain.Entities;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

namespace Pds.Service.Services;

/// <summary>
/// As regras do ciclo, lidas e trocadas.
///
/// <para><b>Ler nunca devolve vazio.</b> Projeto sem linha responde com o padrao
/// de fabrica, e a resposta e indistinguivel da de quem salvou aqueles mesmos
/// valores — quem le precisa saber como o ciclo se comporta, e nao se existe linha
/// no banco.</para>
/// </summary>
public class ProjectCycleSettingsService : IProjectCycleSettingsService
{
    private readonly IUnitOfWork _unitOfWork;

    /// <summary>
    /// Lido, e nunca chamado daqui: esta tela nao agenda nada. Serve para
    /// <b>recusar</b> uma espera que nao teria como acontecer — oferecer a janela e
    /// nao cumpri-la deixaria o relato invisivel para quem o escreveu, e nada
    /// acusaria.
    /// </summary>
    private readonly IDelayedScheduler _scheduler;

    public ProjectCycleSettingsService(IUnitOfWork unitOfWork, IDelayedScheduler scheduler)
    {
        _unitOfWork = unitOfWork;
        _scheduler = scheduler;
    }

    public async Task<CycleSettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);

        return await MapAsync(settings, cancellationToken);
    }

    public async Task<CycleSettingsViewModel> ReplaceAsync(Guid projectPublicId, CycleSettingsDto dto, CancellationToken cancellationToken = default)
    {
        var project = await RequireOwnProjectAsync(projectPublicId, cancellationToken);
        var settings = await _unitOfWork.ProjectCycleSettings.GetByProjectAsync(project.Id, cancellationToken);

        var novo = settings is null;
        settings ??= new ProjectCycleSettings { ProjectId = project.Id };

        settings.ClosureTrigger = Required(dto.ClosureTrigger, "Informe como o relato encerra.");
        settings.PublicDelayMinutes = Range(
            dto.PublicDelayMinutes, 0, ProjectCycleSettings.MaxPublicDelayMinutes,
            "a espera antes de quem relatou ver", "minutos");

        // **Sem fila, a espera nao existe** — e recusar e melhor do que aceitar. Uma
        // janela configurada que nunca vence deixa o relato parado do lado de fora
        // para sempre, e a tela continuaria dizendo que esta tudo certo.
        if (settings.PublicDelayMinutes > 0 && !_scheduler.IsAvailable)
            throw new ConflictException(
                "A espera depende de uma fila, e nao ha nenhuma configurada nesta instalacao.");
        settings.AllowsReopen = Required(dto.AllowsReopen, "Informe se quem relatou pode reabrir.");
        settings.ReopenStateId = await ResolveReopenStateAsync(project.Id, dto.ReopenStatePublicId, cancellationToken);
        settings.ReopenRequiresComment = Required(dto.ReopenRequiresComment, "Informe se reabrir exige um comentario.");
        settings.TrackingCodeCanAct = Required(dto.TrackingCodeCanAct, "Informe se o protocolo sozinho confirma e reabre.");
        settings.SatisfactionEnabled = Required(dto.SatisfactionEnabled, "Informe se a nota e pedida.");
        settings.SatisfactionStyle = Required(dto.SatisfactionStyle, "Informe como a nota aparece.");
        settings.SatisfactionRequired = Required(dto.SatisfactionRequired, "Informe se a nota e obrigatoria.");
        settings.InfoRequestEnabled = Required(dto.InfoRequestEnabled, "Informe se o time pode pedir informacao.");
        settings.InfoRequestWarnDays = Range(
            dto.InfoRequestWarnDays, 1, ProjectCycleSettings.MaxInfoRequestDays,
            "o prazo ate avisar quem relatou", "dias");
        settings.InfoRequestCloseDays = Range(
            dto.InfoRequestCloseDays, 1, ProjectCycleSettings.MaxInfoRequestDays,
            "o prazo ate encerrar sem retorno", "dias");
        settings.AcceptsQuestionsDefault = Required(dto.AcceptsQuestionsDefault, "Informe como a opcao de aceitar duvidas vem marcada.");

        if (novo)
            await _unitOfWork.ProjectCycleSettings.AddAsync(settings, cancellationToken);
        else
            _unitOfWork.ProjectCycleSettings.Update(settings);

        await _unitOfWork.CommitAsync(cancellationToken);

        return await MapAsync(settings, cancellationToken);
    }

    /// <summary>
    /// A coluna de destino da reabertura, traduzida de identificador publico para a
    /// chave interna.
    ///
    /// <para><b>Nulo e uma escolha</b>, e nao ausencia: quer dizer "a primeira
    /// ativa", que e o padrao e funciona sem ninguem configurar.</para>
    ///
    /// <para><b>Coluna aposentada e recusada.</b> Reabrir joga o relato de volta na
    /// fila de trabalho, e mandar para uma coluna que ninguem olha seria perder o
    /// relato de novo — que e exatamente o que a reabertura existe para evitar.</para>
    /// </summary>
    private async Task<long?> ResolveReopenStateAsync(long projectId, Guid? statePublicId, CancellationToken cancellationToken)
    {
        if (statePublicId is null)
            return null;

        var state = await _unitOfWork.ProjectStates.GetByPublicIdAsync(statePublicId.Value, cancellationToken);

        if (state is null || state.ProjectId != projectId)
            throw new KeyNotFoundException("Estado nao encontrado neste projeto.");

        if (!state.IsActive)
            throw new ArgumentException("Esta coluna esta aposentada e nao pode receber um relato reaberto.");

        return state.Id;
    }

    /// <summary>
    /// Traduz a entidade — ou a ausencia dela — para a resposta.
    ///
    /// <para>A leitura do estado de destino so acontece quando ha um: o caso comum
    /// e nulo, e uma consulta por leitura da tela para descobrir isso seria viagem
    /// ao banco para confirmar o padrao.</para>
    /// </summary>
    private async Task<CycleSettingsViewModel> MapAsync(ProjectCycleSettings? settings, CancellationToken cancellationToken)
    {
        var reopenState = settings?.ReopenStateId is long stateId
            ? await _unitOfWork.ProjectStates.GetByIdAsync(stateId, cancellationToken)
            : null;

        return new CycleSettingsViewModel(
            settings?.ClosureTrigger ?? CycleSettingsDefaults.ClosureTrigger,
            settings?.PublicDelayMinutes ?? CycleSettingsDefaults.PublicDelayMinutes,
            settings?.AllowsReopen ?? CycleSettingsDefaults.AllowsReopen,
            reopenState?.PublicId,
            settings?.ReopenRequiresComment ?? CycleSettingsDefaults.ReopenRequiresComment,
            settings?.TrackingCodeCanAct ?? CycleSettingsDefaults.TrackingCodeCanAct,
            settings?.SatisfactionEnabled ?? CycleSettingsDefaults.SatisfactionEnabled,
            settings?.SatisfactionStyle ?? CycleSettingsDefaults.SatisfactionStyle,
            settings?.SatisfactionRequired ?? CycleSettingsDefaults.SatisfactionRequired,
            settings?.InfoRequestEnabled ?? CycleSettingsDefaults.InfoRequestEnabled,
            settings?.InfoRequestWarnDays ?? CycleSettingsDefaults.InfoRequestWarnDays,
            settings?.InfoRequestCloseDays ?? CycleSettingsDefaults.InfoRequestCloseDays,
            settings?.AcceptsQuestionsDefault ?? CycleSettingsDefaults.AcceptsQuestionsDefault);
    }

    private static T Required<T>(T? value, string message) where T : struct
        => value ?? throw new ArgumentException(message);

    /// <summary>
    /// Recusa o numero fora da faixa em vez de corta-lo.
    ///
    /// <para>Cortar em silencio seria pior aqui do que na paginacao: quem digitou
    /// 10000 minutos de espera precisa descobrir que o teto e uma semana, e nao
    /// salvar achando que configurou outra coisa.</para>
    /// </summary>
    private static int Range(int? value, int min, int max, string campo, string unidade)
    {
        var numero = value ?? throw new ArgumentException($"Informe {campo}.");

        if (numero < min || numero > max)
            throw new ArgumentException($"Informe {campo} entre {min} e {max} {unidade}.");

        return numero;
    }

    /// <summary>
    /// O projeto da sessao atual. O filtro global ja limita a consulta a conta que
    /// esta usando o painel, entao projeto de outra conta simplesmente nao volta.
    /// </summary>
    private async Task<Project> RequireOwnProjectAsync(Guid publicId, CancellationToken cancellationToken)
        => await _unitOfWork.Projects.GetByPublicIdAsync(publicId, cancellationToken)
           ?? throw new KeyNotFoundException("Projeto nao encontrado.");
}
