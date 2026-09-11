using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ReportMap : BaseEntityConfiguration<Report>
{
    protected override void ConfigureEntity(EntityTypeBuilder<Report> builder)
    {
        builder.ToTable("reports", table =>
        {
            table.HasComment(
                "O que a pessoa de fora escreveu. Primeira tabela do sistema que nasce sem conta e sem sessao, e por isso carrega o proprio account_id, o protocolo que a pessoa le e o hash do token que abre o acompanhamento.");
        });

        builder.Property(report => report.AccountId)
            .HasColumnName("account_id")
            .IsRequired()
            .HasComment("Conta dona do relato, repetido de proposito em vez de chegar pelo projeto.");

        builder.Property(report => report.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto de onde o relato veio, resolvido pela chave publica da requisicao.");

        builder.Property(report => report.TrackingCode)
            .HasColumnName("tracking_code")
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("O protocolo que a pessoa le e repete. Alfabeto sem 0, O, 1 e I; colisao tratada na geracao.");

        builder.Property(report => report.AccessTokenHash)
            .HasColumnName("access_token_hash")
            .HasMaxLength(128)
            .IsRequired()
            .HasComment("Hash do token do link de acompanhamento. O valor original so existe na URL entregue.");

        builder.Property(report => report.Type)
            .HasColumnName("type")
            .HasConversion(new SnakeCaseEnumConverter<ReportTypeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("bug | improvement | question. Lista fixa por enquanto.");

        builder.Property(report => report.Text)
            .HasColumnName("text")
            .HasMaxLength(Report.MaxTextLength)
            .IsRequired()
            .HasComment("O relato como a pessoa escreveu.");

        builder.Property(report => report.Route)
            .HasColumnName("route")
            .HasMaxLength(500)
            .HasComment("So o caminho da pagina, sem query e sem fragmento: e na query que viaja dado sensivel.");

        builder.Property(report => report.Origin)
            .HasColumnName("origin")
            .HasMaxLength(260)
            .HasComment("Dominio informado pela pagina que embutiu a ferramenta. Indicio, nunca prova.");

        // Unico em todo o sistema, e sem o filtro de deleted_at que as outras
        // unicidades usam: o protocolo esta escrito num papel na mao de alguem, e
        // reaproveita-lo faria duas pessoas diferentes digitarem o mesmo codigo.
        builder.HasIndex(report => report.TrackingCode).IsUnique();

        // A lista do painel: os relatos da conta, do mais novo para o mais antigo.
        builder.HasIndex(report => new { report.AccountId, report.CreatedAt });

        // A mesma lista dentro de um projeto.
        builder.HasIndex(report => new { report.ProjectId, report.CreatedAt });

        // Abrir o acompanhamento pelo link procura por aqui.
        builder.HasIndex(report => report.AccessTokenHash);
    }
}
