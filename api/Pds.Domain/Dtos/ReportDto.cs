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
