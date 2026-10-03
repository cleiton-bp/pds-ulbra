using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ReportMap : BaseEntityConfiguration<Report>
{
    protected override void ConfigureEntity(EntityTypeBuilder<Report> builder)
    {
        builder.ToTable("reports", table =>
        {
            table.HasComment(
                "Os cards do trabalho do time: o relato que a pessoa de fora escreveu (kind = report) e o card que o time criou no painel (kind = team). O relato e a primeira tabela do sistema que nasce sem conta e sem sessao, e por isso carrega o proprio account_id, o protocolo que a pessoa le e o hash do token que abre o acompanhamento; o card do time nao tem lado de fora nenhum.");

            table.HasCheckConstraint("ck_reports_kind", "kind IN ('report', 'team')");

            // O numero vem do contador do projeto, que comeca em 1. Zero seria um
            // card gravado sem passar por ele — e o segundo esbarraria no indice.
            table.HasCheckConstraint("ck_reports_number", "number > 0");

            // O relato continua obrigado a ter o que o torna relato: o protocolo
            // que a pessoa le, o token que abre o acompanhamento, o tipo e o texto.
            // A descricao e do card do time: o texto do relato e de quem relatou.
            table.HasCheckConstraint(
                "ck_reports_report_fields",
                "kind <> 'report' OR (tracking_code IS NOT NULL AND access_token_hash IS NOT NULL AND type IS NOT NULL AND text IS NOT NULL AND description IS NULL)");

            // **E o card do time nunca tem lado de fora.** Sem protocolo, token ou
            // codigo pessoal, nao ha porta publica que o encontre; sem etapa
            // publica nem espera, o motor nunca o mostra; e preso em "pendente", a
            // lista publica — que so le o liberado — nunca o le. A regra "nunca
            // aparece na parte publica" deixa de depender de cada consulta lembrar.
            // E sem o titulo de quem relatou: nao ha quem relatou.
            table.HasCheckConstraint(
                "ck_reports_team_fields",
                "kind <> 'team' OR (title IS NOT NULL AND tracking_code IS NULL AND access_token_hash IS NULL AND reporter_code_id IS NULL AND project_public_stage_id IS NULL AND public_stage_due_at IS NULL AND moderation_state = 'pending' AND type IS NULL AND text IS NULL AND reporter_title IS NULL)");
        });

        builder.Property(report => report.Kind)
            .HasColumnName("kind")
            .HasConversion(new SnakeCaseEnumConverter<CardKindEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("report | team. O relato veio de fora, pela ferramenta; o card do time nasceu no painel e nunca tem lado de fora.");

        builder.Property(report => report.Number)
            .HasColumnName("number")
            .IsRequired()
            .HasComment("O numero curto do card no projeto (#42). Interno: nenhuma rota publica o devolve. Vem de projects.last_card_number; pode pular, nunca repete.");

        // Unico no projeto, e sem o filtro de deleted_at: o numero foi dito numa
        // conversa e escrito num commit, e reaproveita-lo faria #42 querer dizer
        // duas coisas.
        builder.HasIndex(report => new { report.ProjectId, report.Number }).IsUnique();

        builder.Property(report => report.Title)
            .HasColumnName("title")
            .HasMaxLength(Report.MaxTitleLength)
            .HasComment("Titulo do time. Obrigatorio no card do time; no relato, o que o time reescreveu, nulo ate alguem reescrever. Interno: nenhuma rota publica o devolve.");

        builder.Property(report => report.ReporterTitle)
            .HasColumnName("reporter_title")
            .HasMaxLength(Report.MaxTitleLength)
            .HasComment("O titulo que a pessoa escreveu na ferramenta. Nunca muda, e e o unico titulo que volta para ela. Nulo quando ela nao respondeu, e sempre no card do time.");

        builder.Property(report => report.Description)
            .HasColumnName("description")
            .HasMaxLength(Report.MaxDescriptionLength)
            .HasComment("Descricao do card do time, em Markdown; o painel a desenha sem HTML. Sempre nula no relato, cujo texto e de quem relatou.");

        builder.Property(report => report.ArchivedAt)
            .HasColumnName("archived_at")
            .HasComment("Quando o card saiu da tela de Trabalho. Nulo enquanto esta nela. Arquivado se le e se comenta; mover e editar pedem desarquivar.");

        builder.Property(report => report.CreatedByUserId)
            .HasColumnName("created_by_user_id")
            .HasComment("Quem do time criou o card. Nulo no relato: quem escreveu nao tem usuario aqui.");

        // Restrict, como quem moderou: a pessoa nao some do sistema enquanto houver
        // card que ela criou.
        builder.HasOne(report => report.CreatedByUser)
            .WithMany()
            .HasForeignKey(report => report.CreatedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Property(report => report.AssigneeUserId)
            .HasColumnName("assignee_user_id")
            .HasComment("Quem do time esta com o card; um so. Quem sai do time continua aqui, como registro, e o painel o marca como fora do time. Interno.");

        // Restrict, como quem criou: a pessoa nao some do sistema enquanto houver
        // card com ela. O indice vem do EF, e serve ao filtro "meus cards".
        builder.HasOne(report => report.AssigneeUser)
            .WithMany()
            .HasForeignKey(report => report.AssigneeUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Property(report => report.PriorityId)
            .HasColumnName("priority_id")
            .HasComment("A prioridade do projeto que o time escolheu. Nulo e sem prioridade, e e como o card nasce. Interno.");

        // Restrict pelo mesmo motivo do estado: prioridade nao se apaga, se aposenta.
        builder.HasOne(report => report.Priority)
            .WithMany()
            .HasForeignKey(report => report.PriorityId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Property(report => report.DueDate)
            .HasColumnName("due_date")
            .HasComment("O prazo: so a data, sem hora. Nulo e sem prazo. Interno.");

        builder.HasMany(report => report.Labels)
            .WithOne(label => label.Report)
            .HasForeignKey(label => label.ReportId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(report => report.AccountId)
            .HasColumnName("account_id")
            .IsRequired()
            .HasComment("Conta dona do relato, repetido de proposito em vez de chegar pelo projeto.");

        builder.Property(report => report.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto de onde o relato veio, resolvido pela chave publica da requisicao.");

        builder.Property(report => report.ProjectStateId)
            .HasColumnName("project_state_id")
            .HasComment("Onde o relato esta na fila do projeto. Nulo quando o projeto ainda nao tem estado nenhum. E cache: a verdade e a sequencia de eventos.");

        builder.Property(report => report.ProjectPublicStageId)
            .HasColumnName("project_public_stage_id")
            .HasComment("Em que etapa da jornada publica o relato aparece. Nulo enquanto ele nao apareceu em nenhuma. E cache, como project_state_id: a verdade e a sequencia de eventos.");

        builder.Property(report => report.TrackingCode)
            .HasColumnName("tracking_code")
            .HasMaxLength(20)
            .HasComment("O protocolo que a pessoa le e repete. Alfabeto sem 0, O, 1 e I; colisao tratada na geracao. Nulo no card do time, que nao tem lado de fora.");

        builder.Property(report => report.AccessTokenHash)
            .HasColumnName("access_token_hash")
            .HasMaxLength(128)
            .HasComment("Hash do token do link de acompanhamento. O valor original so existe na URL entregue. Nulo no card do time.");

        builder.Property(report => report.Type)
            .HasColumnName("type")
            .HasConversion(new SnakeCaseEnumConverter<ReportTypeEnum>())
            .HasMaxLength(20)
            .HasComment("bug | improvement | question. Lista fixa por enquanto. Nulo no card do time.");

        builder.Property(report => report.Text)
            .HasColumnName("text")
            .HasMaxLength(Report.MaxTextLength)
            .HasComment("O relato como a pessoa escreveu. Nulo no card do time, que tem titulo e descricao.");

        builder.Property(report => report.Route)
            .HasColumnName("route")
            .HasMaxLength(500)
            .HasComment("So o caminho da pagina, sem query e sem fragmento: e na query que viaja dado sensivel.");

        builder.Property(report => report.Origin)
            .HasColumnName("origin")
            .HasMaxLength(260)
            .HasComment("Dominio informado pela pagina que embutiu a ferramenta. Indicio, nunca prova.");

        builder.Property(report => report.ReporterCodeId)
            .HasColumnName("reporter_code_id")
            .HasComment("Codigo pessoal de quem escreveu, quando o projeto usa esse modo. Nulo no modo protocolo e nos relatos anteriores ao modo existir — e esses continuam valendo pelo link.");

        builder.Property(report => report.AcceptsQuestions)
            .HasColumnName("accepts_questions")
            .HasComment("Quem relatou aceita responder duvidas da equipe. Escolha dela, nao do projeto. Nulo e o relato que entrou antes de a pergunta existir: ninguem perguntou, e ninguem respondeu.");

        builder.Property(report => report.PublicStageDueAt)
            .HasColumnName("public_stage_due_at")
            .HasComment("Quando a ultima mudanca de etapa publica passa a valer para quem relatou. Preenchida e a janela para desfazer; nula e o estado normal. E ela que sobrevive, e nao a mensagem na fila.");

        // Parcial: a varredura de recuperacao pergunta **so** pelos agendados, e a
        // coluna e nula na esmagadora maioria das linhas. Um indice cheio custaria
        // manutencao em toda a tabela que mais cresce para servir a um punhado.
        builder.HasIndex(report => report.PublicStageDueAt)
            .HasFilter("public_stage_due_at IS NOT NULL");

        // Unico em todo o sistema, e sem o filtro de deleted_at que as outras
        // unicidades usam: o protocolo esta escrito num papel na mao de alguem, e
        // reaproveita-lo faria duas pessoas diferentes digitarem o mesmo codigo.
        builder.HasIndex(report => report.TrackingCode).IsUnique();

        // Nasceu para a lista do painel, quando o acesso era pela conta. Desde que o
        // acesso passou a ser por projeto, nenhuma consulta le por aqui — o indice
        // fica, como o de access_token_hash, porque derruba-lo pede migracao no banco
        // compartilhado, e a leitura por conta (exclusao da conta) ainda vai existir.
        builder.HasIndex(report => new { report.AccountId, report.CreatedAt });

        // A mesma lista dentro de um projeto.
        builder.HasIndex(report => new { report.ProjectId, report.CreatedAt });

        // **Este indice nao tem consulta.** Ele foi criado esperando que o
        // acompanhamento buscasse pelo hash do token; a busca ficou pelo protocolo,
        // com a comparacao do segredo em memoria, de proposito — dentro do banco ela
        // nao seria em tempo constante. Fica porque derruba-lo
        // pede migracao no banco compartilhado, e o custo dele e uma arvore
        // mantida por insercao.
        builder.HasIndex(report => report.AccessTokenHash);

        builder.Property(report => report.ReporterName)
            .HasColumnName("reporter_name")
            .HasMaxLength(Report.MaxReporterNameLength)
            .HasComment("Nome de quem relatou, quando o projeto pede e a pessoa quis dar. Nulo e o normal. Interno por padrao: so aparece la fora com o projeto em publico identificado E reporter_name_is_public verdadeiro.");

        builder.Property(report => report.ReporterNameIsPublic)
            .HasColumnName("reporter_name_is_public")
            .IsRequired()
            .HasComment("Quem relatou escolheu assinar o relato. Falso por padrao — a caixa nasce desmarcada, porque o que esta em jogo e o nome dela ao lado de um texto que qualquer um le.");

        builder.Property(report => report.ModerationState)
            .HasColumnName("moderation_state")
            .HasConversion(new SnakeCaseEnumConverter<ReportModerationStateEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("pending, approved ou rejected. Todo relato nasce pending, inclusive em projeto privado: e o que faz marcar o projeto como publico depois nao publicar o historico inteiro de uma vez.");

        builder.Property(report => report.ModeratedAt)
            .HasColumnName("moderated_at")
            .HasComment("Quando alguem do time decidiu. Nulo enquanto ninguem decidiu.");

        builder.Property(report => report.ModeratedByUserId)
            .HasColumnName("moderated_by_user_id")
            .HasComment("Quem do time decidiu. Nulo enquanto ninguem decidiu, e tambem quando a conta de quem decidiu foi esvaziada. Nunca sai em rota publica.");

        // A fila da moderacao busca por projeto e estado, e e a consulta que o time
        // abre todo dia num projeto publico.
        builder.HasIndex(report => new { report.ProjectId, report.ModerationState });

        // Restrict pelo mesmo motivo de quem encerrou: apagar o usuario nao pode
        // levar junto o relato que ele liberou.
        builder.HasOne(report => report.ModeratedByUser)
            .WithMany()
            .HasForeignKey(report => report.ModeratedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        // A lista do painel filtra por estado, e a regra de aposentar precisa saber
        // se ainda ha relato parado naquele estado.
        builder.HasIndex(report => report.ProjectStateId);

        // Restrict, e nao Cascade: apagar um estado nao pode levar os relatos que
        // passaram por ele. A regra de negocio nem chega a deixar apagar — aqui e a
        // rede embaixo dela.
        // Restrict: o codigo nao some enquanto houver relato ligado a ele. Apaga-lo
        // deixaria a pessoa sem a lista e sem aviso nenhum — e os relatos ficariam
        // orfaos de um vinculo que nao da para reconstruir.
        builder.HasOne(report => report.ReporterCode)
            .WithMany(code => code.Reports)
            .HasForeignKey(report => report.ReporterCodeId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(report => report.ProjectState)
            .WithMany()
            .HasForeignKey(report => report.ProjectStateId)
            .OnDelete(DeleteBehavior.Restrict);

        // Restrict pelo mesmo motivo do estado interno: apagar uma etapa nao pode
        // levar junto os relatos que passaram por ela. A remocao ja e recusada no
        // servico enquanto algum estado aponta para a etapa; aqui e a rede embaixo.
        //
        // O indice desta coluna vem do EF, que indexa toda chave estrangeira. Nao ha
        // consulta que filtre relato por etapa publica hoje — quando houver, ela ja
        // encontra o indice pronto.
        builder.HasOne(report => report.ProjectPublicStage)
            .WithMany()
            .HasForeignKey(report => report.ProjectPublicStageId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
