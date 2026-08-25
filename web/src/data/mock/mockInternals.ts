import type { ProjectKeyType, ProjectKeyViewModel, ProjectViewModel } from '@/contracts'
import { PanelError } from '@/data/errors'
import type { MockDatabase, MockProject, MockProjectKey } from '@/data/mock/mockDatabase'
import { getToken } from '@/data/sessionToken'

/**
 * O que os tres servicos mocados dividem. A regra e uma so: **imitar a API,
 * inclusive quando ela recusa** — mesmos status e as mesmas mensagens de
 * `Pds.Service/Services/`, sem acento, copiadas ao pe da letra. Mock mais
 * permissivo passa na demonstracao e quebra na integracao.
 */

/** Sem latencia, os estados de carregamento nunca aparecem durante o desenvolvimento. */
export function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 200))
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Toda rota autenticada passa por aqui, como o `[Authorize]` da API. */
export function requireSession(): void {
  if (!getToken()) throw new PanelError('Sessao nao identificada.', 401)
}

export function requireProject(database: MockDatabase, publicId: string): MockProject {
  const project = database.read().projects.find((item) => item.publicId === publicId)

  // Projeto de outra conta responde igual: dizer "existe, mas nao e seu" ja conta
  // que existe.
  if (!project) throw new PanelError('Projeto nao encontrado.', 404)

  return project
}

/** Linha de `project_keys`. A secreta entra sempre sem valor, como no banco. */
export function newKeyRow(
  projectPublicId: string,
  type: ProjectKeyType,
  key: { value: string; prefix: string },
  createdAt: string,
): MockProjectKey {
  return {
    publicId: crypto.randomUUID(),
    projectPublicId,
    type,
    value: type === 'Public' ? key.value : null,
    prefix: key.prefix,
    createdAt,
    revokedAt: null,
    lastUsedAt: null,
  }
}

export function toProjectViewModel(project: MockProject): ProjectViewModel {
  return {
    PublicId: project.publicId,
    Name: project.name,
    Status: project.status,
    CreatedAt: project.createdAt,
    UpdatedAt: project.updatedAt,
  }
}

export function toKeyViewModel(key: MockProjectKey): ProjectKeyViewModel {
  return {
    PublicId: key.publicId,
    Type: key.type,
    // A secreta sai sem valor porque o "banco" nao tem o valor dela.
    Value: key.type === 'Public' ? key.value : null,
    Prefix: key.prefix,
    IsActive: key.revokedAt === null,
    CreatedAt: key.createdAt,
    RevokedAt: key.revokedAt,
    LastUsedAt: key.lastUsedAt,
  }
}
