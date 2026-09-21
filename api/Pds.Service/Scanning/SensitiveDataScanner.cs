using System.Text.RegularExpressions;
using Pds.Domain.Enums;

namespace Pds.Service.Scanning;

/// <summary>Um achado da varredura: o que foi reconhecido, e onde.</summary>
/// <param name="Kind">Que tipo de dado e.</param>
/// <param name="Start">Onde comeca no texto, em caracteres.</param>
/// <param name="Length">Quantos caracteres ocupa.</param>
/// <param name="Sample">O trecho <b>mascarado</b>, para quem le localizar sem o achado virar uma segunda copia do dado.</param>
public record SensitiveDataFinding(SensitiveDataKindEnum Kind, int Start, int Length, string Sample);

/// <summary>
/// Procura documento, cartao, e-mail, telefone e credencial no texto de um relato.
///
/// <para><b>Sinaliza, e nao bloqueia.</b> E a decisao que define o que esta classe
/// pode ser: ela erra, e tem de poder errar. Um detector que recusasse sozinho
/// transformaria cada falso positivo num relato perdido — e perdido para quem
/// escreveu, que nem fica sabendo. Aqui o erro custa uma etiqueta a mais para
/// alguem ignorar.</para>
///
/// <para><b>Roda antes de publicar, e nunca depois</b> — e roda na <b>leitura</b>
/// da fila, e nao na gravacao do relato. A diferenca importa: o achado nao e um
/// fato sobre o relato, e sim o que temos a dizer a quem esta decidindo agora.
/// Gravado na criacao, ele envelheceria — melhorar um padrao deixaria o passado
/// marcado pelo detector velho, e seria preciso uma migracao para reavaliar o que
/// ja estava na fila.</para>
///
/// <para><b>Digito verificador e Luhn ficam aqui de proposito.</b> Sem eles,
/// qualquer numero de pedido de onze digitos viraria CPF, e o time aprenderia a
/// ignorar a etiqueta — que e o unico jeito de uma varredura que nao bloqueia
/// falhar de verdade.</para>
///
/// <para><b>Nao ha estado, nao ha configuracao e nao ha rede.</b> E funcao pura
/// sobre uma string: a mesma entrada da a mesma saida, hoje e no ano que vem.</para>
/// </summary>
public static partial class SensitiveDataScanner
{
    /// <summary>
    /// Ate onde vale procurar.
    ///
    /// <para>O texto ja e limitado a 5000 caracteres na entrada; este teto e a
    /// rede embaixo disso, para o custo da fila nao depender de um limite que mora
    /// em outro arquivo.</para>
    /// </summary>
    private const int MaxScannedLength = 8000;

    /// <summary>
    /// Quantos achados saem por relato.
    ///
    /// <para>Um texto colado de um log tem centenas de tokens iguais, e listar
    /// todos nao ajuda ninguem a decidir: a partir de um punhado, a resposta ja e
    /// a mesma. O teto tambem impede que a fila carregue uma lista maior que o
    /// proprio relato.</para>
    /// </summary>
    public const int MaxFindings = 12;

    public static IReadOnlyList<SensitiveDataFinding> Scan(string? text)
    {
        var conteudo = text ?? string.Empty;

        if (conteudo.Length > MaxScannedLength)
            conteudo = conteudo[..MaxScannedLength];

        if (conteudo.Length == 0)
            return [];

        var achados = new List<SensitiveDataFinding>();

        // **A ordem e da mais especifica para a mais generica**, e e o que evita o
        // mesmo trecho ser contado duas vezes: um CNPJ de catorze digitos tambem
        // passa pelo padrao de cartao, e quem chegar primeiro reserva o espaco.
        Colher(achados, conteudo, TokenPattern(), SensitiveDataKindEnum.Token, _ => true);
        Colher(achados, conteudo, EmailPattern(), SensitiveDataKindEnum.Email, _ => true);
        Colher(achados, conteudo, CpfPattern(), SensitiveDataKindEnum.Cpf, IsCpf);
        Colher(achados, conteudo, CnpjPattern(), SensitiveDataKindEnum.Cnpj, IsCnpj);
        Colher(achados, conteudo, CardPattern(), SensitiveDataKindEnum.CreditCard, IsLuhn);
        Colher(achados, conteudo, PhonePattern(), SensitiveDataKindEnum.Phone, _ => true);

        return [.. achados.OrderBy(achado => achado.Start).Take(MaxFindings)];
    }

    /// <summary>
    /// Varre com um padrao, guardando so o que passa na conferencia e o que nao
    /// pisa em cima de um achado anterior.
    /// </summary>
    private static void Colher(
        List<SensitiveDataFinding> achados,
        string texto,
        Regex padrao,
        SensitiveDataKindEnum tipo,
        Func<string, bool> confere)
    {
        foreach (Match match in padrao.Matches(texto))
        {
            if (achados.Count >= MaxFindings)
                return;

            if (!confere(match.Value))
                continue;

            // Sobreposicao: quem chegou primeiro era o padrao mais especifico.
            if (achados.Any(a => match.Index < a.Start + a.Length && a.Start < match.Index + match.Length))
                continue;

            achados.Add(new SensitiveDataFinding(tipo, match.Index, match.Length, Mascara(match.Value, tipo)));
        }
    }

