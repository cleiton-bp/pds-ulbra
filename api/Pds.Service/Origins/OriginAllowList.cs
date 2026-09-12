using Pds.Domain.Entities;

namespace Pds.Service.Origins;

/// <summary>
/// A lista de enderecos autorizados de um projeto, respondendo a unica pergunta
/// que se faz a ela: <b>esta pagina pode abrir a ferramenta deste projeto?</b>
///
/// <para><b>O que ela pega, e o que ela nao pega.</b> O endereco chega declarado
/// pela propria pagina hospedeira — e quem declara e o carregador, que e codigo
/// nosso e diz a verdade. Entao a chave publica copiada para outro site <b>e</b>
/// pega: quem copiou colou o nosso script junto. Quem falar direto com a API, sem
/// carregador nenhum, declara o que quiser — ou nao declara nada.</para>
///
/// <para>Ou seja: <b>isto e grade de protecao, e nao muro.</b> Ela pega o acidente,
/// que e o caso comum — a chave da producao numa pagina de teste, a chave de um
/// cliente no site de outro. O muro e o <c>frame-ancestors</c>, que precisa de um
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
    /// Duas regras que parecem frouxas e sao deliberadas:
    ///
    /// <para><b>Lista vazia autoriza qualquer lugar.</b> Nao e "nada autorizado":
    /// e "ainda nao restringi". Todo projeto que existe hoje tem a lista vazia, e
    /// a leitura estrita apagaria a ferramenta em toda instalacao no ar de uma vez
    /// — sem erro na tela de ninguem, porque o quadro que nao pode abrir nao
    /// aparece. E exigir um dominio cadastrado antes do primeiro relato
    /// transformaria uma instalacao de dois passos em tres, com o terceiro
    /// falhando calado.</para>
    ///
    /// <para><b>Quem nao declara endereco passa.</b> Recusar o silencio nao ganha
    /// nada — quem quer burlar declara um endereco valido, nao omite — e custa
    /// caro: o relato de teste do painel abre o quadro sem pagina hospedeira e nao
    /// declara nada, e passaria a ser recusado no minuto em que a pessoa
    /// autorizasse o proprio site. So <b>o endereco declarado e fora da lista</b> e
    /// recusado.</para>
    /// </summary>
    public static bool Allows(IReadOnlyList<ProjectOrigin> origins, string? declared)
    {
        if (origins.Count == 0)
            return true;

        var value = OriginDomain.ForComparison(declared);

        if (value.Length == 0)
            return true;

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
        => string.Equals(origin.Domain, declared, StringComparison.Ordinal)
           || (origin.AllowsSubdomains && declared.EndsWith($".{origin.Domain}", StringComparison.Ordinal));
}
