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
                "Os avisos do sino do painel: a mencao num comentario interno, a escolha como responsavel, o endereco novo que mandou relato e os envios pausados por excesso. Cada pessoa le so os proprios, e so dos projetos em que ainda esta. Interno: nenhuma rota publica le esta tabela.");

            table.HasCheckConstraint(
                "ck_notifications_kind",
                "kind IN ('mention', 'assignment', 'origin_pending', 'reports_paused')");

            table.HasCheckConstraint(
                "ck_notifications_comment",
                "(kind = 'mention') = (report_internal_comment_id IS NOT NULL)");

            // Os dois do card tem card; os dois do projeto nao tem — o relato retido nao
            // aparece para o time, e a pausa nao e de relato nenhum.
            table.HasCheckConstraint(
                "ck_notifications_report",
                "(kind IN ('mention', 'assignment')) = (report_id IS NOT NULL)");

            // A pausa diz a camada e ate quando. O endereco novo diz qual no subject —
            // nulo para o relato que nao disse de onde veio.
            table.HasCheckConstraint(
                "ck_notifications_paused",
                "(kind = 'reports_paused') = (limit_scope IS NOT NULL AND paused_until IS NOT NULL)");
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
            .HasComment("O card de que o aviso fala. Nulo nos avisos do projeto (origin_pending, reports_paused).");

        builder.Property(aviso => aviso.ActorUserId)
            .HasColumnName("actor_user_id")
            .HasComment("Quem fez: quem mencionou, ou quem escolheu o responsavel.");

        builder.Property(aviso => aviso.Kind)
            .HasColumnName("kind")
            .HasConversion(new SnakeCaseEnumConverter<NotificationKindEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("mention | assignment | origin_pending | reports_paused. Todos so no painel: no sino, com o som que a pessoa escolheu para o tipo. Os dois ultimos vao para quem administra o projeto.");

        builder.Property(aviso => aviso.ReportInternalCommentId)
            .HasColumnName("report_internal_comment_id")
            .HasComment("O comentario interno da mencao. Nulo na atribuicao.");

        builder.Property(aviso => aviso.Subject)
            .HasColumnName("subject")
            .HasMaxLength(Notification.MaxSubjectLength)
            .HasComment("O endereco de que o aviso do projeto fala: o que mandou relato sem estar autorizado, ou o pausado por excesso. Nunca um IP: a pausa por IP ou por pessoa diz so a camada.");

        builder.Property(aviso => aviso.LimitScope)
            .HasColumnName("limit_scope")
            .HasConversion(new SnakeCaseEnumConverter<ReportLimitScopeEnum>())
            .HasMaxLength(20)
            .HasComment("reporter | ip | origin | project: a camada que pausou os envios. So no aviso reports_paused.");

        builder.Property(aviso => aviso.PausedUntil)
            .HasColumnName("paused_until")
            .HasComment("Ate quando os envios ficam pausados, em UTC. So no aviso reports_paused.");

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
