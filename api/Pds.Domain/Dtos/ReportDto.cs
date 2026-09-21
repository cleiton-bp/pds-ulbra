using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// Um relato chegando da ferramenta embutida no site do cliente.
///
/// <para>Nao ha sessao nesta requisicao: quem diz de qual projeto o relato e, e
/// so, a <see cref="Key"/>.</para>
/// </summary>
public class CreateReportDto
{
    /// <summary>
    /// Chave publica do projeto. E a unica credencial da requisicao — ela nao
    /// autentica ninguem, apenas diz para onde o relato vai.
    /// </summary>
    /// <example>pk_ABC123</example>
    public string? Key { get; set; }

    /// <summary>Defeito, melhoria ou duvida.</summary>
    /// <example>Bug</example>
    public ReportTypeEnum? Type { get; set; }

    /// <summary>O que a pessoa escreveu.</summary>
    /// <example>O botão de finalizar compra não responde no passo de pagamento.</example>
    public string? Text { get; set; }

    /// <summary>
    /// Caminho da pagina de onde o relato foi aberto. O que vier depois do
    /// <c>?</c> ou do <c>#</c> e descartado antes de gravar.
    /// </summary>
    /// <example>/checkout</example>
    public string? Route { get; set; }

    /// <summary>
    /// Dominio da pagina que embutiu a ferramenta, informado por ela mesma.
    /// Guardado como veio, e nunca tratado como prova de origem.
    /// </summary>
    /// <example>loja.exemplo.com</example>
    public string? Origin { get; set; }

    /// <summary>
    /// Quem escreveu aceita responder duvidas da equipe sobre este relato.
    ///
    /// <para><b>Ausente nao e "nao".</b> Quando o campo nao vem, vale o padrao que
    /// o projeto configurou — e nao o mais restritivo. A ferramenta sempre manda o
    /// que a pessoa marcou; quem omite e uma versao antiga dela, ou alguem falando
    /// direto com a rota, e nesses casos o certo e seguir a configuracao do
    /// projeto em vez de silenciar o relato.</para>
    /// </summary>
    /// <example>true</example>
    public bool? AcceptsQuestions { get; set; }

    /// <summary>
    /// O código pessoal de quem já relatou antes neste projeto.
    ///
    /// <para><b>Opcional sempre.</b> Quem nunca teve um recebe o dele na resposta;
    /// quem tem manda, e os relatos ficam na mesma lista.</para>
    ///
    /// <para><b>Código desconhecido não é recusado: vira um código novo.</b>
    /// Recusar diria "este código não existe aqui", e essa diferença entre conhecido
    /// e desconhecido é exatamente como se enumera código alheio.</para>
    ///
    /// <para>Em projeto que não usa este modo, mandar um código é recusado — aceitar
    /// em silêncio gravaria um vínculo que a configuração diz não existir.</para>
    /// </summary>
    /// <example>H7QK-3M2X-P9WD</example>
    public string? ReporterCode { get; set; }

    /// <summary>
    /// Como a pessoa quer ser chamada. <b>Opcional em toda configuracao.</b>
    ///
    /// <para>Guardado como <b>interno</b>: o time ve, o lado de fora nao. Para
    /// aparecer junto do relato publicado sao precisas duas coisas ao mesmo tempo
    /// — o projeto em publico identificado, e <see cref="ReporterNameIsPublic"/>
    /// verdadeiro.</para>
    ///
    /// <para>Vazio e nulo sao a mesma coisa aqui: ninguem se chama "".</para>
    /// </summary>
    /// <example>Ana</example>
    public string? ReporterName { get; set; }

    /// <summary>
    /// A pessoa escolheu <b>assinar</b> este relato.
    ///
    /// <para><b>Ausente e "nao".</b> Ao contrario de <see cref="AcceptsQuestions"/>,
    /// aqui o silencio nao pode cair num padrao do projeto: o que esta em jogo e o
    /// nome dela ao lado de um texto que qualquer um le, e essa escolha nao se
    /// herda de configuracao nenhuma.</para>
    ///
    /// <para>Sem nome, marcar isto nao faz nada — nao ha o que mostrar.</para>
    /// </summary>
    /// <example>false</example>
    public bool? ReporterNameIsPublic { get; set; }

    /// <summary>
    /// O que veio junto, sem ninguem digitar: navegador, tamanho da tela, e o que
    /// o produto passar a capturar. Pares livres, gravados como texto.
    /// </summary>
    public Dictionary<string, string?>? Context { get; set; }
}

/// <summary>
/// A consulta da lista publica, feita pela ferramenta.
///
/// <para>A chave publica e a unica credencial, e como sempre ela nao autentica
/// ninguem: so diz de qual projeto se esta falando.</para>
/// </summary>
public class PublishedReportsDto
{
    /// <summary>Chave publica do projeto.</summary>
    /// <example>pk_ABC123</example>
    public string? Key { get; set; }
}

