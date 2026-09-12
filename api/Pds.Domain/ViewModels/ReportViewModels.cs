using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// O relato recem-criado, como a ferramenta o mostra a quem acabou de escrever.
///
/// <para>Sai daqui o minimo: o que a pessoa precisa para voltar. Nada do lado de
/// dentro atravessa — nem o identificador do projeto, nem o da conta.</para>
/// </summary>
/// <param name="TrackingCode">O protocolo, para anotar e repetir.</param>
/// <param name="AccessToken">
/// O que abre o acompanhamento. <b>Devolvido uma unica vez</b>: o banco fica so com
/// o hash, e nenhuma rota consegue revela-lo de novo.
/// </param>
/// <param name="CreatedAt">Quando o relato entrou, em UTC.</param>
public record CreatedReportViewModel(
    string TrackingCode,
    string AccessToken,
    DateTime CreatedAt);

/// <summary>
/// Um relato na lista do painel.
///
/// <para>O <see cref="Text"/> vem inteiro, e nao cortado. Cortar aqui obrigaria
/// uma segunda rota so para ler o resto — e enquanto ela nao existisse, o time
/// leria pela metade o que a pessoa escreveu. Quem limita e a pagina; quem corta
/// para caber e a tela.</para>
///
/// <para>Nao sai daqui o <c>AccessTokenHash</c>, e nem podia: quem tem o hash nao
/// abre o acompanhamento, mas ja sabe o que procurar num vazamento de banco.</para>
/// </summary>
/// <param name="PublicId">Identificador do relato para as rotas do painel.</param>
/// <param name="TrackingCode">O protocolo, que a pessoa que relatou tambem tem.</param>
/// <param name="Type">Defeito, melhoria ou duvida.</param>
/// <param name="Text">O relato como foi escrito.</param>
/// <param name="Route">O caminho da pagina de onde saiu, sem query e sem fragmento.</param>
/// <param name="Origin">O dominio informado pela pagina hospedeira. Indicio, nunca prova.</param>
/// <param name="CreatedAt">Quando o relato entrou, em UTC.</param>
public record ReportSummaryViewModel(
    Guid PublicId,
    string TrackingCode,
    ReportTypeEnum Type,
    string Text,
    string? Route,
    string? Origin,
    DateTime CreatedAt);

/// <summary>
/// Uma pagina de relatos e o total que existe fora dela.
///
/// <para>O total viaja junto porque a lista do painel cresce por um botao
/// "carregar mais": sem ele, a tela nao sabe se o botao ainda tem o que trazer, e
/// so descobre pedindo uma pagina vazia.</para>
/// </summary>
public record ReportPageViewModel(IReadOnlyList<ReportSummaryViewModel> Items, int Total);

/// <summary>Um par do contexto que veio junto com o relato, sem ninguem digitar.</summary>
/// <param name="Key">Nome do dado, em ingles e snake_case: <c>user_agent</c>, <c>viewport_width</c>.</param>
/// <param name="Value">O valor como chegou, sempre texto.</param>
public record ReportContextViewModel(string Key, string? Value);

/// <summary>
/// Um relato aberto, com o contexto que a lista nao mostra.
///
/// <para>O contexto so aparece aqui porque e a resposta a uma pergunta que so
/// nasce depois de ler o relato — "em que navegador isso aconteceu?". Na lista ele
/// seria ruido em toda linha para servir a uma.</para>
/// </summary>
/// <param name="PublicId">Identificador do relato.</param>
/// <param name="TrackingCode">O protocolo, que a pessoa que relatou tambem tem.</param>
/// <param name="Type">Defeito, melhoria ou duvida.</param>
/// <param name="Text">O relato como foi escrito.</param>
/// <param name="Route">O caminho da pagina de onde saiu, sem query e sem fragmento.</param>
/// <param name="Origin">O dominio informado pela pagina hospedeira. Indicio, nunca prova.</param>
/// <param name="CreatedAt">Quando o relato entrou, em UTC.</param>
/// <param name="Contexts">O que veio junto, em ordem de chave.</param>
public record ReportDetailViewModel(
    Guid PublicId,
    string TrackingCode,
    ReportTypeEnum Type,
    string Text,
    string? Route,
    string? Origin,
    DateTime CreatedAt,
    IReadOnlyList<ReportContextViewModel> Contexts);

