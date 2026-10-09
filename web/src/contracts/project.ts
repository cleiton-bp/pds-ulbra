/** Espelho de `Pds.Domain/ViewModels/ProjectViewModels.cs`. */

import type { ProjectKeyViewModel } from '@/contracts/projectKey'

/** `Archived` nao apaga nada: continua visivel, so para de aceitar coisa nova. */
export type ProjectStatus = 'Active' | 'Archived'

/**
 * O que a pessoa pode fazer no projeto. A dona da conta e sempre administradora;
 * o membro trabalha nos relatos e nao ve a configuracao.
 */
export type ProjectRole = 'Administrator' | 'Member'

/** A conta dona do projeto: so o necessario para agrupar e nomear. */
export interface ProjectAccountViewModel {
  PublicId: string
  Name: string
}

/** So existe `PublicId`; o id do banco nunca sai do servidor. */
export interface ProjectViewModel {
  PublicId: string
  Name: string
  Status: ProjectStatus
  CreatedAt: string
  UpdatedAt: string
  /** A conta dona. A mesma pessoa pode estar em projetos de varias contas. */
  Account: ProjectAccountViewModel
  /** O papel da pessoa da sessao neste projeto. */
  Role: ProjectRole
  /** A pessoa da sessao e dona da conta deste projeto. */
  IsAccountOwner: boolean
  /**
   * Quando chegou o ultimo relato de fora, pela ferramenta. Nulo enquanto o site nao
   * mandou nenhum — e o que decide a porta do projeto para quem administra. O card do
   * time nao conta.
   */
  LastReportReceivedAt: string | null
  /** Ultima mudanca em qualquer card do projeto. Nulo sem card nenhum. */
  LastActivityAt: string | null
}

/**
 * O projeto recem-criado, com a chave publica. **A secreta nao vem**: nasce sob
 * pedido, na tela de chaves.
 */
export interface ProjectCreatedViewModel {
  Project: ProjectViewModel
  PublicKey: ProjectKeyViewModel
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
