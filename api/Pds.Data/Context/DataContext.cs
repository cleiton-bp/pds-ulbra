using Microsoft.EntityFrameworkCore;
using Pds.Domain.Entities;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Data.Context;

/// <summary>
/// Contexto principal da aplicacao.
///
/// <para><b>O isolamento mora aqui.</b> As entidades de negocio ganham um filtro
/// global que so devolve o que pertence aos projetos que a pessoa da requisicao
/// enxerga — todos os da conta propria, e os de outras contas em que entrou pelo
/// time. Assim, mesmo que um identificador de outro projeto chegue numa consulta,
/// nada volta — o isolamento nao depende de cada consulta lembrar de filtrar,
/// porque se depender de lembrar um dia alguem esquece, e aqui esquecer e entregar
/// dado de outro cliente.</para>
///
/// <para><see cref="Account"/> e <see cref="User"/> ficam de fora do filtro de
/// proposito: sao as tabelas de identidade, consultadas no login e no comeco de
/// cada requisicao, quando ainda nao se sabe o que a pessoa enxerga. Nenhuma rota
/// lista usuario ou conta de forma aberta — o acesso a elas passa sempre pelo
/// identificador que veio do token, ou por um projeto que a pessoa ja enxerga.</para>
/// </summary>
public class DataContext : PdsBaseContext
{
    private readonly IAccountContext _accountContext;

    public DataContext(DbContextOptions<DataContext> options, IAccountContext accountContext) : base(options)
    {
        _accountContext = accountContext;
    }

    /// <summary>
    /// Projetos que a requisicao atual enxerga. O EF le esta propriedade a cada
    /// consulta, entao o filtro global acompanha a requisicao sem precisar
    /// reconstruir o modelo — e passa a lista ao banco como um parametro so.
    ///
    /// Sem sessao a lista e vazia, que nao corresponde a projeto nenhum: o padrao e
    /// nao ver nada, e nao ver tudo.
    /// </summary>
    public long[] CurrentProjectIds => _accountContext.ProjectIds as long[] ?? _accountContext.ProjectIds.ToArray();

