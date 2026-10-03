using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Os cards de um projeto, para o time que usa o painel: os relatos que chegaram
/// e os cards que o proprio time criou. A rota se chama <c>reports</c> porque o
/// relato veio primeiro; todo card mora nela.
///
/// **É o outro lado do `/public/reports`.** Lá o relato entra sem que ninguém
/// esteja identificado, porque quem escreve é um visitante anônimo do site do
/// cliente; aqui ele só sai para quem é dono dele. São as duas pontas da mesma
/// tabela, com exigências opostas de propósito.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/reports")]
[Produces("application/json")]
[Tags(SwaggerTags.Reports)]
public class ReportsController : BaseController
{
    private readonly IReportService _reportService;

    public ReportsController(IReportService reportService)
    {
        _reportService = reportService;
    }

    /// <summary>Lista os relatos do projeto, do mais novo para o mais antigo.</summary>
    /// <remarks>
    /// **O texto vem inteiro.** Cortar aqui exigiria uma segunda rota só para ler o
    /// resto, e enquanto ela não existisse o time leria pela metade o que a pessoa
    /// escreveu. Quem limita o tamanho da resposta é a página; quem corta para
    /// caber na linha é a tela.
    ///
    /// O `Total` do envelope é o número de relatos do projeto, e não o desta
    /// página: é ele que diz se ainda há o que carregar.
    ///
    /// Página e tamanho fora da faixa são **corrigidos**, não recusados — pedir a
    /// página zero é engano de quem chama, e não motivo para a tela ficar sem
    /// lista. O tamanho máximo é 100.
    ///
    /// Lista vazia não é erro: é um projeto que ainda não recebeu nada.
    ///
    /// **O filtro por coluna da fila** vai em `state`: ausente traz tudo, um
    /// identificador de estado traz só aquela coluna, e a palavra `none` traz os
    /// que ainda não têm lugar na fila. O `Total` acompanha o filtro — filtrando,
    /// ele é o número daquela coluna, e não o do projeto.
    ///
    /// Identificador que não existe no projeto é **recusado**, e não vira lista
    /// vazia: lista vazia responderia "não há relatos ali" a uma pergunta sobre uma
    /// coluna que não existe, e o erro de digitação passaria despercebido.
    ///
    /// Vêm os relatos e os cards do time, cada um com `Kind` e o número (`Number`).
    /// **O arquivado não vem**: `archived=true` troca a lista pelos arquivados — os
    /// dois nunca juntos.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="page">Página, começando em 1.</param>
    /// <param name="pageSize">Quantos relatos por página. Padrão 20, máximo 100.</param>
    /// <param name="state">Identificador da coluna, ou `none` para os que não têm lugar na fila. Ausente traz tudo.</param>
    /// <param name="archived">Verdadeiro traz só os arquivados.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Relatos do projeto.</response>
    /// <response code="400">Filtro de estado fora do formato.</response>
    /// <response code="404">Projeto ou estado não existe, ou a pessoa não está no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ReportSummaryViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> List(
        Guid publicId,
        CancellationToken cancellationToken,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? state = null,
        [FromQuery] bool archived = false)
    {
        try
        {
            var reports = await _reportService.ListAsync(publicId, page, pageSize, state, archived, cancellationToken);
            return Success(reports.Items, total: reports.Total);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Conta os relatos de cada coluna da fila.</summary>
    /// <remarks>
    /// **É pergunta separada da lista de propósito.** A lista traz uma página; a
    /// contagem varre tudo. Na mesma resposta, ou a contagem mente ou a lista deixa
    /// de paginar — e mostrar "Análise 12" contando as 20 linhas que vieram seria a
    /// primeira coisa a ficar errada.
    ///
    /// Sai **uma linha por coluna do projeto, inclusive as vazias**: a coluna com
    /// zero precisa aparecer no filtro, senão ela some da tela no dia em que o
    /// último relato dela é movido, e quem olha acha que ela deixou de existir.
    ///
    /// A coluna aposentada também vem, com `IsActive` falso — ela pode continuar
    /// segurando relatos antigos, e escondê-la esconderia esses relatos.
    ///
    /// A linha com `StatePublicId` nulo são os relatos que ainda não têm lugar na
    /// fila, e ela **só aparece quando existe algum**. Sem ela, a soma das colunas
    /// não bateria com o total e ninguém saberia por quê.
    ///
    /// **`ClosesReport` diz qual coluna encerra o relato**, e vem daqui porque é
    /// daqui que o painel tira a lista de colunas. A tela precisa saber disso
    /// *antes* de mover, para pedir o desfecho e o motivo no mesmo gesto — perguntar
    /// depois seria mandar o movimento, levar a recusa, e só então abrir o diálogo.
    /// Vem verdadeiro em uma linha no máximo: a última coluna ativa.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">A contagem de cada coluna.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet("counts")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ReportStateCountViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Counts(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var counts = await _reportService.CountByStateAsync(publicId, cancellationToken);
            return Success(counts, total: counts.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>A fila de moderação do projeto.</summary>
    /// <remarks>
    /// **Todo relato nasce pendente, inclusive em projeto privado.** Não é excesso
    /// de zelo: se o relato de projeto privado nascesse liberado, o dia em que
    /// alguém marcasse o projeto como público publicaria o histórico inteiro de uma
    /// vez, sem ninguém ter lido nada.
    ///
    /// **Do mais antigo para o mais novo**, ao contrário de toda outra lista do
    /// painel. Fila que se lê de trás para frente deixa o primeiro que chegou
    /// esperando para sempre.
    ///
    /// O total de pendentes vem em toda resposta, **inclusive quando o recorte é
    /// outro**: é o número que o painel mostra na lateral, e ele não pode sumir
    /// porque alguém abriu a aba dos já decididos.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="state">`Pending`, `Approved` ou `Rejected`. Padrão: `Pending`.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">A fila, e quantos ainda esperam decisão.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet("moderation")]
    [ProducesResponseType(typeof(ApiResponse<ModerationQueueViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Moderation(Guid publicId, [FromQuery] ReportModerationStateEnum state = ReportModerationStateEnum.Pending, CancellationToken cancellationToken = default)
    {
        try
        {
            var queue = await _reportService.ListModerationAsync(publicId, state, cancellationToken);
            return Success(queue, total: queue.Items.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Libera o relato para o público, ou decide que ele não vai.</summary>
    /// <remarks>
    /// **Liberar não publica sozinho.** São duas condições, e nenhuma basta: o
    /// projeto precisa estar num nível público, e o relato precisa ter sido
    /// liberado aqui. Um relato liberado em projeto privado continua invisível para
    /// todo mundo — e é por isso que marcar um projeto como público depois não
    /// publica o histórico inteiro de uma vez.
    ///
    /// **Recusar não apaga nem encerra.** O relato continua no painel, continua no
    /// ciclo, e quem escreveu continua acompanhando pelo link. A recusa fala só da
    /// vitrine — e quem relatou **não é avisado** dela, porque ela é decisão
    /// editorial do time e não um recado sobre o problema.
    ///
    /// **Decidir de novo é permitido; voltar para `Pending` não é.** Quem liberou
    /// por engano recusa, e quem recusou e mudou de ideia libera. O que não existe
    /// é desfazer para "ninguém olhou", porque alguém olhou.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="dto">A decisão.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, com a decisão gravada.</response>
    /// <response code="400">Decisão ausente, desconhecida, ou `Pending`.</response>
    /// <response code="404">Projeto ou relato não encontrado entre os que a pessoa enxerga.</response>
    [HttpPut("{reportPublicId:guid}/moderation")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ModerationItemViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Moderate(Guid publicId, Guid reportPublicId, [FromBody] ModerateReportDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var item = await _reportService.ModerateAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(item, item.State == ReportModerationStateEnum.Approved
                ? "Relato liberado para o público."
                : "Relato marcado como não publicável.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Tudo que aconteceu com o relato, em ordem.</summary>
    /// <remarks>
    /// **Montado a partir dos eventos**, e não de uma coluna de histórico. Uma
    /// coluna seria uma segunda versão do mesmo fato, e as duas divergiriam no
    /// primeiro erro de gravação sem ninguém notar.
    ///
    /// **Os nomes das colunas são os que valiam na época**, guardados no evento.
    /// Buscar o nome atual faria uma coluna renomeada — ou aposentada — reescrever o
    /// passado, dizendo que o relato esteve num estado que ainda não existia.
    ///
    /// **Esta consulta não grava.** Diferente da que abre o relato: registrar um
    /// evento por abertura do histórico encheria o próprio histórico de linhas sobre
    /// alguém ter olhado o histórico.
    ///
    /// Sem paginação, e é decisão: o histórico de um relato é curto por natureza, e
    /// quebrá-lo em páginas esconderia o começo da conversa de quem abriu justamente
    /// para entender o caso.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O histórico, do mais antigo para o mais novo.</response>
    /// <response code="404">Relato ou projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet("{reportPublicId:guid}/history")]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ReportHistoryEntryViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> History(Guid publicId, Guid reportPublicId, CancellationToken cancellationToken)
    {
        try
        {
            var history = await _reportService.HistoryAsync(publicId, reportPublicId, cancellationToken);
            return Success(history, total: history.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Devolve o relato pedindo informação, em vez de encerrar.</summary>
    /// <remarks>
    /// **"Volta para o relator" são dois casos, e não um.** Precisar de contexto e
    /// recusar de fato são decisões opostas, e chegando iguais do outro lado a
    /// pessoa entende que acabou e para de responder — o relato morre por ruído,
    /// que é o problema que este produto existe para resolver. Por isso "não
    /// reproduzi" **não encerra**: abre um pedido, que diz *o que* falta.
    ///
    /// O texto vira um **comentário público**: a conversa acontece pelo próprio
    /// relato, e a pessoa responde por lá, pelo link que ela já tem.
    ///
    /// **Recusado com 403 quando quem escreveu não aceitou responder dúvidas** — e
    /// também quando o relato entrou antes de a pergunta existir. Prometer resposta
    /// a quem não vai responder deixa o relato pendurado, e encerrar por "sem
    /// retorno" quem nunca aceitou responder seria cobrar uma promessa que ninguém
    /// fez. Quem precisa saber disso antes de tentar lê `CanAskInfo` no relato
    /// aberto.
    ///
    /// Os **dois prazos são gravados no pedido**, e não lidos da configuração na
    /// hora de mostrar: mudar o prazo do projeto não pode mover o prazo de um
    /// pedido que já está correndo.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="dto">O que falta, escrito para quem relatou.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, agora esperando resposta.</response>
    /// <response code="400">Texto em branco ou longo demais.</response>
    /// <response code="403">O projeto não usa pedido de informação, ou quem escreveu não aceitou responder.</response>
    /// <response code="404">Relato ou projeto não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">O relato já está encerrado, ou já há um pedido aberto.</response>
    [HttpPost("{reportPublicId:guid}/info-request")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> AskInfo(Guid publicId, Guid reportPublicId, [FromBody] AskInfoDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.AskInfoAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(report, "Pedido enviado a quem relatou.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Encerra o relato, com desfecho e motivo.</summary>
    /// <remarks>
    /// **É o encerramento por botão**, e existe nos dois gatilhos. A configuração
    /// do projeto diz por qual *gesto* o painel oferece encerrar; ela não tira do
    /// time o direito de encerrar. Sem esta rota, o relato parado na última coluna
    /// desde antes da regra existir nunca poderia ser encerrado — mover para onde
    /// ele já está não é movimento.
    ///
    /// **Não move o relato de coluna.** O botão atende o time cuja última coluna
    /// não quer dizer "acabou" — "Aguardando deploy", "Arquivado". Arrastar o
    /// relato por causa do encerramento desarrumaria a fila de quem escolheu esta
    /// opção justamente para não ter de arrumá-la.
    ///
    /// **Relato já encerrado é recusado com 409.** Não é engano de digitação: é a
    /// segunda aba, ou o segundo clique. Uma linha por fechamento é o que faz a
    /// sequência "fechou, reabriu, fechou de novo" contar a história certa.
    ///
    /// **Esta rota não registra visualização**, diferente da que abre o relato: a
    /// tela já está aberta, e a resposta é ela mesma atualizada.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="dto">O desfecho e o motivo.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, agora encerrado.</response>
    /// <response code="400">Desfecho ausente, motivo em branco ou longo demais.</response>
    /// <response code="404">Relato ou projeto não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">O relato já está encerrado.</response>
    [HttpPost("{reportPublicId:guid}/closure")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Close(Guid publicId, Guid reportPublicId, [FromBody] CloseReportDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.CloseAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(report, "Relato encerrado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Move o relato para outra coluna da fila.</summary>
    /// <remarks>
    /// **O evento vem antes do cache, na mesma gravação.** A coluna guardada no
    /// relato é conveniência para a lista não precisar reconstruir o caminho de
    /// cada um; a verdade é a sequência de eventos. Se o evento falhasse e a coluna
    /// passasse, o dado da pesquisa sumiria e ninguém perceberia.
    ///
    /// **Mover para a coluna em que ele já está devolve 200 sem gravar nada.** O
    /// histórico encheria de linhas que não dizem nada, e a contagem passaria a
    /// medir cliques em vez de movimentos.
    ///
    /// **Não há regra de transição**: qualquer coluna, em qualquer ordem, inclusive
    /// para trás. Quem move é o time, e ele é quem conhece o caso — o relato que
    /// volta de "Testando" para "Corrigindo" é o caso mais comum de todos.
    ///
    /// O evento guarda **o nome das duas colunas**, além dos identificadores:
    /// renomear uma coluna depois não pode reescrever o passado dizendo que o
    /// relato esteve num estado que ainda não existia.
    ///
    /// **Cair na última coluna ativa encerra o relato**, e aí `Outcome` e `Reason`
    /// passam a ser obrigatórios. O motivo não é desencorajado: é impossível
    /// encerrar sem ele. É esse texto que quem relatou lê na página de
    /// acompanhamento, e sem ele o produto reproduz exatamente o que existe para
    /// resolver — a pessoa fica sabendo que acabou, e não o que aconteceu.
    ///
    /// **Aposentada não conta.** Quem encerra é a última coluna *ativa*, então
    /// aposentar a última muda qual delas encerra. Quem precisa saber disso antes
    /// de mover lê `ClosesReport` na contagem por coluna.
    ///
    /// **Fora dela, os dois campos são recusados** em vez de ignorados: aceitá-los
    /// num movimento que não encerra gravaria um fim que o relato não teve, e quem
    /// mandou continuaria achando que encerrou.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="dto">A coluna de destino, mais o desfecho e o motivo quando ela encerra.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, na coluna nova.</response>
    /// <response code="400">Coluna de destino ausente; encerramento sem desfecho ou sem motivo; desfecho ou motivo num movimento que não encerra.</response>
    /// <response code="404">Relato, projeto ou estado não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">A coluna de destino está aposentada.</response>
    [HttpPut("{reportPublicId:guid}/state")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportSummaryViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Move(Guid publicId, Guid reportPublicId, [FromBody] MoveReportDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.MoveAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(report, "Relato movido.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Abre um relato, com o contexto que veio junto.</summary>
    /// <remarks>
    /// **Esta consulta grava.** Abrir um relato registra um evento de visualização
    /// com origem no painel, e o intervalo entre ele e a criação é o tempo que o
    /// time levou para ir olhar — metade da pergunta que este trabalho investiga.
    ///
    /// Por isso ela **não deve ser chamada para adiantar dado que ninguém pediu**:
    /// cada chamada vira uma linha, e uma lista que abrisse os relatos sozinha
    /// inventaria leituras que não aconteceram.
    ///
    /// O contexto sai em ordem de chave. Ele vem do navegador de quem relatou, e
    /// não de quem digitou: serve para reproduzir o problema, nunca para
    /// identificar a pessoa.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="reportPublicId">Identificador público do relato.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, com o contexto. A visualização foi registrada.</response>
    /// <response code="404">Relato ou projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet("{reportPublicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, Guid reportPublicId, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.GetAsync(publicId, reportPublicId, cancellationToken);
            return Success(report);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Cria um card do time.</summary>
    /// <remarks>
    /// Sem relator e **sem lado de fora**: não tem protocolo, link de
    /// acompanhamento, etapa pública nem moderação — e o banco recusa a linha que
    /// tente ter. Ganha o próximo número do projeto, como o relato.
    ///
    /// O título é obrigatório (até 200 caracteres, uma linha); a descrição é
    /// Markdown, opcional (até 10 000). Sem `StatePublicId`, nasce no primeiro estado
    /// ativo do projeto.
    /// </remarks>
    /// <response code="200">O card criado.</response>
    /// <response code="400">Sem título, ou título ou descrição longos demais.</response>
    /// <response code="403">O projeto está arquivado.</response>
    /// <response code="404">Projeto ou estado não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">O estado escolhido está aposentado.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> CreateTeamCard(Guid publicId, [FromBody] CreateTeamCardDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _reportService.CreateTeamCardAsync(publicId, dto, cancellationToken), "Card criado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Grava o título e a descrição de um card do time.</summary>
    /// <remarks>
    /// Os dois inteiros. **Relato é recusado** (409): o texto dele é de quem
    /// relatou. Arquivado também: editar pede desarquivar antes.
    /// </remarks>
    /// <response code="200">O card como ficou.</response>
    /// <response code="400">Sem título, ou título ou descrição longos demais.</response>
    /// <response code="404">Card ou projeto não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">É um relato, ou o card está arquivado.</response>
    [HttpPut("{reportPublicId:guid}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> EditTeamCard(Guid publicId, Guid reportPublicId, [FromBody] EditTeamCardDto dto, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _reportService.EditTeamCardAsync(publicId, reportPublicId, dto, cancellationToken), "Card salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Arquiva ou desarquiva um card.</summary>
    /// <remarks>
    /// Arquivado sai da tela de Trabalho; se lê e se comenta, e mover ou editar pedem
    /// desarquivar antes.
    ///
    /// **O relato só se arquiva com a regra do ciclo ligada** (`AllowsReportArchiving`),
    /// e o relato **aberto** é encerrado junto: pede `Outcome` e `Reason`, que quem
    /// relatou lê pelo link — e a partir dali pode reabrir ou finalizar, com a
    /// avaliação. Reabrir pelo link traz o relato de volta para a tela de Trabalho.
    /// O relato já encerrado e o card do time arquivam sem desfecho nem motivo.
    ///
    /// Pedir o que já é verdade não é erro: devolve o card como está.
    /// </remarks>
    /// <response code="200">O card como ficou.</response>
    /// <response code="400">Sem `Archived`; relato aberto sem desfecho ou motivo; ou desfecho e motivo onde não cabem.</response>
    /// <response code="403">O projeto não arquiva relato.</response>
    /// <response code="404">Card ou projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpPut("{reportPublicId:guid}/archive")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetArchived(Guid publicId, Guid reportPublicId, [FromBody] ArchiveCardDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var card = await _reportService.SetArchivedAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(card, card.ArchivedAt is null ? "Card de volta ao Trabalho." : "Card arquivado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Dá ao relato o título do time — ou volta ao de quem relatou.</summary>
    /// <remarks>
    /// O título que a pessoa escreveu na ferramenta **nunca muda** (`ReporterTitle`), e é
    /// o único que volta para ela. O do time é interno. `Title` vazio, ou igual ao de
    /// quem relatou, volta a ele.
    ///
    /// O card do time é recusado (409): lá o título se edita junto da descrição, em
    /// `PUT .../reports/{reportPublicId}`.
    /// </remarks>
    /// <response code="200">O card como ficou.</response>
    /// <response code="400">Título comprido demais.</response>
    /// <response code="404">Card ou projeto não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Card do time, ou card arquivado.</response>
    [HttpPut("{reportPublicId:guid}/title")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetTitle(Guid publicId, Guid reportPublicId, [FromBody] SetCardTitleDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var card = await _reportService.SetTitleAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(card, "Título salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Escolhe quem do time fica com o card — ou ninguém.</summary>
    /// <remarks>
    /// **Um só responsável.** Só quem está no time agora pode ser escolhido. Quem sai do
    /// time continua nos cards que eram dele, como registro, com `InTeam` falso — até
    /// alguém trocar. `UserPublicId` nulo tira o responsável.
    /// </remarks>
    /// <response code="200">O card como ficou.</response>
    /// <response code="400">A pessoa não está no time do projeto.</response>
    /// <response code="404">Card ou projeto não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Card arquivado.</response>
    [HttpPut("{reportPublicId:guid}/assignee")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetAssignee(Guid publicId, Guid reportPublicId, [FromBody] SetCardAssigneeDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var card = await _reportService.SetAssigneeAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(card, "Responsável salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Escolhe a prioridade do card — ou nenhuma.</summary>
    /// <remarks>
    /// Uma prioridade ativa do projeto. A aposentada continua no card que já a tinha, e
    /// não vai para outro (409). `PriorityPublicId` nulo é sem prioridade — como o card
    /// nasce.
    /// </remarks>
    /// <response code="200">O card como ficou.</response>
    /// <response code="404">Card, projeto ou prioridade não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Prioridade aposentada, ou card arquivado.</response>
    [HttpPut("{reportPublicId:guid}/priority")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetPriority(Guid publicId, Guid reportPublicId, [FromBody] SetCardPriorityDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var card = await _reportService.SetPriorityAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(card, "Prioridade salva.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Troca as etiquetas do card de uma vez.</summary>
    /// <remarks>
    /// `LabelPublicIds` é **o conjunto inteiro**: a lista que vier passa a ser a do card,
    /// e a vazia tira todas. Etiquetas do projeto, até dez. Para uma etiqueta que ainda
    /// não existe, crie antes em `POST /projects/{publicId}/labels` — qualquer pessoa do
    /// time pode.
    /// </remarks>
    /// <response code="200">O card como ficou.</response>
    /// <response code="400">Sem a lista, ou mais de dez etiquetas.</response>
    /// <response code="404">Card, projeto ou alguma etiqueta não existe neste projeto.</response>
    /// <response code="409">Card arquivado.</response>
    [HttpPut("{reportPublicId:guid}/labels")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetLabels(Guid publicId, Guid reportPublicId, [FromBody] SetCardLabelsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var card = await _reportService.SetLabelsAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(card, "Etiquetas salvas.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Dá um prazo ao card — ou tira.</summary>
    /// <remarks>
    /// Só a data, sem hora (`2026-10-16`). Data no passado é aceita: registrar um prazo
    /// que já venceu é um registro válido. `DueDate` nulo tira o prazo.
    /// </remarks>
    /// <response code="200">O card como ficou.</response>
    /// <response code="400">Data fora dos anos 2000 a 2100.</response>
    /// <response code="404">Card ou projeto não existe, ou a pessoa não está no projeto.</response>
    /// <response code="409">Card arquivado.</response>
    [HttpPut("{reportPublicId:guid}/due-date")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReportDetailViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetDueDate(Guid publicId, Guid reportPublicId, [FromBody] SetCardDueDateDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var card = await _reportService.SetDueDateAsync(publicId, reportPublicId, dto, cancellationToken);
            return Success(card, "Prazo salvo.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
