using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectMemberMap : BaseEntityConfiguration<ProjectMember>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectMember> builder)
    {
        builder.ToTable("project_members", table =>
        {
            table.HasComment(
                "Quem do time entrou em cada projeto, e com que papel. A entrada e por projeto, e nao pela conta: a mesma pessoa pode estar em projetos de varias contas. O dono da conta nao tem linha aqui — manda em todos os projetos dela pelo users.account_id.");

            // O papel e lido a cada requisicao, na montagem do acesso. Um valor fora
            // da lista derrubaria toda requisicao da pessoa com 500 — e um numero
            // passaria pela conversao como se fosse um papel. A trava fica no banco.
            table.HasCheckConstraint("ck_project_members_role", "role IN ('member', 'administrator')");
        });

        builder.Property(member => member.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto em que a pessoa entrou.");

        builder.Property(member => member.UserId)
            .HasColumnName("user_id")
            .IsRequired()
            .HasComment("A pessoa. Pode ter conta propria e estar em projetos de outras contas.");

        builder.Property(member => member.Role)
            .HasColumnName("role")
            .HasConversion(new SnakeCaseEnumConverter<ProjectRoleEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("member | administrator. Membro trabalha nos relatos e le a configuracao sem muda-la; administrador configura o projeto e decide quem entra.");

        // Uma linha por pessoa em cada projeto. O filtro deixa de fora as apagadas:
        // sem ele, quem saiu e voltou esbarraria numa linha que ninguem enxerga.
        builder.HasIndex(member => new { member.ProjectId, member.UserId })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // O acesso e montado a cada requisicao a partir da pessoa: "em que projetos
        // ela entrou" e a pergunta que mais se faz a esta tabela.
        builder.HasIndex(member => member.UserId);

        // Restrict: a pessoa nao some enquanto estiver num projeto. Sair do projeto
        // apaga a linha, e nunca o usuario — o que ela escreveu nos relatos continua
        // com o nome dela.
        builder.HasOne(member => member.User)
            .WithMany()
            .HasForeignKey(member => member.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
