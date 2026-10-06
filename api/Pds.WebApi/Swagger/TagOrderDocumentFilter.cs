using Microsoft.OpenApi.Models;
using Pds.WebApi.Controllers;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace Pds.WebApi.Swagger;

/// <summary>
/// Declara os grupos do Swagger com descrição e numa ordem que conta uma história:
/// entrar, ver a sessão, criar projeto, gerar chave.
///
/// <para>Sem isto o Swagger monta os grupos sozinho, em ordem alfabética e sem
/// descrição alguma — e "Chaves do projeto" apareceria antes de "Projetos", que é
/// justamente o passo anterior.</para>
/// </summary>
public class TagOrderDocumentFilter : IDocumentFilter
{
    public void Apply(OpenApiDocument document, DocumentFilterContext context)
    {
        document.Tags =
        [
            new OpenApiTag
            {
                Name = SwaggerTags.Auth,
                Description = "Entrar e sair. A única parte que funciona sem token.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.Session,
                Description = "Quem está logado e em qual conta — e o bilhete da conexão em tempo real.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.Notifications,
                Description = "O sino de quem está na sessão: as menções em comentário interno e as vezes em que foi escolhido como responsável, de todos os projetos em que está. E a preferência do e-mail de responsável — a menção não manda e-mail.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.Projects,
                Description = "A unidade que o cliente configura e a que identifica de onde veio cada relato.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectKeys,
                Description = "O que liga o sistema do cliente ao nosso. A secreta é exibida uma única vez.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectOrigins,
                Description = "De onde a ferramenta pode abrir. A chave pública fica à vista no site do cliente; é esta lista que impede a cópia dela de funcionar em outro lugar.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.WidgetSettings,
                Description = "Como a ferramenta aparece no site do cliente: se aparece, a cor, o canto, o tema e os textos.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectStates,
                Description = "A fila de trabalho por onde o relato passa do lado de dentro, com os nomes que o próprio cliente deu. Estado não se apaga: aposenta.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectPriorities,
                Description = "As prioridades do projeto, com os nomes e as cores que o time deu. Nasce com quatro de fábrica (Baixa, Média, Alta, Urgente). Como o estado, não se apaga: aposenta.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectLabels,
                Description = "As etiquetas do projeto. Quem cria é o time, ao etiquetar um card; o administrador renomeia, troca a cor e apaga — apagar tira a etiqueta de todos os cards.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectPublicStages,
                Description = "A jornada que quem relatou acompanha. Vários estados de dentro cabem numa etapa daqui, e é essa perda de detalhe que é o produto. Entre três e sete.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectStatusMappings,
                Description = "O que liga um estado de dentro a uma etapa de fora. Grava-se inteiro, e cada gravação cria uma versão — alterar hoje não reescreve o que já aconteceu.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.CycleSettings,
                Description = "Como o relato acaba: quando encerra, se da para reabrir, e o que o relator responde.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.IdentitySettings,
                Description = "Quem e quem, e quem pode ver: o modo de identificacao e os tres niveis de visibilidade, gravados juntos porque o primeiro decide o segundo.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.MediaSettings,
                Description = "O que o projeto aceita receber junto do relato. Os limites de cada tipo moram numa linha por tipo, e o de tamanho viaja dentro da assinatura do envio — quem recusa o que passa e o proprio armazenamento.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.Team,
                Description = "Quem está no time do projeto, com que papel, e a configuração do time. Ler é de quem está no projeto; mudar o papel e tirar alguém, só do administrador. O dono da conta aparece como administrador, e não sai nem muda de papel.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ProjectInvitations,
                Description = "Convidar, reenviar e cancelar, só do administrador. O e-mail sai pela fila, fora da requisição; o convite guarda só se ele saiu. O link de aceitar nunca aparece aqui — só dentro do e-mail.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.Invitations,
                Description = "O lado de quem foi convidado, com a própria sessão: ver o convite pelo link e aceitar. Aceitar exige o Google do mesmo endereço do convite, confirmado.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.Reports,
                Description = "O que chegou do site do cliente, para o time que usa o painel. Exige sessão, e mostra apenas os relatos dos projetos em que a pessoa está.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.ReportComments,
                Description = "O que fica entre o time e o que é escrito para quem relatou. São duas rotas e duas tabelas: não existe campo que decida qual é qual.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.PublicReports,
                Description = "O relato, do lado de quem relatou: a entrada vinda do site do cliente, com a chave pública — que só diz para onde o relato vai —; o acompanhamento, a resposta, a confirmação e a reabertura, pelo link; a leitura pelo código pessoal; e os anexos, pedidos e confirmados pelo link.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.PublicWidgetSettings,
                Description = "O que o próprio quadro lê para saber como se desenhar, apresentando a mesma chave pública.",
            },
            new OpenApiTag
            {
                Name = SwaggerTags.PublicMediaSettings,
                Description = "O que a ferramenta pode oferecer de anexo, antes de desenhar qualquer coisa. Sem armazenamento na instalacao, vem desligado — o botao existir e o envio falhar seria pior que o botao nao existir.",
            },
        ];
    }
}
