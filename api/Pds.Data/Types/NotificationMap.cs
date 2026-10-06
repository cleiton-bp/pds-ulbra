using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class NotificationMap : BaseEntityConfiguration<Notification>
{
    protected override void ConfigureEntity(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("notifications", table =>
        {
            table.HasComment(
                "Os avisos do sino do painel: a mencao num comentario interno e a escolha como responsavel. Cada pessoa le so os proprios, e so dos projetos em que ainda esta. Interno: nenhuma rota publica le esta tabela.");

            table.HasCheckConstraint("ck_notifications_kind", "kind IN ('mention', 'assignment')");

            // A mencao aponta o comentario; a atribuicao, nao.
            table.HasCheckConstraint(
                "ck_notifications_comment",
                "(kind = 'mention') = (report_internal_comment_id IS NOT NULL)");
        });

        builder.Property(aviso => aviso.UserId)
            .HasColumnName("user_id")
            .IsRequired()
            .HasComment("Quem recebe o aviso.");

        builder.Property(aviso => aviso.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("O projeto do card, repetido para o filtro de acesso nao precisar de juncao.");

        builder.Property(aviso => aviso.ReportId)
            .HasColumnName("report_id")
            .IsRequired()
            .HasComment("O card de que o aviso fala.");

        builder.Property(aviso => aviso.ActorUserId)
            .HasColumnName("actor_user_id")
            .HasComment("Quem fez: quem mencionou, ou quem escolheu o responsavel.");

        builder.Property(aviso => aviso.Kind)
            .HasColumnName("kind")
            .HasConversion(new SnakeCaseEnumConverter<NotificationKindEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("mention | assignment. A mencao so aparece no sino; a atribuicao tambem vai por e-mail, se a pessoa quiser.");

        builder.Property(aviso => aviso.ReportInternalCommentId)
            .HasColumnName("report_internal_comment_id")
            .HasComment("O comentario interno da mencao. Nulo na atribuicao.");

        builder.Property(aviso => aviso.ReadAt)
            .HasColumnName("read_at")
            .HasComment("Quando a pessoa abriu ou marcou como lido, em UTC. Nulo enquanto nao leu.");

        // O sino le os mais recentes de uma pessoa, e conta os que ela nao leu.
        builder.HasIndex(aviso => new { aviso.UserId, aviso.CreatedAt });

        builder.HasIndex(aviso => aviso.UserId)
            .HasFilter("deleted_at IS NULL AND read_at IS NULL");

        // Restrict em todas: nada disso se apaga de verdade, e o aviso nao some debaixo.
        builder.HasOne(aviso => aviso.User)
            .WithMany()
            .HasForeignKey(aviso => aviso.UserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(aviso => aviso.ActorUser)
            .WithMany()
            .HasForeignKey(aviso => aviso.ActorUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(aviso => aviso.Project)
            .WithMany()
            .HasForeignKey(aviso => aviso.ProjectId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(aviso => aviso.Report)
            .WithMany()
            .HasForeignKey(aviso => aviso.ReportId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(aviso => aviso.ReportInternalComment)
            .WithMany()
            .HasForeignKey(aviso => aviso.ReportInternalCommentId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
