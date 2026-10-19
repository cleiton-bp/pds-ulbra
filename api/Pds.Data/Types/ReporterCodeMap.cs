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
                "O codigo que quem relata guarda para reencontrar os proprios relatos, no modo sem login — e, no modo de identidade herdada, a linha da pessoa que o sistema do cliente identificou, pelo hash do sujeito. Tabela e nao coluna: o vinculo vale para varios relatos, entao a unicidade precisa de uma linha propria. Nao guarda nada de pessoa alem de um hash que nao se desfaz.");
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

        builder.Property(code => code.SubjectHash)
            .HasColumnName("subject_hash")
            .HasMaxLength(64)
            .HasComment("No modo de identidade herdada, o SHA-256 (hex) do sal do projeto e do sub do token: a pessoa do sistema do cliente, sem dizer quem ela e. Nulo no modo de codigo pessoal.");

        // Unico **dentro do projeto**, e nao no sistema: dois clientes diferentes
        // podem sortear o mesmo codigo sem que isso signifique nada. Parcial, para o
        // projeto apagado logicamente nao segurar o valor.
        builder.HasIndex(code => new { code.ProjectId, code.Code })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // A mesma pessoa do sistema do cliente e uma linha so por projeto.
        builder.HasIndex(code => new { code.ProjectId, code.SubjectHash })
            .IsUnique()
            .HasFilter("deleted_at IS NULL AND subject_hash IS NOT NULL");
    }
}
