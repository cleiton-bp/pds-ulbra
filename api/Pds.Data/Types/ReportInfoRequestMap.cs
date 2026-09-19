using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ReportInfoRequestMap : BaseEntityConfiguration<ReportInfoRequest>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ReportInfoRequest> builder)
    {
        builder.ToTable("report_info_requests", table =>
        {
            table.HasComment(
                "Quando o time devolve o relato pedindo contexto, em vez de encerrar. 'Nao reproduzi' e 'nao vamos fazer' chegando iguais ao relator fazem ele entender que acabou e parar de responder. A pergunta em si mora num comentario publico; esta linha guarda o relogio.");

            // O aviso vem antes do encerramento, sempre. Trocar os dois faria a
            // pagina avisar depois de ja ter encerrado — e o aviso existe para dar
            // chance de responder.
            table.HasCheckConstraint(
                "ck_report_info_requests_deadlines",
                "warn_at <= close_at AND asked_at <= warn_at");

            // Respondido e vencido sao caminhos opostos: um fecha o pedido porque a
            // pessoa falou, o outro porque ela nao falou. Os dois preenchidos e um
            // estado que nao existe.
            table.HasCheckConstraint(
                "ck_report_info_requests_answered_xor_expired",
                "NOT (answered_at IS NOT NULL AND expired_at IS NOT NULL)");
        });

        builder.Property(request => request.ReportId)
            .HasColumnName("report_id")
            .IsRequired()
            .HasComment("Relato devolvido.");

        builder.Property(request => request.AskedByUserId)
            .HasColumnName("asked_by_user_id")
            .IsRequired()
            .HasComment("Quem do time pediu. Obrigatorio, ao contrario do encerramento: o sistema encerra sozinho no fim do prazo, mas nunca pergunta nada.");

        builder.Property(request => request.AskedAt)
            .HasColumnName("asked_at")
            .IsRequired()
            .HasComment("Quando o pedido foi aberto, em UTC.");

        builder.Property(request => request.WarnAt)
            .HasColumnName("warn_at")
            .IsRequired()
            .HasComment("A partir de quando a pagina avisa que o relato vai encerrar. Gravado aqui e nao lido da configuracao: mudar o prazo do projeto nao pode mover o prazo de um pedido em curso.");

        builder.Property(request => request.CloseAt)
            .HasColumnName("close_at")
            .IsRequired()
            .HasComment("Quando o relato encerra como sem retorno, se ninguem responder. E este o momento agendado na fila.");

        builder.Property(request => request.AnsweredAt)
            .HasColumnName("answered_at")
            .HasComment("Quando quem relatou respondeu. Preenchido, o prazo nao vale mais.");

        builder.Property(request => request.ExpiredAt)
            .HasColumnName("expired_at")
            .HasComment("Quando o prazo venceu e o relato foi encerrado sem resposta.");

        // `IsOpen` e leitura das duas datas, e nao coluna. Sem isto o EF tentaria
        // mapear a propriedade e criaria uma terceira fonte para a mesma verdade.
        builder.Ignore(request => request.IsOpen);

        // A leitura comeca sempre pelo relato, e o que se quer e o pedido aberto.
        builder.HasIndex(request => new { request.ReportId, request.AskedAt });

        // Os vencidos que ninguem fechou, para a recuperacao da subida. Parcial: a
        // esmagadora maioria dos pedidos ja terminou.
        builder.HasIndex(request => request.CloseAt)
            .HasFilter("answered_at IS NULL AND expired_at IS NULL AND deleted_at IS NULL");

        // Restrict, como o autor do encerramento: quem perguntou nao some enquanto
        // houver pergunta dele. Apagar a linha apagaria de quem partiu a devolucao.
        builder.HasOne(request => request.AskedByUser)
            .WithMany()
            .HasForeignKey(request => request.AskedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