/// <summary>
/// A decisao de moderacao sobre um relato, vinda do painel.
/// </summary>
public class ModerateReportDto
{
    /// <summary>
    /// <c>Approved</c> libera para o publico; <c>Rejected</c> decide que nao vai.
    ///
    /// <para><b><c>Pending</c> nao e aceito.</b> Voltar para "ninguem olhou" depois
    /// de alguem ter olhado seria apagar a decisao de uma pessoa — e a fila diria
    /// que falta ler o que ja foi lido. Mudar de ideia e decidir de novo, e a nova
    /// decisao fica gravada por cima com quem a tomou.</para>
    /// </summary>
    /// <example>Approved</example>
    public ReportModerationStateEnum? Decision { get; set; }
}

/// <summary>
/// A consulta do acompanhamento, feita por quem relatou.
///
/// <para><b>Os dois campos juntos, e a recusa e a mesma para qualquer um dos dois
/// errado.</b> Assim quem sonda a rota nao descobre se um protocolo existe — a
/// mesma regra da chave publica, que responde igual para ausente, desconhecida e
/// revogada.</para>
///
/// <para><b>Por que isto e um POST, se e leitura.</b> Duas razoes. O token e um
/// segredo, e segredo em query string entra no log do servidor, no historico do
/// navegador e no <c>Referer</c> que sai da pagina — no corpo, nao entra em
/// nenhum dos tres. E a consulta nao e leitura pura: ela grava o evento de
/// visualizacao, que e o dado da pesquisa sobre o relator voltar.</para>
/// </summary>
public class OpenReportTrackingDto
{
    /// <summary>O protocolo, que a pessoa anotou e que tambem vai no link.</summary>
    /// <example>7K2M-9QXP-4TRV</example>
    public string? TrackingCode { get; set; }

    /// <summary>
    /// O token entregue uma unica vez na criacao do relato. E ele que prova que o
    /// relato e desta pessoa; o protocolo sozinho nao abre nada.
    /// </summary>
    public string? Token { get; set; }
}

/// <summary>
/// A resposta de quem relatou: resolveu.
///
/// <para><b>Carrega as mesmas duas credenciais da consulta</b>, e pelo mesmo
/// motivo: nao ha sessao aqui, e o token do link e a unica prova de que este
/// relato e de quem o apresenta. Recusa igual para qualquer um dos dois errado.</para>
/// </summary>
public class ConfirmReportDto
{
    /// <summary>O protocolo, o mesmo do link.</summary>
    /// <example>7K2M-9QXP-4TRV</example>
    public string? TrackingCode { get; set; }

    /// <summary>O token entregue uma unica vez. E ele que prova de quem e o relato.</summary>
    public string? Token { get; set; }

    /// <summary>
    /// A nota de 1 a 5 sobre como foi o tratamento, ou nula.
    ///
    /// <para>Nula com <see cref="SatisfactionDeclined"/> falso quer dizer "nao quis
    /// nem dizer que nao quis" — a pessoa confirmou e foi embora. E um terceiro
    /// estado, e nao uma variacao dos outros dois.</para>
    /// </summary>
    /// <example>5</example>
    public int? Satisfaction { get; set; }

    /// <summary>
    /// A pessoa clicou em "prefiro nao responder".
    ///
    /// <para><b>Nao e a nota zero, e nao e a sexta estrela.</b> Dentro da escala,
    /// a recusa viraria a pior avaliacao para quem le depressa, e a media contaria
    /// como insatisfacao o que foi so recusa em opinar.</para>
    /// </summary>
    public bool SatisfactionDeclined { get; set; }
}

/// <summary>
/// A resposta de quem relatou: nao resolveu.
///
/// <para><b>Nao leva nota</b>, e isso e decisao e nao esquecimento: quem reabre
/// esta dizendo que o trabalho nao acabou, e avaliar servico inacabado mede outra
/// coisa. A nota volta a ser pedida quando o relato for encerrado de novo.</para>
/// </summary>
public class ReopenReportDto
{
    /// <summary>O protocolo, o mesmo do link.</summary>
    /// <example>7K2M-9QXP-4TRV</example>
    public string? TrackingCode { get; set; }

    /// <summary>O token entregue uma unica vez.</summary>
    public string? Token { get; set; }

    /// <summary>
    /// Por que o relato esta voltando. Obrigatorio quando o projeto pede.
    ///
    /// <para>Existe para quem for pegar o trabalho de novo saber o que faltou, e
    /// nao para a pessoa ter de justificar o pedido.</para>
    /// </summary>
    /// <example>O botão voltou a travar depois da atualização de ontem.</example>
    public string? Comment { get; set; }
}

/// <summary>
/// O time devolve o relato pedindo informacao.
///
/// <para><b>O texto diz o que falta, e nao que falta.</b> "Preciso de mais
/// detalhes" devolve o problema para quem ja nao sabia o que dizer; "em qual
/// navegador, e o que aparecia na tela" e uma pergunta que da para responder.</para>
/// </summary>
public class AskInfoDto
{
    /// <summary>
    /// O que falta, escrito para quem relatou. Vira um comentario publico — a
    /// conversa acontece pelo proprio relato.
    /// </summary>
    /// <example>Em qual navegador isso aconteceu, e o que aparecia na tela?</example>
    public string? Body { get; set; }
}