    /// <summary>
    /// O trecho como ele aparece na etiqueta.
    ///
    /// <para><b>Mascarado, mesmo com o texto inteiro logo ao lado.</b> A etiqueta
    /// viaja mais do que o relato: ela cabe num print, numa captura de tela de
    /// suporte, num log de erro do painel. Repetir o dado ali criaria uma segunda
    /// copia dele em lugares que ninguem pensou em proteger — e o que ela precisa
    /// fazer e so ajudar a achar o trecho no texto.</para>
    /// </summary>
    private static string Mascara(string valor, SensitiveDataKindEnum tipo)
    {
        if (tipo == SensitiveDataKindEnum.Email)
        {
            var arroba = valor.IndexOf('@');
            return arroba <= 0 ? Pontos(valor) : valor[0] + Pontos(valor[1..arroba]) + valor[arroba..];
        }

        return valor.Length <= 4
            ? Pontos(valor)
            : valor[..2] + Pontos(valor[2..^2]) + valor[^2..];
    }

    private static string Pontos(string trecho) => new('*', trecho.Length);

    /// <summary>Digitos verificadores do CPF. Repetidos (111.111.111-11) nao valem.</summary>
    private static bool IsCpf(string valor)
    {
        var digitos = Digitos(valor);

        if (digitos.Length != 11 || digitos.All(d => d == digitos[0]))
            return false;

        return Verificador(digitos, 9, 10) && Verificador(digitos, 10, 11);
    }

    /// <summary>Digitos verificadores do CNPJ, com os pesos ciclicos de 2 a 9.</summary>
    private static bool IsCnpj(string valor)
    {
        var digitos = Digitos(valor);

        if (digitos.Length != 14 || digitos.All(d => d == digitos[0]))
            return false;

        return CnpjVerificador(digitos, 12) && CnpjVerificador(digitos, 13);
    }

    private static bool Verificador(string digitos, int ate, int pesoInicial)
    {
        var soma = 0;
        for (var i = 0; i < ate; i++)
            soma += (digitos[i] - '0') * (pesoInicial - i);

        var resto = soma % 11;
        var esperado = resto < 2 ? 0 : 11 - resto;

        return digitos[ate] - '0' == esperado;
    }

    private static bool CnpjVerificador(string digitos, int ate)
    {
        var soma = 0;
        var peso = 2;

        for (var i = ate - 1; i >= 0; i--)
        {
            soma += (digitos[i] - '0') * peso;
            peso = peso == 9 ? 2 : peso + 1;
        }

        var resto = soma % 11;
        var esperado = resto < 2 ? 0 : 11 - resto;

        return digitos[ate] - '0' == esperado;
    }

    /// <summary>Luhn: prova que o numero foi montado como cartao, e nao que ele existe.</summary>
    private static bool IsLuhn(string valor)
    {
        var digitos = Digitos(valor);

        if (digitos.Length is < 13 or > 19)
            return false;

        var soma = 0;
        var dobra = false;

        for (var i = digitos.Length - 1; i >= 0; i--)
        {
            var n = digitos[i] - '0';

            if (dobra)
            {
                n *= 2;
                if (n > 9) n -= 9;
            }

            soma += n;
            dobra = !dobra;
        }

        return soma % 10 == 0;
    }

    private static string Digitos(string valor) => new([.. valor.Where(char.IsDigit)]);

    // `sk_` de chave secreta, `Bearer`, o `eyJ` com que todo JWT comeca, e a
    // sequencia longa de hexadecimal — sao os quatro jeitos de uma credencial
    // aparecer colada num relato de erro.
    //
    // **O corpo aceita `_` porque a chave de verdade o tem** (`sk_live_...`), e sem
    // isso o padrao so pegaria uma chave que ninguem emite.
    //
    // **`pk_` ficou de fora, e nao por esquecimento.** Chave com esse prefixo e
    // publicavel por convencao — inclusive a nossa, que mora no codigo-fonte da
    // pagina do cliente. Marca-la encheria a fila de aviso sobre o que e publico
    // de proposito, e um aviso que grita a toa e um aviso que o time aprende a
    // ignorar. Ai ele ignora tambem o `sk_`.
    [GeneratedRegex(@"\bsk_[A-Za-z0-9_]{8,}\b|\bBearer\s+[A-Za-z0-9._\-]{16,}|\beyJ[A-Za-z0-9._\-]{16,}\b|\b[0-9a-fA-F]{32,}\b", RegexOptions.None, 200)]
    private static partial Regex TokenPattern();

    [GeneratedRegex(@"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b", RegexOptions.None, 200)]
    private static partial Regex EmailPattern();

    [GeneratedRegex(@"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", RegexOptions.None, 200)]
    private static partial Regex CpfPattern();

    [GeneratedRegex(@"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b", RegexOptions.None, 200)]
    private static partial Regex CnpjPattern();

    [GeneratedRegex(@"\b\d{4}[ .\-]?\d{4}[ .\-]?\d{4}[ .\-]?\d{1,7}\b", RegexOptions.None, 200)]
    private static partial Regex CardPattern();

    // Com DDD, com ou sem o nono digito, com ou sem +55. Sem DDD nao entra: oito
    // digitos soltos sao um numero de pedido com a mesma frequencia.
    [GeneratedRegex(@"(?:\+55\s?)?\(?\b\d{2}\)?[\s.\-]?9?\d{4}[\s.\-]?\d{4}\b", RegexOptions.None, 200)]
    private static partial Regex PhonePattern();
}
