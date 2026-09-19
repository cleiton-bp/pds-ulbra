using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ReportClosureMap : BaseEntityConfiguration<ReportClosure>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ReportClosure> builder)
    {
        builder.ToTable("report_closures", table =>
        {
            table.HasComment(
                "O fim de um relato, com o motivo, e a resposta de quem o escreveu. Tabela propria e nao comentario: acontece uma vez por fechamento, carrega um desfecho e espera resposta. Uma linha por fechamento — relato reaberto e fechado de novo ganha linha nova, e as duas ficam.");

            // A nota vive numa escala de 1 a 5, e quem recusou opinar nao deu nota
            // nenhuma. As duas travas existem porque as duas coisas sao faceis de
            // gravar errado e impossiveis de ver depois: uma nota 0 vira a pior
            // avaliacao do relatorio, e uma recusa com nota conta duas vezes.
            table.HasCheckConstraint(
                "ck_report_closures_satisfaction_range",
                "satisfaction IS NULL OR (satisfaction >= 1 AND satisfaction <= 5)");

            table.HasCheckConstraint(
                "ck_report_closures_satisfaction_xor_declined",
                "NOT (satisfaction IS NOT NULL AND satisfaction_declined)");
        });

        builder.Property(closure => closure.ReportId)
            .HasColumnName("report_id")
            .IsRequired()
            .HasComment("Relato encerrado.");

        builder.Property(closure => closure.Outcome)
            .HasColumnName("outcome")
            .HasConversion(new SnakeCaseEnumConverter<PublicOutcomeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("done | wont_do | no_answer | duplicate. Guardado aqui e nao lido da etapa publica: a jornada e configuracao e pode ser reescrita, o desfecho deste relato nao.");

        builder.Property(closure => closure.Reason)
            .HasColumnName("reason")
            .HasMaxLength(ReportClosure.MaxReasonLength)
            .IsRequired()
            .HasComment("Por que acabou, escrito por quem encerrou. Obrigatorio: sem ele a pessoa fica sabendo que acabou e nao o que aconteceu.");

        builder.Property(closure => closure.ClosedByUserId)
            .HasColumnName("closed_by_user_id")
            .HasComment("Quem do time encerrou. Nulo quer dizer que foi o sistema, no fim do prazo do pedido de informacao.");

        builder.Property(closure => closure.ClosedAt)
            .HasColumnName("closed_at")
            .IsRequired()
            .HasComment("Quando encerrou, em UTC. Separado de created_at porque encerramento agendado e gravado quando a fila o consome.");

        builder.Property(closure => closure.PublicAt)
            .HasColumnName("public_at")
            .IsRequired()
            .HasComment("Quando este fechamento passa a valer para quem relatou. Igual a closed_at quando nao ha espera configurada; adiante dele durante a janela de desfazer. O painel nao le esta coluna: por dentro o relato esta encerrado desde closed_at.");

        builder.Property(closure => closure.ConfirmedAt)
            .HasColumnName("confirmed_at")
            .HasComment("Quando quem relatou confirmou que resolveu. Nulo enquanto nao respondeu.");

        builder.Property(closure => closure.Satisfaction)
            .HasColumnName("satisfaction")
            .HasComment("Nota de 1 a 5 dada na confirmacao. Nula quando nao houve resposta, e nula tambem quando houve recusa — que e outra coisa, e mora na coluna ao lado.");

        builder.Property(closure => closure.SatisfactionDeclined)
            .HasColumnName("satisfaction_declined")
            .IsRequired()
            .HasComment("A pessoa clicou em 'prefiro nao responder'. Fora da escala de proposito: dentro dela viraria a nota mais baixa e a media contaria recusa como insatisfacao.");

        builder.Property(closure => closure.ReopenedAt)
            .HasColumnName("reopened_at")
            .HasComment("Quando quem relatou reabriu. Preenchido, esta linha deixou de ser o fim do relato.");

        builder.Property(closure => closure.ReopenComment)
            .HasColumnName("reopen_comment")
            .HasMaxLength(ReportClosure.MaxReopenCommentLength)
            .HasComment("Por que reabriu, quando o projeto pede o comentario. E para quem for pegar o trabalho de novo, e nao para justificar o pedido.");

        // A leitura comeca sempre pelo relato, e o que se quer e o fechamento que
        // ainda vale — o mais recente sem reabertura. Dai a data no indice.
        builder.HasIndex(closure => new { closure.ReportId, closure.ClosedAt });

        // Restrict, como no comentario publico: quem encerrou nao some enquanto
        // houver encerramento dele. A conta excluida esvazia o usuario e o nome sai
        // junto — mas a linha fica, porque apagar o fechamento apagaria a decisao.
        builder.HasOne(closure => closure.ClosedByUser)
            .WithMany()
            .HasForeignKey(closure => closure.ClosedByUserId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
