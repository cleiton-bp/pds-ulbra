using Pds.Domain.Entities;

namespace Pds.Service.Origins;

/// <summary>
/// A lista de enderecos autorizados de um projeto, respondendo a unica pergunta
/// que se faz a ela: <b>o relato desta pagina entra direto no Trabalho?</b> O que ela
/// nao cobre e recebido e fica retido ate o time decidir.
///
/// <para><b>O que ela pega, e o que ela nao pega.</b> O endereco chega declarado
/// pela propria pagina hospedeira — e quem declara e o carregador, que e codigo
/// nosso e diz a verdade. Entao a chave publica copiada para outro site <b>e</b>
/// pega: quem copiou colou o nosso script junto. Quem falar direto com a API, sem
/// carregador nenhum, declara o que quiser — ou nao declara nada.</para>
///
/// <para>Ou seja: <b>isto e grade de protecao, e nao muro.</b> Ela pega o acidente,
/// que e o caso comum — a chave da producao numa pagina de teste, a chave de um
/// cliente no site de outro. Por isso existem tambem os limites por IP e por projeto
/// na entrada do relato: eles nao dependem do que a pagina declara. O muro e o <c>frame-ancestors</c>, que precisa de um
/// servidor servindo o documento do quadro para montar o cabecalho por projeto, e
/// chega quando houver dominio proprio. Enquanto isso, o que esta escrito aqui e o
/// que de fato acontece.</para>
/// </summary>
public static class OriginAllowList
{
    /// <summary>
    /// A pagina disse de onde veio? Sem isso nao ha o que comparar, e quem chama
    /// nem precisa ir ao banco buscar a lista.
    /// </summary>
    public static bool Declares(string? origin) => OriginDomain.ForComparison(origin).Length > 0;

    /// <summary>
    /// Alguma linha da lista vale para este endereco? <b>Lista vazia nao cobre nada</b>,
    /// e o endereco nao declarado tambem nao: o relato de um endereco que a lista nao
    /// cobre e recebido, mas fica retido ate o time permitir ou bloquear o endereco
    /// (ver <see cref="OriginGate"/>).
    ///
    /// <para>Antes, a lista vazia autorizava qualquer lugar — "ainda nao restringi".
    /// Isso deixava o relato de um site que copiou a chave entrar no Trabalho sem
    /// ninguem ter dito sim. Reter, em vez de recusar, mantem a instalacao em dois
    /// passos: o primeiro relato chega, e o sino pergunta se o endereco e do
    /// cliente.</para>
    /// </summary>
    public static bool Covers(IReadOnlyList<ProjectOrigin> origins, string? declared)
    {
        if (origins.Count == 0)
            return false;

        var value = OriginDomain.ForComparison(declared);

        if (value.Length == 0)
            return false;

        return origins.Any(origin => Matches(origin, value));
    }

    /// <summary>
    /// Comparacao exata, ou sufixo quando o projeto pediu os subdominios.
    ///
    /// <para>A porta faz parte das duas: para o navegador <c>site.com</c> e
    /// <c>site.com:3000</c> sao origens diferentes, e o sufixo compara o endereco
    /// inteiro justamente para <c>*.site.com</c> nao passar a valer em
    /// <c>app.site.com:3000</c>, que e uma origem que ninguem autorizou.</para>
    ///
    /// <para>O ponto na frente do sufixo nao e enfeite: sem ele, <c>site.com</c>
    /// com subdominios ligados autorizaria tambem <c>meu-site.com</c>, que e de
    /// outra pessoa.</para>
    /// </summary>
    private static bool Matches(ProjectOrigin origin, string declared)
        => OriginDomain.Covers(origin.Domain, origin.AllowsSubdomains, declared);
}
