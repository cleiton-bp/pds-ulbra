using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O registro de um arquivo que veio com o relato.
///
/// <para><b>O arquivo nao esta aqui, e nunca vai estar.</b> O que a linha guarda e
/// o nome dele no armazenamento — o bastante para pedir uma permissao de leitura
/// quando alguem que pode ver aparecer. Guardar bytes no banco faria cada consulta
/// arrastar megabytes, e faria o backup do banco crescer com o que ja esta
/// guardado noutro lugar.</para>
///
/// <para><b>Ela nunca guarda um endereco assinado.</b> Guardado, ele vira um link
/// permanente com outro nome, e a validade curta deixa de significar qualquer
/// coisa. O endereco nasce na hora em que alguem pede, e morre em minutos.</para>
///
/// <para><b>O relato vem antes do arquivo, e isso e o desenho.</b> O anexo so pode
/// ser pedido por quem ja tem o protocolo e o token de um relato — o que faz cada
/// passo do envio atravessar a nossa API, onde moram a autorizacao, o limite do
/// projeto e o limite de tentativas. Assinar permissao para quem ainda nao tem
/// relato nenhum seria assinar para qualquer um.</para>
/// </summary>
public class ReportAttachment : PdsBaseEntity
{
    /// <summary>Tamanho maximo do nome original guardado.</summary>
    public const int MaxOriginalNameLength = 200;

    /// <summary>Tamanho maximo do nome do objeto no armazenamento.</summary>
    public const int MaxObjectKeyLength = 200;

    /// <summary>Tamanho maximo do tipo declarado.</summary>
    public const int MaxContentTypeLength = 100;

    /// <summary>
    /// Relato a que o anexo pertence.
    ///
    /// <para><b>Obrigatorio mesmo quando o anexo veio numa resposta</b>, para achar
    /// o relato ser sempre um salto so — e para o isolamento por conta nao depender
    /// de passar por uma coluna que pode ser nula.</para>
    /// </summary>
    public long ReportId { get; set; }
    public Report Report { get; set; } = null!;

    /// <summary>
    /// Preenchido quando o anexo veio junto de uma resposta ao pedido de informacao.
    /// Nulo na criacao e na reabertura.
    /// </summary>
    public long? PublicCommentId { get; set; }
    public ReportPublicComment? PublicComment { get; set; }

    /// <summary>
    /// Preenchido quando o anexo veio junto de uma reabertura: o fechamento que quem
    /// relatou reabriu. Nulo na criacao e na resposta.
    ///
    /// <para><b>Coluna propria, e nao uma conta feita na hora de ler.</b> Deduzir
    /// pela data — o anexo que entrou logo depois de uma reabertura e dela —
    /// faria cada leitura refazer a conta, e a cota da reabertura virar uma busca
    /// por intervalo. Com a coluna, a cota e um filtro, e a tela sabe onde mostrar o
    /// arquivo sem adivinhar.</para>
    ///
    /// <para><b>Aponta para o fechamento, e nao para um comentario.</b> Reabrir nao
    /// escreve na conversa — encerramento nao e conversa —, e o motivo pode ficar em
    /// branco quando o projeto nao o pede. O fechamento reaberto sempre existe, e e
    /// nele que o motivo mora.</para>
    ///
    /// <para>Nunca junto de <see cref="PublicCommentId"/>: um arquivo vai com um envio
    /// so, e o banco trava isso.</para>
    /// </summary>
    public long? ReopenedClosureId { get; set; }
    public ReportClosure? ReopenedClosure { get; set; }

    /// <summary>
    /// Imagem ou arquivo — ou video, nos anexos antigos. E ele que diz qual limite do
    /// projeto se aplica.
    ///
    /// <para>Anexo novo e imagem ou arquivo: o video saiu do produto. Os videos
    /// confirmados antes disso continuam aqui, e continuam tocando.</para>
    /// </summary>
    public MediaKindEnum Kind { get; set; }

    /// <summary>Em que ponto do envio este anexo esta.</summary>
    public AttachmentStatusEnum Status { get; set; }

