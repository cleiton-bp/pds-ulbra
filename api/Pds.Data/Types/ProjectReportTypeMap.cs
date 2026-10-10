using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectReportTypeMap : BaseEntityConfiguration<ProjectReportType>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectReportType> builder)
    {
        builder.ToTable("project_report_types", table =>
        {
            table.HasComment(
                "Os tipos de relato de cada projeto, com os nomes que o time deu. Nasce com tres de fabrica (Defeito, Melhoria, Duvida); o administrador renomeia, troca a cor e o desenho, reordena, cria outros ou desativa, como faz com as prioridades. Cada tipo diz como o formulario pergunta (perguntas curtas e/ou a caixa livre) e em que coluna o relato entra.");

            // O tipo sempre pede alguma coisa: sem pergunta e sem caixa, o formulario
            // nao teria onde a pessoa escrever.
            table.HasCheckConstraint(
                "ck_project_report_types_asks_something",
                "shows_text_box OR cardinality(questions) > 0");

            // A caixa que aparece tem o texto que faz a pergunta certa.
            table.HasCheckConstraint(
                "ck_project_report_types_text_box_prompt",
                "NOT shows_text_box OR text_box_prompt IS NOT NULL");

            table.HasCheckConstraint(
                "ck_project_report_types_questions",
                $"cardinality(questions) <= {ProjectReportType.MaxQuestions}");
        });

        builder.Property(type => type.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono do tipo.");

        builder.Property(type => type.Name)
            .HasColumnName("name")
            .HasMaxLength(ProjectReportType.MaxNameLength)
            .IsRequired()
            .HasComment("Nome dado pelo time. Renomear nao reescreve o passado: o evento da entrada do relato guarda o nome que valia na epoca.");

        builder.Property(type => type.Color)
            .HasColumnName("color")
            .HasConversion(new SnakeCaseEnumConverter<CardColorEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("gray | blue | green | yellow | orange | red | purple | pink. A paleta fixa das prioridades e etiquetas; a cor aparece so no painel.");

        builder.Property(type => type.Icon)
            .HasColumnName("icon")
            .HasConversion(new SnakeCaseEnumConverter<ReportTypeIconEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("bug | improvement | question | idea | praise | other. O desenho, de uma lista fixa: aparece no botao da ferramenta e no card.");

        builder.Property(type => type.Position)
            .HasColumnName("position")
            .IsRequired()
            .HasComment("Ordem na tela e na ferramenta, escolhida pelo time.");

        builder.Property(type => type.DeactivatedAt)
            .HasColumnName("deactivated_at")
            .HasComment("Nulo enquanto o tipo e oferecido; preenchido para desativa-lo sem apagar, porque relato antigo continua apontando para ele. Ao menos um tipo fica ativo, e no maximo dez.");

        builder.Property(type => type.Questions)
            .HasColumnName("questions")
            .HasColumnType("text[]")
            .IsRequired()
            .HasComment("As perguntas curtas que o formulario faz, na ordem: de 0 a 4, cada uma ate 120 caracteres, sem repetir. Mudar nao reescreve os relatos, que guardam as perguntas do envio em reports.answers.");

        builder.Property(type => type.ShowsTextBox)
            .HasColumnName("shows_text_box")
            .IsRequired()
            .HasComment("A caixa livre aparece no formulario. Sem perguntas, tem de aparecer.");

        builder.Property(type => type.TextBoxPrompt)
            .HasColumnName("text_box_prompt")
            .HasMaxLength(ProjectReportType.MaxTextBoxPromptLength)
            .HasComment("O texto cinza dentro da caixa livre. Obrigatorio quando ela aparece; guardado com ela escondida, para voltar igual.");

        builder.Property(type => type.InitialStateId)
            .HasColumnName("initial_state_id")
            .HasComment("A coluna em que o relato deste tipo entra. Nulo e o padrao: a primeira coluna ativa da fila. Do mesmo projeto, e ativa: aposentar a coluna que e entrada de algum tipo e recusado.");

        // A propriedade calculada nao vira coluna, como na prioridade.
        builder.Ignore(type => type.IsActive);

        // O mesmo nome nao entra duas vezes no projeto. Como na prioridade, a
        // conferencia sem diferenciar caixa mora no servico, e o indice e a rede
        // embaixo dela para duas gravacoes ao mesmo tempo.
        builder.HasIndex(type => new { type.ProjectId, type.Name })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        builder.HasIndex(type => type.ProjectId);

        // Restrict: a coluna nao some debaixo do tipo. A regra de aposentar mora no
        // servico, que recusa enquanto houver tipo apontando para ela; aqui e a rede
        // embaixo dessa regra.
        builder.HasOne(type => type.InitialState)
            .WithMany()
            .HasForeignKey(type => type.InitialStateId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
