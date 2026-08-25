import type {
  CreateProjectRequest,
  ProjectCreatedViewModel,
  ProjectViewModel,
  UpdateProjectRequest,
} from '@/contracts'
import { apiGet, apiPatch, apiPost } from '@/data/api/httpClient'
import type { ProjectService } from '@/data/projectService'

export const apiProjectService: ProjectService = {
  listProjects: () => apiGet<ProjectViewModel[]>('/projects'),

  getProject: (publicId) => apiGet<ProjectViewModel>(`/projects/${publicId}`),

  createProject: (name) =>
    apiPost<ProjectCreatedViewModel>('/projects', { Name: name } satisfies CreateProjectRequest),

  updateProject: (publicId, patch: UpdateProjectRequest) =>
    apiPatch<ProjectViewModel>(`/projects/${publicId}`, patch),
}
