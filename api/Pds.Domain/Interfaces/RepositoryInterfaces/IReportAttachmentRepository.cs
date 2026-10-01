using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;
using Pds.Domain.Enums;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>Os arquivos que vieram com um relato.</summary>
public interface IReportAttachmentRepository : IBaseRepository<ReportAttachment>
{
    /// <summary>
    /// Quantos anexos <b>confirmados</b> um envio ja tem, por tipo e no total. A cota e
    /// por tipo; o total fica para quem precisar contar o envio inteiro.
    ///
    /// <para><b>O envio e a criacao do relato, uma resposta ou uma reabertura, e
    /// cada um tem a sua cota.</b> Com uma cota so para o relato, quem mandou quatro
    /// prints ao relatar nao conseguiria responder com o print que o time pediu, nem
    /// mostrar ao reabrir o que ainda esta quebrado. <paramref name="publicCommentId"/>
    /// e <paramref name="reopenedClosureId"/> nulos juntos sao a criacao; no maximo
    /// um deles vem preenchido.</para>
    ///
    /// <para><b>So os confirmados contam.</b> O que ficou pendente e permissao que
    /// alguem pediu e nao usou — faze-lo ocupar vaga deixaria quem tentou tres vezes
    /// e falhou sem conseguir anexar nada.</para>
    ///
    /// <para>Sem sessao: quem anexa e quem relatou, e la a conta atual e zero.</para>
    /// </summary>
    Task<(int Total, int OfKind)> CountConfirmedWithoutSessionAsync(
        long reportId,
        long? publicCommentId,
        long? reopenedClosureId,
        MediaKindEnum kind,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Trava a cota de anexos do relato ate a transacao atual terminar.
    ///
    /// <para><b>E ela que faz o limite valer com envios ao mesmo tempo.</b> Contar e
    /// depois confirmar sao dois passos; sem a trava, duas confirmacoes contam juntas,
    /// as duas veem vaga, e as duas entram. Com ela, a segunda so conta depois de a
    /// primeira terminar — e ja a ve.</para>
    ///
    /// <para>So vale dentro de uma transacao (<c>InTransactionAsync</c>); fora dela
    /// o banco soltaria a trava no fim do proprio comando, sem avisar, e por isso a
    /// chamada fora de uma e recusada.</para>
    /// </summary>
    Task LockUploadQuotaAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Algum anexo que nao foi descartado aponta para este nome no armazenamento.
    ///
    /// <para><b>Existe para a confirmacao que falhou no fim saber se pode apagar a
    /// copia final.</b> O banco pode ter gravado a confirmacao e a resposta dele se
    /// perdido no caminho; apagar ai seria apagar o arquivo de um anexo confirmado.
    /// Le de novo, sem o que o contexto guardou na memoria.</para>
    /// </summary>
    Task<bool> IsObjectKeyInUseWithoutSessionAsync(string objectKey, CancellationToken cancellationToken = default);

    /// <summary>
    /// O anexo <b>pendente</b> daquele relato, para confirmar.
    ///
    /// <para>O relato entra na consulta, e nao so o identificador do anexo: sem ele,
    /// quem tivesse o identificador de um anexo alheio confirmaria o anexo de
    /// outra pessoa.</para>
    /// </summary>
    Task<ReportAttachment?> FindPendingWithoutSessionAsync(
        Guid publicId,
        long reportId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// O anexo <b>ja confirmado</b> daquele relato, com esse identificador.
    ///
    /// <para><b>Existe para a confirmacao repetida responder o que ja aconteceu.</b>
    /// A resposta da primeira pode se perder no caminho — a rede de quem relata, a do
    /// banco —, e a pessoa tenta de novo um arquivo que ja entrou. Pelo mesmo motivo
    /// de <see cref="FindPendingWithoutSessionAsync"/>, o relato entra na consulta.
    /// Le de novo, sem o que o contexto guardou na memoria.</para>
    /// </summary>
    Task<ReportAttachment?> FindConfirmedWithoutSessionAsync(
        Guid publicId,
        long reportId,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Algum arquivo deste envio andou desde <paramref name="since"/>: teve a
    /// permissao pedida, ou terminou — confirmado ou descartado.
    ///
    /// <para><b>E o que diz que o envio ainda esta acontecendo.</b> Os arquivos sobem
    /// um de cada vez, e cada um pede a permissao quando o anterior termina: numa
    /// conexao lenta, o ultimo pede muito depois do texto, mas logo depois de o
    /// penultimo terminar. <b>Terminar conta, e nao so pedir</b>: um arquivo grande
    /// pode levar mais que o prazo inteiro subindo, e o pedido dele ficaria velho
    /// antes de o proximo chegar. O descartado conta: foi o envio andando, e o
    /// proximo arquivo nao tem culpa da recusa dele.</para>
    ///
    /// <para>O envio e o de <see cref="CountConfirmedWithoutSessionAsync"/>: as duas
    /// colunas nulas sao a criacao.</para>
    /// </summary>
    Task<bool> HasActivitySinceWithoutSessionAsync(
        long reportId,
        long? publicCommentId,
        long? reopenedClosureId,
        DateTime since,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Os anexos confirmados de um relato, <b>com sessao</b>, na ordem em que a pessoa
    /// os montou em cada envio (<c>DisplayOrder</c>), e pela hora de chegada no empate.
    /// O filtro global limita a conta do painel — relato de outra conta nao traz nada.
    /// </summary>
    Task<List<ReportAttachment>> ListConfirmedAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os anexos confirmados de um relato, sem sessao, na mesma ordem de
    /// <see cref="ListConfirmedAsync"/>.
    /// </summary>
    Task<List<ReportAttachment>> ListConfirmedWithoutSessionAsync(
        long reportId,
        CancellationToken cancellationToken = default);
}
