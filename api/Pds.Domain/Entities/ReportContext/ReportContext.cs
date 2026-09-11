namespace Pds.Domain.Entities;

/// <summary>
/// O que veio junto com o relato sem ninguem digitar: rota, navegador, tamanho da
/// tela, e o que o produto passar a capturar amanha.
///
/// <para><b>Por que tabela separada, e nao colunas em <see cref="Report"/>.</b>
/// O que se vai querer saber amanha ainda nao esta decidido hoje. Como coluna,
/// cada captura nova seria uma migracao numa tabela que e a que mais cresce; como
/// linha, e so mandar um par a mais no mesmo corpo da requisicao.</para>
///
/// <para>O preco e que tudo vira texto e a interpretacao fica com quem le. E o
/// preco certo enquanto a lista de capturas nao estabilizar.</para>
/// </summary>
public class ReportContext : PdsBaseEntity
{
    /// <summary>Relato a que este dado pertence.</summary>
    public long ReportId { get; set; }
    public Report Report { get; set; } = null!;

    /// <summary>
    /// Nome do dado em ingles e snake_case, como <c>user_agent</c> ou
    /// <c>viewport_width</c>. Unico dentro do relato.
    /// </summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>O valor como chegou, sempre texto.</summary>
    public string? Value { get; set; }
}
