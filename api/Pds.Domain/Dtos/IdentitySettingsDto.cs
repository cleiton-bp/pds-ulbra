using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// A configuracao de identidade, como a tela a manda.
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
}
