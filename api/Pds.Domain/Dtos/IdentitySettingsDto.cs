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
/// engano que esta etapa nao pode deixar acontecer em silencio.</para>
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
}
