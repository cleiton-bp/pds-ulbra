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
    /// Os relatos ligados a um codigo pessoal — <b>sem sessao</b>.
    ///
    /// <para><b>Codigo desconhecido devolve lista vazia</b>, e nao uma recusa. E a
    /// regra que sustenta o modo: qualquer diferenca entre "nao existe" e "existe e
    /// esta vazio" transforma esta rota num oraculo, e tentar codigos ate a resposta
    /// mudar e exatamente como se enumera codigo alheio.</para>
    ///
    /// <para><b>Nao grava evento de visualizacao.</b> Ver a lista nao e ler o
    /// relato, e contar como leitura encheria a medida de reacao com aberturas que
    /// nao aconteceram.</para>
    /// </summary>
    Task<ReporterCodeReportsViewModel> ListByReporterCodeAsync(ReporterCodeLookupDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Quem relatou diz que resolveu — <b>sem sessao</b>, pelo link.
    ///
    /// <para><b>E a metade que faltava da metafora.</b> "Concluido" e o time
    /// dizendo que acabou; isto e a pessoa do outro lado dizendo que chegou. Sem os
    /// dois, o produto vira o que o README denuncia.</para>
    ///
    /// <para>A nota vem junto quando o projeto a pede. <b>Tres estados, e nao
    /// dois</b>: respondeu, recusou, ou nem respondeu — e a separacao e o que faz a
    /// contagem nao mentir. Recusar continua possivel mesmo quando a nota e
    /// obrigatoria, e fica fora da escala.</para>
    ///
    /// <para>Confirmar duas vezes e recusado: preserva o instante da primeira
    /// resposta, que e o dado que a pesquisa compara com o do encerramento.</para>
    /// </summary>
    Task<PublicReportViewModel> ConfirmAsync(ConfirmReportDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Quem relatou diz que <b>nao</b> resolveu, e o relato volta para a fila.
    ///
    /// <para><b>Reabrir nao e regredir.</b> A jornada publica anda para tras aqui
    /// sem passar pela marca "permite retorno": aquela regra existe para o vaivem
    /// interno do time nao sacudir a linha do tempo de quem espera, e aqui quem
    /// pediu o retorno foi a propria pessoa. Segurar a jornada deixaria a pagina
    /// dela mostrando "Concluido" depois de ela mesma dizer que nao concluiu.</para>
    ///
    /// <para>Volta para a coluna que o projeto configurou, ou para a primeira ativa
    /// quando aquela foi aposentada depois. <b>Nao leva nota</b>: quem reabre esta
    /// dizendo que o trabalho nao acabou, e avaliar servico inacabado mede outra
    /// coisa.</para>
    ///
    /// <para>Depois de confirmar nao da mais para reabrir — quem confirmou fechou a
    /// conversa, e o problema que volta depois disso e outro relato.</para>
    /// </summary>
    Task<PublicReportViewModel> ReopenAsync(ReopenReportDto dto, CancellationToken cancellationToken = default);

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

    /// <summary>
    /// Encerra o relato por um botao, com desfecho e motivo.
    ///
    /// <para><b>Existe nos dois gatilhos de encerramento.</b> A configuracao do
    /// projeto diz por qual gesto o painel <b>oferece</b> encerrar; ela nao tira do
    /// time o direito de encerrar. Sem isto, o relato parado na ultima coluna desde
    /// antes de a regra existir nunca poderia ser encerrado — mover para onde ele
    /// ja esta nao e movimento.</para>
    ///
    /// <para><b>Nao move o relato de coluna.</b> O botao atende o time cuja ultima
    /// coluna nao quer dizer "acabou", e arrastar o relato por causa do
    /// encerramento desarrumaria a fila de quem escolheu esta opcao justamente para
    /// nao ter de arruma-la.</para>
    ///
    /// <para>Relato que ja esta encerrado e <b>recusado</b>: uma linha por
    /// fechamento e o que faz a sequencia "fechou, reabriu, fechou de novo" contar
    /// a historia certa. E nao registra visualizacao — a tela ja esta aberta.</para>
    /// </summary>
    Task<ReportDetailViewModel> CloseAsync(Guid projectPublicId, Guid reportPublicId, CloseReportDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reavalia a jornada publica de um relato cuja espera venceu.
    ///
    /// <para><b>Aqui esta o coracao do desenho, e ele cabe numa frase: a decisao
    /// acontece agora, e nao quando o agendamento foi feito.</b> O metodo rele o
    /// estado <b>atual</b> do relato e traduz a partir dele. Por isso:</para>
    ///
    /// <list type="bullet">
    /// <item>desfazer funciona <b>sem cancelar nada</b> — o vencimento foi reescrito,
    /// e a chamada antiga encontra uma data no futuro e sai sem fazer nada;</item>
    /// <item>chamar duas vezes nao faz dano — a segunda encontra o vencimento ja
    /// limpo;</item>
    /// <item>chamar tarde nao faz dano — o que vale e o estado de agora.</item>
    /// </list>
    ///
    /// <para><b>Nao ha autor.</b> O evento publico nasce sem usuario, e isso e
    /// verdade e nao omissao: o passo aconteceu porque um prazo venceu, e o estado
    /// que o causou pode ter vindo de varios movimentos de pessoas diferentes. Quem
    /// moveu continua gravado nos eventos internos, cada um com o seu autor.</para>
    ///
    /// <para>Relato inexistente, sem agendamento ou sem coluna sai em silencio: os
    /// tres sao estados normais para quem chega depois do fato.</para>
    /// </summary>
    Task ApplyScheduledPublicStageAsync(Guid reportPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os relatos cuja espera venceu e ninguem aplicou, para a recuperacao da
    /// subida. Ver <see cref="ApplyScheduledPublicStageAsync"/>.
    /// </summary>
    Task<IReadOnlyList<Guid>> ListOverdueScheduledAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Devolve o relato pedindo informacao, em vez de encerrar.
    ///
    /// <para><b>Recusado quando quem escreveu nao aceitou responder duvidas</b> — e
    /// tambem quando ele entrou antes de a pergunta existir. Prometer resposta a
    /// quem nao vai responder deixa o relato pendurado esperando, e encerrar por
    /// "sem retorno" quem nunca aceitou responder seria cobrar uma promessa que
    /// ninguem fez.</para>
    ///
    /// <para>A pergunta vira um <b>comentario publico</b>: a conversa acontece pelo
    /// proprio relato. Esta chamada grava os dois prazos e agenda o encerramento.</para>
    /// </summary>
    Task<ReportDetailViewModel> AskInfoAsync(Guid projectPublicId, Guid reportPublicId, AskInfoDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Quem relatou responde a pergunta da equipe — <b>sem sessao</b>, pelo link.
    ///
    /// <para><b>So enquanto ha pedido aberto.</b> Sem a pergunta do outro lado, isto
    /// viraria uma caixa de entrada sem dono e sem moderacao — e moderacao ficou de
    /// fora desta etapa de proposito. A vez volta para a equipe assim que ela
    /// responde, e o prazo para de correr.</para>
    /// </summary>
    Task<PublicReportViewModel> ReplyAsync(ReplyToReportDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// Encerra o relato como "sem retorno", quando o prazo do pedido venceu.
    ///
    /// <para>A mesma regra da espera: <b>a decisao acontece agora</b>. Pedido ja
    /// respondido, ja vencido, ou relato encerrado por outro caminho saem em
    /// silencio — sao os tres estados normais para quem chega depois do fato.</para>
    ///
    /// <para><b>Encerrado assim continua reabrivel</b>, e o motivo gravado diz isso
    /// a quem le: quem nao respondeu em duas semanas pode voltar no mes seguinte, e
    /// o produto existe justamente para quem foi esquecido.</para>
    /// </summary>
    Task ExpireInfoRequestAsync(Guid reportPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Os pedidos cujo prazo venceu e ninguem fechou, para a recuperacao da subida.
    /// Ver <see cref="ExpireInfoRequestAsync"/>.
    /// </summary>
    Task<IReadOnlyList<Guid>> ListOverdueInfoRequestsAsync(CancellationToken cancellationToken = default);
}
