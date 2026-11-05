namespace Pds.Domain.Enums;

/// <summary>
/// Como o sistema do cliente assina quem e a pessoa, no modo
/// <see cref="ReporterIdentityModeEnum.InheritedIdentity"/>.
///
/// <para><b>Os dois sao assinados, e nenhum chama o sistema do cliente.</b> O que muda e
/// o trabalho do lado de la: o HMAC e uma linha em qualquer linguagem, sem biblioteca; o
/// JWT pede uma biblioteca de JWT e um par de chaves.</para>
///
/// No banco vira texto em snake_case (hmac, jwt).
/// </summary>
public enum IdentityFormatEnum
{
    /// <summary>
    /// Assinatura simples: HMAC-SHA256 do id e da validade, com a chave secreta do
    /// projeto. A chave secreta nao e guardada: sai da chave mestra da instalacao
    /// (<c>IDENTITY_HMAC_KEY</c>), e o banco sozinho nao forja nada. Padrao.
    /// </summary>
    Hmac,

    /// <summary>JWT ES256: o cliente assina com a chave privada, e nos guardamos so a publica.</summary>
    Jwt,
}
