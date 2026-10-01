using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// O pedido de permissao para gravar um arquivo.
///
/// <para><b>O protocolo e o token vem junto, e nao sao formalidade.</b> Sao eles que
/// dizem de quem e o relato — assinar permissao para quem nao tem relato nenhum
/// seria assinar para qualquer um, e essa e a unica rota publica do sistema que
/// gera custo em dinheiro.</para>
///
/// <para><b>O arquivo vai com um envio, e o envio tem hora.</b> Sao tres: a criacao
/// do relato (nenhuma bandeira), a resposta ao time (<see cref="ForReply"/>) e a
/// reabertura (<see cref="ForReopen"/>). Cada um aceita arquivo nos 15 minutos
/// seguintes, e cada um tem a sua cota.</para>
///
/// <para><b>Sem duracao.</b> Ela so existia para o video, que saiu do produto. O
/// quadro antigo que ainda mande <c>DurationSeconds</c> nao quebra: campo que o
/// contrato nao conhece e ignorado na leitura.</para>
/// </summary>
public class RequestAttachmentUploadDto
{
    /// <summary>O protocolo do relato.</summary>
    /// <example>7K2M-9QXP-4TRV</example>
    public string? TrackingCode { get; set; }

    /// <summary>O token que saiu junto do protocolo, na criacao.</summary>
    public string? Token { get; set; }

    /// <summary>
    /// De que tipo e o arquivo: <c>Image</c>, ou <c>File</c> — o que nao e imagem, dos
    /// formatos que o projeto marcou, reconhecido pela extensao de <see cref="FileName"/>.
    ///
    /// <para><c>Video</c> e recusado com 409: saiu do produto por pesar demais no
    /// armazenamento e na entrega.</para>
    /// </summary>
    /// <example>Image</example>
    public MediaKindEnum? Kind { get; set; }

    /// <summary>O tipo do arquivo, que vai entrar na assinatura.</summary>
    /// <example>image/png</example>
    public string? ContentType { get; set; }

    /// <summary>
    /// Tamanho que o navegador diz ter o arquivo.
    ///
    /// <para><b>Serve para recusar cedo, e nao para gravar.</b> O que fica gravado e
    /// o que o armazenamento contar na confirmacao — este numero vem de fora.</para>
    /// </summary>
    /// <example>524288</example>
    public long? SizeBytes { get; set; }

    /// <summary>Nome do arquivo na maquina de quem relata. Guardado para o time, nunca mostrado fora.</summary>
    /// <example>erro-no-pagamento.png</example>
    public string? FileName { get; set; }

    /// <summary>
    /// Ha miniatura para enviar junto.
    ///
    /// <para>Ela e feita no proprio navegador antes do envio, e por isso precisa de
    /// permissao propria — vai para outro endereco, e e outro arquivo.</para>
    /// </summary>
    /// <example>true</example>
    public bool? WithThumbnail { get; set; }

    /// <summary>
    /// O formato da miniatura: <c>image/webp</c>, o padrao quando nao vem, ou
    /// <c>image/jpeg</c>.
    ///
    /// <para><b>JPEG e para o navegador que nao gera WebP</b> — o Safari, inclusive o do
    /// iPhone. Sem ele, quem relata por la mandaria o arquivo sem miniatura, e o time
    /// veria so a palavra "imagem" na lista.</para>
    ///
    /// <para>O formato entra na assinatura, e a confirmacao confere os bytes contra
    /// ele: miniatura que diz ser JPEG e nao e e descartada, e o arquivo vale sem
    /// ela.</para>
    /// </summary>
    /// <example>image/webp</example>
    public string? ThumbnailContentType { get; set; }

    /// <summary>
    /// Em que tamanho a imagem aparece logo abaixo do texto: <c>Small</c> (um terco da
    /// linha), <c>Medium</c> (meia), <c>Large</c> (tres quartos) ou <c>Full</c> (a linha
    /// inteira).
    ///
    /// <para><b>Sem ele, a linha inteira</b> — e o do quadro de antes deste campo, que
    /// nao o conhece. Valor fora da lista e recusado com 400.</para>
    /// </summary>
    /// <example>Medium</example>
    public AttachmentDisplaySizeEnum? DisplaySize { get; set; }

    /// <summary>
    /// A posicao no envio, a partir de zero, <b>dentro da categoria</b>: as imagens de 0
    /// em diante, e os arquivos tambem — a ordem em que a pessoa os montou.
    ///
    /// <para><b>A lista do relato sai nessa ordem</b>, e nao na de chegada — o arquivo
    /// que falhou e foi tentado de novo chega depois dos outros, e voltaria para o fim.
    /// Sem ele, zero, e a hora de chegada desempata. Vai de 0 a 9 (o teto de quantos de
    /// um tipo cabem num envio, menos um); fora disso, 400.</para>
    /// </summary>
    /// <example>0</example>
    public int? DisplayOrder { get; set; }

    /// <summary>
    /// O arquivo vai junto da <b>resposta</b> que a pessoa acabou de mandar, e nao da
    /// criacao do relato.
    ///
    /// <para><b>Nao diz qual resposta, e e de proposito.</b> O servidor prende o
    /// arquivo a resposta mais recente de quem relatou, se ela for dos ultimos 15
    /// minutos. Aceitar um identificador vindo de fora obrigaria a conferir de quem
    /// ele e — e cada conferencia a mais e uma chance de esquecer uma.</para>
    ///
    /// <para>Sem ele e sem <see cref="ForReopen"/>, o arquivo vai com a criacao do
    /// relato. Nos tres casos a permissao so sai nos 15 minutos depois do envio, e
    /// cada permissao tem 1 hora para ser confirmada.</para>
    /// </summary>
    /// <example>false</example>
    public bool? ForReply { get; set; }

    /// <summary>
    /// O arquivo vai junto da <b>reabertura</b> que a pessoa acabou de fazer — o print
    /// do que ainda esta acontecendo.
    ///
    /// <para><b>Nao diz qual reabertura</b>, pelo mesmo motivo de
    /// <see cref="ForReply"/>: o servidor prende o arquivo a reabertura mais recente
    /// deste relato, se ela for dos ultimos 15 minutos.</para>
    ///
    /// <para>Junto de <see cref="ForReply"/> e recusado com 400: um arquivo vai com um
    /// envio so.</para>
    /// </summary>
    /// <example>false</example>
    public bool? ForReopen { get; set; }
}

/// <summary>
/// O aviso de que o arquivo chegou ao armazenamento.
///
/// <para><b>Sem ele o anexo nao existe para o produto.</b> E aqui que a nossa API
/// le os primeiros bytes, confere que sao do tipo declarado, e prende o anexo ao
/// relato — a assinatura do envio garante o rotulo, nunca o conteudo.</para>
/// </summary>
public class ConfirmAttachmentDto
{
    /// <summary>O protocolo do relato.</summary>
    /// <example>7K2M-9QXP-4TRV</example>
    public string? TrackingCode { get; set; }

    /// <summary>O token que saiu junto do protocolo, na criacao.</summary>
    public string? Token { get; set; }

    /// <summary>O identificador que veio junto da permissao.</summary>
    public Guid? AttachmentPublicId { get; set; }
}
