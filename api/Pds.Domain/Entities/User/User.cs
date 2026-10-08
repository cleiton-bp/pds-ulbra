namespace Pds.Domain.Entities;

/// <summary>
/// Quem entra no painel. A identidade vem do Google, entao aqui nao existe senha,
/// nem recuperacao, nem confirmacao de e-mail.
/// </summary>
public class User : PdsBaseEntity
{
    /// <summary>
    /// Conta propria: a que nasce no primeiro acesso, e da qual a pessoa e dona.
    /// Os projetos de outras contas chegam por <c>project_members</c>, e nao por
    /// aqui — a mesma pessoa pode estar em projetos de varias contas.
    /// </summary>
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

    /// <summary>
    /// Se o Google confirmou que a pessoa e dona do <see cref="Email"/>, no ultimo
    /// login. Aceitar convite exige isto: e o que faz "o mesmo e-mail do convite"
    /// querer dizer a mesma pessoa, e nao alguem que digitou o endereco numa conta.
    /// </summary>
    public bool EmailVerified { get; set; }

    /// <summary>Nome vindo do Google.</summary>
    public string? Name { get; set; }

    /// <summary>Foto vinda do Google. Opcional.</summary>
    public string? AvatarUrl { get; set; }

    /// <summary>Ultimo acesso, em UTC.</summary>
    public DateTime? LastLoginAt { get; set; }

    /// <summary>
    /// O volume do som dos avisos no painel, de 0 a 100. O som de cada tipo de aviso fica
    /// em <see cref="NotificationSounds"/>.
    /// </summary>
    public int NotificationVolume { get; set; } = NotificationSoundDefaults.Volume;

    /// <summary>O som que a pessoa escolheu para cada tipo de aviso.</summary>
    public ICollection<UserNotificationSound> NotificationSounds { get; set; } = new List<UserNotificationSound>();

    /// <summary>O menor e o maior volume.</summary>
    public const int MinNotificationVolume = 0;
    public const int MaxNotificationVolume = 100;
}
