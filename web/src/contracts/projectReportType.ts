import type { CardColor, ReportTypeIcon } from '@/contracts/report'

/** Espelho de `Pds.Domain/ViewModels/ProjectReportTypeViewModels.cs` e do DTO dele. */

/**
 * Um tipo de relato do projeto — "Defeito", "Melhoria", "Dúvida", ou o que o time
 * tiver criado. Chega na ordem da ferramenta, com os desativados no lugar deles: e a
 * mesma lista que a reordenacao reescreve.
 *
 * **O tipo diz como o formulario pergunta**: ate quatro perguntas curtas, a caixa
 * livre com o texto dela, ou os dois — e nunca nada. E diz em que coluna o relato
 * entra.
 */
export interface ProjectReportTypeViewModel {
  PublicId: string
  Name: string
  Color: CardColor
  Icon: ReportTypeIcon
  /** A ordem na tela e na ferramenta, contada a partir de zero. */
  Position: number
  /** Falso quando foi desativado: continua nos relatos que o tem, e sai da ferramenta. */
  IsActive: boolean
  /** As perguntas curtas do formulario, na ordem. Vazia quando o tipo so tem a caixa. */
  Questions: string[]
  ShowsTextBox: boolean
  /**
   * O texto cinza dentro da caixa livre. Pode vir mesmo com a caixa escondida:
   * fica guardado para quando ela voltar.
   */
  TextBoxPrompt: string | null
  /** A coluna em que o relato deste tipo entra; **nula** e a primeira coluna ativa. */
  InitialStatePublicId: string | null
  CreatedAt: string
}

/** Teto do nome, o mesmo da prioridade: vira etiqueta no card e botao na ferramenta. */
export const MAX_REPORT_TYPE_NAME_LENGTH = 40

/**
 * Quantos tipos **ativos** cabem num projeto. Os tipos viram botoes lado a lado num
 * quadro de 360 pixels: passar disso deixa de ser escolha e vira lista para ler.
 */
export const MAX_ACTIVE_REPORT_TYPES = 10

/** Quantas perguntas um tipo faz: quatro respostas curtas ainda cabem no quadro sem rolar. */
export const MAX_REPORT_TYPE_QUESTIONS = 4

/** Teto de cada pergunta: e uma pergunta, e nao uma instrucao. */
export const MAX_REPORT_TYPE_QUESTION_LENGTH = 120

/** Teto do texto dentro da caixa livre. */
export const MAX_TEXT_BOX_PROMPT_LENGTH = 160

/**
 * Teto de cada resposta, e da caixa livre quando ela vem junto de perguntas. A caixa
 * sozinha continua com o teto do relato inteiro (`MAX_REPORT_TEXT_LENGTH`).
 */
export const MAX_REPORT_ANSWER_LENGTH = 1000

/**
 * O tipo inteiro, como a tela o grava — na criacao e na edicao.
 *
 * **Substitui, e nao altera campo a campo**: `InitialStatePublicId` nulo e um valor
 * (a primeira coluna ativa), e num corpo parcial seria indistinguivel de "nao mexa".
 */
export interface SaveProjectReportTypeRequest {
  Name: string
  Color: CardColor
  Icon: ReportTypeIcon
  /** De 0 a 4, sem repetir. A pergunta em branco a API descarta. */
  Questions: string[]
  /** Sem perguntas, tem de ser verdadeiro: o tipo sempre pede alguma coisa. */
  ShowsTextBox: boolean
  /** Obrigatorio com a caixa aparecendo; com ela escondida, guardado para quando voltar. */
  TextBoxPrompt: string | null
  InitialStatePublicId: string | null
}

/** Todos os tipos do projeto, inclusive os desativados, uma vez cada. */
export interface ReorderProjectReportTypesRequest {
  Order: string[]
}
