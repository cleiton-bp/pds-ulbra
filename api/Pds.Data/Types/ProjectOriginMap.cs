using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ProjectOriginMap : BaseEntityConfiguration<ProjectOrigin>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectOrigin> builder)
    {
        builder.ToTable("project_origins", table =>
        {
            table.HasComment(
                "De quais enderecos um relato pode ser aberto. A chave publica viaja no site do cliente e qualquer um consegue le-la; sem esta lista, a chave copiada de um site funciona em qualquer outro.");
        });

        builder.Property(origin => origin.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto que autoriza este dominio.");

        builder.Property(origin => origin.Domain)
            .HasColumnName("domain")
            // 253 e o tamanho maximo de um nome de dominio, mais a porta.
            .HasMaxLength(260)
            .IsRequired()
            .HasComment("Dominio autorizado, guardado em minusculo, sem esquema e sem barra final. A porta faz parte quando informada.");

        builder.Property(origin => origin.AllowsSubdomains)
            .HasColumnName("allows_subdomains")
            .IsRequired()
            .HasDefaultValue(false)
            .HasComment("Quando verdadeiro vale para app.site.com e loja.site.com sem precisar de uma linha para cada.");

        // O mesmo dominio nao entra duas vezes no projeto. O filtro deixa de fora as
        // linhas apagadas: sem ele, remover e autorizar de novo o mesmo endereco
        // esbarraria numa linha que ninguem enxerga mais.
        builder.HasIndex(origin => new { origin.ProjectId, origin.Domain })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // A montagem do frame-ancestors comeca pelo projeto e le a lista inteira.
        builder.HasIndex(origin => origin.ProjectId);
    }
}
