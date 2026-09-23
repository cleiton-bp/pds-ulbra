/** Espelho de `Pds.Domain/Dtos/MediaSettingsDto.cs` e `ViewModels/MediaSettingsViewModels.cs`. */

/**
 * Que tipo de arquivo e este.
 *
 * Os valores sao os nomes do `MediaKindEnum` em C#: a API serializa enum como
 * texto em PascalCase.
 *
 * **A lista cresce com o produto.** Acrescentar audio um dia e acrescentar um
 * valor aqui e uma linha no banco — nao ha coluna por tipo em lugar nenhum.
 */
export type MediaKind = 'Image' | 'Video'

/** Os limites de um tipo de midia neste projeto. */
export interface MediaKindLimitViewModel {
  Kind: MediaKind
  /** Este tipo e aceito. Desligar mantem os limites gravados. */
  IsEnabled: boolean
  MaxCount: number
  /** Teto de tamanho de cada arquivo, em **bytes**. */
  MaxBytes: number
  /** Nulo para o que nao tem duracao. */
  MaxDurationSeconds: number | null
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
   * instalacao inteira. Falso, a tela desliga o interruptor e diz por que — em
   * vez de deixar ligar uma coisa que falharia no envio, depois de a pessoa ja
   * ter escolhido o arquivo.
   */
  IsStorageAvailable: boolean
  IsEnabled: boolean
  AllowsScreenCapture: boolean
  AllowsOnInfoRequest: boolean
  /** Teto de arquivos por relato, somando todos os tipos. */
  MaxFilesPerReport: number
  Kinds: MediaKindLimitViewModel[]
}

/**
 * O que a tela manda ao salvar.
 *
 * **Vai inteira, e nao em pedacos.** Salvar campo a campo faria duas abas
 * abertas gravarem metades diferentes da mesma configuracao sem ninguem notar — e
 * o limite total e o de cada tipo so fazem sentido lidos juntos.
 */
export interface SaveMediaSettingsRequest {
  IsEnabled: boolean
  AllowsScreenCapture: boolean
  AllowsOnInfoRequest: boolean
  MaxFilesPerReport: number
  Kinds: MediaKindLimitViewModel[]
}

/**
 * Um tipo aceito, como a ferramenta precisa ver.
 *
 * **Traz os tipos de arquivo, e nao so a categoria**: e o que deixa o seletor do
 * navegador ja filtrar o que nao serve.
 */
export interface PublicMediaKindViewModel {
  Kind: MediaKind
  MaxCount: number
  /** Teto de cada arquivo, em **bytes**. */
  MaxBytes: number
  MaxDurationSeconds: number | null
  ContentTypes: string[]
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
  MaxFilesPerReport: number
  Kinds: PublicMediaKindViewModel[]
}
