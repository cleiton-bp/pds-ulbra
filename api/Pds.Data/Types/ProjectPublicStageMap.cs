using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectPublicStageMap : BaseEntityConfiguration<ProjectPublicStage>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectPublicStage> builder)
    {
        builder.ToTable("project_public_stages", table =>
        {
            table.HasComment(
                "A jornada que quem relatou acompanha. Separada de project_states porque o time precisa de detalhe que quem esta de fora nao precisa: varios estados caem numa etapa so, e essa perda de detalhe e o produto.");
        });

        builder.Property(stage => stage.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono da etapa. A jornada e de cada sistema, nao da conta.");

        builder.Property(stage => stage.Label)
            .HasColumnName("label")
            .HasMaxLength(ProjectPublicStage.MaxLabelLength)
            .IsRequired()
            .HasComment("O nome do passo, como quem relatou le. Unico no projeto: dois rotulos iguais na mesma linha do tempo nao teriam como ser distinguidos.");

        builder.Property(stage => stage.Description)
            .HasColumnName("description")
            .HasMaxLength(ProjectPublicStage.MaxSentenceLength)
            .IsRequired()
            .HasComment("A frase que explica o passo. Obrigatoria: rotulo sozinho e o que a ferramenta de dentro ja dava.");

        builder.Property(stage => stage.NextStep)
            .HasColumnName("next_step")
            .HasMaxLength(ProjectPublicStage.MaxSentenceLength)
            .HasComment("O que vem depois, quando o cliente quer dizer. Nulo na ultima etapa, que nao tem depois.");

        builder.Property(stage => stage.Position)
            .HasColumnName("position")
            .IsRequired()
            .HasComment("Ordem da jornada. Nao e unica: reordenar reescreve a lista inteira de uma vez.");

        builder.Property(stage => stage.IsTerminal)
            .HasColumnName("is_terminal")
            .IsRequired()
            .HasComment("A etapa em que o trabalho do time acaba. Nao quer dizer encerrado: a confirmacao de quem relatou vem depois dela.");

        builder.Property(stage => stage.AllowsReturn)
            .HasColumnName("allows_return")
            .IsRequired()
            .HasComment("A jornada pode voltar para esta etapa. Por padrao ela nao anda para tras, e esta marca e a excecao combinada.");

        builder.Property(stage => stage.AwaitsReporter)
            .HasColumnName("awaits_reporter")
            .IsRequired()
            .HasComment("A etapa espera quem relatou, e nao o time. Ainda nao e lida por ninguem: nasce com a tabela para nao custar migracao depois.");

        builder.Property(stage => stage.Outcome)
            .HasColumnName("outcome")
            .HasConversion(new SnakeCaseEnumConverter<PublicOutcomeEnum>())
            .HasMaxLength(20)
            .HasComment("done | wont_do | no_answer | duplicate. Nulo fora da etapa terminal, obrigatorio nela: fim sem desfecho e fim sem explicacao.");

        // O mesmo rotulo nao entra duas vezes na jornada, pelo mesmo desenho do
        // estado interno: indice parcial, comparando byte a byte, com a conferencia
        // que ignora caixa morando no servico. Aqui ele e a rede embaixo.
        builder.HasIndex(stage => new { stage.ProjectId, stage.Label })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // A jornada e sempre lida inteira, a partir do projeto.
        builder.HasIndex(stage => stage.ProjectId);
    }
}
