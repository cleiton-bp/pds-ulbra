/** Espelho de `Pds.Domain/Dtos/MediaSettingsDto.cs` e `ViewModels/MediaSettingsViewModels.cs`. */

/**
 * Que tipo de arquivo e este.
 *
 * Os valores sao os nomes do `MediaKindEnum` em C#: a API serializa enum como
 * texto em PascalCase.
 *
 * **A lista cresce com o produto.** Acrescentar audio um dia e acrescentar um
 * valor aqui e uma linha no banco — nao ha coluna por tipo em lugar nenhum.
 *
 * **`File` e o arquivo que nao e imagem** — o PDF, o log, a planilha —, dos formatos
 * que o dono marca, e sempre baixado.
 *
 * **`Video` so aparece em anexo antigo.** O video saiu do produto por pesar demais
 * no armazenamento e na entrega: nada novo entra, e a configuracao nao o lista.
 * Ele continua aqui porque os videos ja confirmados seguem na galeria, tocando.
 */
export type MediaKind = 'Image' | 'File' | 'Video'

/** Os tipos que ainda se podem enviar. Ver `MediaKind`. */
export const UPLOADABLE_MEDIA_KINDS: readonly MediaKind[] = ['Image', 'File']

/**
 * Um formato de arquivo do catalogo da API, para a tela de Midia marcar. O nome em
 * portugues de cada um e da tela; a lista, e a conferencia dos bytes, sao da API.
 */
export interface FileFormatViewModel {
  /** `pdf`, `text`, `spreadsheet`, `document`, `json`, `zip`. */
  Key: string
  /** Marcado de fabrica. */
  IsDefault: boolean
  /** As extensoes, com o ponto. */
  Extensions: string[]
}

/**
 * Os limites de um tipo de midia neste projeto.
 *
 * **Sem duracao.** A API ainda manda `MaxDurationSeconds`, sempre nulo, para a
 * tela aberta antes de o video sair nao quebrar; este lado nao le.
 */
export interface MediaKindLimitViewModel {
  Kind: MediaKind
  /** Este tipo e aceito. Desligar mantem os limites gravados. */
  IsEnabled: boolean
  MaxCount: number
  /** Teto de tamanho de cada arquivo, em **bytes**. */
  MaxBytes: number
  /**
   * Os formatos marcados, pelo nome no catalogo. So o arquivo tem; vazio na imagem.
   * Ausente na API de antes do arquivo.
   */
  Formats?: string[]
}

/**
 * O que este projeto aceita receber junto do relato.
 *
 * **Nunca vem vazio.** Projeto que nunca abriu a tela recebe os padroes, e a
 * resposta e indistinguivel da de quem salvou aqueles mesmos valores.
 */
export interface MediaSettingsViewModel {
  /**
   * Ha armazenamento configurado nesta instalacao.
   *
   * **Nao e configuracao do projeto**, e por isso vem separado: e o estado da
   * instalacao inteira. Falso, a tela trava o interruptor e diz por que — em
   * vez de deixar ligar uma coisa que falharia no envio, depois de a pessoa ja
   * ter escolhido o arquivo.
   */
  IsStorageAvailable: boolean
  /**
   * O quadro mostra anexo. **Sem armazenamento vem falso**, mesmo que o projeto
   * tenha ligado — o que foi salvo continua guardado do lado de la.
   */
  IsEnabled: boolean
  AllowsScreenCapture: boolean
  AllowsOnInfoRequest: boolean
  /** Da para anexar ao reabrir um relato encerrado. */
  AllowsOnReopen: boolean
  /**
   * Os limites de cada categoria — imagem e arquivo —, cada envio com os seus: a
   * criacao do relato, cada resposta e cada reabertura. Sem total por envio.
   */
  Kinds: MediaKindLimitViewModel[]
  /** O catalogo de formatos de arquivo, para marcar. */
  FileFormats: FileFormatViewModel[]
  /**
   * O antigo total por envio. **So a API de antes do arquivo manda**, e ela o exige ao
   * salvar: a tela devolve o que leu, para salvar continuar funcionando na janela da
   * troca. A API nova nao manda, e ignora.
   */
  MaxFilesPerReport?: number
}

/**
 * O que a tela manda ao salvar.
 *
 * **Vai inteira, e nao em pedacos.** Salvar campo a campo faria duas abas
 * abertas gravarem metades diferentes da mesma configuracao sem ninguem notar.
 */
export interface SaveMediaSettingsRequest {
  IsEnabled: boolean
  AllowsScreenCapture: boolean
  AllowsOnInfoRequest: boolean
  AllowsOnReopen: boolean
  Kinds: MediaKindLimitViewModel[]
  /** Ver `MediaSettingsViewModel.MaxFilesPerReport`: so para a API de antes. */
  MaxFilesPerReport?: number
}

/**
 * Um tipo aceito, como a ferramenta precisa ver.
 *
 * **Traz os tipos de arquivo, e nao so a categoria**: e o que deixa o seletor do
 * navegador ja filtrar o que nao serve.
 *
 * **Sem duracao.** A API ainda manda `MaxDurationSeconds`, sempre nulo, para o
 * quadro guardado no navegador antes de o video sair nao recusar todo print; este
 * lado nao le.
 */
export interface PublicMediaKindViewModel {
  Kind: MediaKind
  MaxCount: number
  /** Teto de cada arquivo, em **bytes**. */
  MaxBytes: number
  /** Os tipos aceitos. No arquivo, os dos formatos marcados. */
  ContentTypes: string[]
  /**
   * Cada extensao aceita, com o tipo que o envio declara para ela. **E pela extensao
   * que o arquivo e reconhecido**: o navegador deduz o tipo e erra de lugar para lugar
   * — o `.log` chega sem tipo, o `.csv` chega como planilha do Excel no Windows —, e a
   * API recusa extensao e tipo que nao casam. Ausente na API de antes do arquivo — ai
   * nenhum arquivo e aceito, e a imagem segue pelo tipo.
   */
  Types?: AcceptedTypeViewModel[]
}

/** Uma extensao aceita, e o tipo que o envio declara para ela. */
export interface AcceptedTypeViewModel {
  /** Com o ponto, em minusculas. */
  Extension: string
  ContentType: string
}

/**
 * O que a ferramenta pode oferecer de anexo.
 *
 * **So os tipos ligados aparecem**, e sem armazenamento na instalacao `IsEnabled`
 * vem falso mesmo que o projeto tenha ligado.
 */
export interface PublicMediaSettingsViewModel {
  IsEnabled: boolean
  AllowsScreenCapture: boolean
  AllowsOnInfoRequest: boolean
  /** Da para anexar ao reabrir. E o que a pagina de acompanhamento olha na reabertura. */
  AllowsOnReopen: boolean
  /** Os tipos aceitos, com os limites de cada um. Sem total por envio. */
  Kinds: PublicMediaKindViewModel[]
}
