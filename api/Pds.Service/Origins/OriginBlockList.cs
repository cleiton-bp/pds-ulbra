using Pds.Domain.Entities;

namespace Pds.Service.Origins;

/// <summary>
/// A lista de enderecos bloqueados de um projeto, respondendo a pergunta contraria a
/// da lista de autorizados: <b>esta pagina foi barrada?</b>
///
/// <para><b>Vale mesmo com a lista de autorizados vazia.</b> E para isso que ela
/// existe: o cliente que nunca declarou os proprios enderecos ve um estranho na lista
/// de quem mandou relatos e fecha a porta para ele, sem precisar declarar antes todos
/// os enderecos dele.</para>
///
/// <para>O que ela pega e o que ela nao pega e o mesmo da lista de autorizados (ver
/// <see cref="OriginAllowList"/>): pega a chave publica colada em outro site, que e o
/// caso real; nao pega quem fala direto com a API e declara o que quiser.</para>
/// </summary>
public static class OriginBlockList
{
    /// <summary>
    /// O endereco declarado cai numa linha da lista? Quem nao declara nada nao e
    /// barrado — pelo mesmo motivo da lista de autorizados: quem quer burlar declara
    /// um endereco qualquer, e nao omite.
    /// </summary>
    public static bool Blocks(IReadOnlyList<ProjectBlockedOrigin> blocked, string? declared)
    {
        if (blocked.Count == 0)
            return false;

        var value = OriginDomain.ForComparison(declared);

        if (value.Length == 0)
            return false;

        return blocked.Any(item => OriginDomain.Covers(item.Domain, item.IncludesSubdomains, value));
    }
}
