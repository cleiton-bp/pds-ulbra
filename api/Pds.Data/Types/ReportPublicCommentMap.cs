using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ReportPublicCommentMap : BaseEntityConfiguration<ReportPublicComment>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ReportPublicComment> builder)
    {
        builder.ToTable("report_public_comments", table =>
        {
            table.HasComment(
                "O que o time escolhe dizer a quem relatou. Ainda nao tem leitor: a camada que o relator le vem depois, e ate la ele e publico no nome. Tabela separada do interno pelo mesmo motivo que a outra.");
        });

        builder.Property(comment => comment.ReportId)
            .HasColumnName("report_id")
            .IsRequired()
            .HasComment("Relato comentado.");

        builder.Property(comment => comment.UserId)
            .HasColumnName("user_id")
            .IsRequired()
            .HasComment("Quem escreveu, do lado de dentro. A camada publica nao mostra o nome, mas quem respondeu e pergunta interna.");

        builder.Property(comment => comment.Body)
            .HasColumnName("body")
            .HasMaxLength(ReportPublicComment.MaxBodyLength)
            .IsRequired()
            .HasComment("O texto que vai ser lido por quem relatou.");

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