/// <summary>
/// A resposta de quem relatou ao pedido de informacao.
///
/// <para><b>So enquanto ha pedido aberto.</b> Nao e canal livre: sem a pergunta do
/// outro lado, isto viraria uma caixa de entrada sem dono e sem moderacao — e
/// moderacao foi deixada de fora desta etapa de proposito.</para>
/// </summary>
public class ReplyToReportDto
{
    /// <summary>O protocolo, o mesmo do link.</summary>
    /// <example>7K2M-9QXP-4TRV</example>
    public string? TrackingCode { get; set; }

    /// <summary>O token entregue uma unica vez.</summary>
    public string? Token { get; set; }

    /// <summary>A resposta.</summary>
    /// <example>Foi no Chrome do celular, e a tela ficava branca depois de tocar em pagar.</example>
    public string? Body { get; set; }
}

/// <summary>
/// Para onde o relato vai na fila. O relato e o projeto vem da rota.
/// </summary>
public class MoveReportDto
{
    /// <summary>
    /// A coluna de destino. Precisa ser do mesmo projeto e estar <b>ativa</b> —
    /// mandar relato para uma coluna aposentada seria desfazer pela porta dos
    /// fundos o que aposentar decidiu.
    /// </summary>
    public Guid? StatePublicId { get; set; }

    /// <summary>
    /// Qual final foi este, quando o movimento <b>encerra</b> o relato.
    ///
    /// <para>Obrigatorio ao cair na ultima coluna ativa, e recusado fora dela: um
    /// desfecho gravado num movimento que nao encerra nada seria um fim que o
    /// relato nao teve.</para>
    /// </summary>
    /// <example>Done</example>
    public PublicOutcomeEnum? Outcome { get; set; }

    /// <summary>
    /// Por que acabou. <b>Obrigatorio quando o movimento encerra</b>, e e o texto
    /// que quem relatou le na pagina de acompanhamento.
    ///
    /// <para>Nao e desencorajado, e impossivel: sem ele o produto reproduz o que
    /// existe para resolver — a pessoa fica sabendo que acabou, e nao o que
    /// aconteceu.</para>
    /// </summary>
    /// <example>Corrigimos o botão de finalizar compra na versão desta semana.</example>
    public string? Reason { get; set; }
}

/// <summary>
/// O encerramento pedido por um botao, e nao por um movimento.
///
/// <para><b>Existe mesmo nos projetos que encerram pela ultima coluna.</b> A
/// configuracao diz por qual gesto o painel <b>oferece</b> encerrar; ela nao tira
/// do time o direito de encerrar um relato que ja esta parado na ultima coluna
/// desde antes de a regra existir.</para>
/// </summary>
public class CloseReportDto
{
    /// <summary>Qual dos quatro finais foi este. Obrigatorio.</summary>
    /// <example>Done</example>
    public PublicOutcomeEnum? Outcome { get; set; }

    /// <summary>
    /// Por que acabou. Obrigatorio, e e o texto que quem relatou le na pagina de
    /// acompanhamento.
    /// </summary>
    /// <example>Corrigimos o botão de finalizar compra na versão desta semana.</example>
    public string? Reason { get; set; }
}

/// <summary>
/// A consulta da lista pessoal, pelo código.
///
/// <para><b>É `POST` e não `GET` pelo mesmo motivo da consulta de acompanhamento:</b>
/// o código é o que identifica a pessoa, e em query string ele entraria no log de
/// acesso do servidor, no histórico do navegador e no `Referer` que sai da página.
/// No corpo, não entra em nenhum dos três.</para>
/// </summary>
public class ReporterCodeLookupDto
{
    /// <summary>A chave pública do projeto, que diz onde o código vale.</summary>
    /// <example>pk_1R0KtQwz</example>
    public string? Key { get; set; }

    /// <summary>O código que a pessoa guardou.</summary>
    /// <example>H7QK-3M2X-P9WD</example>
    public string? Code { get; set; }
}

/// <summary>
/// A leitura de **um** relato pelo código pessoal, em vez do link.
///
/// <para><b>O código prova que o relato é dela; o link é que dá poder sobre ele.</b>
/// Por isso esta rota lê, e as ações vêm desligadas — a menos que o projeto tenha
/// ligado `tracking_code_can_act`, que existe exatamente para esta decisão.</para>
/// </summary>
public class OpenByReporterCodeDto
{
    /// <summary>A chave pública do projeto.</summary>
    /// <example>pk_1R0KtQwz</example>
    public string? Key { get; set; }

    /// <summary>O código pessoal.</summary>
    /// <example>H7QK-3M2X-P9WD</example>
    public string? Code { get; set; }

    /// <summary>O protocolo do relato a abrir, que veio da lista.</summary>
    /// <example>7K2M-9QXP-4TRV</example>
    public string? TrackingCode { get; set; }
}
