namespace Pds.Domain.Dtos;

/// <summary>
/// Autorizacao de um endereco novo. O projeto vem da rota, nunca do corpo.
/// </summary>
public class CreateProjectOriginDto
{
    /// <summary>
    /// Dominio do site que vai abrir a ferramenta. Aceita colado da barra do
    /// navegador: o esquema, a barra final e o caminho sao descartados, e o que
    /// sobra e guardado em minusculo. A porta, quando informada, faz parte —
    /// <c>site.com</c> e <c>site.com:3000</c> sao enderecos diferentes.
    /// </summary>
    /// <example>loja.com.br</example>
    public string? Domain { get; set; }

    /// <summary>
    /// Autorizar tambem o que estiver abaixo deste dominio, como
    /// <c>app.site.com</c>. Vem desligado por padrao.
    /// </summary>
    /// <example>false</example>
    public bool AllowsSubdomains { get; set; }
}

/// <summary>
/// Bloqueio de um endereco. O projeto vem da rota, nunca do corpo.
/// </summary>
public class CreateProjectBlockedOriginDto
{
    /// <summary>
    /// Dominio a bloquear. Normalizado como o da lista de autorizados: aceita colado
    /// da barra do navegador, e a porta, quando informada, faz parte.
    /// </summary>
    /// <example>copia-da-loja.com</example>
    public string? Domain { get; set; }

    /// <summary>
    /// Bloquear tambem o que estiver abaixo deste dominio, como
    /// <c>app.site.com</c>. Vem desligado: barrar os vizinhos sem pedir pode tirar do
    /// ar um site do proprio cliente.
    /// </summary>
    /// <example>false</example>
    public bool IncludesSubdomains { get; set; }
}
