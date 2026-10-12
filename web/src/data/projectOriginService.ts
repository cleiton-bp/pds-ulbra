import type {
  CreateProjectBlockedOriginRequest,
  CreateProjectOriginRequest,
  HeldOriginReportsRequest,
  HeldOriginReportsResultViewModel,
  HeldOriginViewModel,
  ObservedOriginViewModel,
  ProjectBlockedOriginViewModel,
  ProjectOriginViewModel,
} from '@/contracts'

/** Espelha o `ProjectOriginService` da API. */
export interface ProjectOriginService {
  /** Enderecos autorizados do projeto, em ordem alfabetica. */
  listProjectOrigins(publicId: string): Promise<ProjectOriginViewModel[]>

  /**
   * Autoriza um endereco. O dominio pode ir colado da barra do navegador: a API
   * normaliza antes de gravar e devolve a forma final.
   */
  addProjectOrigin(
    publicId: string,
    request: CreateProjectOriginRequest,
  ): Promise<ProjectOriginViewModel>

  /** Retira a autorizacao. A ferramenta para de abrir la na proxima carga da pagina. */
  removeProjectOrigin(publicId: string, originPublicId: string): Promise<void>

  /**
   * Os enderecos que ja mandaram relatos, do mais recente para o mais antigo (ate
   * cem): quantos, o ultimo quando, e como o projeto os trata hoje.
   */
  listObservedOrigins(publicId: string): Promise<ObservedOriginViewModel[]>

  /** Os enderecos bloqueados, do mais novo para o mais antigo, com os marcados de cada um. */
  listBlockedOrigins(publicId: string): Promise<ProjectBlockedOriginViewModel[]>

  /**
   * Bloqueia um endereco. Vale na hora, mesmo com a lista de autorizados vazia, e o
   * mesmo endereco sai da lista de autorizados.
   */
  blockOrigin(
    publicId: string,
    request: CreateProjectBlockedOriginRequest,
  ): Promise<ProjectBlockedOriginViewModel>

  /** Desbloqueia. Os relatos de la deixam de estar marcados. */
  unblockOrigin(publicId: string, blockedPublicId: string): Promise<void>

  /**
   * "Aguardando liberacao": os relatos retidos por endereco. Permitir e bloquear um
   * endereco daqui sao `addProjectOrigin` e `blockOrigin`; os sem endereco usam os dois
   * abaixo.
   */
  listPendingOrigins(publicId: string): Promise<HeldOriginViewModel[]>

  /** Libera os retidos de um endereco exato (ou os sem endereco), sem mexer nas listas. */
  releasePendingOrigin(
    publicId: string,
    request: HeldOriginReportsRequest,
  ): Promise<HeldOriginReportsResultViewModel>

  /** Apaga de vez os retidos de um endereco exato (ou os sem endereco). */
  deletePendingOrigin(
    publicId: string,
    request: HeldOriginReportsRequest,
  ): Promise<HeldOriginReportsResultViewModel>
}
