using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Os limites de <b>um</b> tipo de midia, neste projeto.
///
/// <para><b>Uma linha por tipo, e e esse o ponto.</b> O desenho obvio seria colunas
/// na configuracao — <c>image_max_count</c>, <c>video_max_bytes</c>, e assim por
/// diante. Ele custa uma migracao por tipo novo, e deixa toda linha carregando
/// campos de tipos que aquele projeto nunca ligou. Em linhas, o tipo novo e um
/// <c>INSERT</c>, e cada um leva so os limites que fazem sentido para ele.</para>
///
/// <para><b>Pendura na configuracao, e nao no projeto.</b> Sem a configuracao estes
/// limites nao querem dizer nada — e as duas nascem juntas, quando alguem salva
/// pela primeira vez.</para>
/// </summary>
public class ProjectMediaKind : PdsBaseEntity
{
    /// <summary>Teto do sistema para imagem, em bytes. Acima do que qualquer projeto escolhe.</summary>
    public const long ImageMaxBytesCeiling = 10L * 1024 * 1024;

    /// <summary>Teto do sistema para video, em bytes.</summary>
    public const long VideoMaxBytesCeiling = 50L * 1024 * 1024;

    /// <summary>Teto do sistema para a duracao do video, em segundos.</summary>
    public const int MaxDurationSecondsCeiling = 300;

    /// <summary>Teto do sistema para a quantidade de um mesmo tipo num relato.</summary>
    public const int MaxCountCeiling = 10;

    /// <summary>Configuracao dona da linha.</summary>
    public long ProjectMediaSettingsId { get; set; }
    public ProjectMediaSettings ProjectMediaSettings { get; set; } = null!;

    /// <summary>
    /// Que tipo esta linha configura. Unico por configuracao, entre os nao apagados.
    /// </summary>
    public MediaKindEnum Kind { get; set; }

    /// <summary>
    /// Este tipo e aceito.
    /// </summary>
    /// <remarks>
    /// <para><b>Desligar nao apaga os limites.</b> Eles ficam gravados, e religar
    /// devolve o que ja tinha sido pensado — apagar a linha faria quem desligou o
    /// video por um mes reconfigurar tudo ao voltar atras.</para>
    /// </remarks>
    public bool IsEnabled { get; set; }

    /// <summary>Quantos arquivos deste tipo cabem num relato.</summary>
    public int MaxCount { get; set; }

    /// <summary>
    /// Teto de tamanho de cada arquivo, em bytes.
    /// </summary>
    /// <remarks>
    /// <para><b>E este numero que viaja dentro da assinatura do envio</b>, e quem
    /// recusa o que passa e o proprio armazenamento. Nao ha outro lugar onde ele
    /// pudesse ser cobrado: no quadro nao vale, porque ele roda no navegador de
    /// quem relata; no servidor tambem nao, porque o arquivo nunca passa por la.</para>
    /// </remarks>
    public long MaxBytes { get; set; }

    /// <summary>
    /// Duracao maxima, em segundos. Nulo para o que nao tem duracao.
    /// </summary>
    /// <remarks>
    /// <para><b>E a protecao mais barata desta etapa</b>, porque vale duas vezes:
    /// corta armazenamento e corta exposicao. Sessenta segundos de tela mostram
    /// muito mais dado de terceiro que um print, que e um instante escolhido.</para>
    /// </remarks>
    public int? MaxDurationSeconds { get; set; }
}
