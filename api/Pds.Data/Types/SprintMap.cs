using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class SprintMap : BaseEntityConfiguration<Sprint>
{
    protected override void ConfigureEntity(EntityTypeBuilder<Sprint> builder)
    {
        builder.ToTable("sprints", table =>
        {
            table.HasComment(
                "As sprints do projeto: uma em andamento por vez — a que o quadro mostra —, as planejadas e as fechadas. Interno: nenhuma rota publica le esta tabela.");

            table.HasCheckConstraint("ck_sprints_state", "state IN ('planned', 'active', 'closed')");
            table.HasCheckConstraint("ck_sprints_dates", "ends_on >= starts_on");
            table.HasCheckConstraint("ck_sprints_number", "number > 0");
        });

        builder.Property(sprint => sprint.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("O projeto da sprint.");

        builder.Property(sprint => sprint.Number)
            .HasColumnName("number")
            .IsRequired()
            .HasComment("O numero da sprint no projeto, que da o nome de fabrica (Sprint 3). Nunca repete, nem com a apagada.");

        builder.Property(sprint => sprint.Name)
            .HasColumnName("name")
            .HasMaxLength(Sprint.MaxNameLength)
            .IsRequired()
            .HasComment("O nome da sprint. De fabrica, Sprint e o numero.");

        builder.Property(sprint => sprint.Goal)
            .HasColumnName("goal")
            .HasMaxLength(Sprint.MaxGoalLength)
            .HasComment("O que o time quer entregar nesta sprint. Opcional.");

        builder.Property(sprint => sprint.State)
            .HasColumnName("state")
            .HasConversion(new SnakeCaseEnumConverter<SprintStateEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("planned | active | closed. Uma active por projeto.");

        builder.Property(sprint => sprint.StartsOn)
            .HasColumnName("starts_on")
            .IsRequired()
            .HasComment("O primeiro dia da sprint.");

        builder.Property(sprint => sprint.EndsOn)
            .HasColumnName("ends_on")
            .IsRequired()
            .HasComment("O ultimo dia da sprint. Nasce com a duracao padrao do projeto, e se ajusta.");

        builder.Property(sprint => sprint.StartedAt)
            .HasColumnName("started_at")
            .HasComment("Quando foi iniciada, em UTC. Nulo enquanto planejada.");

        builder.Property(sprint => sprint.ClosedAt)
            .HasColumnName("closed_at")
            .HasComment("Quando foi fechada, em UTC. Nulo enquanto nao fechou.");

        // O numero e unico no projeto, sem o filtro de deleted_at: a apagada nao devolve
        // o numero, como o card.
        builder.HasIndex(sprint => new { sprint.ProjectId, sprint.Number }).IsUnique();

        // Uma em andamento por projeto. A conferencia do servico diz o porque; esta trava
        // segura as duas abas que iniciam ao mesmo tempo.
        builder.HasIndex(sprint => sprint.ProjectId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL AND state = 'active'");

        builder.HasOne(sprint => sprint.Project)
            .WithMany()
            .HasForeignKey(sprint => sprint.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
