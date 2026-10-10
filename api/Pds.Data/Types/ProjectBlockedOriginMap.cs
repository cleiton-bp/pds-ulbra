using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ProjectBlockedOriginMap : BaseEntityConfiguration<ProjectBlockedOrigin>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectBlockedOrigin> builder)
    {
        builder.ToTable("project_blocked_origins", table =>
        {
            table.HasComment(
                "Enderecos que o projeto bloqueou: a ferramenta nao abre la e o relato de la e recusado, mesmo com a lista de autorizados vazia. E a reacao a quem copiou a chave publica para outro site.");
        });

        builder.Property(blocked => blocked.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto que bloqueia este dominio.");

        builder.Property(blocked => blocked.Domain)
            .HasColumnName("domain")
            // O mesmo tamanho da lista de autorizados: um nome de dominio mais a porta.
            .HasMaxLength(260)
            .IsRequired()
            .HasComment("Dominio bloqueado, normalizado como na lista de autorizados: minusculo, sem esquema e sem barra final. A porta faz parte quando informada.");

        builder.Property(blocked => blocked.IncludesSubdomains)
            .HasColumnName("includes_subdomains")
            .IsRequired()
            .HasDefaultValue(false)
            .HasComment("Quando verdadeiro barra tambem app.site.com e loja.site.com. Desligado por padrao: barrar os vizinhos sem pedir pode tirar do ar um site do proprio cliente.");

        builder.Property(blocked => blocked.BlockedByUserId)
            .HasColumnName("blocked_by_user_id")
            .HasComment("Quem bloqueou. Nulo quando a conta da pessoa foi esvaziada: o bloqueio continua valendo sem ela.");

        // Sem a pessoa, o bloqueio fica: quem saiu nao leva junto a porta que fechou.
        builder.HasOne(blocked => blocked.BlockedByUser)
            .WithMany()
            .HasForeignKey(blocked => blocked.BlockedByUserId)
            .OnDelete(DeleteBehavior.SetNull);

        // O mesmo dominio nao entra duas vezes. O filtro deixa de fora o que foi
        // desbloqueado: sem ele, bloquear de novo esbarraria numa linha que ninguem
        // enxerga mais.
        builder.HasIndex(blocked => new { blocked.ProjectId, blocked.Domain })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
