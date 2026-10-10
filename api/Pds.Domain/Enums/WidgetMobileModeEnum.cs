namespace Pds.Domain.Enums;

/// <summary>
/// Como o botao fica no celular — numa janela estreita, medida pela pagina do
/// cliente, e nao pelo aparelho.
///
/// <para>No telefone, um botao com texto no canto cobre conteudo que no computador
/// nem chega perto. O cliente escolhe se ele continua igual, se vira so o icone, ou
/// se sai — quem tem um aplicativo proprio para o celular as vezes prefere assim.</para>
///
/// No banco vira texto em snake_case (same, icon_only, hidden).
/// </summary>
public enum WidgetMobileModeEnum
{
    /// <summary>Igual ao do computador. Padrao.</summary>
    Same,

    /// <summary>So o icone, redondo. Exige um icone escolhido.</summary>
    IconOnly,

    /// <summary>O botao nao aparece no celular.</summary>
    Hidden,
}
