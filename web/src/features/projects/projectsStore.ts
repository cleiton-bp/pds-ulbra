import { create } from 'zustand'
import type { ProjectCreatedViewModel, ProjectViewModel, UpdateProjectRequest } from '@/contracts'
import { describeError, projectService } from '@/data'

/**
 * Guarda o que veio do servidor e nada mais: regra de negocio mora na API (e no
 * mock que a imita). Duplicar "nome nao pode repetir" aqui criaria duas versoes
 * da mesma regra para divergirem com o tempo.
 */
type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface ProjectsState {
  projects: ProjectViewModel[]
  status: LoadStatus
  error: string | null
  load: () => Promise<void>
  /** Caminho de quem abre a URL do detalhe direto. Levanta `PanelError`. */
  loadOne: (publicId: string) => Promise<ProjectViewModel>
  create: (name: string) => Promise<ProjectCreatedViewModel>
  update: (publicId: string, patch: UpdateProjectRequest) => Promise<ProjectViewModel>
}

/** Substitui o projeto se ja estiver na lista; insere no topo se for novo. */
function merge(projects: ProjectViewModel[], project: ProjectViewModel): ProjectViewModel[] {
  const index = projects.findIndex((item) => item.PublicId === project.PublicId)
  if (index === -1) return [project, ...projects]

  const next = projects.slice()
  next[index] = project
  return next
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  status: 'idle',
  error: null,

  async load() {
    set({ status: 'loading', error: null })

    try {
      set({ projects: await projectService.listProjects(), status: 'ready' })
    } catch (error) {
      set({ status: 'error', error: describeError(error) })
    }
  },

  async loadOne(publicId) {
    // Nao captura de proposito, igual a `create` e a `update`: 404 e 500 pedem
    // telas diferentes, e devolver `null` para os dois fazia a casca acusar "nao
    // existe" quando a verdade era que a API nao respondeu.
    const project = await projectService.getProject(publicId)
    set({ projects: merge(get().projects, project) })
    return project
  },

  async create(name) {
    const created = await projectService.createProject(name)
    set({ projects: merge(get().projects, created.Project) })
    return created
  },

  async update(publicId, patch) {
    const project = await projectService.updateProject(publicId, patch)
    set({ projects: merge(get().projects, project) })
    return project
  },
}))
