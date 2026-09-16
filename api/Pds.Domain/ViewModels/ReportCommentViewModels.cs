namespace Pds.Domain.ViewModels;

/// <summary>
/// Um comentario interno, como o painel o le.
/// </summary>
/// <param name="PublicId">Identificador do comentario. <b>Nunca aparece em rota publica.</b></param>
/// <param name="AuthorName">Quem escreveu. Vazio quando a conta do autor foi anonimizada.</param>
/// <param name="Body">O texto.</param>
/// <param name="CreatedAt">Quando foi escrito, em UTC.</param>
public record InternalCommentViewModel(
    Guid PublicId,
    string AuthorName,
    string Body,
    DateTime CreatedAt);

/// <summary>
/// Um comentario para quem relatou, como o painel o le.
///
/// <para>E um tipo separado do interno, e nao o mesmo com um campo dizendo qual e
/// qual. Assim nenhuma rota consegue devolver os dois na mesma lista por
/// descuido — e a rota publica que vier depois so tem como alcancar este.</para>
/// </summary>
/// <param name="PublicId">Identificador do comentario.</param>
/// <param name="AuthorName">Quem escreveu, do lado de dentro. A camada publica nao mostra este nome.</param>
/// <param name="Body">O texto.</param>
/// <param name="CreatedAt">Quando foi escrito, em UTC.</param>
public record PublicCommentViewModel(
    Guid PublicId,
    string AuthorName,
    string Body,
    DateTime CreatedAt);

/// <summary>
/// Os comentarios de um relato, <b>em duas listas separadas</b>.
///
/// <para>Separadas ate aqui de proposito. Uma lista so, com um campo dizendo qual
/// e qual, devolveria o interno para qualquer lugar que esquecesse de filtrar — e
/// esquecer nao da erro nenhum, so uma linha a mais na resposta.</para>
/// </summary>
public record ReportCommentsViewModel(
    IReadOnlyList<InternalCommentViewModel> Internal,
    IReadOnlyList<PublicCommentViewModel> Public);
