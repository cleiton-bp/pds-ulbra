using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ProjectMediaSettingsMap : BaseEntityConfiguration<ProjectMediaSettings>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectMediaSettings> builder)
    {
        builder.ToTable("project_media_settings", table =>
        {
            table.HasComment(
                "O que este projeto aceita receber junto do relato. Uma linha por projeto, criada so quando alguem salva — os padroes vivem no codigo, e projeto sem linha e projeto que nunca precisou mudar nada. Nenhum limite de tipo mora aqui: isso fica em project_media_kinds, uma linha por tipo.");
        });

        builder.Property(settings => settings.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1.");

        builder.Property(settings => settings.IsEnabled)
            .HasColumnName("is_enabled")
            .IsRequired()
            .HasComment("O quadro mostra anexo. Desligado, nada mais nesta linha vale — nem tipo ligado, nem limite configurado: o botao nao aparece e o servidor recusa assinar permissao. Sem armazenamento configurado nao liga, e a tela diz por que.");

        builder.Property(settings => settings.AllowsScreenCapture)
            .HasColumnName("allows_screen_capture")
            .IsRequired()
            .HasComment("O botao de capturar a tela aparece. Nao e a captura automatica, que continua impossivel de dentro do quadro: aqui o navegador pergunta qual tela, e quem decide o que aparece e quem relata. Onde o navegador nao souber fazer, o botao some sozinho.");

        builder.Property(settings => settings.AllowsOnInfoRequest)
            .HasColumnName("allows_on_info_request")
            .IsRequired()
            .HasComment("Da para anexar respondendo a um pedido de informacao do time, que e onde o print mais serve. Chave propria porque ha projeto que quer anexo na criacao e nao quer na conversa.");

        builder.Property(settings => settings.MaxFilesPerReport)
            .HasColumnName("max_files_per_report")
            .IsRequired()
            .HasComment("Quantos arquivos cabem num relato, somando todos os tipos. Existe alem do limite por tipo, e nao no lugar dele: so com o limite por tipo, tres imagens mais um video passariam num projeto que so queria dois no total.");

        // Uma linha por projeto. Parcial, para o projeto apagado logicamente nao
        // segurar o lugar de uma configuracao nova.
        builder.HasIndex(settings => settings.ProjectId)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");
    }
}
