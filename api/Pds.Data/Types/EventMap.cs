using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

/// <summary>
/// Unico mapeamento do sistema que nao herda de
/// <see cref="BaseEntityConfiguration{TEntity}"/>: aquela base desenha as quatro
/// colunas padrao, e duas delas nao existem aqui. A tabela so cresce — nada e
/// alterado, entao nao ha <c>updated_at</c>; nada e apagado, entao nao ha
/// <c>deleted_at</c>.
/// </summary>
public class EventMap : IEntityTypeConfiguration<Event>
{
    public void Configure(EntityTypeBuilder<Event> builder)
    {
        builder.ToTable("events", table =>
        {
            table.HasComment(
                "O registro do que aconteceu, e a tabela que responde a pergunta de pesquisa. Unica do sistema que so cresce: nunca e alterada e nunca e apagada, nem quando a conta que a originou e excluida.");
        });

        builder.HasKey(entity => entity.Id);

        builder.Property(entity => entity.Id)
            .HasColumnName("id")
            .UseIdentityByDefaultColumn()
            .HasComment("Chave interna, sequencial. Nunca sai da aplicacao.");

        builder.Property(entity => entity.PublicId)
            .HasColumnName("public_id")
            .IsRequired()
            .HasComment("Identificador publico, GUID aleatorio.");

        builder.Property(entity => entity.AccountId)
            .HasColumnName("account_id")
            .HasComment("Conta de origem. Continua apontando para ela depois de anonimizada.");

        builder.Property(entity => entity.ProjectId)
            .HasColumnName("project_id")
            .HasComment("Projeto de origem. Anulavel porque o projeto some de verdade e o evento fica.");

        builder.Property(entity => entity.ReportId)
            .HasColumnName("report_id")
            .HasComment("Relato a que o evento se refere. Nulo quando o evento nao nasce de um relato.");

        builder.Property(entity => entity.Type)
            .HasColumnName("type")
            .HasConversion(new SnakeCaseEnumConverter<EventTypeEnum>())
            .HasMaxLength(40)
            .IsRequired()
            .HasComment("report_created | report_viewed por enquanto. A lista cresce conforme o produto anda.");

        builder.Property(entity => entity.Source)
            .HasColumnName("source")
            .HasConversion(new SnakeCaseEnumConverter<EventSourceEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("widget | panel | api | public_page. De onde a acao partiu.");

        builder.Property(entity => entity.Payload)
            .HasColumnName("payload")
            .HasColumnType("jsonb")
            .HasComment("O resto do evento em chave e valor, para tipo novo entrar sem migracao.");

        builder.Property(entity => entity.OccurredAt)
            .HasColumnName("occurred_at")
            .IsRequired()
            .HasComment("Quando aconteceu, em UTC. E esta a data que a analise usa.");

        builder.Property(entity => entity.CreatedAt)
            .HasColumnName("created_at")
            .IsRequired()
            .HasComment("Quando a linha foi gravada, em UTC. Difere de occurred_at quando houve retentativa.");

        builder.HasIndex(entity => entity.PublicId).IsUnique();

        // As duas consultas da pesquisa: por cliente ao longo do tempo, e a
        // comparacao entre projetos com acompanhamento e projetos sem.
        builder.HasIndex(entity => new { entity.AccountId, entity.OccurredAt });
        builder.HasIndex(entity => new { entity.ProjectId, entity.OccurredAt });

        // "Quantas vezes este relato foi visto" — a contagem que responde se dar
        // visibilidade reduz o contato repetido.
        builder.HasIndex(entity => entity.ReportId);

        // As tres ligacoes anulam em vez de arrastar a linha junto: o evento
        // sobrevive ao que o originou, e essa e a razao de a tabela existir.
        builder.HasOne(entity => entity.Account)
            .WithMany()
            .HasForeignKey(entity => entity.AccountId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne(entity => entity.Project)
            .WithMany()
            .HasForeignKey(entity => entity.ProjectId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasOne(entity => entity.Report)
            .WithMany()
            .HasForeignKey(entity => entity.ReportId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
