using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ProjectCycleSettingsMap : BaseEntityConfiguration<ProjectCycleSettings>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectCycleSettings> builder)
    {
        builder.ToTable("project_cycle_settings", table =>
        {
            table.HasComment(
                "Como o ciclo fecha neste projeto: quando encerra, quanto espera antes de quem relatou ver, se da para reabrir e como, e o que a pessoa responde no fim. Uma linha por projeto, criada so quando alguem salva — os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada.");

            // Os dois prazos e a espera sao numeros digitados por uma pessoa, e um
            // zero a mais nao da erro em lugar nenhum: deixaria quem relatou sem
            // noticia por meses, ou o relato esperando resposta por anos. O teto e
            // conferido no servico, e estas travas sao a rede embaixo.
            table.HasCheckConstraint(
                "ck_project_cycle_settings_public_delay",
                $"public_delay_minutes >= 0 AND public_delay_minutes <= {ProjectCycleSettings.MaxPublicDelayMinutes}");

            table.HasCheckConstraint(
                "ck_project_cycle_settings_info_request_days",
                $"info_request_warn_days >= 1 AND info_request_warn_days <= {ProjectCycleSettings.MaxInfoRequestDays} AND info_request_close_days >= 1 AND info_request_close_days <= {ProjectCycleSettings.MaxInfoRequestDays}");
        });

        builder.Property(settings => settings.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1.");

        builder.Property(settings => settings.ClosureTrigger)
            .HasColumnName("closure_trigger")
            .HasConversion(new SnakeCaseEnumConverter<ClosureTriggerEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("last_column | button — se o relato encerra ao cair na ultima coluna ativa ou por um botao proprio.");

        builder.Property(settings => settings.PublicDelayMinutes)
            .HasColumnName("public_delay_minutes")
            .IsRequired()
            .HasComment("Quanto o lado publico espera antes de mudar. Zero e o comportamento anterior a esta etapa; acima de zero e a janela para desfazer um movimento errado.");

        builder.Property(settings => settings.AllowsReopen)
            .HasColumnName("allows_reopen")
            .IsRequired()
            .HasComment("Se quem relatou pode reabrir.");

        builder.Property(settings => settings.ReopenStateId)
            .HasColumnName("reopen_state_id")
            .HasComment("Para qual coluna interna o relato volta ao ser reaberto. Nula usa a primeira ativa.");

        builder.Property(settings => settings.ReopenRequiresComment)
            .HasColumnName("reopen_requires_comment")
            .IsRequired()
            .HasComment("Se reabrir exige dizer por que. O motivo e para quem vai pegar o relato de volta.");

        builder.Property(settings => settings.TrackingCodeCanAct)
            .HasColumnName("tracking_code_can_act")
            .IsRequired()
            .HasComment("Se o protocolo sozinho confirma e reabre, ou se as duas acoes exigem o link. Ler e inofensivo; reabrir mexe na fila do time.");

        builder.Property(settings => settings.SatisfactionEnabled)
            .HasColumnName("satisfaction_enabled")
            .IsRequired()
            .HasComment("Se a nota e pedida ao confirmar.");

        builder.Property(settings => settings.SatisfactionStyle)
            .HasColumnName("satisfaction_style")
            .HasConversion(new SnakeCaseEnumConverter<SatisfactionStyleEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("stars | number — como a escala de 1 a 5 aparece. Muda o desenho, e nao o dado: os dois guardam o mesmo inteiro.");

        builder.Property(settings => settings.SatisfactionRequired)
            .HasColumnName("satisfaction_required")
            .IsRequired()
            .HasComment("Se confirmar exige responder. Mesmo exigindo, 'prefiro nao responder' continua existindo, fora da escala.");

        builder.Property(settings => settings.InfoRequestEnabled)
            .HasColumnName("info_request_enabled")
            .IsRequired()
            .HasComment("Se o time pode devolver o relato pedindo informacao em vez de encerrar.");

        builder.Property(settings => settings.InfoRequestWarnDays)
            .HasColumnName("info_request_warn_days")
            .IsRequired()
            .HasComment("Dias sem resposta ate avisar quem relatou de que o relato vai encerrar.");

        builder.Property(settings => settings.InfoRequestCloseDays)
            .HasColumnName("info_request_close_days")
            .IsRequired()
            .HasComment("Dias depois do aviso ate encerrar como sem retorno. Encerrado assim continua reabrivel.");

        builder.Property(settings => settings.AcceptsQuestionsDefault)
            .HasColumnName("accepts_questions_default")
            .IsRequired()
            .HasComment("Como a opcao de aceitar duvidas vem marcada no formulario. A escolha final e de quem relata, nao do projeto.");

        // Uma linha por projeto. Parcial, para o projeto apagado logicamente nao
        // segurar o lugar de uma configuracao nova.
        builder.HasIndex(settings => settings.ProjectId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // Restrict: a coluna escolhida como destino da reabertura nao some por
        // debaixo da configuracao. Quem quiser remove-la tira daqui primeiro — e a
        // recusa explica, em vez de a reabertura passar a cair em outro lugar sem
        // ninguem ter pedido.
        builder.HasOne(settings => settings.ReopenState)
            .WithMany()
            .HasForeignKey(settings => settings.ReopenStateId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
