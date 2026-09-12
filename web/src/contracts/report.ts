/** Espelho de `Pds.Domain/Dtos/ReportDto.cs` e `ViewModels/ReportViewModels.cs`. */

/**
 * O que a pessoa esta relatando.
 *
 * Os valores sao os nomes do `ReportTypeEnum` em C#, e nao rotulos: a API
 * serializa enum como texto em PascalCase (`Pds.Shared/Json/PdsJsonOptions.cs`).
 * O que aparece na tela e outra coisa, e mora junto do formulario.
 */
export type ReportType = 'Bug' | 'Improvement' | 'Question'

/**
 * Um relato saindo da ferramenta embutida no site do cliente.
 *
 * Nao ha sessao nesta requisicao: quem diz de qual projeto o relato e, e so, a
 * `Key`. Ela nao autentica ninguem — apenas enderece o relato.
 */
export interface CreateReportRequest {
  /** Chave publica do projeto, a mesma que esta no `data-key` do script. */
  Key: string
  Type: ReportType
  Text: string
  /**
   * Caminho da pagina de onde o relato foi aberto. A API descarta o que vier
   * depois do `?` ou do `#` antes de gravar, mas quem envia ja manda so o
   * caminho: dado que nao sai da maquina nao precisa de confianca no servidor.
   */
  Route: string | null
  /**
   * Dominio da pagina que embutiu a ferramenta, declarado por ela mesma. A API
   * guarda como veio e **nunca** trata como prova de origem.
   */
  Origin: string | null
  /** O que veio junto sem ninguem digitar: navegador, tamanho da tela. */
  Context: Record<string, string> | null
}

/**
 * O relato recem-criado, como a ferramenta o mostra a quem acabou de escrever.
 * Sai daqui o minimo: nem identificador de projeto, nem de conta.
 */
export interface CreatedReportViewModel {
  /** O protocolo, para anotar e repetir. */
  TrackingCode: string
  /**
   * O que abre o acompanhamento. Vem **uma unica vez**: o banco fica so com o
   * hash, e nenhuma rota consegue revela-lo de novo.
   */
  AccessToken: string
  CreatedAt: string
}

/** Limite da coluna `text`, declarado em `Report.MaxTextLength`. */
export const MAX_REPORT_TEXT_LENGTH = 5000

/**
 * Um relato na lista do painel.
 *
 * O `Text` vem inteiro, e nao cortado: quem corta para caber na linha e a tela.
 * Se a API cortasse, ler o resto exigiria uma rota que ainda nao existe.
 */
export interface ReportSummaryViewModel {
  PublicId: string
  /** O protocolo, o mesmo que a pessoa que relatou anotou. */
  TrackingCode: string
  Type: ReportType
  Text: string
  /** So o caminho da pagina: a API descarta query e fragmento antes de gravar. */
  Route: string | null
  /** Dominio informado pela pagina hospedeira. Indicio, nunca prova de origem. */
  Origin: string | null
  CreatedAt: string
}

/** Um par do contexto que veio junto com o relato, sem ninguem digitar. */
export interface ReportContextViewModel {
  /** Nome do dado, em ingles e snake_case: `user_agent`, `viewport_width`. */
  Key: string
  Value: string | null
}

/**
 * Um relato aberto. O contexto so vem aqui porque e a resposta a uma pergunta que
 * so nasce depois de ler o relato — "em que navegador isso aconteceu?".
 */
export interface ReportDetailViewModel extends ReportSummaryViewModel {
  /** Em ordem de chave, decidida pela API. */
  Contexts: ReportContextViewModel[]
}
