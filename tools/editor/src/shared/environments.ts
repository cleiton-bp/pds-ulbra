/**
 * Os ambientes da ferramenta. Cada um e um editor e uma pasta de arquivos.
 *
 * Mora num lugar so porque tres partes precisam dele e nao podem discordar: a
 * tela de inicio (o que oferecer), o roteamento (qual endereco abre qual editor)
 * e a API (qual pasta ler).
 */

/**
 * A pasta de conteudo, dentro de `database-models/` — e o nome que a API usa na rota:
 * `/api/<collection>/...`.
 */
export type Collection = 'modeling' | 'use-cases'

/** O ambiente no endereco: `#/modeling/…`, `#/use-cases/…`. O mesmo nome da pasta. */
export type EnvironmentId = 'modeling' | 'use-cases'

export type Environment = {
  id: EnvironmentId
  collection: Collection
  /** O nome na tela: titulo da aba do navegador, cartao do inicio, aba do editor. */
  title: string
  /** O que o ambiente responde, numa frase — aparece no cartao do inicio. */
  summary: string
  /** Tecla que abre o ambiente a partir do inicio. */
  key: string
}

export const ENVIRONMENTS: readonly Environment[] = [
  {
    id: 'modeling',
    collection: 'modeling',
    title: 'Modelagem',
    summary: 'As tabelas, os campos e as relações do banco — uma modelagem por etapa.',
    key: '1',
  },
  {
    id: 'use-cases',
    collection: 'use-cases',
    title: 'Casos de uso',
    summary: 'Quem usa o sistema e o que cada ator pode fazer.',
    key: '2',
  },
]

export const environmentById = (id: EnvironmentId): Environment =>
  ENVIRONMENTS.find((env) => env.id === id) ?? ENVIRONMENTS[0]!

export const isEnvironmentId = (value: string): value is EnvironmentId =>
  ENVIRONMENTS.some((env) => env.id === value)
