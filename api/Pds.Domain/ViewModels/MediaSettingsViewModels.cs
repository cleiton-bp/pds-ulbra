using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>Os limites de um tipo de midia neste projeto.</summary>
/// <param name="Kind">Imagem ou video.</param>
/// <param name="IsEnabled">Este tipo e aceito.</param>
/// <param name="MaxCount">Quantos arquivos deste tipo cabem num relato.</param>
/// <param name="MaxBytes">Teto de tamanho de cada arquivo, em bytes.</param>
/// <param name="MaxDurationSeconds">Duracao maxima, nula para o que nao tem duracao.</param>
public record MediaKindLimitViewModel(
    MediaKindEnum Kind,
    bool IsEnabled,
    int MaxCount,
    long MaxBytes,
    int? MaxDurationSeconds);

/// <summary>
/// O que este projeto aceita receber junto do relato.
///
/// <para><b>Nunca vem vazia.</b> Projeto que nunca abriu a tela recebe os padroes, e
/// a resposta e indistinguivel da de quem salvou aqueles mesmos valores — quem le
/// nao precisa saber se existe linha no banco, precisa saber como o projeto se
/// comporta.</para>
/// </summary>
/// <param name="IsStorageAvailable">
/// Ha armazenamento configurado nesta instalacao.
///
/// <para><b>Nao e configuracao do projeto, e por isso vem separado.</b> E o estado
/// da instalacao inteira, e e o que a tela precisa para desligar o interruptor e
/// dizer por que em vez de deixar alguem ligar uma coisa que falharia no
/// envio.</para>
/// </param>
/// <param name="IsEnabled">O quadro mostra anexo.</param>
/// <param name="AllowsScreenCapture">O botao de capturar a tela aparece.</param>
/// <param name="AllowsOnInfoRequest">Da para anexar respondendo ao time.</param>
/// <param name="MaxFilesPerReport">Teto de arquivos por relato, somando os tipos.</param>
/// <param name="Kinds">Os limites de cada tipo.</param>
public record MediaSettingsViewModel(
    bool IsStorageAvailable,
    bool IsEnabled,
    bool AllowsScreenCapture,
    bool AllowsOnInfoRequest,
    int MaxFilesPerReport,
    IReadOnlyList<MediaKindLimitViewModel> Kinds);

/// <summary>
/// Um tipo aceito, como a ferramenta precisa ver.
///
/// <para><b>Traz os tipos de arquivo, e nao so o nome da categoria.</b> E o que
/// permite o seletor de arquivo do navegador ja filtrar o que nao serve — recusar
/// depois de a pessoa escolher e recusar tarde.</para>
/// </summary>
/// <param name="Kind">Imagem ou video.</param>
/// <param name="MaxCount">Quantos deste tipo cabem num relato.</param>
/// <param name="MaxBytes">Teto de tamanho de cada um.</param>
/// <param name="MaxDurationSeconds">Duracao maxima, quando ha.</param>
/// <param name="ContentTypes">Os tipos de arquivo aceitos nesta categoria.</param>
public record PublicMediaKindViewModel(
    MediaKindEnum Kind,
    int MaxCount,
    long MaxBytes,
    int? MaxDurationSeconds,
    IReadOnlyList<string> ContentTypes);

/// <summary>
/// O que a ferramenta precisa saber para mostrar — ou nao mostrar — o anexo.
///
/// <para><b>So os tipos ligados aparecem.</b> A ferramenta nao tem o que fazer com
/// um tipo que o projeto recusa, e listar o que nao serve so daria a quem
/// inspeciona um mapa do que existe do outro lado.</para>
///
/// <para><b>Sem armazenamento nesta instalacao, isto vem desligado</b>, mesmo que o
/// projeto tenha o anexo ligado na configuracao dele. O botao existir e o envio
/// falhar seria pior do que o botao nao existir.</para>
/// </summary>
/// <param name="IsEnabled">A ferramenta mostra anexo.</param>
/// <param name="AllowsScreenCapture">O botao de capturar a tela aparece.</param>
/// <param name="AllowsOnInfoRequest">Da para anexar respondendo ao time.</param>
/// <param name="MaxFilesPerReport">Teto de arquivos por relato, somando os tipos.</param>
/// <param name="Kinds">Os tipos aceitos, com os limites de cada um.</param>
public record PublicMediaSettingsViewModel(
    bool IsEnabled,
    bool AllowsScreenCapture,
    bool AllowsOnInfoRequest,
    int MaxFilesPerReport,
    IReadOnlyList<PublicMediaKindViewModel> Kinds);
