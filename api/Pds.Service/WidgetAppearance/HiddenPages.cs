using Pds.Domain.Entities;

namespace Pds.Service.WidgetAppearance;

/// <summary>
/// Confere a lista de paginas onde o botao nao aparece, antes de ela chegar ao banco.
///
/// <para><b>Aqui so se decide o que pode ser gravado; quem compara e a ferramenta.</b>
/// O caminho da pagina so existe no navegador de quem visita, e a regra de comparar
/// mora num lugar so, em <c>web/src/embed/launcher.ts</c> — onde o carregador tambem
/// alcanca. As duas pontas precisam concordar no formato, e e este: caminho exato
/// (<c>/checkout</c>) ou um comeco terminado em <c>*</c> (<c>/login/*</c>).</para>
///
/// <para><b>Recusar o formato errado em vez de consertar.</b> Um <c>?</c> no meio, um
/// <c>*</c> fora do fim ou a falta da barra sao sinal de que quem escreveu esperava
/// outra regra — consertar calado faria o botao aparecer onde o cliente achou que tinha
/// escondido.</para>
/// </summary>
public static class HiddenPages
{
    /// <summary>
    /// A lista aparada, sem linhas vazias e sem repetidas (sem diferenca de maiuscula,
    /// como a comparacao), na ordem em que veio.
    /// </summary>
    public static List<string> Normalize(IReadOnlyList<string?>? values)
    {
        if (values is null)
            throw new ArgumentException("Informe as paginas onde o botao nao aparece (a lista pode ser vazia).");

        var paginas = new List<string>();

        foreach (var value in values)
        {
            var caminho = (value ?? string.Empty).Trim();

            // A linha em branco que o painel deixou no fim nao e pagina nenhuma.
            if (caminho.Length == 0)
                continue;

            if (caminho.Length > ProjectWidgetSettings.MaxHiddenPathLength)
                throw new ArgumentException($"Cada pagina pode ter ate {ProjectWidgetSettings.MaxHiddenPathLength} caracteres.");

            if (!caminho.StartsWith('/'))
                throw new ArgumentException($"\"{caminho}\": o caminho comeca com uma barra, como /checkout.");

            if (caminho.IndexOfAny(['?', '#']) >= 0)
                throw new ArgumentException($"\"{caminho}\": escreva so o caminho, sem o que vem depois de ? ou #.");

            if (caminho.Any(char.IsWhiteSpace))
                throw new ArgumentException($"\"{caminho}\": o caminho nao pode ter espacos.");

            var asterisco = caminho.IndexOf('*');
            if (asterisco >= 0 && asterisco != caminho.Length - 1)
                throw new ArgumentException($"\"{caminho}\": o * so vale no fim, como /login/*.");

            if (!paginas.Contains(caminho, StringComparer.OrdinalIgnoreCase))
                paginas.Add(caminho);
        }

        if (paginas.Count > ProjectWidgetSettings.MaxHiddenPaths)
            throw new ArgumentException($"A lista pode ter ate {ProjectWidgetSettings.MaxHiddenPaths} paginas.");

        return paginas;
    }
}
