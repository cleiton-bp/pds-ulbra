using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class UpdateColumnComments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterTable(
                name: "report_public_comments",
                comment: "A conversa com quem relatou: o que o time escolhe dizer a ele, e o que ele responde. Quem relatou le na pagina de acompanhamento. Tabela separada do interno pelo mesmo motivo que a outra.",
                oldComment: "O que o time escolhe dizer a quem relatou. Ainda nao tem leitor: a camada que o relator le vem depois, e ate la ele e publico no nome. Tabela separada do interno pelo mesmo motivo que a outra.");

            migrationBuilder.AlterTable(
                name: "report_attachments",
                comment: "O registro de um arquivo que veio com o relato, com uma resposta ou com uma reabertura. O arquivo em si nao esta aqui e nunca estara: o que a linha guarda e o nome dele no armazenamento, o bastante para pedir uma permissao de leitura quando alguem que pode ver aparecer.",
                oldComment: "O registro de um arquivo que veio com o relato. O arquivo em si nao esta aqui e nunca estara: o que a linha guarda e o nome dele no armazenamento, o bastante para pedir uma permissao de leitura quando alguem que pode ver aparecer.");

            migrationBuilder.AlterColumn<string>(
                name: "thumbnail_object_key",
                table: "report_attachments",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true,
                comment: "A miniatura da imagem, gerada no proprio navegador antes do envio — WebP, ou JPEG onde o navegador nao codifica WebP. Vem de fora, entao ela tambem e conferida. O arquivo nao tem; nos videos antigos, e o quadro de capa.",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldNullable: true,
                oldComment: "A miniatura, gerada no proprio navegador antes do envio. No video e o quadro de capa. Vem de fora, entao ela tambem e conferida.");

            migrationBuilder.AlterColumn<string>(
                name: "status",
                table: "report_attachments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "pending ou confirmed. Nasce pending quando a permissao e assinada, e so vira confirmed quando a nossa API confere os bytes e prende o anexo ao relato. O que fica pending e permissao nao usada: nao aparece nem conta no limite, e o arquivo, se chegou, fica na pasta de envio, que o armazenamento esvazia sozinho.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "pending ou confirmed. Nasce pending quando a permissao e assinada, e so vira confirmed quando a nossa API confere os bytes e prende o anexo ao relato. O que fica pending e orfao — ocupa espaco e nao pertence a nada.");

            migrationBuilder.AlterColumn<int>(
                name: "duration_seconds",
                table: "report_attachments",
                type: "integer",
                nullable: true,
                comment: "Duracao em segundos, so dos videos antigos.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true,
                oldComment: "Duracao em segundos, so para o que tem duracao.");

            migrationBuilder.AlterColumn<DateTime>(
                name: "confirmed_at",
                table: "report_attachments",
                type: "timestamp without time zone",
                nullable: true,
                comment: "Quando a nossa API prendeu o anexo ao relato. Nulo enquanto pendente.",
                oldClrType: typeof(DateTime),
                oldType: "timestamp without time zone",
                oldNullable: true,
                oldComment: "Quando a nossa API prendeu o anexo ao relato. Nulo e orfao.");

            migrationBuilder.AlterColumn<bool>(
                name: "allows_screen_capture",
                table: "project_media_settings",
                type: "boolean",
                nullable: false,
                comment: "O botao de capturar uma area da pagina aparece. Quem captura e o carregador, na pagina do cliente, sem o navegador perguntar nada; a imagem abre no editor antes de entrar na lista, e quem esconde o que nao quer mostrar e quem relata. Onde a pagina nao deixa, o botao some sozinho.",
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldComment: "O botao de capturar a tela aparece. Nao e a captura automatica, que continua impossivel de dentro do quadro: aqui o navegador pergunta qual tela, e quem decide o que aparece e quem relata. Onde o navegador nao souber fazer, o botao some sozinho.");

            migrationBuilder.AlterColumn<int>(
                name: "max_duration_seconds",
                table: "project_media_kinds",
                type: "integer",
                nullable: true,
                comment: "Duracao maxima em segundos, so das linhas antigas de video — o video saiu do produto. Nula na imagem e no arquivo.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true,
                oldComment: "Duracao maxima em segundos, nula para o que nao tem duracao. E a protecao mais barata desta etapa, porque corta armazenamento e exposicao de uma vez.");

            migrationBuilder.AlterColumn<bool>(
                name: "tracking_code_can_act",
                table: "project_cycle_settings",
                type: "boolean",
                nullable: false,
                comment: "Se o codigo pessoal sozinho confirma e reabre, ou se as acoes exigem o link. Ler e inofensivo; reabrir mexe na fila do time. Gravado e, por enquanto, ignorado: confirmar, reabrir e responder so aceitam o link.",
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldComment: "Se o protocolo sozinho confirma e reabre, ou se as duas acoes exigem o link. Ler e inofensivo; reabrir mexe na fila do time.");

            migrationBuilder.AlterColumn<int>(
                name: "public_delay_minutes",
                table: "project_cycle_settings",
                type: "integer",
                nullable: false,
                comment: "Quanto o lado publico espera antes de mudar. Zero: muda na hora; acima de zero e a janela para desfazer um movimento errado.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldComment: "Quanto o lado publico espera antes de mudar. Zero e o comportamento anterior a esta etapa; acima de zero e a janela para desfazer um movimento errado.");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterTable(
                name: "report_public_comments",
                comment: "O que o time escolhe dizer a quem relatou. Ainda nao tem leitor: a camada que o relator le vem depois, e ate la ele e publico no nome. Tabela separada do interno pelo mesmo motivo que a outra.",
                oldComment: "A conversa com quem relatou: o que o time escolhe dizer a ele, e o que ele responde. Quem relatou le na pagina de acompanhamento. Tabela separada do interno pelo mesmo motivo que a outra.");

            migrationBuilder.AlterTable(
                name: "report_attachments",
                comment: "O registro de um arquivo que veio com o relato. O arquivo em si nao esta aqui e nunca estara: o que a linha guarda e o nome dele no armazenamento, o bastante para pedir uma permissao de leitura quando alguem que pode ver aparecer.",
                oldComment: "O registro de um arquivo que veio com o relato, com uma resposta ou com uma reabertura. O arquivo em si nao esta aqui e nunca estara: o que a linha guarda e o nome dele no armazenamento, o bastante para pedir uma permissao de leitura quando alguem que pode ver aparecer.");

            migrationBuilder.AlterColumn<string>(
                name: "thumbnail_object_key",
                table: "report_attachments",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true,
                comment: "A miniatura, gerada no proprio navegador antes do envio. No video e o quadro de capa. Vem de fora, entao ela tambem e conferida.",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldNullable: true,
                oldComment: "A miniatura da imagem, gerada no proprio navegador antes do envio — WebP, ou JPEG onde o navegador nao codifica WebP. Vem de fora, entao ela tambem e conferida. O arquivo nao tem; nos videos antigos, e o quadro de capa.");

            migrationBuilder.AlterColumn<string>(
                name: "status",
                table: "report_attachments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                comment: "pending ou confirmed. Nasce pending quando a permissao e assinada, e so vira confirmed quando a nossa API confere os bytes e prende o anexo ao relato. O que fica pending e orfao — ocupa espaco e nao pertence a nada.",
                oldClrType: typeof(string),
                oldType: "character varying(20)",
                oldMaxLength: 20,
                oldComment: "pending ou confirmed. Nasce pending quando a permissao e assinada, e so vira confirmed quando a nossa API confere os bytes e prende o anexo ao relato. O que fica pending e permissao nao usada: nao aparece nem conta no limite, e o arquivo, se chegou, fica na pasta de envio, que o armazenamento esvazia sozinho.");

            migrationBuilder.AlterColumn<int>(
                name: "duration_seconds",
                table: "report_attachments",
                type: "integer",
                nullable: true,
                comment: "Duracao em segundos, so para o que tem duracao.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true,
                oldComment: "Duracao em segundos, so dos videos antigos.");

            migrationBuilder.AlterColumn<DateTime>(
                name: "confirmed_at",
                table: "report_attachments",
                type: "timestamp without time zone",
                nullable: true,
                comment: "Quando a nossa API prendeu o anexo ao relato. Nulo e orfao.",
                oldClrType: typeof(DateTime),
                oldType: "timestamp without time zone",
                oldNullable: true,
                oldComment: "Quando a nossa API prendeu o anexo ao relato. Nulo enquanto pendente.");

            migrationBuilder.AlterColumn<bool>(
                name: "allows_screen_capture",
                table: "project_media_settings",
                type: "boolean",
                nullable: false,
                comment: "O botao de capturar a tela aparece. Nao e a captura automatica, que continua impossivel de dentro do quadro: aqui o navegador pergunta qual tela, e quem decide o que aparece e quem relata. Onde o navegador nao souber fazer, o botao some sozinho.",
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldComment: "O botao de capturar uma area da pagina aparece. Quem captura e o carregador, na pagina do cliente, sem o navegador perguntar nada; a imagem abre no editor antes de entrar na lista, e quem esconde o que nao quer mostrar e quem relata. Onde a pagina nao deixa, o botao some sozinho.");

            migrationBuilder.AlterColumn<int>(
                name: "max_duration_seconds",
                table: "project_media_kinds",
                type: "integer",
                nullable: true,
                comment: "Duracao maxima em segundos, nula para o que nao tem duracao. E a protecao mais barata desta etapa, porque corta armazenamento e exposicao de uma vez.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldNullable: true,
                oldComment: "Duracao maxima em segundos, so das linhas antigas de video — o video saiu do produto. Nula na imagem e no arquivo.");

            migrationBuilder.AlterColumn<bool>(
                name: "tracking_code_can_act",
                table: "project_cycle_settings",
                type: "boolean",
                nullable: false,
                comment: "Se o protocolo sozinho confirma e reabre, ou se as duas acoes exigem o link. Ler e inofensivo; reabrir mexe na fila do time.",
                oldClrType: typeof(bool),
                oldType: "boolean",
                oldComment: "Se o codigo pessoal sozinho confirma e reabre, ou se as acoes exigem o link. Ler e inofensivo; reabrir mexe na fila do time. Gravado e, por enquanto, ignorado: confirmar, reabrir e responder so aceitam o link.");

            migrationBuilder.AlterColumn<int>(
                name: "public_delay_minutes",
                table: "project_cycle_settings",
                type: "integer",
                nullable: false,
                comment: "Quanto o lado publico espera antes de mudar. Zero e o comportamento anterior a esta etapa; acima de zero e a janela para desfazer um movimento errado.",
                oldClrType: typeof(int),
                oldType: "integer",
                oldComment: "Quanto o lado publico espera antes de mudar. Zero: muda na hora; acima de zero e a janela para desfazer um movimento errado.");
        }
    }
}
