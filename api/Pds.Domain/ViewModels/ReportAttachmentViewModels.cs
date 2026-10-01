using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Um formulario assinado, pronto para o navegador enviar.
///
/// <para><b>Nao e um endereco solto, e a diferenca e o teto de tamanho.</b> Um
/// endereco assinado para gravar diz o que gravar e onde, e nao diz de que tamanho:
/// quem o obtivesse gravaria um arquivo de qualquer tamanho por ele. Os campos
/// daqui carregam as regras assinadas, e o armazenamento recusa o que nao couber
/// antes de gravar.</para>
/// </summary>
/// <param name="Url">Para onde o formulario e enviado.</param>
/// <param name="Fields">Campos que acompanham o arquivo. Vao todos, e na ordem, antes do arquivo.</param>
/// <param name="MaxBytes">Teto que o armazenamento vai cobrar.</param>
public record SignedUploadViewModel(
    string Url,
    IReadOnlyDictionary<string, string> Fields,
    long MaxBytes);

/// <summary>
/// A permissao para enviar um anexo, e o identificador com que ele sera confirmado.
/// </summary>
/// <param name="PublicId">O anexo. Volta na confirmacao.</param>
/// <param name="File">O formulario do arquivo.</param>
/// <param name="Thumbnail">O formulario da miniatura, quando ha uma.</param>
/// <param name="ExpiresAt">Quando as permissoes deixam de valer, em UTC.</param>
public record AttachmentUploadTicketViewModel(
    Guid PublicId,
    SignedUploadViewModel File,
    SignedUploadViewModel? Thumbnail,
    DateTime ExpiresAt);

/// <summary>
/// O anexo, depois de a nossa API ter conferido os bytes e prendido ao relato.
///
/// <para><b>Sem duracao.</b> So o video tinha, e video nao e mais confirmado. Nenhum
/// quadro le esta resposta alem de saber que deu certo, entao o campo saiu sem
/// deixar ninguem para tras.</para>
/// </summary>
/// <param name="PublicId">Identificador do anexo.</param>
/// <param name="Kind">O tipo confirmado: imagem ou arquivo.</param>
/// <param name="SizeBytes">Tamanho real, contado pelo armazenamento.</param>
public record ConfirmedAttachmentViewModel(
    Guid PublicId,
    MediaKindEnum Kind,
    long SizeBytes);

/// <summary>
/// Um anexo como o time ve, no painel.
///
/// <para><b>Os enderecos nascem nesta resposta e morrem em minutos.</b> Nenhum deles
/// esta guardado em lugar nenhum; pedir de novo gera outros. <c>ExpiresAt</c> e o
/// que a tela usa para pedir antes de a imagem quebrar.</para>
///
/// <para><b>O nome original so aparece aqui.</b> O time precisa dele para entender o
/// que chegou; do lado de fora ele nunca sai, porque nome de arquivo conta pasta,
/// cliente e numero de contrato que a imagem nao conta.</para>
/// </summary>
/// <param name="PublicId">Identificador do anexo.</param>
/// <param name="Kind">Imagem ou arquivo — ou video, nos anexos confirmados antes de o video sair do produto.</param>
/// <param name="DisplaySize">
/// Em que tamanho a imagem aparece logo abaixo do texto — a escolha de quem relatou. A
/// lista ja vem na ordem em que ela montou cada envio.
/// </param>
/// <param name="ContentType">
/// O tipo gravado — o do catalogo, conferido pelos bytes. E por ele que a tela sabe
/// dizer "PDF" ou "planilha" do arquivo que nao e imagem.
/// </param>
/// <param name="Url">Endereco assinado do arquivo. No arquivo que nao e imagem, so baixa, com o nome original.</param>
/// <param name="ThumbnailUrl">Endereco assinado da miniatura, quando ha.</param>
/// <param name="ExpiresAt">
/// Quando o primeiro endereco deste anexo deixa de servir — o do arquivo ou o da
/// miniatura —, em UTC. E antes dele que a tela pede a lista de novo.
/// </param>
/// <param name="SizeBytes">Tamanho real.</param>
/// <param name="DurationSeconds">Duracao, quando ha. So os videos antigos tem.</param>
/// <param name="OriginalName">O nome que o arquivo tinha na maquina de quem relatou.</param>
/// <param name="CameWithReply">Veio numa resposta ao pedido de informacao, e nao na criacao.</param>
/// <param name="ReplyPublicId">A fala da conversa em que o arquivo veio, para a tela o mostrar logo abaixo dela.</param>
/// <param name="CameWithReopen">Veio numa reabertura, e nao na criacao.</param>
/// <param name="ReopenPublicId">
/// A reabertura em que o arquivo veio — o identificador do fechamento reaberto, o
/// mesmo de <c>Reopenings</c> no relato —, para a tela o mostrar junto do motivo.
/// </param>
/// <param name="CreatedAt">Quando entrou.</param>
public record PanelAttachmentViewModel(
    Guid PublicId,
    MediaKindEnum Kind,
    AttachmentDisplaySizeEnum DisplaySize,
    string ContentType,
    string Url,
    string? ThumbnailUrl,
    DateTime ExpiresAt,
    long SizeBytes,
    int? DurationSeconds,
    string? OriginalName,
    bool CameWithReply,
    Guid? ReplyPublicId,
    bool CameWithReopen,
    Guid? ReopenPublicId,
    DateTime CreatedAt);

