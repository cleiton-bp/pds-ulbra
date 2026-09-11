namespace Pds.Domain.Enums;

/// <summary>
/// De onde a acao partiu. Separar a origem do tipo e o que permite perguntar
/// "quantas vezes o relator voltou" sem confundir com "quantas vezes o time
/// abriu" — as duas coisas sao a mesma acao vinda de lugares diferentes.
///
/// No banco vira texto em snake_case (widget, panel, api, public_page).
/// </summary>
public enum EventSourceEnum
{
    /// <summary>A ferramenta embutida no site do cliente.</summary>
    Widget,

    /// <summary>O painel, usado pelo time do cliente.</summary>
    Panel,

    /// <summary>Chamada direta a API, pelo servidor do cliente.</summary>
    Api,

    /// <summary>A pagina publica de acompanhamento, aberta por quem relatou.</summary>
    PublicPage,
}
