using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectPriorityMap : BaseEntityConfiguration<ProjectPriority>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectPriority> builder)
    {
        builder.ToTable("project_priorities", table =>
        {
            table.HasComment(
                "As prioridades de cada projeto, com os nomes que o time deu. Nasce com quatro de fabrica (Baixa, Media, Alta, Urgente); o administrador renomeia, troca a cor, reordena ou cria outras, como faz com os estados.");
        });

        builder.Property(priority => priority.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono da prioridade.");

        builder.Property(priority => priority.Name)
            .HasColumnName("name")
            .HasMaxLength(ProjectPriority.MaxNameLength)
            .IsRequired()
            .HasComment("Nome dado pelo time. Renomear nao reescreve o passado: o evento guarda o nome que valia na epoca.");

        builder.Property(priority => priority.Color)
            .HasColumnName("color")
            .HasConversion(new SnakeCaseEnumConverter<CardColorEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("gray | blue | green | yellow | orange | red | purple | pink. Paleta fixa: cada cor tem o par certo no tema claro e no escuro.");

        builder.Property(priority => priority.Position)
            .HasColumnName("position")
            .IsRequired()
            .HasComment("Ordem na tela, da menos para a mais urgente, escolhida pelo time.");

        builder.Property(priority => priority.DeactivatedAt)
            .HasColumnName("deactivated_at")
            .HasComment("Nulo enquanto a prioridade pode ser escolhida; preenchido para aposenta-la sem apagar, porque card antigo continua apontando para ela.");

        // A propriedade calculada nao vira coluna, como no estado.
        builder.Ignore(priority => priority.IsActive);

        // O mesmo nome nao entra duas vezes no projeto. Como no estado, a
        // conferencia sem diferenciar caixa mora no servico, e o indice e a rede
        // embaixo dela para duas gravacoes ao mesmo tempo.
        builder.HasIndex(priority => new { priority.ProjectId, priority.Name })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        builder.HasIndex(priority => priority.ProjectId);
    }
}
