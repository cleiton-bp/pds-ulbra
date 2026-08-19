using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectKeyMap : BaseEntityConfiguration<ProjectKey>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectKey> builder)
    {
        builder.ToTable("project_keys", table =>
        {
            table.HasComment(
                "Chave que liga o sistema do cliente ao nosso. Tabela separada de projects porque chave e rotacionada e revogada, e guardar quando cada uma valeu e o que permite investigar um incidente depois.");

            // A trava que garante o desenho: a publica preenche value e deixa hash
            // nulo, a secreta faz o contrario. Sem isso, um erro de codigo grava a
            // secreta em claro e ninguem percebe, porque a tela continua igual.
            table.HasCheckConstraint(
                "ck_project_keys_value_xor_hash",
                "(type = 'public' AND value IS NOT NULL AND hash IS NULL) OR (type = 'secret' AND value IS NULL AND hash IS NOT NULL)");
        });

        builder.Property(key => key.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono da chave.");

        builder.Property(key => key.Type)
            .HasColumnName("type")
            .HasConversion(new SnakeCaseEnumConverter<ProjectKeyTypeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("public | secret. Define se o valor e guardado em claro ou como hash.");

        builder.Property(key => key.Value)
            .HasColumnName("value")
            .HasMaxLength(120)
            .HasComment("So para a publica: vai aparecer no site do cliente, entao fica em claro.");

        builder.Property(key => key.Hash)
            .HasColumnName("hash")
            .HasMaxLength(128)
            .HasComment("So para a secreta: o valor original nunca e guardado.");

        builder.Property(key => key.Prefix)
            .HasColumnName("prefix")
            .HasMaxLength(24)
            .IsRequired()
            .HasComment("Primeiros caracteres, para identificar a chave na lista sem revela-la.");

        builder.Property(key => key.RevokedAt)
            .HasColumnName("revoked_at")
            .HasComment("Nulo enquanto valida; preenchido ao regenerar, em UTC. Nao confundir com deleted_at.");

        builder.Property(key => key.LastUsedAt)
            .HasColumnName("last_used_at")
            .HasComment("Ultimo uso, em UTC. Ajuda a saber se da para revogar sem quebrar nada.");

        // Toda requisicao vinda do sistema do cliente comeca procurando o projeto
        // pela chave publica. E a consulta mais quente do sistema, e ela cresce com
        // o numero de relatos, nao com o numero de clientes: precisa de indice desde
        // o comeco.
        builder.HasIndex(key => key.Value);

        // A conferencia da chave secreta procura pelo hash, pelo mesmo motivo.
        builder.HasIndex(key => key.Hash);

        builder.HasIndex(key => new { key.ProjectId, key.Type });

        // IsActive nao vira coluna: e so a leitura de revoked_at em forma de
        // pergunta. Guardar a mesma informacao em dois lugares abre a porta para os
        // dois discordarem.
        builder.Ignore(key => key.IsActive);
    }
}
