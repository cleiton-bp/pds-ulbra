using System.Security.Cryptography;
using Pds.Service.Security;

namespace Pds.Service.Reports;

/// <summary>
/// Gera o token do link de acompanhamento.
///
/// <para><b>Por que existe, se ja ha o protocolo.</b> O protocolo e curto e falado,
/// logo e adivinhavel: ele serve para identificar o relato, nunca para abri-lo.
/// Quem tem o link tem o token, e e o token que prova que o relato e seu.</para>
///
/// <para>Guardamos so o hash, pela mesma razao da chave secreta — e literalmente a
/// mesma funcao, reaproveitada de <see cref="ProjectKeyGenerator"/> para a decisao
/// sobre como se faz hash neste sistema morar num lugar so.</para>
/// </summary>
public static class AccessToken
{
    /// <summary>
    /// 32 bytes sorteados. Nao ha o que adivinhar aqui, entao um hash rapido basta:
    /// bcrypt e parecidos existem para senha digitada por gente.
    /// </summary>
    private const int EntropyBytes = 32;

    /// <summary>
    /// Devolve o valor, que vai na URL entregue uma unica vez, e o hash, que e o
    /// unico dos dois que fica no banco.
    /// </summary>
    public static (string Value, string Hash) Generate()
    {
        var value = Convert.ToBase64String(RandomNumberGenerator.GetBytes(EntropyBytes))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

        return (value, ProjectKeyGenerator.ComputeHash(value));
    }
}
