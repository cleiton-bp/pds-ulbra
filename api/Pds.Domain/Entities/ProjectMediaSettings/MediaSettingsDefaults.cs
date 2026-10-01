using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O que vale quando ninguem configurou nada.
///
/// <para><b>Projeto novo tem de andar sem ninguem abrir esta tela.</b> A
/// configuracao existe para quem quer outra coisa, e nao para quem precisa
/// comecar.</para>
///
/// <para><b>Moram em codigo, e nao como valor padrao de coluna.</b> Assim existem
/// num lugar so — com o padrao no banco, mudar de ideia deixaria as linhas antigas
/// com o valor velho e as novas com o novo, e nenhuma delas saberia disso.</para>
///
/// <para><b>Aqui o padrao tambem precisa ser barato.</b> Esta e a primeira parte do
/// produto que custa dinheiro por byte guardado, e cada numero destes e uma conta
/// que alguem paga.</para>
/// </summary>
public static class MediaSettingsDefaults
{
    /// <summary>
    /// Anexo ligado.
    ///
    /// <para>Diferente do padrao da identificacao, que e o mais fechado: ali a
    /// escolha e coletar dado pessoal, e aqui e receber um print que quem relata
    /// escolheu mandar. Sem armazenamento configurado isto nao liga, entao o caminho de quem
    /// nunca quis midia continua sendo simplesmente nao configurar.</para>
    /// </summary>
    public const bool IsEnabled = true;

    /// <summary>
    /// Captura de tela ligada.
    ///
    /// <para>Onde o navegador nao souber fazer, o botao some sozinho — entao ligado
    /// de fabrica nao promete nada que nao possa ser cumprido.</para>
    /// </summary>
    public const bool AllowsScreenCapture = true;

    /// <summary>
    /// Anexo na resposta ao time, ligado.
    ///
    /// <para>E onde o print mais serve, e desligado de fabrica faria o caso mais
    /// util do anexo depender de alguem descobrir uma tela.</para>
    /// </summary>
    public const bool AllowsOnInfoRequest = true;

    /// <summary>
    /// Anexo ao reabrir, ligado.
    ///
    /// <para>Quem reabre esta dizendo que o problema continua, e o print do que
    /// continua e o que poupa a volta seguinte do time. Desligado de fabrica, a
    /// reabertura chegaria so com texto a quem mais precisa ver.</para>
    /// </summary>
    public const bool AllowsOnReopen = true;

    /// <summary>
    /// Quatro arquivos por envio, no total.
    ///
    /// <para>Cobre "a tela do erro, o que eu fiz antes, o que apareceu depois", com
    /// folga de um.</para>
    ///
    /// <para><b>Com so imagem, de fabrica quem segura e o limite dela</b>, que e
    /// menor: os dois valem juntos e vence o menor. Este total so passa a pesar
    /// quando o projeto sobe o limite da imagem.</para>
    /// </summary>
    public const int MaxFilesPerReport = 4;

    /// <summary>Tres imagens de ate 5 MB. Print de celular moderno passa de 3 MB.</summary>
    public static readonly (int Count, long Bytes) Image = (3, 5L * 1024 * 1024);

    /// <summary>
    /// Como o projeto se comporta, com a linha gravada ou sem ela.
    ///
    /// <para><b>E o unico lugar onde o padrao e aplicado.</b> A tela do painel e a
    /// rota que assina o envio chamam esta funcao — resolver o padrao em dois
    /// lugares faria, um dia, a tela mostrar um limite e o servidor cobrar
    /// outro.</para>
    ///
    /// <para><b>Os tipos saem da lista de fabrica, e nao das linhas gravadas.</b> E
    /// isso que faz a linha de video de um projeto antigo ficar no banco sem valer
    /// nada: o painel nao a mostra, a ferramenta nao a oferece, e o pedido de
    /// permissao nao acha limite para ela.</para>
    /// </summary>
    public static EffectiveMediaSettings Resolve(ProjectMediaSettings? settings)
        => new(
            settings?.IsEnabled ?? IsEnabled,
            settings?.AllowsScreenCapture ?? AllowsScreenCapture,
            settings?.AllowsOnInfoRequest ?? AllowsOnInfoRequest,
            settings?.AllowsOnReopen ?? AllowsOnReopen,
            settings?.MaxFilesPerReport ?? MaxFilesPerReport,
            BuildKinds()
                .Select(padrao =>
                {
                    var gravado = settings?.Kinds.FirstOrDefault(kind => kind.Kind == padrao.Kind);

                    return new EffectiveMediaKind(
                        padrao.Kind,
                        gravado?.IsEnabled ?? padrao.IsEnabled,
                        gravado?.MaxCount ?? padrao.MaxCount,
                        gravado?.MaxBytes ?? padrao.MaxBytes);
                })
                .ToList());

    /// <summary>
    /// Os tipos que o produto oferece, com o padrao de cada um.
    ///
    /// <para>Monta a configuracao inteira de um projeto novo — e quando um tipo novo
    /// entrar no produto, e aqui que ele nasce ligado ou desligado de fabrica.</para>
    ///
    /// <para><b>So imagem.</b> O video saiu do produto por pesar demais no
    /// armazenamento e na entrega, e saiu daqui junto: tipo fora desta lista nao
    /// existe para a configuracao, mesmo com linha gravada.</para>
    /// </summary>
    public static List<ProjectMediaKind> BuildKinds() =>
    [
        new()
        {
            Kind = MediaKindEnum.Image,
            IsEnabled = true,
            MaxCount = Image.Count,
            MaxBytes = Image.Bytes,
        },
    ];
}
