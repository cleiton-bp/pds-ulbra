using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ReportInternalCommentMap : BaseEntityConfiguration<ReportInternalComment>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ReportInternalComment> builder)
    {
        builder.ToTable("report_internal_comments", table =>
        {
            table.HasComment(
                "O que o time escreve entre si. E tabela separada do comentario publico, e nao um campo de visibilidade, porque com sinalizador basta esquecer um filtro para vazar e com tabelas separadas vazar exige uma consulta que nao existe.");
        });

        builder.Property(comment => comment.ReportId)
            .HasColumnName("report_id")
            .IsRequired()
            .HasComment("Relato comentado.");

        builder.Property(comment => comment.UserId)
            .HasColumnName("user_id")
            .IsRequired()
            .HasComment("Quem escreveu. Obrigatorio: comentario interno sem autor nao serve para decidir nada depois.");

        builder.Property(comment => comment.Body)
            .HasColumnName("body")
            .HasMaxLength(ReportInternalComment.MaxBodyLength)
            .IsRequired()
            .HasComment("O texto como o time escreveu. Nao sai desta tabela, nem para o payload do evento.");

        // A leitura comeca sempre pelo relato, em ordem de escrita.
        builder.HasIndex(comment => new { comment.ReportId, comment.CreatedAt });

        // Restrict: o autor nao some enquanto houver comentario dele. A conta
        // excluida esvazia o usuario, e o nome sai junto — mas a linha fica, porque
        // apagar o comentario apagaria a decisao que ele explica.
        builder.HasOne(comment => comment.User)
            .WithMany()
            .HasForeignKey(comment => comment.UserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
