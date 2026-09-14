using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectInitialStateMap : BaseEntityConfiguration<ProjectInitialState>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectInitialState> builder)
    {
        builder.ToTable("project_initial_states", table =>
        {
            table.HasComment(
                "Onde um relato cai ao entrar, por tipo. E tabela em vez de colunas em projects para tipo novo nao pedir migracao, e a linha so nasce quando o cliente escolhe: sem linha, vale o primeiro estado ativo da fila.");
        });

        builder.Property(initial => initial.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto a que esta escolha pertence.");

        builder.Property(initial => initial.ReportType)
            .HasColumnName("report_type")
            .HasConversion(new SnakeCaseEnumConverter<ReportTypeEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("bug, improvement ou question. Unico por projeto entre os nao apagados.");

        builder.Property(initial => initial.ProjectStateId)
            .HasColumnName("project_state_id")
            .IsRequired()
            .HasComment("Estado onde o relato deste tipo cai. Do mesmo projeto, e ativo.");

        // Um destino por tipo. Dois seriam duas respostas para a mesma pergunta, e
        // qual delas valeria dependeria da ordem da consulta.
        builder.HasIndex(initial => new { initial.ProjectId, initial.ReportType })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // Apagar o estado nao pode arrastar a escolha junto sem ninguem ver: a
        // regra de aposentar mora no servico, que recusa enquanto houver tipo
        // apontando para ele. Restrict e a rede embaixo dessa regra.
        builder.HasOne(initial => initial.ProjectState)
            .WithMany()
            .HasForeignKey(initial => initial.ProjectStateId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
