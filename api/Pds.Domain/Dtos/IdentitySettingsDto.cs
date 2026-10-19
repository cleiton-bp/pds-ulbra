using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// A configuracao de identidade, como a tela a manda.
///
/// <para><b>Os dois campos vao juntos porque a regra e do par.</b> "Publico
/// identificado" so vale onde o modo identifica — gravar um campo de cada vez
/// deixaria o projeto passar por um estado que a regra proibe, e qual dos dois
/// recusar dependeria de quem chegou primeiro.</para>
///
/// <para><b>Vai inteira, e nao em pedacos</b>, pelo mesmo motivo da configuracao do
/// ciclo: salvar campo a campo faria duas abas abertas gravarem metades diferentes
/// da mesma configuracao sem ninguem notar.</para>
///
/// <para><b>Anulavel aqui, e obrigatorio de verdade.</b> Anulavel e o que permite
/// responder "informe o modo" em vez de gravar um <c>Protocol</c> que ninguem
/// escolheu — e trocar o modo de identificacao por omissao e exatamente o tipo de
/// engano que esta configuracao nao pode deixar acontecer em silencio.</para>
/// </summary>
public class IdentitySettingsDto
{
    /// <summary>Como quem abre um relato e reconhecido: <c>Protocol</c>, <c>PersonalCode</c> ou <c>InheritedIdentity</c>.</summary>
    /// <example>Protocol</example>
    public ReporterIdentityModeEnum? Mode { get; set; }

    /// <summary>Quem pode ver os relatos: <c>Private</c>, <c>PublicAnonymous</c> ou <c>PublicIdentified</c>.</summary>
    /// <example>Private</example>
    public ReportVisibilityEnum? Visibility { get; set; }

    /// <summary>A ferramenta pergunta o nome de quem relata.</summary>
    /// <example>false</example>
    public bool? AsksForName { get; set; }

    /// <summary>
    /// A chave publica do sistema do cliente, ECDSA P-256, em SPKI base64 ou PEM. Exigida
    /// no modo InheritedIdentity; nos outros, guardada para a volta. O token que ela
    /// confere tem de ser dedicado — nunca o token de login do usuario no sistema do cliente.
    /// </summary>
    /// <example>MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE...</example>
    public string? IdentityPublicKey { get; set; }

    /// <summary>Por quantos minutos, no maximo, um token pode valer: de 1 a 60. Ausente, 15.</summary>
    /// <example>15</example>
    public int? IdentityTokenMaxMinutes { get; set; }

    /// <summary>No modo herdado, recusar o relato sem token (ou com token que nao confere) em vez de aceita-lo como protocolo. Ausente, falso.</summary>
    /// <example>false</example>
    public bool? IdentityRequired { get; set; }
}
