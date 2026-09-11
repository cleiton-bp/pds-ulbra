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
