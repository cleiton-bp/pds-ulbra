namespace Pds.Domain.Entities;

/// <summary>
/// Endereco autorizado a mandar relatos direto para o Trabalho de um projeto.
///
/// <para><b>Por que a lista precisa existir.</b> A chave publica viaja no HTML do
/// site do cliente e qualquer visitante consegue le-la. Sozinha, ela nao diz de
/// onde o relato saiu — diz apenas qual projeto ele procura. Sem esta lista, a
/// chave copiada de um site funciona em qualquer outro.</para>
///
/// <para><b>Fora da lista, o relato e recebido e retido.</b> A ferramenta abre em
/// qualquer endereco que nao esteja bloqueado; o relato de um endereco que a lista nao
/// cobre — inclusive com a lista vazia — fica fora do Trabalho ate o time permitir o
/// endereco (entrar aqui) ou bloquea-lo. Recusar em vez de reter faria o endereco novo
/// nunca aparecer para o time; aceitar direto, como a lista vazia fazia antes, deixava
/// o relato de quem copiou a chave entrar sem ninguem ter dito sim.</para>
///
/// <para><b>O que ela pega, e o que ela nao pega.</b> A ferramenta abre num quadro
/// servido pelo nosso proprio dominio, entao a origem que o navegador carimba e a
/// nossa, e a origem informada pela pagina hospedeira e auto-declarada. Como quem
/// a declara e o carregador, que e codigo nosso, a chave copiada para outro site
/// <b>e</b> pega; quem falar direto com a API declara o que quiser. Isto e grade
/// de protecao, e nao muro: o muro e o <c>frame-ancestors</c> montado a partir
/// desta lista, que precisa de um servidor servindo o documento do quadro e chega
/// com o dominio proprio.</para>
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
