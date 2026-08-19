namespace Pds.Domain.Entities;

/// <summary>
/// Quem entra no painel. A identidade vem do Google, entao aqui nao existe senha,
/// nem recuperacao, nem confirmacao de e-mail.
/// </summary>
public class User : PdsBaseEntity
{
    /// <summary>Conta a que este usuario pertence.</summary>
    public long AccountId { get; set; }
    public Account Account { get; set; } = null!;

    /// <summary>
    /// O <c>sub</c> do Google. E a identidade de verdade, e por isso e unico.
    ///
    /// Identificar a pessoa pelo e-mail parece natural e esta errado: o e-mail da
    /// conta Google pode mudar, o <c>sub</c> nao. Quem usa e-mail como chave acaba
    /// criando conta duplicada ou, pior, entregando a conta de alguem a quem herdou
    /// o endereco.
    /// </summary>
    public string GoogleSubject { get; set; } = string.Empty;

    /// <summary>
    /// E-mail vindo do Google. Serve para contato e para exibir na tela, nao como
    /// identidade — e por isso nao tem indice unico.
    /// </summary>
    public string? Email { get; set; }

    /// <summary>Nome vindo do Google.</summary>
    public string? Name { get; set; }

    /// <summary>Foto vinda do Google. Opcional.</summary>
    public string? AvatarUrl { get; set; }

    /// <summary>Ultimo acesso, em UTC.</summary>
    public DateTime? LastLoginAt { get; set; }
}
