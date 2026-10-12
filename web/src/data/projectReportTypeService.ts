import type {
  ProjectReportTypeViewModel,
  ReorderProjectReportTypesRequest,
  SaveProjectReportTypeRequest,
} from '@/contracts'

/**
 * Os tipos de relato do projeto. O membro le a lista — e dela que sai o filtro de
 * tipo da tela de Trabalho —; criar, mudar, reordenar, desativar e reativar sao do
 * administrador.
 */
export interface ProjectReportTypeService {
  /** Na ordem da ferramenta, com os desativados no lugar deles. */
  listReportTypes(publicId: string): Promise<ProjectReportTypeViewModel[]>

  /** Cria no fim da lista. */
  addReportType(
    publicId: string,
    request: SaveProjectReportTypeRequest,
  ): Promise<ProjectReportTypeViewModel>

  /** Grava o tipo inteiro: o que nao vier volta ao vazio, e nao "fica como estava". */
  updateReportType(
    publicId: string,
    typePublicId: string,
    request: SaveProjectReportTypeRequest,
  ): Promise<ProjectReportTypeViewModel>

  /** Reescreve a ordem inteira — todos os tipos, inclusive os desativados. */
  reorderReportTypes(
    publicId: string,
    request: ReorderProjectReportTypesRequest,
  ): Promise<ProjectReportTypeViewModel[]>

  /** Tira da ferramenta sem apagar. O ultimo ativo a API recusa. */
  deactivateReportType(publicId: string, typePublicId: string): Promise<ProjectReportTypeViewModel>

  /** Traz de volta para a ferramenta. Com dez ativos, a API recusa. */
  activateReportType(publicId: string, typePublicId: string): Promise<ProjectReportTypeViewModel>
}
