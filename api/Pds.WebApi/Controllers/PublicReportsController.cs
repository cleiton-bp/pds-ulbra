using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;

namespace Pds.WebApi.Controllers;

/// <summary>
/// O relato entrando, e o relato sendo acompanhado por quem o escreveu. As duas
/// pontas públicas do mesmo relato, e **nenhuma delas tem sessão**.
///
/// **As duas credenciais aqui são de naturezas opostas**, e confundi-las é o erro
/// a evitar. Na entrada, a chave pública não autentica ninguém: ela apenas diz
/// para qual projeto o relato vai, e está à vista no HTML do site do cliente. No
/// acompanhamento, o token do link **é** uma credencial — ele prova que aquele
/// relato é de quem o apresenta, é conferido em tempo constante e existe uma vez
/// só.
///
/// Por isso o `[AllowAnonymous]` está escrito, e não apenas subentendido pela
/// ausência do `[Authorize]`: no dia em que alguém definir uma política padrão de
/// autorização para a API inteira, estas rotas precisam continuar abertas de
/// propósito, e não por esquecimento.
/// </summary>
[AllowAnonymous]
[Route("public/reports")]
[Produces("application/json")]
[Tags(SwaggerTags.PublicReports)]
public class PublicReportsController : BaseController
{
    private readonly IReportService _reportService;
    private readonly IReportAttachmentService _attachmentService;
    private readonly IProjectMediaSettingsService _mediaSettingsService;

    public PublicReportsController(
        IReportService reportService,
        IReportAttachmentService attachmentService,
        IProjectMediaSettingsService mediaSettingsService)
    {
        _reportService = reportService;
        _attachmentService = attachmentService;
        _mediaSettingsService = mediaSettingsService;
    }

