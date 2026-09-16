using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IReportService
{
    /// <summary>
    /// Recebe um relato da ferramenta embutida, sem sessao. Resolve o projeto pela
    /// chave publica, grava o relato com o contexto que veio junto e registra o
    /// evento de criacao.
    ///
    /// <para>Devolve o protocolo e o token de acompanhamento — e o token sai daqui
    /// uma unica vez.</para>
    /// </summary>
    Task<CreatedReportViewModel> CreateAsync(CreateReportDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// O acompanhamento de um relato, aberto por quem o escreveu — <b>sem sessao</b>.
    ///
    /// <para>Identifica pelo protocolo e confere pelo token, em tempo constante.
    /// <b>Protocolo inexistente e token errado recebem a mesma recusa</b>, com a
    /// mesma mensagem: responder diferente contaria a quem sonda que o protocolo
    /// existe, e o protocolo e curto e falado de proposito.</para>
    ///
    /// <para>Grava o evento de visualizacao com origem <c>PublicPage</c>. E o outro
    /// lado da pergunta da pesquisa: o intervalo entre o relato e a primeira olhada
    /// do time mede a reacao, e a volta do relator mede se a camada publica serve
    /// para alguma coisa. Nenhum dos dois e reconstituivel depois.</para>
    /// </summary>
    Task<PublicReportViewModel> OpenTrackingAsync(OpenReportTrackingDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os relatos de um projeto, do mais novo para o mais antigo, para o painel.
    ///
    /// <para>Ao contrario da criacao, esta rota exige sessao: o relato entra sem
    /// ninguem identificado, mas so sai para quem e dono dele. Projeto de outra
    /// conta responde como se nao existisse.</para>
    ///
    /// <para><paramref name="page"/> e <paramref name="pageSize"/> sao corrigidos
    /// em vez de recusados — pedir a pagina zero e engano de quem chama, e nao
    /// motivo para a tela ficar sem lista.</para>
    /// </summary>
    Task<ReportPageViewModel> ListAsync(Guid projectPublicId, int page, int pageSize, string? state, CancellationToken cancellationToken = default);

    /// <summary>
    /// Quantos relatos ha em cada coluna da fila. Sai uma linha por coluna do
    /// projeto, <b>inclusive as vazias</b>, mais a linha dos que ainda nao tem
    /// lugar na fila quando ela nao esta vazia.
    /// </summary>
    Task<IReadOnlyList<ReportStateCountViewModel>> CountByStateAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Move o relato para outra coluna da fila.
    ///
    /// <para><b>O evento vem antes do cache, na mesma gravacao.</b> A coluna
    /// gravada no relato e conveniencia para a lista nao precisar reconstruir o
    /// caminho de cada um; a verdade e a sequencia de eventos. Se o evento falhar
    /// e a coluna passar, o dado da pesquisa some e ninguem percebe.</para>
    ///
    /// <para>Mover para a coluna em que ele ja esta <b>nao gera evento</b> e nao
    /// grava nada: o historico encheria de linhas que nao dizem nada, e a
    /// contagem passaria a medir cliques em vez de movimentos.</para>
    ///
    /// <para>Nao ha regra de transicao: qualquer coluna, em qualquer ordem. Quem
    /// move e o time, e ele e quem conhece o caso — o relato que volta de
    /// "Testando" para "Corrigindo" e o caso mais comum de todos.</para>
    /// </summary>
    Task<ReportSummaryViewModel> MoveAsync(Guid projectPublicId, Guid reportPublicId, MoveReportDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Tudo que aconteceu com o relato, em ordem, <b>montado a partir dos
    /// eventos</b>.
    ///
    /// <para>Nao registra visualizacao: esta consulta le o que ja aconteceu, e
    /// gravar um evento por abertura do historico encheria o proprio historico de
    /// linhas sobre alguem ter olhado o historico.</para>
    /// </summary>
    Task<IReadOnlyList<ReportHistoryEntryViewModel>> HistoryAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Abre um relato do projeto, com o contexto que veio junto.
    ///
    /// <para><b>Le e grava.</b> Abrir um relato registra um evento de visualizacao
    /// com origem no painel — e a contagem de quantas vezes o time foi olhar, que a
    /// pesquisa compara com a de quem relatou. Por isso nao pode ser chamado para
    /// adiantar dado que ninguem pediu: cada chamada vira uma linha.</para>
    /// </summary>
    Task<ReportDetailViewModel> GetAsync(Guid projectPublicId, Guid reportPublicId, CancellationToken cancellationToken = default);
}
