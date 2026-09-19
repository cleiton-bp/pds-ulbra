/** Espelho de `Pds.Domain/Dtos/CycleSettingsDto.cs` e `ViewModels/CycleSettingsViewModels.cs`. */

/**
 * Por qual gesto o painel oferece o encerramento.
 *
 * Os valores sao os nomes do `ClosureTriggerEnum` em C#: a API serializa enum
 * como texto em PascalCase. O que aparece na tela e outra coisa, e mora junto do
 * formulario.
 */
export type ClosureTrigger = 'LastColumn' | 'Button'

/** Como a escala de 1 a 5 aparece para quem relatou. Muda o desenho, nao o dado. */
export type SatisfactionStyle = 'Stars' | 'Number'

/**
 * As regras do ciclo de um projeto.
 *
 * **Nunca vem vazia.** Projeto que nunca abriu a tela recebe os padroes, e a
 * resposta e indistinguivel da de quem salvou aqueles mesmos valores: quem le
 * precisa saber como o ciclo se comporta, e nao se existe linha no banco.
 *
 * **A maior parte destes campos ainda nao tem leitor.** Eles chegam nos passos
 * seguintes da etapa, e viajam desde agora porque a configuracao e salva inteira
 * — uma tela que mandasse so o que sabe apagaria o resto.
 */
export interface CycleSettingsViewModel {
  ClosureTrigger: ClosureTrigger
  /** Quanto o lado publico espera antes de mudar, em minutos. Zero e sem espera. */
  PublicDelayMinutes: number
  AllowsReopen: boolean
  /** Coluna de destino da reabertura. **Nulo e uma escolha**: quer dizer "a primeira ativa". */
  ReopenStatePublicId: string | null
  ReopenRequiresComment: boolean
  /** Se o protocolo sozinho confirma e reabre, ou se as duas acoes exigem o link. */
  TrackingCodeCanAct: boolean
  SatisfactionEnabled: boolean
  SatisfactionStyle: SatisfactionStyle
  SatisfactionRequired: boolean
  InfoRequestEnabled: boolean
  InfoRequestWarnDays: number
  InfoRequestCloseDays: number
  /** Como a caixa de aceitar duvidas vem marcada. A escolha final e de quem relata. */
  AcceptsQuestionsDefault: boolean
}

/**
 * O corpo do salvamento tem a mesma forma da leitura, e isso e deliberado: a tela
 * manda de volta o que recebeu, com o campo que mudou trocado. **Substitui, e nao
 * altera campo a campo** — `ReopenStatePublicId: null` e um valor, e num corpo
 * parcial seria indistinguivel de "nao mexa".
 */
export type SaveCycleSettingsRequest = CycleSettingsViewModel

/** Teto da espera, declarado em `ProjectCycleSettings.MaxPublicDelayMinutes`: uma semana. */
export const MAX_PUBLIC_DELAY_MINUTES = 7 * 24 * 60

/** Teto de cada prazo do pedido de informacao, em dias. */
export const MAX_INFO_REQUEST_DAYS = 365