    /// <summary>
    /// O nome do arquivo no armazenamento.
    ///
    /// <para><b>Sorteado por nos, e nunca derivado do nome que veio de fora.</b> Um
    /// nome escolhido por quem envia permitiria escrever por cima do arquivo de
    /// outra pessoa, ou sair do lugar onde os arquivos deste projeto moram.</para>
    /// </summary>
    public string ObjectKey { get; set; } = string.Empty;

    /// <summary>
    /// A miniatura, gerada no proprio navegador antes do envio. Nos videos antigos,
    /// e o quadro de capa.
    ///
    /// <para><b>Vem de fora, entao ela tambem e conferida.</b> Miniatura e imagem
    /// como qualquer outra, e aceita-la sem olhar seria abrir pelo lado de tras a
    /// porta que o arquivo principal tem fechada.</para>
    /// </summary>
    public string? ThumbnailObjectKey { get; set; }

    /// <summary>
    /// O tipo declarado, que entrou na assinatura do envio.
    ///
    /// <para><b>Ele garante o rotulo, e nao o conteudo.</b> A assinatura impede
    /// gravar um objeto marcado como outra coisa; ela nao consegue ler o que esta
    /// dentro. Quem confere os bytes e a confirmacao, na nossa API.</para>
    /// </summary>
    public string ContentType { get; set; } = string.Empty;

    /// <summary>
    /// Tamanho do que o armazenamento aceitou.
    ///
    /// <para><b>Lido do armazenamento na confirmacao, e nao do que o navegador
    /// disse.</b> O numero que vem de fora serve para recusar cedo; o que fica
    /// gravado precisa ser o real, porque e ele que a cobranca um dia vai somar.</para>
    /// </summary>
    public long SizeBytes { get; set; }

    /// <summary>
    /// Duracao, so para o que tem duracao.
    ///
    /// <para>So video tinha, e video nao entra mais: anexo novo grava nulo. Fica
    /// pelos videos que ja estavam guardados, que o painel ainda lista com a
    /// duracao.</para>
    /// </summary>
    public int? DurationSeconds { get; set; }

    /// <summary>
    /// O nome que o arquivo tinha na maquina de quem relata.
    ///
    /// <para><b>Guardado para o time, e nunca mostrado do lado de fora.</b> Nome de
    /// arquivo conta coisa que a imagem nao conta — pasta, cliente, numero de
    /// contrato —, e num relato publico isso vazaria sem ninguem ter olhado.</para>
    /// </summary>
    public string? OriginalName { get; set; }

    /// <summary>Quando a nossa API prendeu o anexo ao relato. Nulo enquanto pendente.</summary>
    public DateTime? ConfirmedAt { get; set; }

    /// <summary>
    /// Em que tamanho a imagem aparece, logo abaixo do texto do envio que a trouxe.
    /// Escolha de quem relata, gravada com o anexo — ver
    /// <see cref="AttachmentDisplaySizeEnum"/>.
    /// </summary>
    public AttachmentDisplaySizeEnum DisplaySize { get; set; } = DefaultDisplaySize;

    /// <summary>
    /// A posicao no envio, a partir de zero, dentro da categoria — a ordem em que a
    /// pessoa montou as imagens, e a dos arquivos, cada uma no seu bloco.
    ///
    /// <para><b>Guardada, e nao deduzida da hora de chegada.</b> Os arquivos sobem um
    /// de cada vez, e o que falhou e foi tentado de novo chega depois dos outros: pela
    /// hora, ele pularia para o fim, e duas imagens pequenas que estavam lado a lado
    /// trocariam de lugar.</para>
    ///
    /// <para><b>Vale dentro de um envio</b> — a criacao, uma resposta, uma reabertura —,
    /// que e onde a tela mostra as imagens juntas. Anexo de antes desta coluna fica com
    /// zero, e a hora de chegada desempata como sempre desempatou.</para>
    /// </summary>
    public int DisplayOrder { get; set; }

    /// <summary>
    /// O tamanho de quem nao escolheu: o quadro de antes desta coluna, e os anexos que
    /// ja estavam guardados. A linha inteira — ver <see cref="AttachmentDisplaySizeEnum.Full"/>.
    /// </summary>
    public const AttachmentDisplaySizeEnum DefaultDisplaySize = AttachmentDisplaySizeEnum.Full;
}
