using Microsoft.EntityFrameworkCore;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Data.Context;

/// <summary>
/// Contexto principal da aplicacao.
///
/// <para><b>O isolamento entre contas mora aqui.</b> As entidades de negocio
/// ganham um filtro global que so devolve o que pertence a conta da requisicao.
/// Assim, mesmo que um identificador de outra conta chegue numa consulta, nada
/// volta — o isolamento nao depende de cada consulta lembrar de filtrar, porque se
/// depender de lembrar um dia alguem esquece, e aqui esquecer e entregar dado de
/// outro cliente.</para>
///
/// <para><see cref="Account"/> e <see cref="User"/> ficam de fora do filtro de
/// proposito: sao as tabelas de identidade, consultadas no login, quando ainda nao
/// se sabe de qual conta a pessoa e. Nenhuma rota lista usuario ou conta de forma
/// aberta — o acesso a elas passa sempre pelo identificador que veio do token.</para>
/// </summary>
public class DataContext : PdsBaseContext
{
    private readonly IAccountContext _accountContext;

    public DataContext(DbContextOptions<DataContext> options, IAccountContext accountContext) : base(options)
    {
        _accountContext = accountContext;
    }

    /// <summary>
    /// Conta da requisicao atual. O EF le esta propriedade a cada consulta, entao o
    /// filtro global acompanha a requisicao sem precisar reconstruir o modelo.
    ///
    /// Sem sessao o valor e zero, que nao corresponde a nenhuma conta: o padrao e
    /// nao ver nada, e nao ver tudo.
    /// </summary>
    public long CurrentAccountId => _accountContext.AccountId ?? 0;

