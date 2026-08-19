using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class AccountMap : BaseEntityConfiguration<Account>
{
    protected override void ConfigureEntity(EntityTypeBuilder<Account> builder)
    {
        builder.ToTable("accounts", table => table.HasComment(
            "Conta: a fronteira de isolamento do sistema. Todo dado pertence a uma, e nenhuma consulta atravessa de uma para outra."));

        builder.Property(account => account.Name)
            .HasColumnName("name")
            .HasMaxLength(120)
            .IsRequired()
            .HasComment("Nome da conta, exibido no painel.");

        builder.Property(account => account.PurgeAt)
            .HasColumnName("purge_at")
            .HasComment("Data em que a exclusao vira definitiva. Gravada no pedido para sobreviver a mudanca de politica.");

        builder.Property(account => account.AnonymizedAt)
            .HasColumnName("anonymized_at")
            .HasComment("Quando a identificacao foi removida. A partir daqui nenhuma linha da conta guarda dado pessoal.");

        builder.HasMany(account => account.Users)
            .WithOne(user => user.Account)
            .HasForeignKey(user => user.AccountId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(account => account.Projects)
            .WithOne(project => project.Account)
            .HasForeignKey(project => project.AccountId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
