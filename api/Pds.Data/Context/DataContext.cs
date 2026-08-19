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
}