    public DbSet<Account> Accounts { get; set; } = null!;
    public DbSet<User> Users { get; set; } = null!;
    public DbSet<Project> Projects { get; set; } = null!;
    public DbSet<ProjectMember> ProjectMembers { get; set; } = null!;
    public DbSet<ProjectInvitation> ProjectInvitations { get; set; } = null!;
    public DbSet<ProjectTeamSettings> ProjectTeamSettings { get; set; } = null!;
    public DbSet<ProjectKey> ProjectKeys { get; set; } = null!;
    public DbSet<ProjectOrigin> ProjectOrigins { get; set; } = null!;
    public DbSet<ProjectWidgetSettings> ProjectWidgetSettings { get; set; } = null!;
    public DbSet<ProjectState> ProjectStates { get; set; } = null!;
    public DbSet<ProjectPriority> ProjectPriorities { get; set; } = null!;
    public DbSet<ProjectLabel> ProjectLabels { get; set; } = null!;
    public DbSet<ProjectInitialState> ProjectInitialStates { get; set; } = null!;
    public DbSet<ProjectPublicStage> ProjectPublicStages { get; set; } = null!;
    public DbSet<ProjectStatusMapping> ProjectStatusMappings { get; set; } = null!;
    public DbSet<ProjectCycleSettings> ProjectCycleSettings { get; set; } = null!;
    public DbSet<ProjectIdentitySettings> ProjectIdentitySettings { get; set; } = null!;
    public DbSet<ProjectMediaSettings> ProjectMediaSettings { get; set; } = null!;
    public DbSet<ProjectMediaKind> ProjectMediaKinds { get; set; } = null!;
    public DbSet<ReporterCode> ReporterCodes { get; set; } = null!;
    public DbSet<Report> Reports { get; set; } = null!;
    public DbSet<ReportContext> ReportContexts { get; set; } = null!;
    public DbSet<ReportLabel> ReportLabels { get; set; } = null!;
    public DbSet<CardLink> CardLinks { get; set; } = null!;
    public DbSet<ReportInternalComment> ReportInternalComments { get; set; } = null!;
    public DbSet<ReportPublicComment> ReportPublicComments { get; set; } = null!;
    public DbSet<ReportClosure> ReportClosures { get; set; } = null!;
    public DbSet<ReportInfoRequest> ReportInfoRequests { get; set; } = null!;
    public DbSet<ReportAttachment> ReportAttachments { get; set; } = null!;
    public DbSet<Event> Events { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Aplica os mapeamentos de Types/ e o filtro global de exclusao logica.
        base.OnModelCreating(modelBuilder);

        // A translate do Postgres, para a busca sem acento. E funcao que ja existe no
        // banco: o mapeamento nao cria nada nem muda o esquema.
        modelBuilder.HasDbFunction(typeof(SqlText).GetMethod(nameof(SqlText.Translate))!)
            .HasName("translate")
            .IsBuiltIn();

        // Projeto: exclusao logica mais acesso. Substitui o filtro herdado. A lista
        // ja chega pronta do middleware — os da conta propria e os do time —, entao
        // aqui e uma comparacao de coluna, sem juncao com project_members.
        modelBuilder.Entity<Project>()
            .HasQueryFilter(project => project.DeletedAt == null && CurrentProjectIds.Contains(project.Id));

        // Membro do time: quem enxerga o projeto enxerga quem esta nele — e o que a
        // escolha de responsavel e a tela de membros vao precisar. Quem monta o
        // acesso no comeco da requisicao le esta tabela desligando o filtro, porque
        // ali a lista ainda esta vazia.
        modelBuilder.Entity<ProjectMember>()
            .HasQueryFilter(member => member.DeletedAt == null
                                      && member.Project.DeletedAt == null
                                      && CurrentProjectIds.Contains(member.ProjectId));

        // Convite: chega ao acesso pelo projeto, como o membro. Quem le isto **sem
        // sessao** sao tres: o consumidor da fila, que monta o e-mail; a pessoa
        // convidada, que ainda nao esta no projeto e abre o convite pelo link; e a
        // varredura da subida. Os tres desligam este filtro e reescrevem as
        // condicoes a mao, marcados com TagWith.
        modelBuilder.Entity<ProjectInvitation>()
            .HasQueryFilter(invitation => invitation.DeletedAt == null
                                          && invitation.Project.DeletedAt == null
                                          && CurrentProjectIds.Contains(invitation.ProjectId));

        // Configuracao do time: mesmo caminho das outras configuracoes do projeto.
        modelBuilder.Entity<ProjectTeamSettings>()
            .HasQueryFilter(settings => settings.DeletedAt == null
                                        && settings.Project.DeletedAt == null
                                        && CurrentProjectIds.Contains(settings.ProjectId));

        // Chave: chega ao acesso pelo projeto. A modelagem nao repete account_id aqui
        // porque a chave nao existe fora de um projeto; o acesso compara o
        // project_id da propria linha, e so a exclusao logica do projeto passa pela
        // navegacao.
        modelBuilder.Entity<ProjectKey>()
            .HasQueryFilter(key => key.DeletedAt == null
                                   && key.Project.DeletedAt == null
                                   && CurrentProjectIds.Contains(key.ProjectId));

        // Endereco autorizado: chega ao acesso pelo projeto, como a chave, e pelo
        // mesmo motivo — ele nao existe fora de um projeto.
        modelBuilder.Entity<ProjectOrigin>()
            .HasQueryFilter(origin => origin.DeletedAt == null
                                      && origin.Project.DeletedAt == null
                                      && CurrentProjectIds.Contains(origin.ProjectId));

        // Configuracao da ferramenta: mesmo caminho do endereco autorizado. Quem le
        // isto **sem sessao** e o proprio quadro, e la o acesso esta vazio — por
        // isso a leitura publica desliga este filtro e reescreve as condicoes a mao,
        // como ja faz a busca da chave publica.
        modelBuilder.Entity<ProjectWidgetSettings>()
            .HasQueryFilter(settings => settings.DeletedAt == null
                                        && settings.Project.DeletedAt == null
                                        && CurrentProjectIds.Contains(settings.ProjectId));

        // Estado da fila de trabalho: mesmo caminho do endereco autorizado, e pelo
        // mesmo motivo — ele nao existe fora de um projeto.
        modelBuilder.Entity<ProjectState>()
            .HasQueryFilter(state => state.DeletedAt == null
                                     && state.Project.DeletedAt == null
                                     && CurrentProjectIds.Contains(state.ProjectId));

        // Prioridade e etiqueta: mesmo caminho do estado, e pelo mesmo motivo. Nenhuma
        // leitura sem sessao chega a elas — sao do time, e so do time.
        modelBuilder.Entity<ProjectPriority>()
            .HasQueryFilter(priority => priority.DeletedAt == null
                                        && priority.Project.DeletedAt == null
                                        && CurrentProjectIds.Contains(priority.ProjectId));

        modelBuilder.Entity<ProjectLabel>()
            .HasQueryFilter(label => label.DeletedAt == null
                                     && label.Project.DeletedAt == null
                                     && CurrentProjectIds.Contains(label.ProjectId));

        // Onde cada tipo entra: mesmo caminho do estado, e pelo mesmo motivo. Quem
        // le isto **sem sessao** e a entrada do relato, e la o acesso esta vazio —
        // por isso aquela leitura desliga este filtro e reescreve as condicoes a
        // mao, como ja fazem a busca da chave publica e a do endereco autorizado.
        modelBuilder.Entity<ProjectInitialState>()
            .HasQueryFilter(initial => initial.DeletedAt == null
                                       && initial.Project.DeletedAt == null
                                       && CurrentProjectIds.Contains(initial.ProjectId));

        // Etapa publica: mesmo caminho do estado interno, e pelo mesmo motivo — ela
        // nao existe fora de um projeto. Quem vai ler isto **sem sessao** e a pagina
        // de acompanhamento, e la o acesso esta vazio; aquela leitura vai desligar
        // este filtro e reescrever as condicoes a mao, como ja fazem a chave publica
        // e o endereco autorizado.
        modelBuilder.Entity<ProjectPublicStage>()
            .HasQueryFilter(stage => stage.DeletedAt == null
                                     && stage.Project.DeletedAt == null
                                     && CurrentProjectIds.Contains(stage.ProjectId));

        // Mapeamento: mesmo caminho da etapa publica. Quem vai ler isto **sem
        // sessao** e a pagina de acompanhamento, e la o acesso esta vazio — aquela
        // leitura desliga este filtro e reescreve as condicoes a mao.
        modelBuilder.Entity<ProjectStatusMapping>()
            .HasQueryFilter(mapping => mapping.DeletedAt == null
                                       && mapping.Project.DeletedAt == null
                                       && CurrentProjectIds.Contains(mapping.ProjectId));

        // Regras do ciclo: mesmo caminho da configuracao da ferramenta, e pelo
        // mesmo motivo — nao existe fora de um projeto. Quem le isto **sem sessao**
        // e a pagina de acompanhamento, que precisa saber se reabrir existe aqui.
        modelBuilder.Entity<ProjectCycleSettings>()
            .HasQueryFilter(settings => settings.DeletedAt == null
                                        && settings.Project.DeletedAt == null
                                        && CurrentProjectIds.Contains(settings.ProjectId));

        // Identidade: mesmo caminho dos dois acima. Quem le isto **sem sessao** e a
        // propria ferramenta, que precisa saber se pede identidade, codigo, ou nada —
        // e essa leitura desliga este filtro e reescreve as condicoes a mao, como as
        // outras fazem.
        modelBuilder.Entity<ProjectIdentitySettings>()
            .HasQueryFilter(settings => settings.DeletedAt == null
                                        && settings.Project.DeletedAt == null
                                        && CurrentProjectIds.Contains(settings.ProjectId));

        // Configuracao de midia: mesmo caminho do endereco autorizado. Quem le isto
        // **sem sessao** e o proprio quadro, para saber se mostra o botao de anexar
        // — e la o acesso esta vazio, entao aquela leitura desliga este filtro e
        // reescreve as condicoes a mao, como a configuracao da ferramenta ja faz.
        modelBuilder.Entity<ProjectMediaSettings>()
            .HasQueryFilter(settings => settings.DeletedAt == null
                                        && settings.Project.DeletedAt == null
                                        && CurrentProjectIds.Contains(settings.ProjectId));

        // Anexo: chega ao acesso pelo projeto do relato, que e o dono dele. O caminho
        // e o mesmo do contexto do relato — e passa pelo relato de proposito,
        // porque e ele o dono, e nao o comentario onde o anexo talvez tenha vindo.
        //
        // Quem le isto **sem sessao** e quem relatou, na pagina de acompanhamento e
        // no proprio quadro; la o acesso esta vazio, entao aquela leitura desliga
        // este filtro e reescreve as condicoes a mao.
        modelBuilder.Entity<ReportAttachment>()
            .HasQueryFilter(attachment => attachment.DeletedAt == null
                                          && attachment.Report.DeletedAt == null
                                          && CurrentProjectIds.Contains(attachment.Report.ProjectId));

        // Limite por tipo: chega ao acesso por dois saltos, e nao por um. E o preco
        // de o limite pendurar na configuracao em vez de no projeto — e vale a pena,
        // porque sem a configuracao estes numeros nao querem dizer nada.
        modelBuilder.Entity<ProjectMediaKind>()
            .HasQueryFilter(kind => kind.DeletedAt == null
                                    && kind.ProjectMediaSettings.DeletedAt == null
                                    && kind.ProjectMediaSettings.Project.DeletedAt == null
                                    && CurrentProjectIds.Contains(kind.ProjectMediaSettings.ProjectId));

        // Codigo pessoal: mesmo caminho. Quem le isto **sem sessao** e a propria
        // pessoa que digitou o codigo, e la o acesso esta vazio — aquela leitura
        // desliga este filtro e reescreve as condicoes a mao.
        modelBuilder.Entity<ReporterCode>()
            .HasQueryFilter(code => code.DeletedAt == null
                                    && code.Project.DeletedAt == null
                                    && CurrentProjectIds.Contains(code.ProjectId));

        // Relato: aqui o filtro compara coluna, e nao navegacao. E a tabela que mais
        // cresce e a que o painel lista o tempo todo, entao o acesso olha o
        // project_id da propria linha, sem juncao em toda consulta.
        modelBuilder.Entity<Report>()
            .HasQueryFilter(report => report.DeletedAt == null
                                      && CurrentProjectIds.Contains(report.ProjectId));

        // Contexto: chega ao acesso pelo relato, como a chave chega pelo projeto.
        modelBuilder.Entity<ReportContext>()
            .HasQueryFilter(context => context.DeletedAt == null
                                       && context.Report.DeletedAt == null
                                       && CurrentProjectIds.Contains(context.Report.ProjectId));

        // Etiqueta no card: chega ao acesso pelo relato, como o contexto. E some junto
        // com a etiqueta apagada, mesmo que alguma linha tenha ficado para tras.
        modelBuilder.Entity<ReportLabel>()
            .HasQueryFilter(link => link.DeletedAt == null
                                    && link.Report.DeletedAt == null
                                    && link.ProjectLabel.DeletedAt == null
                                    && CurrentProjectIds.Contains(link.Report.ProjectId));

        // Vinculo entre cards: o acesso pela coluna do projeto, como o relato, e some
        // junto com qualquer um dos dois cards. Quem le sem sessao — a etapa que o
        // duplicado segue, mudada pela pagina de acompanhamento ou pela fila — desliga
        // este filtro e reescreve as condicoes a mao.
        modelBuilder.Entity<CardLink>()
            .HasQueryFilter(link => link.DeletedAt == null
                                    && link.FromReport.DeletedAt == null
                                    && link.ToReport.DeletedAt == null
                                    && CurrentProjectIds.Contains(link.ProjectId));

        // Comentarios: chegam ao acesso pelo relato, como o contexto. Sao duas
        // entidades e dois filtros iguais, e nao uma com campo de visibilidade —
        // e essa separacao que faz o interno nao ter como aparecer numa resposta
        // publica por esquecimento.
        modelBuilder.Entity<ReportInternalComment>()
            .HasQueryFilter(comment => comment.DeletedAt == null
                                       && comment.Report.DeletedAt == null
                                       && CurrentProjectIds.Contains(comment.Report.ProjectId));

        modelBuilder.Entity<ReportPublicComment>()
            .HasQueryFilter(comment => comment.DeletedAt == null
                                       && comment.Report.DeletedAt == null
                                       && CurrentProjectIds.Contains(comment.Report.ProjectId));

        // Encerramento: chega ao acesso pelo relato, como o comentario. Quem le isto
        // **sem sessao** e a pagina de acompanhamento, e la o acesso esta vazio —
        // aquela leitura desliga este filtro e reescreve as condicoes a mao.
        modelBuilder.Entity<ReportClosure>()
            .HasQueryFilter(closure => closure.DeletedAt == null
                                       && closure.Report.DeletedAt == null
                                       && CurrentProjectIds.Contains(closure.Report.ProjectId));

        // Pedido de informacao: mesmo caminho do encerramento, e pelo mesmo motivo.
        modelBuilder.Entity<ReportInfoRequest>()
            .HasQueryFilter(request => request.DeletedAt == null
                                       && request.Report.DeletedAt == null
                                       && CurrentProjectIds.Contains(request.Report.ProjectId));

        // Evento: so o acesso pelo projeto, porque nao existe evento apagado. Todo
        // evento gravado hoje nasce de um projeto; o que ficar sem projeto (a conta
        // excluida apaga o projeto e o evento fica) nao aparece no painel. Sem
        // sessao a lista e vazia — o padrao continua sendo nao ver nada.
        modelBuilder.Entity<Event>()
            .HasQueryFilter(entity => entity.ProjectId != null && CurrentProjectIds.Contains(entity.ProjectId.Value));

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