/// <summary>
/// Um anexo como quem relatou ve, na pagina de acompanhamento.
///
/// <para><b>E outro tipo, e nao o do painel com um campo a menos.</b> Com um tipo so,
/// o campo acrescentado amanha ao do painel sairia aqui sem ninguem decidir — e
/// vazamento por serializacao nao da erro em teste nenhum. O nome original, que o
/// painel mostra, nem existe neste tipo.</para>
/// </summary>
/// <param name="PublicId">Identificador do anexo.</param>
/// <param name="Kind">Imagem ou arquivo — ou video, nos anexos confirmados antes de o video sair do produto.</param>
/// <param name="DisplaySize">
/// Em que tamanho a imagem aparece logo abaixo do texto — a escolha de quem relatou. A
/// lista ja vem na ordem em que ela montou cada envio.
/// </param>
/// <param name="ContentType">O tipo gravado, conferido pelos bytes. E por ele que a tela diz "PDF" ou "planilha".</param>
/// <param name="SizeBytes">Tamanho real, contado pelo armazenamento — para a pessoa saber o que vai baixar.</param>
/// <param name="Url">Endereco assinado do arquivo. No arquivo que nao e imagem, so baixa, com um nome generico — o original nunca sai.</param>
/// <param name="ThumbnailUrl">Endereco assinado da miniatura, quando ha.</param>
/// <param name="ExpiresAt">
/// Quando o primeiro endereco deste anexo deixa de servir — o do arquivo ou o da
/// miniatura —, em UTC. E antes dele que a tela pede a lista de novo.
/// </param>
/// <param name="DurationSeconds">Duracao, quando ha. So os videos antigos tem.</param>
/// <param name="ReplyPublicId">A fala da conversa em que o arquivo veio, quando veio numa resposta.</param>
/// <param name="ReopenPublicId">A reabertura em que o arquivo veio, quando veio numa — o mesmo identificador de <c>Reopenings</c> no relato.</param>
/// <param name="CreatedAt">Quando entrou.</param>
public record PublicAttachmentViewModel(
    Guid PublicId,
    MediaKindEnum Kind,
    AttachmentDisplaySizeEnum DisplaySize,
    string ContentType,
    long SizeBytes,
    string Url,
    string? ThumbnailUrl,
    DateTime ExpiresAt,
    int? DurationSeconds,
    Guid? ReplyPublicId,
    Guid? ReopenPublicId,
    DateTime CreatedAt);
