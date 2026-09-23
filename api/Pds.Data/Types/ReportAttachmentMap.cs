using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Data.Types;

public class ReportAttachmentMap : BaseEntityConfiguration<ReportAttachment>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ReportAttachment> builder)
    {
        builder.ToTable("report_attachments", table =>
        {
            table.HasComment(
                "O registro de um arquivo que veio com o relato. O arquivo em si nao esta aqui e nunca estara: o que a linha guarda e o nome dele no armazenamento, o bastante para pedir uma permissao de leitura quando alguem que pode ver aparecer.");
        });

        builder.Property(attachment => attachment.ReportId)
            .HasColumnName("report_id")
            .IsRequired()
            .HasComment("Relato a que o anexo pertence. Obrigatorio mesmo quando o anexo veio numa resposta, para achar o relato ser sempre um salto so — e para o isolamento por conta nao depender de uma coluna que pode ser nula.");

        builder.Property(attachment => attachment.PublicCommentId)
            .HasColumnName("public_comment_id")
            .HasComment("Preenchido quando o anexo veio junto de uma resposta ao pedido de informacao. Nulo quando veio na criacao do relato.");

        builder.Property(attachment => attachment.Kind)
            .HasColumnName("kind")
            .HasConversion(new SnakeCaseEnumConverter<MediaKindEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("image ou video. A mesma lista de project_media_kinds, porque e ela que diz qual limite se aplica.");

        builder.Property(attachment => attachment.Status)
            .HasColumnName("status")
            .HasConversion(new SnakeCaseEnumConverter<AttachmentStatusEnum>())
            .HasMaxLength(20)
            .IsRequired()
            .HasComment("pending ou confirmed. Nasce pending quando a permissao e assinada, e so vira confirmed quando a nossa API confere os bytes e prende o anexo ao relato. O que fica pending e orfao — ocupa espaco e nao pertence a nada.");

        builder.Property(attachment => attachment.ObjectKey)
            .HasColumnName("object_key")
            .HasMaxLength(ReportAttachment.MaxObjectKeyLength)
            .IsRequired()
            .HasComment("O nome do arquivo no armazenamento, sorteado por nos e nunca derivado do nome que veio de fora — nome escolhido de fora permitiria escrever por cima do arquivo de outra pessoa. Nunca um endereco assinado: guardado, ele viraria link permanente com outro nome.");

        builder.Property(attachment => attachment.ThumbnailObjectKey)
            .HasColumnName("thumbnail_object_key")
            .HasMaxLength(ReportAttachment.MaxObjectKeyLength)
            .HasComment("A miniatura, gerada no proprio navegador antes do envio. No video e o quadro de capa. Vem de fora, entao ela tambem e conferida.");

        builder.Property(attachment => attachment.ContentType)
            .HasColumnName("content_type")
            .HasMaxLength(ReportAttachment.MaxContentTypeLength)
            .IsRequired()
            .HasComment("O tipo declarado, que entrou na assinatura do envio. Garante o rotulo, e nao o conteudo — quem confere os bytes e a confirmacao, na nossa API.");

        builder.Property(attachment => attachment.SizeBytes)
            .HasColumnName("size_bytes")
            .IsRequired()
            .HasComment("Tamanho do que o armazenamento aceitou, lido dele na confirmacao e nao do que o navegador disse.");

        builder.Property(attachment => attachment.DurationSeconds)
            .HasColumnName("duration_seconds")
            .HasComment("Duracao em segundos, so para o que tem duracao.");

        builder.Property(attachment => attachment.OriginalName)
            .HasColumnName("original_name")
            .HasMaxLength(ReportAttachment.MaxOriginalNameLength)
            .HasComment("O nome que o arquivo tinha na maquina de quem relata. Guardado para o time, e nunca mostrado do lado de fora: nome de arquivo conta pasta, cliente e numero de contrato, que a imagem nao conta.");

        builder.Property(attachment => attachment.ConfirmedAt)
            .HasColumnName("confirmed_at")
            .HasComment("Quando a nossa API prendeu o anexo ao relato. Nulo e orfao.");

        builder.HasOne(attachment => attachment.Report)
            .WithMany()
            .HasForeignKey(attachment => attachment.ReportId)
            .OnDelete(DeleteBehavior.Cascade);

        // O comentario some, e o anexo fica preso ao relato. Cascata aqui apagaria
        // a prova junto com a conversa que a pedia.
        builder.HasOne(attachment => attachment.PublicComment)
            .WithMany()
            .HasForeignKey(attachment => attachment.PublicCommentId)
            .OnDelete(DeleteBehavior.SetNull);

        // O nome no armazenamento e unico no sistema inteiro, e nao por projeto: ele
        // e sorteado, e duas linhas apontando para o mesmo arquivo fariam apagar uma
        // levar a outra junto.
        builder.HasIndex(attachment => attachment.ObjectKey)
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // A consulta de sempre: os anexos de um relato. Sem isto, montar a tela do
        // relato varreria a tabela inteira.
        builder.HasIndex(attachment => attachment.ReportId);
    }
}
