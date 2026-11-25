namespace Pds.Domain.ViewModels;

/// <summary>
/// Um comentario interno, como o painel o le.
/// </summary>
/// <param name="PublicId">Identificador do comentario. <b>Nunca aparece em rota publica.</b></param>
/// <param name="AuthorName">Quem escreveu. Vazio quando a conta do autor foi anonimizada.</param>
/// <param name="Body">O texto.</param>
/// <param name="CreatedAt">Quando foi escrito, em UTC.</param>
/// <param name="EditedAt">
/// Quando foi corrigido pela ultima vez, em UTC; nulo se nunca foi. A tela marca
/// "editado": quem ja tinha lido precisa saber que o texto mudou.
/// </param>
/// <param name="IsYours">
/// Quem pergunta e quem escreveu — so ela corrige e apaga. Calculado a cada leitura,
/// pela sessao: o mesmo comentario e "seu" para uma pessoa e nao para as outras.
/// </param>
/// <param name="AuthorAvatarUrl">A foto de quem escreveu, a da conta Google. Nula sem foto.</param>
/// <param name="ReplyTo">A mensagem que este comentario responde, ou nula.</param>
public record InternalCommentViewModel(
    Guid PublicId,
    string AuthorName,
    string Body,
    DateTime CreatedAt,
    DateTime? EditedAt,
    bool IsYours,
    string? AuthorAvatarUrl = null,
    CommentReplyViewModel? ReplyTo = null);

/// <summary>
/// A mensagem citada numa resposta, como o chat mostra em cima do texto: quem escreveu e o
/// que disse. A tela leva ate a original quando ela esta na conversa.
/// </summary>
/// <param name="PublicId">A original. Nulo quando ela foi apagada.</param>
/// <param name="AuthorName">Quem escreveu a original, do lado de dentro. Nulo para quem relatou.</param>
/// <param name="FromReporter">A original e de quem relatou.</param>
/// <param name="Body">O texto da original. Nulo quando ela foi apagada.</param>
/// <param name="IsYours">A original e de quem le: a tela diz "Voce" no lugar do nome.</param>
public record CommentReplyViewModel(
    Guid? PublicId,
    string? AuthorName,
    bool FromReporter,
    string? Body,
    bool IsYours = false);

/// <summary>
/// Um comentario para quem relatou, como o painel o le.
///
/// <para>E um tipo separado do interno, e nao o mesmo com um campo dizendo qual e
/// qual. Assim nenhuma rota consegue devolver os dois na mesma lista por
/// descuido — e a rota publica que vier depois so tem como alcancar este.</para>
/// </summary>
/// <param name="PublicId">Identificador do comentario.</param>
/// <param name="FromReporter">
/// A fala e de <b>quem relatou</b>, respondendo a equipe.
///
/// <para><b>Campo proprio, e nao "nome vazio".</b> Nome nulo tambem acontece quando
/// a conta do autor interno foi esvaziada, e os dois casos sao opostos — um e a
/// pessoa de fora falando, o outro e alguem de dentro cujo nome se perdeu. Tratar
/// os dois pelo mesmo sinal poria palavra de um na boca do outro.</para>
/// </param>
/// <param name="AuthorName">
/// Quem escreveu, do lado de dentro. Nulo quando a fala e de quem relatou — que nao
/// tem usuario aqui — ou quando a conta do autor foi esvaziada.
/// </param>
/// <param name="Body">O texto.</param>
/// <param name="CreatedAt">Quando foi escrito, em UTC.</param>
/// <param name="IsYours">Quem pergunta e quem escreveu, do lado de dentro.</param>
/// <param name="AuthorAvatarUrl">A foto de quem escreveu, do lado de dentro. Nula sem foto e para quem relatou.</param>
/// <param name="ReplyTo">A mensagem que este comentario responde, ou nula.</param>
public record PublicCommentViewModel(
    Guid PublicId,
    bool FromReporter,
    string? AuthorName,
    string Body,
    DateTime CreatedAt,
    bool IsYours = false,
    string? AuthorAvatarUrl = null,
    CommentReplyViewModel? ReplyTo = null);

/// <summary>
/// Os comentarios de um relato, <b>em duas listas separadas</b>.
///
/// <para>Separadas ate aqui de proposito. Uma lista so, com um campo dizendo qual
/// e qual, devolveria o interno para qualquer lugar que esquecesse de filtrar — e
/// esquecer nao da erro nenhum, so uma linha a mais na resposta.</para>
/// </summary>
/// <param name="Internal">Os entre o time, do mais antigo para o mais novo.</param>
/// <param name="Public">Os para quem relatou, do mais antigo para o mais novo.</param>
/// <param name="HasOlderInternal">Ha comentarios entre o time mais antigos que os da lista.</param>
/// <param name="HasOlderPublic">Ha comentarios para quem relatou mais antigos que os da lista.</param>
public record ReportCommentsViewModel(
    IReadOnlyList<InternalCommentViewModel> Internal,
    IReadOnlyList<PublicCommentViewModel> Public,
    bool HasOlderInternal = false,
    bool HasOlderPublic = false);

/// <summary>
/// Os comentarios entre o time anteriores a uma mensagem, para o chat carregar ao subir.
/// </summary>
/// <param name="Items">Do mais antigo para o mais novo.</param>
/// <param name="HasOlder">Ha mais antigos que estes.</param>
public record InternalCommentsPageViewModel(
    IReadOnlyList<InternalCommentViewModel> Items,
    bool HasOlder);

/// <summary>
/// Os comentarios para quem relatou anteriores a uma mensagem, para o chat carregar ao subir.
/// </summary>
/// <param name="Items">Do mais antigo para o mais novo.</param>
/// <param name="HasOlder">Ha mais antigos que estes.</param>
public record PublicCommentsPageViewModel(
    IReadOnlyList<PublicCommentViewModel> Items,
    bool HasOlder);
