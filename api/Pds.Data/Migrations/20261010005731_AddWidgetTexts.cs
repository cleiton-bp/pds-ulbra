using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pds.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddWidgetTexts : Migration
    {
        // Os textos que a ferramenta tinha fixos passam a ser do projeto. Cada coluna
        // nasce com o texto de fabrica — o mesmo de WidgetSettingsDefaults —, e o
        // projeto que ja tinha salvo a configuracao continua vendo o que via. Os textos
        // sao copiados aqui, e nao lidos de la: a migracao descreve o banco de hoje, e
        // os padroes do codigo podem mudar depois.
        //
        // O DEFAULT so serve para preencher as linhas que ja existem, e sai logo depois:
        // nenhuma coluna desta tabela tem padrao no banco, porque os padroes moram uma
        // vez, no codigo, e uma segunda declaracao divergiria sem ninguem ver.
        private static readonly string[] Textos =
        [
            "submit_label", "report_title_question", "report_title_placeholder", "type_field_label",
            "more_details_label", "name_question", "public_notice", "tracking_intro",
        ];

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "success_message",
                table: "project_widget_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                comment: "A frase acima do protocolo, na confirmacao. Aceita {{primeiroNome}}, {{protocolo}}, {{tipo}} e {{projeto}}, com o padrao depois da barra ({{primeiroNome|pessoa}}); a ferramenta troca depois de enviar.",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldComment: "A frase acima do protocolo, na confirmacao.");

            migrationBuilder.AddColumn<string>(
                name: "more_details_label",
                table: "project_widget_settings",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "Mais detalhes",
                comment: "O nome da caixa livre quando ela vem depois das perguntas do tipo. Sem variaveis.");

            migrationBuilder.AddColumn<string>(
                name: "name_question",
                table: "project_widget_settings",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "Como podemos te chamar",
                comment: "A pergunta do nome, quando o projeto pergunta. Sem variaveis.");

            migrationBuilder.AddColumn<string>(
                name: "public_notice",
                table: "project_widget_settings",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                defaultValue: "Este relato pode virar público. Alguém da equipe lê antes; se for liberado, qualquer pessoa poderá ler o que você escrever aqui.",
                comment: "O aviso de que o relato pode virar publico, antes de a pessoa escrever. A frase sobre o nome vem depois e nao e configuravel: depende da visibilidade. Sem variaveis.");

            migrationBuilder.AddColumn<string>(
                name: "report_title_placeholder",
                table: "project_widget_settings",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "O botão de pagar não responde",
                comment: "O exemplo cinza dentro da linha do titulo. Sem variaveis.");

            migrationBuilder.AddColumn<string>(
                name: "report_title_question",
                table: "project_widget_settings",
                type: "character varying(80)",
                maxLength: 80,
                nullable: false,
                defaultValue: "Em poucas palavras, o que aconteceu?",
                comment: "A pergunta do titulo, acima da linha curta. Sem variaveis.");

            migrationBuilder.AddColumn<string>(
                name: "submit_label",
                table: "project_widget_settings",
                type: "character varying(30)",
                maxLength: 30,
                nullable: false,
                defaultValue: "Enviar",
                comment: "O texto do botao que envia o relato. Sem variaveis.");

            migrationBuilder.AddColumn<string>(
                name: "tracking_intro",
                table: "project_widget_settings",
                type: "character varying(300)",
                maxLength: 300,
                nullable: false,
                defaultValue: "Este é o registro do que você enviou.",
                comment: "A frase do topo da pagina de acompanhamento. Aceita as variaveis da confirmacao e {{etapa}}; a pagina troca na leitura.");

            migrationBuilder.AddColumn<string>(
                name: "type_field_label",
                table: "project_widget_settings",
                type: "character varying(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "O que é",
                comment: "O nome do seletor de tipo. Sem variaveis.");

            migrationBuilder.Sql(
                "ALTER TABLE project_widget_settings "
                + string.Join(", ", Textos.Select(coluna => $"ALTER COLUMN {coluna} DROP DEFAULT"))
                + ";");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "more_details_label",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "name_question",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "public_notice",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "report_title_placeholder",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "report_title_question",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "submit_label",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "tracking_intro",
                table: "project_widget_settings");

            migrationBuilder.DropColumn(
                name: "type_field_label",
                table: "project_widget_settings");

            migrationBuilder.AlterColumn<string>(
                name: "success_message",
                table: "project_widget_settings",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                comment: "A frase acima do protocolo, na confirmacao.",
                oldClrType: typeof(string),
                oldType: "character varying(200)",
                oldMaxLength: 200,
                oldComment: "A frase acima do protocolo, na confirmacao. Aceita {{primeiroNome}}, {{protocolo}}, {{tipo}} e {{projeto}}, com o padrao depois da barra ({{primeiroNome|pessoa}}); a ferramenta troca depois de enviar.");
        }
    }
}
