namespace Pds.Domain.Entities;

/// <summary>
/// Endereco autorizado a abrir a ferramenta de relato de um projeto.
///
/// <para><b>Por que a lista precisa existir.</b> A chave publica viaja no HTML do
/// site do cliente e qualquer visitante consegue le-la. Sozinha, ela nao diz de
/// onde o relato saiu — diz apenas qual projeto ele procura. Sem esta lista, a
/// chave copiada de um site funciona em qualquer outro.</para>
///
/// <para><b>O que de fato barra.</b> Nao e a comparacao do endereco que chega na
/// requisicao: a ferramenta abre num quadro servido pelo nosso proprio dominio,
/// entao a origem que o navegador carimba e a nossa, e a origem informada pela
/// pagina hospedeira e auto-declarada — serve de indicio, nunca de prova. Quem
/// barra e o <c>frame-ancestors</c> montado a partir desta lista, que impede o
/// quadro de sequer abrir fora dela.</para>
/// </summary>
public class ProjectOrigin : PdsBaseEntity
{
    /// <summary>Projeto que autoriza este endereco.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// O dominio autorizado, ja normalizado: minusculo, sem esquema, sem barra
    /// final e sem caminho. A porta faz parte quando informada, porque
    /// <c>site.com</c> e <c>site.com:3000</c> sao origens diferentes para o
    /// navegador.
    /// </summary>
    public string Domain { get; set; } = string.Empty;

    /// <summary>
    /// Quando verdadeiro, vale tambem para o que estiver abaixo do dominio
    /// (<c>app.site.com</c>, <c>loja.site.com</c>), sem precisar de uma linha para
    /// cada. Fica desligado por padrao: autorizar demais e o erro que nao aparece.
    /// </summary>
    public bool AllowsSubdomains { get; set; }
}
