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
 * **Os campos viajam juntos** porque a configuracao e salva inteira — uma tela que
 * mandasse so o que sabe apagaria o resto.
 */
export interface CycleSettingsViewModel {
  ClosureTrigger: ClosureTrigger
  /** Quanto o lado publico espera antes de mudar, em minutos. Zero e sem espera. */
  PublicDelayMinutes: number
  AllowsReopen: boolean
  /** Coluna de destino da reabertura. **Nulo e uma escolha**: quer dizer "a primeira ativa". */
  ReopenStatePublicId: string | null
  ReopenRequiresComment: boolean
  /**
   * Se o codigo pessoal sozinho confirma e reabre, ou se as duas acoes exigem o link.
   * Fica gravado e a API o ignora enquanto essas acoes so aceitarem o token do link.
   */
  TrackingCodeCanAct: boolean
  SatisfactionEnabled: boolean
  SatisfactionStyle: SatisfactionStyle
  SatisfactionRequired: boolean
  InfoRequestEnabled: boolean
  InfoRequestWarnDays: number
  InfoRequestCloseDays: number
  /** Como a caixa de aceitar duvidas vem marcada. A escolha final e de quem relata. */
  AcceptsQuestionsDefault: boolean
  /**
   * Se o time pode arquivar relato. Desligado de fabrica. Arquivar o relato aberto
   * encerra junto, com desfecho e motivo — quem relatou le e pode reabrir ou
   * finalizar.
   */
  AllowsReportArchiving: boolean
  /**
   * Quantos dias a ultima coluna do quadro mostra: o card que entrou nela ha mais
   * tempo continua na lista. **Zero mostra todos.** De fabrica 14, como nos quadros
   * Kanban.
   */
  LastColumnVisibleDays: number
  /**
   * Faltando ate quantos dias o prazo do card fica em destaque. **Zero: so no
   * proprio dia.** O vencido e sempre vencido. De fabrica 2.
   */
  DueSoonDays: number
  /**
   * Se o time trabalha em sprints: o backlog aparece, o quadro mostra so a sprint em
   * andamento, e o card ganha pontos. Desligado de fabrica; desligar nao apaga nada.
   */
  SprintsEnabled: boolean
  /** A duracao com que cada sprint nasce, em semanas: de 1 a 4. De fabrica 2. */
  SprintLengthWeeks: number
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

/** Teto dos dias que a ultima coluna do quadro mostra, declarado em `ProjectCycleSettings.MaxLastColumnVisibleDays`. */
export const MAX_LAST_COLUMN_VISIBLE_DAYS = 365

/** Teto do destaque do prazo, em dias, declarado em `ProjectCycleSettings.MaxDueSoonDays`. */
export const MAX_DUE_SOON_DAYS = 30

/** A duracao padrao da sprint, em semanas, declarada em `ProjectCycleSettings`. */
export const MIN_SPRINT_LENGTH_WEEKS = 1
export const MAX_SPRINT_LENGTH_WEEKS = 4
