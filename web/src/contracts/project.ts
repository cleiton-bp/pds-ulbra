/** Espelho de `Pds.Domain/ViewModels/ProjectViewModels.cs`. */

import type { ProjectKeyViewModel, RevealedSecretKeyViewModel } from '@/contracts/projectKey'

/** `Archived` nao apaga nada: continua visivel, so para de aceitar coisa nova. */
export type ProjectStatus = 'Active' | 'Archived'

/** So existe `PublicId`; o id do banco nunca sai do servidor. */
export interface ProjectViewModel {
  PublicId: string
  Name: string
  Status: ProjectStatus
  CreatedAt: string
  UpdatedAt: string
}

/** Unica resposta que carrega o valor da chave secreta — ela so existe aqui. */
export interface ProjectCreatedViewModel {
  Project: ProjectViewModel
  PublicKey: ProjectKeyViewModel
  SecretKey: RevealedSecretKeyViewModel
}

/** Limite da coluna `name`. Fato do contrato, nao das telas. */
export const MAX_PROJECT_NAME_LENGTH = 120

export interface CreateProjectRequest {
  Name: string
}

/** O que nao vier fica como esta. */
export interface UpdateProjectRequest {
  Name?: string
  Status?: ProjectStatus
}
