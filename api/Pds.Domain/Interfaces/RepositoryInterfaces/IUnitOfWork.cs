using Pds.ApiBase.Interfaces;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>
/// Reune os repositorios e confirma tudo numa unica gravacao. E o que permite
/// criar o projeto e as duas chaves de uma vez: ou entra tudo, ou nao entra nada.
/// </summary>
public interface IUnitOfWork : IBaseUnitOfWork
{
    IAccountRepository Accounts { get; }
    IUserRepository Users { get; }
    IProjectRepository Projects { get; }
    IProjectKeyRepository ProjectKeys { get; }
    IProjectOriginRepository ProjectOrigins { get; }
    IProjectWidgetSettingsRepository ProjectWidgetSettings { get; }
    IProjectStateRepository ProjectStates { get; }
    IProjectInitialStateRepository ProjectInitialStates { get; }
    IProjectPublicStageRepository ProjectPublicStages { get; }
    IProjectStatusMappingRepository ProjectStatusMappings { get; }
    IProjectCycleSettingsRepository ProjectCycleSettings { get; }
    IProjectIdentitySettingsRepository ProjectIdentitySettings { get; }
    IReportRepository Reports { get; }
    IReportInternalCommentRepository ReportInternalComments { get; }
    IReportPublicCommentRepository ReportPublicComments { get; }
    IReportClosureRepository ReportClosures { get; }
    IReportInfoRequestRepository ReportInfoRequests { get; }
    IEventRepository Events { get; }
}
