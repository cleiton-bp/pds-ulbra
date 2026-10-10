using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ProjectReportLimitsMap : BaseEntityConfiguration<ProjectReportLimits>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectReportLimits> builder)
    {
        builder.ToTable("project_report_limits", table =>
        {
            table.HasComment(
                "Quantos relatos o projeto aceita em pouco tempo, por camada: quem relata, IP, endereco de origem e o projeto inteiro, e o intervalo minimo entre dois. Uma linha por projeto, criada so quando alguem salva — os padroes e os tetos vivem no codigo. Nenhum IP e guardado: as contagens vivem na memoria do processo.");

            // A mesma faixa que a API confere: de 1 ao teto (dez vezes o padrao). O
            // intervalo pode ser zero, que o desliga.
            table.HasCheckConstraint(
                "ck_project_report_limits_ranges",
                $"per_reporter BETWEEN 1 AND {ReportLimitsDefaults.MaxPerReporter} "
                + $"AND per_ip_per_hour BETWEEN 1 AND {ReportLimitsDefaults.MaxPerIpPerHour} "
                + $"AND per_origin_per_hour BETWEEN 1 AND {ReportLimitsDefaults.MaxPerOriginPerHour} "
                + $"AND per_project_per_hour BETWEEN 1 AND {ReportLimitsDefaults.MaxPerProjectPerHour} "
                + $"AND per_project_per_day BETWEEN 1 AND {ReportLimitsDefaults.MaxPerProjectPerDay} "
                + $"AND min_interval_seconds BETWEEN 0 AND {ReportLimitsDefaults.MaxMinIntervalSeconds}");
        });

        builder.Property(limits => limits.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1.");

        builder.Property(limits => limits.PerReporter)
            .HasColumnName("per_reporter")
            .IsRequired()
            .HasComment("Relatos da mesma pessoa a cada 10 minutos. Padrao 5. A pessoa e o codigo pessoal, no projeto que usa esse modo e quando ele vem; senao, o IP.");

        builder.Property(limits => limits.PerIpPerHour)
            .HasColumnName("per_ip_per_hour")
            .IsRequired()
            .HasComment("Relatos do mesmo IP por hora. Padrao 20.");

        builder.Property(limits => limits.PerOriginPerHour)
            .HasColumnName("per_origin_per_hour")
            .IsRequired()
            .HasComment("Relatos do mesmo endereco de origem por hora. Padrao 200. A origem e declarada pela pagina: por isso as camadas de IP e de projeto existem.");

        builder.Property(limits => limits.PerProjectPerHour)
            .HasColumnName("per_project_per_hour")
            .IsRequired()
            .HasComment("Relatos do projeto inteiro por hora. Padrao 300.");

        builder.Property(limits => limits.PerProjectPerDay)
            .HasColumnName("per_project_per_day")
            .IsRequired()
            .HasComment("Relatos do projeto inteiro nas ultimas 24 horas. Padrao 2000.");

        builder.Property(limits => limits.MinIntervalSeconds)
            .HasColumnName("min_interval_seconds")
            .IsRequired()
            .HasComment("Segundos minimos entre dois relatos da mesma pessoa ou do mesmo IP. Padrao 30; zero desliga. Antes disso a recusa e direta, sem desafio.");

        // Uma linha por projeto. Parcial, para o projeto apagado logicamente nao
        // segurar o lugar de uma configuracao nova.
        builder.HasIndex(limits => limits.ProjectId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
