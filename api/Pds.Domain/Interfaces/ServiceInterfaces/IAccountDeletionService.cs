using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>O que acontece no login de uma conta que pediu exclusao.</summary>
public enum AccountDeletionOnSignIn
{
    /// <summary>A conta nao estava no prazo de exclusao: nada muda.</summary>
    None,

    /// <summary>Estava no prazo, e o login cancelou: os projetos voltaram.</summary>
    Cancelled,

    /// <summary>O prazo ja tinha vencido: a conta foi apagada agora, e o login segue como primeiro acesso.</summary>
    Purged,
}

/// <summary>
/// A exclusao da conta pela propria pessoa, com prazo de arrependimento.
///
/// <para><b>Dois tempos.</b> No pedido, a conta e os projetos saem do ar na hora (o painel
/// fecha para o dono e para o time, o botao some dos sites e o acompanhamento deixa de
/// abrir), e o prazo fica gravado. No fim do prazo, a limpeza apaga de verdade projetos,
/// relatos e arquivos e tira da pessoa o que a identifica. Entrar no painel antes disso
/// desfaz o pedido.</para>
/// </summary>
public interface IAccountDeletionService
{
    /// <summary>O que vai sumir, contado agora, para o dialogo de confirmacao.</summary>
    Task<AccountDeletionPreviewViewModel> GetPreviewAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Pede a exclusao da conta da sessao: tira os projetos do ar, encerra as sessoes da
    /// pessoa e agenda a limpeza para o fim do prazo. A confirmacao e o dialogo do painel,
    /// que explica o que some e como desfazer antes do botao.
    /// </summary>
    Task<AccountDeletionRequestedViewModel> RequestAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Chamado pelo login, antes de abrir a sessao. Dentro do prazo, cancela a exclusao e
    /// devolve os projetos; com o prazo vencido e a limpeza ainda nao feita, faz a limpeza
    /// agora, e o login segue como o de quem chega pela primeira vez.
    /// </summary>
    Task<AccountDeletionOnSignIn> ResolveOnSignInAsync(long accountId, CancellationToken cancellationToken = default);

    /// <summary>
    /// A limpeza definitiva. Rele a conta: so apaga se o pedido continua de pe e o prazo
    /// venceu, entao mensagem repetida ou atrasada nao faz dano, e o cancelamento nao
    /// precisa desmarcar nada.
    /// </summary>
    Task PurgeAsync(Guid accountPublicId, CancellationToken cancellationToken = default);

    /// <summary>As contas com o prazo vencido e a limpeza por fazer, para a recuperacao na subida.</summary>
    Task<IReadOnlyList<Guid>> ListOverdueAsync(CancellationToken cancellationToken = default);
}
