import type { ProjectCreatedViewModel, ProjectViewModel, UpdateProjectRequest } from '@/contracts'
import { PanelError } from '@/data/errors'
import { demoDatabase } from '@/data/mock/demoDatabase'
import { generatePublicKey, generateSecretKey } from '@/data/mock/keyGenerator'
import type { MockDatabase, MockProject } from '@/data/mock/mockDatabase'
import {
  delay,
  newKeyRow,
  nowIso,
  requireProject,
  requireSession,
  toKeyViewModel,
  toProjectViewModel,
} from '@/data/mock/mockInternals'
import type { ProjectService } from '@/data/projectService'

export function createMockProjectService(database: MockDatabase): ProjectService {
  function requireValidName(name: string, ignorePublicId?: string): string {
    const trimmed = name.trim()
    if (!trimmed) throw new PanelError('O nome do projeto e obrigatorio.', 400)

    const taken = database
      .read()
      .projects.some(
        (item) =>
          item.publicId !== ignorePublicId && item.name.toLowerCase() === trimmed.toLowerCase(),
      )
    if (taken) throw new PanelError('Ja existe um projeto com este nome na conta.', 409)

    return trimmed
  }

  return {
    async listProjects(): Promise<ProjectViewModel[]> {
      await delay()
      requireSession()

      return database
        .read()
        .projects.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(toProjectViewModel)
    },

    async getProject(publicId: string): Promise<ProjectViewModel> {
      await delay()
      requireSession()

      return toProjectViewModel(requireProject(database, publicId))
    },

    async createProject(name: string): Promise<ProjectCreatedViewModel> {
      await delay()
      requireSession()

      const timestamp = nowIso()
      const project: MockProject = {
        publicId: crypto.randomUUID(),
        name: requireValidName(name),
        status: 'Active',
        createdAt: timestamp,
        updatedAt: timestamp,
      }

      const publicKey = generatePublicKey()
      const secretKey = generateSecretKey()
      const publicRow = newKeyRow(project.publicId, 'Public', publicKey, timestamp)
      // O valor da secreta nao entra no "banco": sai na resposta e acabou.
      const secretRow = newKeyRow(project.publicId, 'Secret', secretKey, timestamp)

      // Uma escrita so: ou entram o projeto e as duas chaves, ou nao entra nada.
      database.write((state) => {
        state.projects.push(project)
        state.keys.push(publicRow, secretRow)
      })

      return {
        Project: toProjectViewModel(project),
        PublicKey: toKeyViewModel(publicRow),
        SecretKey: {
          PublicId: secretRow.publicId,
          Value: secretKey.value,
          Prefix: secretRow.prefix,
          CreatedAt: secretRow.createdAt,
        },
      }
    },

    async updateProject(publicId: string, patch: UpdateProjectRequest): Promise<ProjectViewModel> {
      await delay()
      requireSession()
      requireProject(database, publicId)

      const name = patch.Name === undefined ? undefined : requireValidName(patch.Name, publicId)

      database.write((state) => {
        const project = state.projects.find((item) => item.publicId === publicId)
        if (!project) return

        if (name !== undefined) project.name = name
        if (patch.Status !== undefined) project.status = patch.Status
        project.updatedAt = nowIso()
      })

      return toProjectViewModel(requireProject(database, publicId))
    },
  }
}

export const mockProjectService = createMockProjectService(demoDatabase)
