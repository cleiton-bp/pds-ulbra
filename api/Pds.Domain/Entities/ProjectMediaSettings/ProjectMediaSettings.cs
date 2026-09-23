namespace Pds.Domain.Entities;

/// <summary>
/// O que este projeto aceita receber junto do relato.
///
/// <para><b>Uma linha por projeto, criada so quando alguem salva.</b> O mesmo molde
/// de <see cref="ProjectWidgetSettings"/>, <see cref="ProjectCycleSettings"/> e
/// <see cref="ProjectIdentitySettings"/>: os padroes vivem em codigo, e projeto sem
/// linha aqui e projeto que nunca precisou mudar nada — e le exatamente o mesmo
/// comportamento de quem salvou os padroes.</para>
///
/// <para><b>Esta configuracao vem antes do quadro saber anexar, e nao depois.</b> E
/// ela que diz o que existe: desligada, o quadro nao mostra nada de midia, e nenhum
/// outro campo desta linha importa. E a unica trava que a etapa constroi de
/// proposito.</para>
///
/// <para><b>Nenhum limite de tipo mora aqui.</b> Eles estao em
/// <see cref="ProjectMediaKind"/>, uma linha por tipo — e e esse desenho que faz
/// acrescentar audio um dia ser dado, e nao migracao.</para>
/// </summary>
public class ProjectMediaSettings : PdsBaseEntity
{
    /// <summary>Teto do sistema para arquivos por relato, acima do que qualquer projeto escolhe.</summary>
    public const int MaxFilesPerReportCeiling = 10;

    /// <summary>Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// O quadro mostra anexo.
    /// </summary>
    /// <remarks>
    /// <para><b>Desligado, nada mais nesta linha vale.</b> Nao adianta ter tipo
    /// ligado nem limite configurado: o botao nao aparece, e o servidor recusa
    /// assinar permissao nenhuma.</para>
    ///
    /// <para><b>Sem armazenamento configurado, isto nao liga.</b> A tela recusa e
    /// diz por que — oferecer o botao e falhar no envio seria pior do que nao
    /// oferecer.</para>
    /// </remarks>
    public bool IsEnabled { get; set; }

    /// <summary>
    /// O botao de capturar a tela aparece.
    /// </summary>
    /// <remarks>
    /// <para><b>Nao e a captura automatica</b>, que continua impossivel: codigo
    /// dentro de um quadro de outra origem nao alcanca a pagina que o hospeda. Aqui
    /// e o navegador que pergunta qual tela ou janela, e quem decide o que aparece
    /// e quem relata.</para>
    ///
    /// <para>Ligado nao garante que o botao apareca: onde o navegador nao souber
    /// fazer — e o iOS nao sabe —, ele some sozinho, e anexar arquivo continua.</para>
    /// </remarks>
    public bool AllowsScreenCapture { get; set; }

    /// <summary>
    /// Da para anexar respondendo a um pedido de informacao do time.
    /// </summary>
    /// <remarks>
    /// <para><b>E onde o print mais serve</b>: o time olhou o relato, nao entendeu,
    /// e pediu a tela. Fica numa chave propria porque ha projeto que quer anexo na
    /// criacao e nao quer na conversa.</para>
    /// </remarks>
    public bool AllowsOnInfoRequest { get; set; }

    /// <summary>
    /// Quantos arquivos cabem num relato, somando todos os tipos.
    /// </summary>
    /// <remarks>
    /// <para><b>Existe alem do limite de cada tipo, e nao no lugar dele.</b> So com
    /// o limite por tipo, tres imagens mais um video passariam mesmo num projeto que
    /// so queria dois arquivos no total — a soma nao tem quem a segure.</para>
    /// </remarks>
    public int MaxFilesPerReport { get; set; }

    /// <summary>Os limites de cada tipo, uma linha por tipo.</summary>
    public ICollection<ProjectMediaKind> Kinds { get; set; } = [];
}
