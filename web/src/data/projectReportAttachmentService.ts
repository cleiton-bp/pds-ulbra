import type { PanelAttachmentViewModel } from '@/contracts'

/**
 * Os arquivos de um relato, para o time.
 *
 * **Os enderecos vencem em minutos**, e pedir de novo e o jeito certo de renovar:
 * nenhum deles fica guardado em lugar nenhum.
 */
export interface ProjectReportAttachmentService {
  listAttachments(
    projectPublicId: string,
    reportPublicId: string,
  ): Promise<PanelAttachmentViewModel[]>
}
