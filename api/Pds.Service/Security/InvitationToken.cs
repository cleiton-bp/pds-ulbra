using System.Buffers.Text;
using System.Security.Cryptography;

namespace Pds.Service.Security;

/// <summary>
/// O link do convite: 256 bits sorteados, e so o hash vai para o banco.
///
/// <para><b>O valor so existe na memoria, durante a montagem do e-mail.</b> Ele
/// nao aparece em tela (o convite e so por e-mail), nao viaja pela fila e nao e
/// gravado — quem le o banco ve o hash, e o hash nao aceita convite.</para>
/// </summary>
public static class InvitationToken
{
    private const int EntropyBytes = 32;

    /// <summary>Um link novo, em base64url — cabe na URL sem escapar nada.</summary>
    public static string Generate() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(EntropyBytes));

    /// <summary>O hash que fica no banco. O mesmo da chave secreta do projeto.</summary>
    public static string Hash(string token) => ProjectKeyGenerator.ComputeHash(token);
}
