using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectInvitationMap : BaseEntityConfiguration<ProjectInvitation>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectInvitation> builder)
    {
        builder.ToTable("project_invitations", table =>
        {
            table.HasComment(
                "Convites para entrar no time de um projeto, com o papel. O link de aceitar nunca e guardado: nasce na hora de montar o e-mail, e aqui fica so o hash dele. Aceitar exige entrar com o Google do mesmo endereco. Aberto e o convite nem aceito nem cancelado; vencido continua aberto, para poder ser reenviado.");

            // Mesma trava do papel em project_members: o valor aqui vira o papel de
            // quem aceitar, e um texto fora da lista viraria um papel que ninguem
            // escolheu.
            table.HasCheckConstraint("ck_project_invitations_role", "role IN ('member', 'administrator')");

            table.HasCheckConstraint(
                "ck_project_invitations_email_status",
                "email_status IN ('pending', 'sending', 'sent', 'failed')");
        });

        builder.Property(invitation => invitation.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto para o qual a pessoa foi convidada.");

        builder.Property(invitation => invitation.Email)
            .HasColumnName("email")
            .HasMaxLength(ProjectInvitation.MaxEmailLength)
            .IsRequired()
            .HasComment("Endereco convidado, em minusculas. Aceitar exige o Google confirmando este mesmo endereco.");

        builder.Property(invitation => invitation.Role)
            .HasColumnName("role")
            .HasConversion(new SnakeCaseEnumConverter<ProjectRoleEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("member | administrator. O papel com que a pessoa entra ao aceitar.");

        builder.Property(invitation => invitation.InvitedByUserId)
            .HasColumnName("invited_by_user_id")
            .IsRequired()
            .HasComment("Quem convidou. O nome vai no e-mail.");

        builder.Property(invitation => invitation.TokenHash)
            .HasColumnName("token_hash")
            .HasMaxLength(64)
            .HasComment("SHA-256 do link que esta valendo, em hexadecimal. Nulo enquanto o e-mail nao foi montado; trocado a cada reenvio, o que invalida o link anterior.");

        builder.Property(invitation => invitation.ExpiresAt)
            .HasColumnName("expires_at")
            .IsRequired()
            .HasComment("Ate quando o convite vale, em UTC. Nasce do prazo da configuracao do time; reenviar renova.");

        builder.Property(invitation => invitation.AcceptedAt)
            .HasColumnName("accepted_at")
            .HasComment("Quando a pessoa aceitou. Preenchido, o convite fechou.");

        builder.Property(invitation => invitation.AcceptedByUserId)
            .HasColumnName("accepted_by_user_id")
            .HasComment("Quem aceitou — a pessoa que entrou no time.");

        builder.Property(invitation => invitation.RevokedAt)
            .HasColumnName("revoked_at")
            .HasComment("Quando um administrador cancelou. Preenchido, o convite fechou e o link deixa de valer.");

        builder.Property(invitation => invitation.EmailStatus)
            .HasColumnName("email_status")
            .HasConversion(new SnakeCaseEnumConverter<InvitationEmailStatusEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("pending | sending | sent | failed. Onde esta o e-mail do convite — o unico registro do envio: o texto do e-mail nao e guardado.");

        builder.Property(invitation => invitation.EmailAttemptedAt)
            .HasColumnName("email_attempted_at")
            .HasComment("Quando o envio foi tentado pela ultima vez.");

        builder.Property(invitation => invitation.EmailSentAt)
            .HasColumnName("email_sent_at")
            .HasComment("Quando o servidor de e-mail aceitou a mensagem.");

        builder.Property(invitation => invitation.EmailError)
            .HasColumnName("email_error")
            .HasMaxLength(ProjectInvitation.MaxEmailErrorLength)
            .HasComment("Por que o e-mail nao saiu: o tipo da falha, e nunca a mensagem do servidor, que costuma repetir o endereco de quem recebe.");

        builder.Ignore(invitation => invitation.IsOpen);

        // Um convite aberto por endereco em cada projeto. Convidar de novo o mesmo
        // endereco reenvia o que ja existe, em vez de empilhar links que valem ao
        // mesmo tempo.
        builder.HasIndex(invitation => new { invitation.ProjectId, invitation.Email })
            .IsUnique()
            .HasFilter("deleted_at IS NULL AND accepted_at IS NULL AND revoked_at IS NULL");

        // A pessoa que abre o link chega so com ele: e por aqui que o convite e
        // achado. Unico, porque um hash que servisse a dois convites deixaria o link
        // de um aceitar o outro.
        builder.HasIndex(invitation => invitation.TokenHash)
            .IsUnique()
            .HasFilter("token_hash IS NOT NULL");

        // A varredura da subida procura o que ficou na fila ou preso no meio do envio.
        builder.HasIndex(invitation => invitation.EmailStatus)
            .HasFilter("email_status IN ('pending', 'sending')");

        // Restrict nas duas pessoas: quem convidou e quem aceitou nao somem por
        // debaixo do convite. Pessoa nao se apaga — sai do time.
        builder.HasOne(invitation => invitation.InvitedByUser)
            .WithMany()
            .HasForeignKey(invitation => invitation.InvitedByUserId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(invitation => invitation.AcceptedByUser)
            .WithMany()
            .HasForeignKey(invitation => invitation.AcceptedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
