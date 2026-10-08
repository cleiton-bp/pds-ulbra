using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectMap : BaseEntityConfiguration<Project>
{
    protected override void ConfigureEntity(EntityTypeBuilder<Project> builder)
    {
        builder.ToTable("projects", table => table.HasComment(
            "Projeto: a unidade que o cliente configura e a que identifica de onde veio cada relato."));

        builder.Property(project => project.AccountId)
            .HasColumnName("account_id")
            .IsRequired()
            .HasComment("Conta dona do projeto. Quem e dono dela manda neste projeto sem linha em project_members; o resto do time chega por la.");

        builder.Property(project => project.Name)
            .HasColumnName("name")
            .HasMaxLength(120)
            .IsRequired()
            .HasComment("Nome do projeto, unico dentro da conta entre os que nao foram apagados.");

        builder.Property(project => project.Status)
            .HasColumnName("status")
            .HasConversion(new SnakeCaseEnumConverter<ProjectStatusEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("active | archived. Arquivado continua visivel, so para de aceitar coisa nova.");

        builder.Property(project => project.MappingVersion)
            .HasColumnName("mapping_version")
            .IsRequired()
            .HasDefaultValue(0)
            .HasComment("Versao do mapeamento que vale agora. Zero enquanto nada foi ligado. Nao e o maior valor de project_status_mappings: desfazer tudo grava uma versao sem linha nenhuma.");

        builder.Property(project => project.LastCardNumber)
            .HasColumnName("last_card_number")
            .IsRequired()
            .HasDefaultValue(0)
            .HasComment("O ultimo numero de card dado no projeto; o proximo leva este mais um. Somado numa gravacao so (UPDATE ... RETURNING), que serializa quem cria ao mesmo tempo. Nao e o maior reports.number: lido assim, dois cards simultaneos tentariam o mesmo numero.");

        // **O contador so anda pelo UPDATE ... RETURNING do numero do card.**
        // Renomear, arquivar ou salvar o mapa grava a linha inteira do projeto, com o
        // contador lido antes; se um card nascesse no meio, o numero dele voltaria a
        // ser dado, e o card seguinte esbarraria no indice unico. Ignorado depois de
        // criado, o EF nunca o escreve.
        builder.Property(project => project.LastCardNumber)
            .Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Ignore);

        builder.Property(project => project.LastSprintNumber)
            .HasColumnName("last_sprint_number")
            .IsRequired()
            .HasDefaultValue(0)
            .HasComment("O ultimo numero de sprint dado no projeto (Sprint 3); a proxima leva este mais um. Somado numa gravacao so (UPDATE ... RETURNING), como o numero do card.");

        // Como o numero do card: so anda pelo UPDATE ... RETURNING.
        builder.Property(project => project.LastSprintNumber)
            .Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Ignore);

        builder.Property(project => project.BoardTopRank)
            .HasColumnName("board_top_rank")
            .IsRequired()
            .HasDefaultValue(0L)
            .HasComment("O lugar do ultimo card posto no topo de uma coluna do quadro: o que chega sem ser arrastado, ou o que foi solto no topo. O proximo fica uma folga acima. So desce, numa gravacao so (UPDATE ... RETURNING): o card que chega fica acima de tudo sem ler a coluna.");

        // Como o contador do numero: so anda pelo UPDATE ... RETURNING, e o EF nunca o
        // escreve — a gravacao da linha inteira do projeto o faria voltar.
        builder.Property(project => project.BoardTopRank)
            .Metadata.SetAfterSaveBehavior(PropertySaveBehavior.Ignore);

        // Nome unico por conta, ignorando o que foi apagado: sem o filtro, o nome de
        // um projeto excluido continuaria ocupando o lugar e o cliente nao
        // conseguiria reaproveita-lo.
        builder.HasIndex(project => new { project.AccountId, project.Name })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        builder.HasMany(project => project.Keys)
            .WithOne(key => key.Project)
            .HasForeignKey(key => key.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(project => project.Origins)
            .WithOne(origin => origin.Project)
            .HasForeignKey(origin => origin.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(project => project.Members)
            .WithOne(member => member.Project)
            .HasForeignKey(member => member.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(project => project.Invitations)
            .WithOne(invitation => invitation.Project)
            .HasForeignKey(invitation => invitation.ProjectId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
