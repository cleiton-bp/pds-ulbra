import type { ProjectKeyViewModel, RevealedSecretKeyViewModel } from '@/contracts'

/** Espelha o `ProjectKeyService` da API. Quem escolhe mock ou API e o `data/index.ts`. */
export interface ProjectKeyService {
  /** Inclusive as revogadas: o historico e o que permite investigar depois. */
  listProjectKeys(publicId: string): Promise<ProjectKeyViewModel[]>

  /** Revoga a atual e cria outra, revelada uma unica vez. Sem desfazer. */
  regenerateSecretKey(publicId: string): Promise<RevealedSecretKeyViewModel>
}
