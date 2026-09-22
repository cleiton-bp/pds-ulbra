using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ReporterCodeMap : BaseEntityConfiguration<ReporterCode>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ReporterCode> builder)
    {
        builder.ToTable("reporter_codes", table =>
        {
            table.HasComment(
                "O codigo que quem relata guarda para reencontrar os proprios relatos, no modo sem login. Tabela e nao coluna: o codigo vale para varios relatos, entao a unicidade precisa de uma linha propria. Nao guarda nada de pessoa — e um identificador sorteado e nada mais.");
        });

        builder.Property(code => code.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto onde este codigo vale. Ele nao atravessa projetos.");

        builder.Property(code => code.Code)
            .HasColumnName("code")
            .HasMaxLength(32)
            .IsRequired()
            .HasComment("O codigo no formato do protocolo, sorteado inteiro pelo sistema. Codigo apresentado de fora nunca e consultado para dizer se existe: qualquer diferenca entre livre e ocupado vira enumeracao. Na geracao a consulta existe, e nao conta nada — o candidato foi sorteado por nos.");

        // Unico **dentro do projeto**, e nao no sistema: dois clientes diferentes
        // podem sortear o mesmo codigo sem que isso signifique nada. Parcial, para o
        // projeto apagado logicamente nao segurar o valor.
        builder.HasIndex(code => new { code.ProjectId, code.Code })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
