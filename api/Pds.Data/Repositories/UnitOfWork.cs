using Pds.ApiBase;
using Pds.Data.Context;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

/// <summary>
/// Cria os repositorios sob demanda, todos sobre o mesmo <see cref="DataContext"/>,
/// e confirma tudo de uma vez no <c>CommitAsync</c>.
/// </summary>
public class UnitOfWork : BaseUnitOfWork, IUnitOfWork
{
    private readonly DataContext _context;

    public UnitOfWork(DataContext context) : base(context)
    {
        _context = context;
    }

    private IAccountRepository? _accounts;
    public IAccountRepository Accounts => _accounts ??= new AccountRepository(_context);

    private IUserRepository? _users;
    public IUserRepository Users => _users ??= new UserRepository(_context);

    private IProjectRepository? _projects;
    public IProjectRepository Projects => _projects ??= new ProjectRepository(_context);

    private IProjectKeyRepository? _projectKeys;
    public IProjectKeyRepository ProjectKeys => _projectKeys ??= new ProjectKeyRepository(_context);

    private IProjectOriginRepository? _projectOrigins;
    public IProjectOriginRepository ProjectOrigins => _projectOrigins ??= new ProjectOriginRepository(_context);

    private IProjectWidgetSettingsRepository? _projectWidgetSettings;

    public IProjectWidgetSettingsRepository ProjectWidgetSettings
        => _projectWidgetSettings ??= new ProjectWidgetSettingsRepository(_context);

    private IProjectStateRepository? _projectStates;
    public IProjectStateRepository ProjectStates => _projectStates ??= new ProjectStateRepository(_context);

    private IProjectInitialStateRepository? _projectInitialStates;

    public IProjectInitialStateRepository ProjectInitialStates
        => _projectInitialStates ??= new ProjectInitialStateRepository(_context);

    private IProjectPublicStageRepository? _projectPublicStages;

    public IProjectPublicStageRepository ProjectPublicStages
        => _projectPublicStages ??= new ProjectPublicStageRepository(_context);

    private IProjectStatusMappingRepository? _projectStatusMappings;

    public IProjectStatusMappingRepository ProjectStatusMappings
        => _projectStatusMappings ??= new ProjectStatusMappingRepository(_context);

    private IProjectCycleSettingsRepository? _projectCycleSettings;

    public IProjectCycleSettingsRepository ProjectCycleSettings
        => _projectCycleSettings ??= new ProjectCycleSettingsRepository(_context);

    private IProjectIdentitySettingsRepository? _projectIdentitySettings;

    public IProjectIdentitySettingsRepository ProjectIdentitySettings
        => _projectIdentitySettings ??= new ProjectIdentitySettingsRepository(_context);

    private IReporterCodeRepository? _reporterCodes;
    public IReporterCodeRepository ReporterCodes => _reporterCodes ??= new ReporterCodeRepository(_context);

    private IReportRepository? _reports;
    public IReportRepository Reports => _reports ??= new ReportRepository(_context);

    private IReportInternalCommentRepository? _reportInternalComments;

    public IReportInternalCommentRepository ReportInternalComments
        => _reportInternalComments ??= new ReportInternalCommentRepository(_context);

    private IReportPublicCommentRepository? _reportPublicComments;

    public IReportPublicCommentRepository ReportPublicComments
        => _reportPublicComments ??= new ReportPublicCommentRepository(_context);

    private IReportClosureRepository? _reportClosures;
    public IReportClosureRepository ReportClosures => _reportClosures ??= new ReportClosureRepository(_context);

    private IReportInfoRequestRepository? _reportInfoRequests;

    public IReportInfoRequestRepository ReportInfoRequests
        => _reportInfoRequests ??= new ReportInfoRequestRepository(_context);

    private IEventRepository? _events;
    public IEventRepository Events => _events ??= new EventRepository(_context);
}