    public DbSet<Account> Accounts { get; set; } = null!;
    public DbSet<User> Users { get; set; } = null!;
    public DbSet<Project> Projects { get; set; } = null!;
    public DbSet<ProjectKey> ProjectKeys { get; set; } = null!;
    public DbSet<ProjectOrigin> ProjectOrigins { get; set; } = null!;
    public DbSet<ProjectWidgetSettings> ProjectWidgetSettings { get; set; } = null!;
    public DbSet<ProjectState> ProjectStates { get; set; } = null!;
    public DbSet<ProjectInitialState> ProjectInitialStates { get; set; } = null!;
    public DbSet<Report> Reports { get; set; } = null!;
    public DbSet<ReportContext> ReportContexts { get; set; } = null!;
    public DbSet<ReportInternalComment> ReportInternalComments { get; set; } = null!;
    public DbSet<ReportPublicComment> ReportPublicComments { get; set; } = null!;
    public DbSet<Event> Events { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Aplica os mapeamentos de Types/ e o filtro global de exclusao logica.
        base.OnModelCreating(modelBuilder);

        // Projeto: exclusao logica mais conta. Substitui o filtro herdado.
        modelBuilder.Entity<Project>()
            .HasQueryFilter(project => project.DeletedAt == null && project.AccountId == CurrentAccountId);

        // Chave: chega na conta pelo projeto. A modelagem nao repete account_id aqui
        // porque a chave nao existe fora de um projeto; o preco e este filtro passar
        // pela navegacao, e o ganho e nao ter a mesma informacao em duas tabelas
        // podendo divergir.
        modelBuilder.Entity<ProjectKey>()
            .HasQueryFilter(key => key.DeletedAt == null
                                   && key.Project.DeletedAt == null
                                   && key.Project.AccountId == CurrentAccountId);

        // Endereco autorizado: chega na conta pelo projeto, como a chave, e pelo
        // mesmo motivo — ele nao existe fora de um projeto.
        modelBuilder.Entity<ProjectOrigin>()
            .HasQueryFilter(origin => origin.DeletedAt == null
                                      && origin.Project.DeletedAt == null
                                      && origin.Project.AccountId == CurrentAccountId);

        // Configuracao da ferramenta: mesmo caminho do endereco autorizado. Quem le
        // isto **sem sessao** e o proprio quadro, e la a conta atual e zero — por
        // isso a leitura publica desliga este filtro e reescreve as condicoes a mao,
        // como ja faz a busca da chave publica.
        modelBuilder.Entity<ProjectWidgetSettings>()
            .HasQueryFilter(settings => settings.DeletedAt == null
                                        && settings.Project.DeletedAt == null
                                        && settings.Project.AccountId == CurrentAccountId);

        // Estado da fila de trabalho: mesmo caminho do endereco autorizado, e pelo
        // mesmo motivo — ele nao existe fora de um projeto.
        modelBuilder.Entity<ProjectState>()
            .HasQueryFilter(state => state.DeletedAt == null
                                     && state.Project.DeletedAt == null
                                     && state.Project.AccountId == CurrentAccountId);

        // Onde cada tipo entra: mesmo caminho do estado, e pelo mesmo motivo. Quem
        // le isto **sem sessao** e a entrada do relato, e la a conta atual e zero —
        // por isso aquela leitura desliga este filtro e reescreve as condicoes a
        // mao, como ja fazem a busca da chave publica e a do endereco autorizado.
        modelBuilder.Entity<ProjectInitialState>()
            .HasQueryFilter(initial => initial.DeletedAt == null
                                       && initial.Project.DeletedAt == null
                                       && initial.Project.AccountId == CurrentAccountId);

        // Relato: aqui o filtro compara coluna, e nao navegacao. E a tabela que mais
        // cresce e a que o painel lista o tempo todo, entao ela repete account_id de
        // proposito para o isolamento nao custar uma juncao em toda consulta.
        modelBuilder.Entity<Report>()
            .HasQueryFilter(report => report.DeletedAt == null
                                      && report.AccountId == CurrentAccountId);

        // Contexto: chega na conta pelo relato, como a chave chega pelo projeto.
        modelBuilder.Entity<ReportContext>()
            .HasQueryFilter(context => context.DeletedAt == null
                                       && context.Report.DeletedAt == null
                                       && context.Report.AccountId == CurrentAccountId);

        // Comentarios: chegam na conta pelo relato, como o contexto. Sao duas
        // entidades e dois filtros iguais, e nao uma com campo de visibilidade —
        // e essa separacao que faz o interno nao ter como aparecer numa resposta
        // publica por esquecimento.
        modelBuilder.Entity<ReportInternalComment>()
            .HasQueryFilter(comment => comment.DeletedAt == null
                                       && comment.Report.DeletedAt == null
                                       && comment.Report.AccountId == CurrentAccountId);

        modelBuilder.Entity<ReportPublicComment>()
            .HasQueryFilter(comment => comment.DeletedAt == null
                                       && comment.Report.DeletedAt == null
                                       && comment.Report.AccountId == CurrentAccountId);

        // Evento: so o isolamento por conta, porque nao existe evento apagado. Sem
        // sessao a conta atual e zero, que nao corresponde a nenhuma — o padrao
        // continua sendo nao ver nada, e nao ver tudo.
        modelBuilder.Entity<Event>()
            .HasQueryFilter(entity => entity.AccountId == CurrentAccountId);

        // Todas as datas do sistema sao UTC. Fixar o tipo evita que o Postgres tente
        // converter fuso por conta propria ao gravar ou ler.
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            foreach (var property in entityType.GetProperties()
                         .Where(property => property.ClrType == typeof(DateTime) || property.ClrType == typeof(DateTime?)))
            {
                property.SetColumnType("timestamp without time zone");
            }
        }
    }

    /// <summary>
    /// <see cref="Event"/> nao herda de <see cref="PdsBaseEntity"/>, entao fica de
    /// fora do preenchimento automatico do contexto base. Em vez de confiar em quem
    /// cria o evento lembrar de sortear o identificador e datar a linha, o carimbo
    /// acontece aqui — pelo mesmo motivo que ele acontece la: se depender de
    /// lembrar, um dia alguem esquece.
    ///
    /// <para><c>OccurredAt</c> so cai para <c>CreatedAt</c> quando ninguem o
    /// informou. Ele e o momento do fato, que quem registra o evento conhece melhor
    /// do que o contexto, e sobrescreve-lo apagaria a diferenca entre o fato e a
    /// gravacao — justamente o que a analise precisa enxergar quando houve
    /// retentativa.</para>
    /// </summary>
    private void StampEvents()
    {
        var now = DateTime.UtcNow;

        foreach (var entry in ChangeTracker.Entries<Event>().Where(entry => entry.State == EntityState.Added))
        {
            if (entry.Entity.PublicId == Guid.Empty)
                entry.Entity.PublicId = Guid.NewGuid();

            if (entry.Entity.CreatedAt == default)
                entry.Entity.CreatedAt = now;

            if (entry.Entity.OccurredAt == default)
                entry.Entity.OccurredAt = entry.Entity.CreatedAt;
        }
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        StampEvents();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampEvents();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }
}
