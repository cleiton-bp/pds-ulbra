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
  /** Onde o relato esta na fila; **nulo** quando o projeto nao tinha coluna ativa quando ele chegou. */
  StatePublicId: string | null
  /** O nome da coluna **agora**: renomear a coluna muda o que a lista mostra. */
  StateName: string | null
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

/**
 * A consulta do acompanhamento, feita pela pagina publica.
 *
 * Os dois campos vao juntos, e a recusa da API e a mesma para qualquer um dos
 * dois errado: quem sonda a rota nao descobre se um protocolo existe.
 */
export interface OpenReportTrackingRequest {
  TrackingCode: string
  /** O que veio no link, e o unico dos dois que abre alguma coisa. */
  Token: string
}

/**
 * O relato como quem o escreveu o ve.
 *
 * **Nao estende `ReportSummaryViewModel`**, e a diferenca e o ponto: este e o
 * unico contrato que chega a alguem fora do time do cliente, e por heranca o
 * campo que a etapa 3 acrescentar ao painel — comentario, responsavel — passaria
 * a sair aqui sem ninguem decidir isso.
 *
 * Nao ha campo de situacao porque nao ha situacao: estado interno e a etapa 3.
 */
export interface PublicReportViewModel {
  TrackingCode: string
  Type: ReportType
  Text: string
  CreatedAt: string
}

/**
 * Quantos relatos ha em cada coluna da fila.
 *
 * Vem uma linha por coluna do projeto, **inclusive as vazias** — a coluna com zero
 * precisa aparecer no filtro, senao ela some da tela no dia em que o ultimo relato
 * dela e movido.
 *
 * A linha com `StatePublicId` nulo sao os que ainda nao tem lugar na fila, e ela
 * so vem quando existe algum.
 */
export interface ReportStateCountViewModel {
  StatePublicId: string | null
  StateName: string | null
  /** Falso quando a coluna foi aposentada. Sempre verdadeiro na linha sem coluna. */
  IsActive: boolean
  Total: number
}

/** O valor que a rota aceita no lugar de um identificador, para pedir os sem coluna. */
export const WITHOUT_STATE_FILTER = 'none'

/** Para onde o relato vai na fila. */
export interface MoveReportRequest {
  StatePublicId: string
}

/**
 * Um comentario que fica entre o time.
 *
 * E um tipo separado do publico, e nao o mesmo com um campo dizendo qual e qual:
 * uma lista so devolveria o interno para qualquer lugar que esquecesse de
 * filtrar, e esquecer nao da erro nenhum.
 */
export interface InternalCommentViewModel {
  PublicId: string
  AuthorName: string
  Body: string
  CreatedAt: string
}

/** Um comentario escrito para quem relatou. Ainda nao tem leitor. */
export interface PublicCommentViewModel {
  PublicId: string
  AuthorName: string
  Body: string
  CreatedAt: string
}

/** Os comentarios de um relato, em **duas listas separadas**. */
export interface ReportCommentsViewModel {
  Internal: InternalCommentViewModel[]
  Public: PublicCommentViewModel[]
}

export interface CreateCommentRequest {
  Body: string
}

/** Limite dos dois textos. Separados na API de proposito, iguais hoje. */
export const MAX_COMMENT_LENGTH = 5000

/** O que aconteceu, nos nomes do `EventTypeEnum` em C#. */
export type ReportEventType =
  | 'ReportCreated'
  | 'ReportViewed'
  | 'ReportStateChanged'
  | 'ReportInternalCommented'
  | 'ReportPublicCommented'

/**
 * Uma linha do historico.
 *
 * Os nomes das colunas sao **os que valiam na epoca**, guardados no evento —
 * buscar o nome atual faria uma coluna renomeada reescrever o passado.
 */
export interface ReportHistoryEntryViewModel {
  PublicId: string
  Type: ReportEventType
  AuthorName: string | null
  FromStateName: string | null
  ToStateName: string | null
  OccurredAt: string
}
