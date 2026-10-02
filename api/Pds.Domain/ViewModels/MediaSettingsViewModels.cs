using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>Os limites de um tipo de midia neste projeto.</summary>
/// <param name="Kind">Imagem ou arquivo. O video saiu do produto, e nao aparece nem para o projeto que tinha limite gravado para ele.</param>
/// <param name="IsEnabled">Este tipo e aceito.</param>
/// <param name="MaxCount">Quantos arquivos deste tipo cabem em cada envio.</param>
/// <param name="MaxBytes">Teto de tamanho de cada arquivo, em bytes.</param>
/// <param name="MaxDurationSeconds">
/// Sempre nulo: so o video tinha duracao.
///
/// <para><b>Fica na resposta para nao quebrar a tela antiga.</b> Ela desenha o
/// campo de duracao quando este valor nao e nulo — e campo ausente, para ela, nao e
/// nulo: uma aba aberta antes da troca mostraria um campo de duracao quebrado na
/// imagem.</para>
/// </param>
/// <param name="Formats">Os formatos marcados, pelo nome no catalogo. So o arquivo tem; vazio na imagem.</param>
public record MediaKindLimitViewModel(
    MediaKindEnum Kind,
    bool IsEnabled,
    int MaxCount,
    long MaxBytes,
    int? MaxDurationSeconds,
    IReadOnlyList<string> Formats);

/// <summary>
/// Um formato do catalogo, para a tela de Midia desenhar a lista de marcar.
///
/// <para><b>O catalogo vem da API, e nao da tela.</b> E a API que confere os bytes de
/// cada formato; uma lista copiada na tela ficaria, um dia, oferecendo o que o envio
/// recusa. O nome de cada um em portugues e da tela.</para>
/// </summary>
/// <param name="Key">O nome do formato no contrato.</param>
/// <param name="IsDefault">Marcado de fabrica.</param>
/// <param name="Extensions">As extensoes, com o ponto.</param>
public record FileFormatViewModel(string Key, bool IsDefault, IReadOnlyList<string> Extensions);

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
/// da instalacao inteira, e e o que a tela precisa para travar o interruptor e
/// dizer por que em vez de deixar alguem ligar uma coisa que falharia no
/// envio.</para>
/// </param>
/// <param name="IsEnabled">
/// O quadro mostra anexo.
///
/// <para><b>Sem armazenamento nesta instalacao, vem falso</b>, mesmo que o projeto
/// tenha ligado: a tela nao mostra ligado o que a ferramenta nao oferece. O que foi
/// salvo continua guardado.</para>
/// </param>
/// <param name="AllowsScreenCapture">O botao de capturar a tela aparece. A captura vira imagem.</param>
/// <param name="AllowsOnInfoRequest">Da para anexar respondendo ao time.</param>
/// <param name="AllowsOnReopen">Da para anexar ao reabrir um relato encerrado.</param>
/// <param name="Kinds">
/// Os limites de cada tipo que o produto oferece — imagem e arquivo. Sem total por
/// envio: cada categoria tem a sua quantidade e o seu tamanho.
/// </param>
/// <param name="FileFormats">O catalogo de formatos de arquivo, para a tela marcar.</param>
public record MediaSettingsViewModel(
    bool IsStorageAvailable,
    bool IsEnabled,
    bool AllowsScreenCapture,
    bool AllowsOnInfoRequest,
    bool AllowsOnReopen,
    IReadOnlyList<MediaKindLimitViewModel> Kinds,
    IReadOnlyList<FileFormatViewModel> FileFormats);

/// <summary>
/// Um tipo aceito, como a ferramenta precisa ver.
///
/// <para><b>Traz os tipos de arquivo, e nao so o nome da categoria.</b> E o que
/// permite o seletor de arquivo do navegador ja filtrar o que nao serve — recusar
/// depois de a pessoa escolher e recusar tarde.</para>
/// </summary>
/// <param name="Kind">Imagem ou arquivo. O video saiu do produto.</param>
/// <param name="MaxCount">Quantos deste tipo cabem em cada envio.</param>
/// <param name="MaxBytes">Teto de tamanho de cada um.</param>
/// <param name="MaxDurationSeconds">
/// Sempre nulo: so o video tinha duracao.
///
/// <para><b>Fica na resposta para nao quebrar o quadro antigo.</b> Ele le a duracao
/// do arquivo quando este valor nao e nulo — e campo ausente, para ele, nao e nulo.
/// Um quadro guardado no navegador antes da troca tentaria ler uma imagem como
/// video, e recusaria todo print.</para>
/// </param>
/// <param name="ContentTypes">Os tipos de arquivo aceitos nesta categoria. No arquivo, os dos formatos marcados.</param>
/// <param name="Types">
/// Cada extensao aceita, com o tipo que o envio deve declarar para ela. <b>E pela
/// extensao que o arquivo e reconhecido</b>: o navegador deduz o tipo e erra de lugar
/// para lugar — o <c>.log</c> chega sem tipo, o <c>.csv</c> chega como planilha do
/// Excel no Windows —, e o pedido de permissao recusa extensao e tipo que nao casam.
/// Na imagem, as do PNG, JPEG e WebP.
/// </param>
public record PublicMediaKindViewModel(
    MediaKindEnum Kind,
    int MaxCount,
    long MaxBytes,
    int? MaxDurationSeconds,
    IReadOnlyList<string> ContentTypes,
    IReadOnlyList<AcceptedTypeViewModel> Types);

/// <summary>Uma extensao aceita, e o tipo que o envio declara para ela.</summary>
/// <param name="Extension">Com o ponto, em minusculas.</param>
/// <param name="ContentType">O tipo do catalogo, e nao o que o navegador deduzir.</param>
public record AcceptedTypeViewModel(string Extension, string ContentType);

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
/// <param name="AllowsScreenCapture">O botao de capturar a tela aparece. A captura vira imagem.</param>
/// <param name="AllowsOnInfoRequest">Da para anexar respondendo ao time.</param>
/// <param name="AllowsOnReopen">Da para anexar ao reabrir um relato encerrado.</param>
/// <param name="Kinds">Os tipos aceitos, com os limites de cada um. Sem total por envio: cada categoria tem o seu.</param>
public record PublicMediaSettingsViewModel(
    bool IsEnabled,
    bool AllowsScreenCapture,
    bool AllowsOnInfoRequest,
    bool AllowsOnReopen,
    IReadOnlyList<PublicMediaKindViewModel> Kinds);
