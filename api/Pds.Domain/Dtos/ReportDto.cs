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
    /// O que veio junto, sem ninguem digitar: navegador, tamanho da tela, e o que
    /// o produto passar a capturar. Pares livres, gravados como texto.
    /// </summary>
    public Dictionary<string, string?>? Context { get; set; }
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
