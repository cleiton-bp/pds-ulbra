using System.Text.RegularExpressions;
using Pds.Domain.Entities;

namespace Pds.Service.States;

/// <summary>
/// Arruma o nome de um estado antes de ele chegar ao banco.
///
/// <para>Faz pouco de proposito: diferente do dominio autorizado, este texto vai
/// para a tela do jeito que a pessoa escreveu — corrigir a caixa dela seria
/// escolher por ela como o proprio processo se chama.</para>
/// </summary>
public static partial class StateName
{
    /// <summary>
    /// Tira as bordas e junta os espacos repetidos do meio.
    ///
    /// <para>O espaco duplo importa porque ele e invisivel: "Em  analise" e "Em
    /// analise" ficariam como dois estados diferentes numa lista onde parecem o
    /// mesmo, e a conferencia de nome repetido deixaria os dois passarem.</para>
    ///
    /// <para>A mesma troca cuida de quebra de linha e tabulacao coladas de outro
    /// lugar, que viram espaco em vez de quebrar o rotulo na tela.</para>
    /// </summary>
    /// <exception cref="ArgumentException">Nome em branco ou comprido demais.</exception>
    public static string Normalize(string? value)
    {
        var name = Whitespace().Replace((value ?? string.Empty).Trim(), " ");

        if (name.Length == 0)
            throw new ArgumentException("Escreva um nome para o estado.");

        // Conferido depois de juntar os espacos: o que sobrou e o que vai ser
        // gravado, e e esse tamanho que a coluna precisa aceitar.
        if (name.Length > ProjectState.MaxNameLength)
            throw new ArgumentException($"O nome do estado pode ter ate {ProjectState.MaxNameLength} caracteres.");

        return name;
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
