using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class UserNotificationSoundMap : BaseEntityConfiguration<UserNotificationSound>
{
    protected override void ConfigureEntity(EntityTypeBuilder<UserNotificationSound> builder)
    {
        builder.ToTable("user_notification_sounds", table =>
        {
            table.HasComment(
                "O som que cada pessoa escolheu para cada tipo de aviso do painel. Sem linha para um tipo, vale o de fabrica. Vale em todos os projetos da pessoa. Interno.");

            table.HasCheckConstraint("ck_user_notification_sounds_kind", "kind IN ('mention', 'assignment', 'origin_pending', 'reports_paused')");
            table.HasCheckConstraint(
                "ck_user_notification_sounds_sound",
                "sound IN ('none', 'bell', 'drop', 'ping', 'chime', 'bubble', 'soft')");
        });

        builder.Property(som => som.UserId)
            .HasColumnName("user_id")
            .IsRequired()
            .HasComment("A pessoa.");

        builder.Property(som => som.Kind)
            .HasColumnName("kind")
            .HasConversion(new SnakeCaseEnumConverter<NotificationKindEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("mention | assignment | origin_pending | reports_paused: o tipo de aviso, como em notifications.kind.");

        builder.Property(som => som.Sound)
            .HasColumnName("sound")
            .HasConversion(new SnakeCaseEnumConverter<NotificationSoundEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("none | bell | drop | ping | chime | bubble | soft. O som e gerado no navegador; none e so o sino, sem som.");

        // Um som por tipo, por pessoa.
        builder.HasIndex(som => new { som.UserId, som.Kind })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        builder.HasOne(som => som.User)
            .WithMany(user => user.NotificationSounds)
            .HasForeignKey(som => som.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
