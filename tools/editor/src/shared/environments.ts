/**
 * Os ambientes da ferramenta. Cada um e um editor e uma pasta de arquivos.
 */

/**
 * A pasta de conteudo, dentro de `database-models/` — e o nome que a API usa na rota:
 * `/api/<collection>/...`.
 */
export type Collection = 'modeling'

/** O ambiente. O mesmo nome da pasta. */
export type EnvironmentId = 'modeling'

export type Environment = {
  id: EnvironmentId
  collection: Collection
}

export const ENVIRONMENTS: readonly Environment[] = [
  {
    id: 'modeling',
    collection: 'modeling',
  },
]

export const environmentById = (id: EnvironmentId): Environment =>
  ENVIRONMENTS.find((env) => env.id === id) ?? ENVIRONMENTS[0]!
