using Microsoft.EntityFrameworkCore;
using Pds.ApiBase.Repositories;
using Pds.Data.Context;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Data.Repositories;

public class ProjectRepository : BaseRepository<Project, DataContext>, IProjectRepository
{
    /// <summary>
    /// Marca no SQL a conferencia de nome repetido — uma das tres leituras de painel
    /// que desligam o filtro de proposito, ao lado das duas da montagem do acesso.
    /// </summary>
    public const string NameCheckQueryTag = "conferencia de nome repetido na conta";

    public ProjectRepository(DataContext context) : base(context)
    {
    }

    public async Task<IReadOnlyList<Project>> ListAsync(CancellationToken cancellationToken = default)
        // O filtro global ja restringe aos projetos que a pessoa enxerga.
        => await Context.Projects
            .Include(project => project.Account)
            .OrderByDescending(project => project.CreatedAt)
            .ToListAsync(cancellationToken);

    public Task<Project?> GetWithAccountAsync(Guid publicId, CancellationToken cancellationToken = default)
        => Context.Projects
            .Include(project => project.Account)
            .FirstOrDefaultAsync(project => project.PublicId == publicId, cancellationToken);

    public Task<bool> NameExistsAsync(long accountId, string name, long? ignoreProjectId = null,
        CancellationToken cancellationToken = default)
        => Context.Projects
            .TagWith(NameCheckQueryTag)
            // Atravessa o filtro de acesso e reescreve a exclusao logica a mao: o nome
            // e unico na conta inteira, inclusive entre os projetos que a pessoa nao
            // enxerga — ver a interface.
            .IgnoreQueryFilters()
            .Where(project => project.DeletedAt == null && project.AccountId == accountId)
            .Where(project => ignoreProjectId == null || project.Id != ignoreProjectId)
            // Comparacao sem diferenciar maiuscula: para quem usa, "Loja" e "loja"
            // sao o mesmo projeto, e deixar os dois existirem so gera confusao.
            .AnyAsync(project => project.Name.ToLower() == name.ToLower(), cancellationToken);

    public async Task<int> NextCardNumberAsync(long projectId, CancellationToken cancellationToken = default)
    {
        // SQL direto: o LINQ nao escreve "some e devolva o valor novo" num comando
        // so, e em dois comandos voltaria a corrida que o contador existe para
        // evitar. SQL escrito a mao nao passa pelo filtro global — e e o que a
        // criacao do relato, sem sessao, precisa. Sem updated_at: numerar um card
        // nao e mudar o projeto. A marca "numero do card" vai escrita no comando, e
        // nao interpolada: interpolada, viraria parametro, e o log do banco nao a
        // mostraria.
        var numeros = await Context.Database
            .SqlQuery<int>($"""
                -- numero do card
                UPDATE projects
                SET last_card_number = last_card_number + 1
                WHERE id = {projectId}
                RETURNING last_card_number AS "Value"
                """)
            .ToListAsync(cancellationToken);

        return numeros.Count == 1
            ? numeros[0]
            : throw new InvalidOperationException("Projeto nao encontrado ao numerar o card.");
    }

    public async Task<long> NextTopRankAsync(long projectId, CancellationToken cancellationToken = default)
    {
        // O mesmo desenho do numero: "desca e devolva o valor novo" num comando so, e
        // escrito a mao porque o LINQ nao o escreve — e porque o relato que chega
        // pela ferramenta nao tem sessao. Sem updated_at: arrumar o quadro nao e
        // mudar o projeto.
        var topos = await Context.Database
            .SqlQuery<long>($"""
                -- topo do quadro
                UPDATE projects
                SET board_top_rank = board_top_rank - {Report.BoardRankGap}
                WHERE id = {projectId}
                RETURNING board_top_rank AS "Value"
                """)
            .ToListAsync(cancellationToken);

        return topos.Count == 1
            ? topos[0]
            : throw new InvalidOperationException("Projeto nao encontrado ao por o card no topo do quadro.");
    }
}
