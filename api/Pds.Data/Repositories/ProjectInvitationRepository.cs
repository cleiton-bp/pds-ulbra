using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectInvitationRepository : BaseRepository<ProjectInvitation, DataContext>, IProjectInvitationRepository
{
    /// <summary>A pessoa convidada abrindo o link: ela ainda nao enxerga o projeto.</summary>
    public const string TokenQueryTag = "convite aberto pelo link";

    /// <summary>O consumidor da fila montando e mandando o e-mail: nao ha sessao.</summary>
    public const string EmailQueryTag = "envio do e-mail do convite";

    public ProjectInvitationRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<ProjectInvitation>> ListOpenByProjectAsync(long projectId, CancellationToken cancellationToken = default)
        => await Context.ProjectInvitations
            .AsNoTracking()
            .Include(invitation => invitation.InvitedByUser)
            .Where(invitation => invitation.ProjectId == projectId
                                 && invitation.AcceptedAt == null
                                 && invitation.RevokedAt == null)
            .OrderByDescending(invitation => invitation.CreatedAt)
            .ThenByDescending(invitation => invitation.Id)
            .ToListAsync(cancellationToken);

    public Task<ProjectInvitation?> FindOpenByEmailAsync(long projectId, string email, CancellationToken cancellationToken = default)
        => Context.ProjectInvitations
            .Include(invitation => invitation.InvitedByUser)
            .FirstOrDefaultAsync(invitation => invitation.ProjectId == projectId
                                               && invitation.Email == email
                                               && invitation.AcceptedAt == null
                                               && invitation.RevokedAt == null,
                cancellationToken);

    public Task<ProjectInvitation?> FindByTokenHashWithoutSessionAsync(string tokenHash, CancellationToken cancellationToken = default)
        // As condicoes do filtro global reescritas a mao, menos a do acesso: quem
        // abre o link esta entrando no time, e ainda nao enxerga o projeto. O hash
        // de 256 bits e a credencial — e o servico ainda confere o Google da pessoa.
        => Context.ProjectInvitations
            .TagWith(TokenQueryTag)
            .IgnoreQueryFilters()
            .Include(invitation => invitation.Project)
            .Include(invitation => invitation.InvitedByUser)
            .FirstOrDefaultAsync(invitation => invitation.TokenHash == tokenHash
                                               && invitation.DeletedAt == null
                                               && invitation.Project.DeletedAt == null,
                cancellationToken);

    public Task<ProjectInvitation?> GetForEmailWithoutSessionAsync(Guid publicId, CancellationToken cancellationToken = default)
        // O consumidor da fila nao tem sessao nenhuma: a lista de projetos
        // acessiveis esta vazia, e o filtro global esconderia tudo. Sem rastreio: o
        // que ele grava vai por gravacao condicional, e uma entidade rastreada
        // gravaria de volta o que leu, por cima de um reenvio feito no meio.
        => Context.ProjectInvitations
            .AsNoTracking()
            .TagWith(EmailQueryTag)
            .IgnoreQueryFilters()
            .Include(invitation => invitation.Project)
            .Include(invitation => invitation.InvitedByUser)
            .FirstOrDefaultAsync(invitation => invitation.PublicId == publicId
                                               && invitation.DeletedAt == null
                                               && invitation.Project.DeletedAt == null,
                cancellationToken);

    public async Task<bool> TryClaimForSendingWithoutSessionAsync(long invitationId, DateTime readUpdatedAt, string tokenHash, DateTime now, CancellationToken cancellationToken = default)
    {
        // **Uma gravacao condicional, e nao ler e depois gravar.** Entre a leitura e
        // a gravacao, a varredura da subida e a mensagem da fila podem pegar o mesmo
        // convite — e a pessoa receberia dois e-mails com links diferentes. Aqui so
        // um dos dois muda a linha; o outro ve zero linhas e desiste.
        //
        // O updated_at lido entra na condicao: se um reenvio mudou papel ou prazo
        // depois da leitura, o e-mail montado com o que foi lido sairia errado. E o
        // hash vai junto da reserva — o banco nunca fica "enviando" sem o hash do
        // link que esta saindo.
        //
        // A gravacao direta nao passa pelo SaveChanges, entao o updated_at vai a mao.
        var linhas = await Context.ProjectInvitations
            .TagWith(EmailQueryTag)
            .IgnoreQueryFilters()
            .Where(invitation => invitation.Id == invitationId
                                 && invitation.EmailStatus == InvitationEmailStatusEnum.Pending
                                 && invitation.UpdatedAt == readUpdatedAt
                                 && invitation.AcceptedAt == null
                                 && invitation.RevokedAt == null
                                 && invitation.DeletedAt == null)
            .ExecuteUpdateAsync(set => set
                    .SetProperty(invitation => invitation.EmailStatus, InvitationEmailStatusEnum.Sending)
                    .SetProperty(invitation => invitation.TokenHash, tokenHash)
                    .SetProperty(invitation => invitation.EmailAttemptedAt, now)
                    .SetProperty(invitation => invitation.UpdatedAt, now),
                cancellationToken);

        return linhas == 1;
    }

    public async Task<bool> FinishSendingWithoutSessionAsync(long invitationId, string tokenHash, bool sent, string? error, DateTime now, CancellationToken cancellationToken = default)
    {
        // "Enviando", com o hash deste envio: a prova de que a linha ainda e dele.
        // Sem condicao, um reenvio no meio — que pos o convite de novo na fila, sem
        // hash — seria coberto por "enviado": o pedido novo desistiria, e o unico
        // e-mail que saiu teria um link que nao abre nada. Com um consumidor so, o
        // status ja basta; o hash cobre duas instancias da API, em que o pedido novo
        // pode reservar antes de o antigo terminar.
        var linhas = await Context.ProjectInvitations
            .TagWith(EmailQueryTag)
            .IgnoreQueryFilters()
            .Where(invitation => invitation.Id == invitationId
                                 && invitation.EmailStatus == InvitationEmailStatusEnum.Sending
                                 && invitation.TokenHash == tokenHash
                                 && invitation.DeletedAt == null)
            .ExecuteUpdateAsync(set => set
                    .SetProperty(invitation => invitation.EmailStatus,
                        sent ? InvitationEmailStatusEnum.Sent : InvitationEmailStatusEnum.Failed)
                    .SetProperty(invitation => invitation.EmailSentAt, sent ? now : (DateTime?)null)
                    .SetProperty(invitation => invitation.EmailError, error)
                    .SetProperty(invitation => invitation.UpdatedAt, now),
                cancellationToken);

        return linhas == 1;
    }

    public async Task<bool> FailPendingWithoutSessionAsync(long invitationId, DateTime readUpdatedAt, string error, DateTime now, CancellationToken cancellationToken = default)
    {
        // Vencido ou sem e-mail — mas so a linha que foi lida: um reenvio no meio
        // trouxe prazo novo, e marcar "nao saiu" por cima dele seria mentira.
        var linhas = await Context.ProjectInvitations
            .TagWith(EmailQueryTag)
            .IgnoreQueryFilters()
            .Where(invitation => invitation.Id == invitationId
                                 && invitation.EmailStatus == InvitationEmailStatusEnum.Pending
                                 && invitation.UpdatedAt == readUpdatedAt
                                 && invitation.DeletedAt == null)
            .ExecuteUpdateAsync(set => set
                    .SetProperty(invitation => invitation.EmailStatus, InvitationEmailStatusEnum.Failed)
                    .SetProperty(invitation => invitation.EmailError, error)
                    .SetProperty(invitation => invitation.UpdatedAt, now),
                cancellationToken);

        return linhas == 1;
    }

    public async Task<IReadOnlyList<Guid>> ListPendingEmailWithoutSessionAsync(CancellationToken cancellationToken = default)
        => await Context.ProjectInvitations
            .TagWith(EmailQueryTag)
            .IgnoreQueryFilters()
            .Where(invitation => invitation.EmailStatus == InvitationEmailStatusEnum.Pending
                                 && invitation.AcceptedAt == null
                                 && invitation.RevokedAt == null
                                 && invitation.DeletedAt == null
                                 && invitation.Project.DeletedAt == null)
            .OrderBy(invitation => invitation.Id)
            .Select(invitation => invitation.PublicId)
            .ToListAsync(cancellationToken);

    public Task<int> FailStuckSendingWithoutSessionAsync(DateTime attemptedBefore, string error, CancellationToken cancellationToken = default)
        // Preso em "enviando" desde antes da subida: o processo caiu no meio. Nao da
        // para saber se o servidor chegou a aceitar — e marcar falha e o lado
        // seguro: a tela oferece reenviar, e o reenvio gera link novo.
        => Context.ProjectInvitations
            .TagWith(EmailQueryTag)
            .IgnoreQueryFilters()
            .Where(invitation => invitation.EmailStatus == InvitationEmailStatusEnum.Sending
                                 && invitation.EmailAttemptedAt < attemptedBefore
                                 && invitation.DeletedAt == null)
            .ExecuteUpdateAsync(set => set
                    .SetProperty(invitation => invitation.EmailStatus, InvitationEmailStatusEnum.Failed)
                    .SetProperty(invitation => invitation.EmailError, error)
                    .SetProperty(invitation => invitation.UpdatedAt, DateTime.UtcNow),
                cancellationToken);
}
