/** Espelho de `Pds.Domain/ViewModels/ProjectOriginViewModels.cs`. */

/**
 * Endereco autorizado a abrir a ferramenta de relato.
 *
 * `Domain` chega **normalizado** pela API: minusculo, sem esquema, sem barra
 * final. A porta faz parte quando informada, porque para o navegador `site.com` e
 * `site.com:3000` sao origens diferentes.
 */
export interface ProjectOriginViewModel {
  PublicId: string
  Domain: string
  /** Vale tambem para o que estiver abaixo do dominio, como `app.site.com`. */
  AllowsSubdomains: boolean
  CreatedAt: string
}

/** Limite da coluna `domain`: os 253 do nome de dominio mais a porta. */
export const MAX_ORIGIN_DOMAIN_LENGTH = 260

export interface CreateProjectOriginRequest {
  Domain: string
  AllowsSubdomains: boolean
}

/**
 * Como o projeto trata hoje um endereco que ja mandou relatos. Espelho de
 * `ObservedOriginStatusEnum`.
 *
 * `Unlisted` e "nem autorizado nem bloqueado": com a lista de autorizados vazia ele
 * passa, e com ela preenchida ele e recusado — a tela diz qual, lendo a lista.
 */
export type ObservedOriginStatus = 'Unlisted' | 'Allowed' | 'Blocked'

/** Um endereco que ja mandou relatos. Espelho de `ObservedOriginViewModel`. */
export interface ObservedOriginViewModel {
  /** Em minusculo, na forma em que as listas comparam. */
  Domain: string
  /** Quantos relatos vieram de la, os arquivados inclusive. */
  ReportCount: number
  LastReportAt: string
  Status: ObservedOriginStatus
  /** Com o endereco bloqueado, quantos relatos dele estao marcados. Zero fora do bloqueio. */
  MarkedCount: number
  /** A linha de bloqueio que vale para ele; nula fora do bloqueio. */
  BlockedOriginId: string | null
}

/** Endereco bloqueado. Espelho de `ProjectBlockedOriginViewModel`. */
export interface ProjectBlockedOriginViewModel {
  PublicId: string
  Domain: string
  /** Barra tambem o que estiver abaixo do dominio, como `app.site.com`. */
  IncludesSubdomains: boolean
  BlockedAt: string
  /** Quem bloqueou; nulo quando a conta da pessoa foi esvaziada. */
  BlockedByName: string | null
  /** Relatos vindos de la ainda marcados — os que ninguem manteve nem apagou. */
  MarkedCount: number
}

export interface CreateProjectBlockedOriginRequest {
  Domain: string
  IncludesSubdomains: boolean
}

/** Teto de enderecos bloqueados por projeto, o mesmo da API. */
export const MAX_BLOCKED_ORIGINS = 100

/**
 * Os relatos retidos de um endereco, em "Aguardando liberacao": chegaram de fora da
 * lista de autorizados, e o time ainda nao os viu.
 */
export interface HeldOriginViewModel {
  /** O endereco; nulo para os relatos que nao disseram de onde vieram. */
  Domain: string | null
  ReportCount: number
  /** Quando chegou o mais novo. */
  LastReportAt: string
}

/** Os retidos de um endereco exato, ou os sem endereco (`Domain` nulo). */
export interface HeldOriginReportsRequest {
  Domain: string | null
}

/** Quantos relatos retidos foram liberados, ou apagados. */
export interface HeldOriginReportsResultViewModel {
  Reports: number
}
