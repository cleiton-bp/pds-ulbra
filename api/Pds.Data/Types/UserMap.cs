using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class UserMap : BaseEntityConfiguration<User>
{
    protected override void ConfigureEntity(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("users", table => table.HasComment(
            "Quem entra no painel. A identidade vem do Google, entao nao ha senha nem recuperacao."));

        builder.Property(user => user.AccountId)
            .HasColumnName("account_id")
            .IsRequired()
            .HasComment("Conta a que este usuario pertence.");

        builder.Property(user => user.GoogleSubject)
            .HasColumnName("google_subject")
            .HasMaxLength(255)
            .IsRequired()
            .HasComment("O sub do Google. Identificador estavel: e por ele que o login reconhece a pessoa.");

        builder.Property(user => user.Email)
            .HasColumnName("email")
            .HasMaxLength(320)
            .HasComment("E-mail vindo do Google. Pode mudar la, entao serve para contato e nao como identidade.");

        builder.Property(user => user.Name)
            .HasColumnName("name")
            .HasMaxLength(180)
            .HasComment("Nome vindo do Google.");

        builder.Property(user => user.AvatarUrl)
            .HasColumnName("avatar_url")
            .HasMaxLength(500)
            .HasComment("Foto vinda do Google. Opcional.");

        builder.Property(user => user.LastLoginAt)
            .HasColumnName("last_login_at")
            .HasComment("Ultimo acesso, em UTC.");

        // O sub e unico entre os usuarios que valem. O filtro por deleted_at existe
        // para que um usuario apagado nao impeca a mesma pessoa de entrar de novo.
        builder.HasIndex(user => user.GoogleSubject)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // Sem indice unico em email de proposito: duas contas Google diferentes
        // podem acabar com o mesmo endereco ao longo do tempo, e quem manda e o sub.
        // A ausencia e escolha, nao esquecimento.
        builder.HasIndex(user => user.AccountId);
    }
}