    /// <summary>Abre um relato.</summary>
    /// <remarks>
    /// O projeto é resolvido pela chave pública do corpo. A resposta traz o
    /// **protocolo**, que a pessoa anota e repete, e o **token de acompanhamento**,
    /// que vai no link — e o token sai daqui uma única vez, porque o banco guarda
    /// apenas o hash dele.
    ///
    /// O que vier depois do `?` ou do `#` na rota é descartado antes de gravar: é
    /// ali que costumam viajar token, documento e e-mail.
    ///
    /// **`AcceptsQuestions` é escolha de quem escreve, e não do projeto.** Quem
    /// relatou um defeito às pressas pode não querer virar parte da investigação, e
    /// prometer resposta a quem não vai responder deixa o relato pendurado
    /// esperando. O projeto só escolhe como a caixa vem marcada no formulário.
    ///
    /// **Campo ausente não é "não".** Sem ele vale o padrão que o projeto
    /// configurou — silenciar o relato porque uma versão antiga da ferramenta não
    /// mandou o campo seria punir quem escreveu por um descompasso que não é dele.
    ///
    /// **A origem é conferida contra a lista do projeto, e continua não sendo
    /// prova.** A ferramenta abre num quadro do nosso domínio, então o endereço que
    /// chega aqui é informado pela própria página hospedeira — e quem informa é o
    /// carregador, que é código nosso. Por isso a lista pega a chave copiada para
    /// outro site, e não pega quem falar direto com esta rota. Projeto com a lista
    /// vazia aceita qualquer endereço, e quem não declara endereço passa.
    /// </remarks>
    /// <param name="dto">O relato, com a chave pública do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Relato aberto. Guarde o token: ele não será exibido de novo.</response>
    /// <response code="400">Texto em branco, longo demais, ou tipo não informado.</response>
    /// <response code="401">Chave pública ausente, desconhecida ou revogada.</response>
    /// <response code="403">O projeto está arquivado, ou o endereço declarado não está na lista dele.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<CreatedReportViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateReportDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var created = await _reportService.CreateAsync(dto, cancellationToken);
            return Success(created, "Relato recebido.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Abre o acompanhamento de um relato.</summary>
    /// <remarks>
    /// A página pública de acompanhamento chama esta rota com o protocolo e o token
    /// que saíram da criação do relato. **O protocolo identifica e o token abre**: o
    /// protocolo é curto e falado de propósito, logo adivinhável, e sozinho ele não
    /// abre nada.
    ///
    /// **Por que um `POST` para uma leitura.** O token é um segredo, e segredo em
    /// query string entra no log do servidor, no histórico do navegador e no
    /// `Referer` que sai da página — no corpo, não entra em nenhum dos três. E a
    /// chamada não é leitura pura: ela grava o evento de visualização, que é o dado
    /// da pesquisa sobre o relator voltar para olhar.
    ///
    /// **Protocolo inexistente e token errado recebem a mesma recusa 404**, com a
    /// mesma mensagem. Responder diferente contaria a quem sonda que acertou metade
    /// — e 404 em vez de 403 pela mesma razão de sempre aqui: confirmar que o
    /// relato existe já é informação.
    ///
    /// **A resposta traz a jornada**, na ordem, com o passo em que o relato está e as
    /// datas em que ele chegou a cada um. As datas vêm dos **eventos**, e não da
    /// posição: um relato pode pular etapas, e marcar como percorrido tudo que está
    /// antes contaria uma história que não aconteceu. Projeto sem jornada devolve a
    /// lista vazia, e a página diz isso em vez de prometer.
    ///
    /// **Tudo aqui é montado campo a campo.** Nenhuma entidade é serializada nesta
    /// resposta, e não há herança do que o painel lê. É a única resposta do sistema
    /// que sai para alguém de fora do time do cliente: com serialização, a coluna
    /// acrescentada amanhã a uma tabela interna apareceria aqui sem ninguém decidir,
    /// e vazamento por serialização não dá erro em teste nenhum.
    ///
    /// A resposta sai com `Cache-Control: no-store`. É o relato de alguém, e ele não
    /// fica guardado em proxy nem no disco de quem abriu.
    /// </remarks>
    /// <param name="dto">O protocolo e o token, os dois juntos.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, como quem o escreveu o vê.</response>
    /// <response code="404">O link não abre nenhum relato.</response>
    [HttpPost("tracking")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<PublicReportViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Tracking([FromBody] OpenReportTrackingDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.OpenTrackingAsync(dto, cancellationToken);
            Response.Headers.CacheControl = "no-store";

            return Success(report);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>O que já foi liberado para o público neste projeto.</summary>
    /// <remarks>
    /// **É `GET`, e as outras consultas públicas são `POST`.** A diferença não é
    /// estilo: ali o corpo carrega um segredo — o token, o código pessoal —, e
    /// segredo em query string entra no log do servidor, no histórico do navegador
    /// e no `Referer`. Aqui não há segredo nenhum: a chave pública já está no
    /// código-fonte da página do cliente.
    ///
    /// **Duas condições, e nenhuma sozinha basta**: o projeto precisa estar num
    /// nível público, e cada relato precisa ter sido liberado na moderação. Foi por
    /// isso que os três níveis vieram um passo antes e não ligaram lista nenhuma.
    ///
    /// **Projeto privado responde lista vazia, e não uma recusa.** Mesma disciplina
    /// da consulta por código pessoal: a diferença entre "não publica" e "publica e
    /// não tem nada" não diz nada a quem lê, e dita em voz alta contaria a
    /// configuração do cliente a qualquer um que colasse a chave pública numa
    /// requisição.
    ///
    /// **Não sai daqui o protocolo.** Ele é curto, falado em voz alta, e é metade
    /// da credencial de quem relatou — publicá-lo entregaria a estranhos o número
    /// que a própria pessoa usa para voltar. O nome só aparece com o projeto em
    /// `PublicIdentified` **e** a pessoa tendo escolhido assinar.
    /// </remarks>
    /// <param name="key">Chave pública do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Os relatos liberados, ou uma lista vazia.</response>
    /// <response code="401">Chave ausente, desconhecida ou revogada.</response>
    [HttpGet("published")]
    [ProducesResponseType(typeof(ApiResponse<PublishedReportsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Published([FromQuery] string? key, CancellationToken cancellationToken)
    {
        try
        {
            var lista = await _reportService.ListPublishedAsync(new PublishedReportsDto { Key = key }, cancellationToken);
            return Success(lista, total: lista.Reports.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Os relatos ligados a um código pessoal.</summary>
    /// <remarks>
    /// **Sem sessão.** É a lista de quem relatou, no modo em que o projeto entrega um
    /// código para a pessoa guardar.
    ///
    /// **Código desconhecido devolve lista vazia, e não 404.** É a decisão central
    /// desta rota: qualquer diferença entre "não existe" e "existe e está vazio"
    /// a transformaria num oráculo, e tentar códigos até a resposta mudar é
    /// exatamente como se enumera código alheio. Projeto que não usa este modo
    /// responde igual, pelo mesmo motivo.
    ///
    /// **A lista não carrega o token de cada relato.** O código diz *quais* relatos
    /// são dela; o link de cada um é que dá poder sobre ele — confirmar, reabrir,
    /// responder. Embutir o token aqui faria doze símbolos valerem tanto quanto
    /// todos os links somados.
    ///
    /// **Não grava visualização.** Ver a lista não é ler o relato, e contar como
    /// leitura encheria a medida de reação com aberturas que não aconteceram.
    /// </remarks>
    /// <param name="dto">A chave pública do projeto e o código.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">A lista, possivelmente vazia.</response>
    /// <response code="401">Chave pública inválida, como nas outras rotas públicas.</response>
    [HttpPost("by-code")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ReporterCodeReportsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> ByCode([FromBody] ReporterCodeLookupDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var relatos = await _reportService.ListByReporterCodeAsync(dto, cancellationToken);
            return Success(relatos);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Abre um relato da lista pessoal, pelo código.</summary>
    /// <remarks>
    /// **Sem sessão.** É o que torna a lista clicável: quem digitou o código num
    /// navegador novo não tem os links de cada relato, e sem isto veria uma lista
    /// que não abre nada.
    ///
    /// **Lê, e por padrão não age.** O código prova que o relato é dela; o link é
    /// que dá poder sobre ele — confirmar, reabrir e responder chegam desligados, a
    /// menos que o projeto tenha ligado `TrackingCodeCanAct` na tela de Ciclo.
    ///
    /// **Uma recusa só, para todos os enganos.** Código em branco, código que não
    /// existe, protocolo que não existe e protocolo que é de outra pessoa recebem a
    /// mesma mensagem: responder diferente contaria a quem sonda o que ele acertou.
    ///
    /// **Grava a visualização**, com `by: reporter_code` na carga — é o que
    /// distingue, na contagem, quem voltou pela lista de quem voltou pelo link.
    /// </remarks>
    /// <param name="dto">A chave pública, o código e o protocolo.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, como quem o escreveu o vê.</response>
    /// <response code="401">Chave pública inválida.</response>
    /// <response code="404">Código ou protocolo não conferem.</response>
    [HttpPost("by-code/open")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<PublicReportViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> OpenByCode([FromBody] OpenByReporterCodeDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.OpenByReporterCodeAsync(dto, cancellationToken);
            return Success(report);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Quem relatou diz que resolveu.</summary>
    /// <remarks>
    /// **É a metade que faltava da metáfora.** "Concluído" é o time dizendo que
    /// acabou; isto é a pessoa do outro lado dizendo que chegou. Sem os dois, o
    /// produto vira um sistema que avisa que fechou o chamado.
    ///
    /// **A nota tem três estados, e não dois**: respondeu de 1 a 5, recusou
    /// (`SatisfactionDeclined`), ou não respondeu nada. A separação é o que faz a
    /// contagem não mentir — recusar opinar não é insatisfação, e somar os dois
    /// daria uma média que parece precisa e não é.
    ///
    /// **"Prefiro não responder" existe mesmo quando a nota é obrigatória**, e fica
    /// fora da escala: não é o zero nem a sexta estrela. Sem a saída, a obrigação
    /// vira clique sem pensar e a média passa a medir o clique.
    ///
    /// Projeto que não pede nota **descarta** o que vier, em vez de recusar: quem
    /// manda é a nossa própria página, e perder a confirmação por causa de um campo
    /// que a pessoa não escolheu mandar seria punir ela por um erro nosso.
    ///
    /// As duas credenciais são as mesmas da consulta, com a mesma recusa única.
    /// </remarks>
    /// <param name="dto">Protocolo, token e a resposta sobre a nota.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, agora confirmado.</response>
    /// <response code="400">Nota fora de 1 a 5, nota e recusa juntas, ou nota obrigatória sem resposta.</response>
    /// <response code="404">Link incompleto, protocolo desconhecido, ou token que não é deste relato.</response>
    /// <response code="409">O relato não está encerrado, ou você já respondeu sobre ele.</response>
    [HttpPost("confirm")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<PublicReportViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Confirm([FromBody] ConfirmReportDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.ConfirmAsync(dto, cancellationToken);
            return Success(report, "Obrigado pela resposta.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Quem relatou diz que não resolveu, e o relato volta para a fila.</summary>
    /// <remarks>
    /// **Reabrir não é regredir**, e por isso a jornada pública anda para trás aqui
    /// sem passar pela marca "permite retorno". Aquela regra existe para o vaivém
    /// interno do time não sacudir a linha do tempo de quem espera; aqui quem pediu
    /// o retorno foi a própria pessoa. Segurar a jornada deixaria a página dela
    /// mostrando "Concluído" depois de ela mesma dizer que não concluiu.
    ///
    /// O relato volta para a coluna que o projeto configurou — ou para a primeira
    /// ativa, quando aquela foi aposentada depois. Mandá-lo para uma coluna que
    /// ninguém olha seria perdê-lo de novo, que é o que a reabertura existe para
    /// evitar.
    ///
    /// **Não leva nota.** Quem reabre está dizendo que o trabalho não acabou, e
    /// avaliar serviço inacabado mede outra coisa. A nota volta a ser pedida quando
    /// o relato for encerrado de novo.
    ///
    /// **Depois de confirmar não dá mais para reabrir**: quem confirmou fechou a
    /// conversa, e o problema que volta depois disso é outro relato.
    ///
    /// Grava **dois** eventos, e os dois são verdade: a pessoa reabriu, e o relato
    /// mudou de coluna. A origem `PublicPage` é o que diz que não foi o time.
    /// </remarks>
    /// <param name="dto">Protocolo, token e o motivo de estar voltando.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, de volta à fila.</response>
    /// <response code="400">Comentário exigido e em branco, ou longo demais.</response>
    /// <response code="403">Este projeto não aceita reabrir.</response>
    /// <response code="404">Link incompleto, protocolo desconhecido, ou token que não é deste relato.</response>
    /// <response code="409">O relato não está encerrado, ou você já confirmou que foi resolvido.</response>
    [HttpPost("reopen")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<PublicReportViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Reopen([FromBody] ReopenReportDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.ReopenAsync(dto, cancellationToken);
            return Success(report, "O relato voltou para a equipe.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Quem relatou responde a pergunta da equipe.</summary>
    /// <remarks>
    /// **Só enquanto há pedido aberto.** Sem a pergunta do outro lado, esta rota
    /// viraria uma caixa de entrada sem dono e sem moderação — e moderação ficou de
    /// fora desta etapa de propósito. Relato sem pedido aberto recebe 409.
    ///
    /// A resposta entra na **mesma tabela** do que a equipe escreve, com o autor
    /// nulo: é o que faz a conversa ser uma lista só, em ordem, e é o que "a
    /// conversa acontece pelo próprio relato" significa na prática.
    ///
    /// **A vez volta para a equipe**, e o prazo para de correr. A mensagem que ia
    /// encerrar o relato não é cancelada — ao chegar, ela não encontra pedido
    /// aberto e se descarta, pela mesma propriedade da espera.
    ///
    /// As duas credenciais são as mesmas da consulta, com a mesma recusa única.
    /// </remarks>
    /// <param name="dto">Protocolo, token e a resposta.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O relato, com a resposta na conversa.</response>
    /// <response code="400">Resposta em branco ou longa demais.</response>
    /// <response code="404">Link incompleto, protocolo desconhecido, ou token que não é deste relato.</response>
    /// <response code="409">Não há nenhuma pergunta aberta neste relato.</response>
    [HttpPost("reply")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<PublicReportViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Reply([FromBody] ReplyToReportDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var report = await _reportService.ReplyAsync(dto, cancellationToken);
            return Success(report, "Resposta enviada.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
    /// <summary>Pede permissão para enviar um arquivo neste relato.</summary>
    /// <remarks>
    /// **O arquivo não passa por aqui, e não vai passar.** Esta rota devolve um
    /// formulário assinado; quem carrega os bytes é o navegador, falando direto com
    /// o armazenamento. Passar o arquivo pela API significaria carregar megabytes na
    /// memória do servidor duas vezes, sem ganhar nada.
    ///
    /// **O protocolo e o token não são formalidade.** São eles que dizem de quem é o
    /// relato — assinar permissão para quem não tem relato nenhum seria assinar para
    /// qualquer um, e esta é a única rota pública do sistema que gera custo em
    /// dinheiro.
    ///
    /// **O teto de tamanho viaja dentro da assinatura**, e quem recusa o que passa é
    /// o próprio armazenamento. Não há outro lugar onde ele pudesse ser cobrado: no
    /// widget não vale, porque ele roda no navegador de quem relata; aqui também
    /// não, porque o arquivo nunca chega.
    ///
    /// **A permissão vale poucos minutos**, e é só o tempo de o envio começar.
    /// Vazou, tem prazo.
    ///
    /// Depois de enviar, **confirme**: sem isso o arquivo é órfão e não pertence a
    /// relato nenhum.
    /// </remarks>
    /// <param name="dto">O relato, o tipo e o tamanho do arquivo.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Formulário assinado, pronto para enviar.</response>
    /// <response code="400">Projeto não aceita anexo, formato recusado, limite estourado, ou arquivo grande demais.</response>
    /// <response code="404">O link não abre nenhum relato.</response>
    /// <response code="429">Muitos pedidos de envio a partir do mesmo IP.</response>
    [HttpPost("attachments")]
    [EnableRateLimiting(Startup.MediaUploadRateLimitPolicy)]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<AttachmentUploadTicketViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> RequestAttachment(
        [FromBody] RequestAttachmentUploadDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            var ticket = await _attachmentService.RequestUploadAsync(dto, cancellationToken);
            return Success(ticket);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Confirma que o arquivo chegou, e prende o anexo ao relato.</summary>
    /// <remarks>
    /// **É aqui que a API lê os primeiros bytes do arquivo.** A assinatura do envio
    /// garante o **rótulo** — o objeto é gravado com o tipo que pedimos — e não
    /// garante o **conteúdo**: nada impede quem obteve a permissão de pôr bytes de
    /// qualquer coisa num objeto marcado como imagem. Só olhando o começo do arquivo
    /// dá para saber, e esse é o único lugar onde isso cabe.
    ///
    /// **O que não confere é apagado**, no armazenamento e no banco. Sem isso, cada
    /// recusa deixaria um arquivo guardado para sempre — a conta cresce com o que
    /// foi aceito, e não pode crescer também com o que foi recusado.
    ///
    /// **O tamanho gravado é o que o armazenamento contou**, e não o que o navegador
    /// disse. O número que vem de fora serve para recusar cedo; o que fica é o real,
    /// porque é ele que a cobrança um dia vai somar.
    ///
    /// **Sem esta chamada o anexo não existe para o produto**: não aparece no
    /// painel, não aparece na jornada pública, e não conta para o limite do próximo
    /// envio.
    /// </remarks>
    /// <param name="dto">O relato e o anexo que está sendo confirmado.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Anexo confirmado.</response>
    /// <response code="400">O arquivo não chegou, não é do formato declarado, ou passa do limite.</response>
    /// <response code="404">O link não abre nenhum relato, ou não há anexo pendente com esse identificador.</response>
    /// <response code="429">Muitos pedidos de envio a partir do mesmo IP.</response>
    [HttpPost("attachments/confirm")]
    [EnableRateLimiting(Startup.MediaUploadRateLimitPolicy)]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ConfirmedAttachmentViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> ConfirmAttachment(
        [FromBody] ConfirmAttachmentDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            var confirmado = await _attachmentService.ConfirmAsync(dto, cancellationToken);
            return Success(confirmado, "Anexo recebido.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Os arquivos do relato, para quem o relatou.</summary>
    /// <remarks>
    /// **A mesma porta do acompanhamento.** O protocolo identifica e o token abre;
    /// protocolo sem token, token errado e relato inexistente recebem a mesma recusa
    /// 404, e nenhuma assinatura é gerada antes de a porta aceitar.
    ///
    /// **Por que um `POST` para uma leitura.** O token é segredo, e segredo em query
    /// string entra no log do servidor, no histórico do navegador e no `Referer` —
    /// no corpo, não entra em nenhum dos três.
    ///
    /// **Sem o nome original.** Esta resposta é montada campo a campo, num tipo
    /// próprio, e o nome que o arquivo tinha na máquina de quem relatou nem existe
    /// nele — com o tipo do painel, o campo acrescentado amanhã sairia aqui sem
    /// ninguém decidir.
    ///
    /// Sai com `Cache-Control: no-store`: são endereços assinados do relato de alguém.
    /// </remarks>
    /// <param name="dto">O protocolo e o token, os dois juntos.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Os anexos confirmados, na ordem em que entraram.</response>
    /// <response code="404">O link não abre nenhum relato.</response>
    /// <response code="409">Não há armazenamento configurado nesta instalação.</response>
    [HttpPost("tracking/attachments")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<List<PublicAttachmentViewModel>>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> TrackingAttachments(
        [FromBody] OpenReportTrackingDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            var anexos = await _attachmentService.ListForTrackingAsync(dto, cancellationToken);
            Response.Headers.CacheControl = "no-store";
            return Success(anexos, total: anexos.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>O que dá para anexar ao responder, pela porta do acompanhamento.</summary>
    /// <remarks>
    /// **A página de quem relatou não tem a chave pública do projeto** — chegou pelo
    /// link, que carrega só o relato. Esta é a mesma leitura que a ferramenta faz,
    /// pela mesma porta das outras rotas do acompanhamento: protocolo e token.
    ///
    /// `AllowsOnInfoRequest` é o que a página olha. Sem armazenamento nesta
    /// instalação, `IsEnabled` vem falso.
    /// </remarks>
    /// <param name="dto">O protocolo e o token, os dois juntos.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O que dá para anexar.</response>
    /// <response code="404">O link não abre nenhum relato.</response>
    [HttpPost("tracking/media-settings")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<PublicMediaSettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> TrackingMediaSettings(
        [FromBody] OpenReportTrackingDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _mediaSettingsService.GetForTrackingAsync(dto, cancellationToken);
            Response.Headers.CacheControl = "no-store";
            return Success(settings);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

}
