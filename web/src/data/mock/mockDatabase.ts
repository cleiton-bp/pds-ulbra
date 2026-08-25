/**
 * O "banco" do mock. Clona na entrada e na saida para a tela nao conseguir
 * alterar o estado por referencia — mock que compartilha objeto funciona no mock
 * e quebra na integracao.
 *
 * A chave secreta nao existe aqui: so prefixo, igual ao PostgreSQL, que so tem o
 * hash. `localStorage` existe para a demonstracao sobreviver a um F5.
 */

import type { ProjectKeyType, ProjectStatus } from '@/contracts'
import { demoAccount, demoUser } from '@/data/mock/seed'

/** Versionada: mudar o formato do estado invalida o que estava salvo. */
const STORAGE_KEY = 'pds.web.mock.v2'

export interface MockProject {
  publicId: string
  name: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

export interface MockProjectKey {
  publicId: string
  projectPublicId: string
  type: ProjectKeyType
  /** So a publica tem valor. Na secreta e sempre `null`, como no banco. */
  value: string | null
  prefix: string
  createdAt: string
  revokedAt: string | null
  lastUsedAt: string | null
}

interface MockState {
  account: typeof demoAccount
  user: typeof demoUser
  projects: MockProject[]
  keys: MockProjectKey[]
}

function initialState(): MockState {
  return {
    account: structuredClone(demoAccount),
    user: structuredClone(demoUser),
    projects: [],
    keys: [],
  }
}

export class MockDatabase {
  private state: MockState

  /** `persist: false` nos testes: cada caso comeca limpo. */
  constructor(private readonly persist = true) {
    this.state = (persist && this.load()) || initialState()
  }

  read(): MockState {
    return structuredClone(this.state)
  }

  write(mutate: (state: MockState) => void): void {
    const next = structuredClone(this.state)
    mutate(next)
    this.state = next
    this.save()
  }

  reset(): void {
    this.state = initialState()
    this.save()
  }

  /** Nulo em Node (testes) e em navegador com armazenamento bloqueado. */
  private storage(): Storage | null {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  }

  private load(): MockState | null {
    const raw = this.storage()?.getItem(STORAGE_KEY)
    if (!raw) return null

    try {
      return JSON.parse(raw) as MockState
    } catch {
      // Formato antigo ou corrompido: recomeca, em vez de derrubar o painel.
      return null
    }
  }

  private save(): void {
    if (this.persist) this.storage()?.setItem(STORAGE_KEY, JSON.stringify(this.state))
  }
}
