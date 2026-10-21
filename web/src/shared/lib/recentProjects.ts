/**
 * Os projetos que esta pessoa abriu por ultimo, **neste navegador** — o "Abertos
 * recentemente" do hub.
 *
 * **E historico, e nao preferencia**: como o historico do navegador, vale no aparelho em
 * que a pessoa abriu, e por isso mora aqui, e nao na conta. O que vale em qualquer
 * aparelho (fixar um projeto, por exemplo) e outra coisa, e seria da API.
 *
 * **Por pessoa**, pela chave: duas contas no mesmo navegador nao misturam os recentes.
 *
 * **Toda leitura e escrita pode estourar**, e nenhuma pode derrubar o painel:
 * `localStorage` some em janela anonima de alguns navegadores e lanca com os dados do
 * site bloqueados. Sem armazenamento, o hub so nao mostra os recentes.
 */
const PREFIXO = 'pds.web.recent-projects.v1.'

/** Quantos o navegador guarda. O hub mostra menos; o resto cobre os que sairam da lista. */
const GUARDADOS = 8

export interface RecentProject {
  publicId: string
  /** Quando a pessoa abriu o projeto, em ISO. */
  openedAt: string
}

function chave(userId: string): string {
  return PREFIXO + userId
}

/** Os abertos por ultimo, do mais recente para o mais antigo. Vazio sem armazenamento. */
export function readRecentProjects(userId: string): RecentProject[] {
  try {
    const bruto = window.localStorage.getItem(chave(userId))
    if (!bruto) return []

    const lido: unknown = JSON.parse(bruto)
    if (!Array.isArray(lido)) return []

    // O que veio do armazenamento e conferido campo a campo: outra versao do painel, ou
    // alguem mexendo a mao, nao pode quebrar o hub.
    return lido
      .filter(
        (item): item is RecentProject =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as RecentProject).publicId === 'string' &&
          typeof (item as RecentProject).openedAt === 'string',
      )
      .slice(0, GUARDADOS)
  } catch {
    return []
  }
}

/** Guarda que a pessoa abriu o projeto agora. O mesmo projeto sobe para o topo, sem repetir. */
export function rememberProjectOpened(userId: string, projectId: string, agora = new Date()): void {
  try {
    const outros = readRecentProjects(userId).filter((item) => item.publicId !== projectId)
    const lista: RecentProject[] = [
      { publicId: projectId, openedAt: agora.toISOString() },
      ...outros,
    ]
    window.localStorage.setItem(chave(userId), JSON.stringify(lista.slice(0, GUARDADOS)))
  } catch {
    // Sem onde guardar, o hub so nao mostra os recentes. Ver o comentario do topo.
  }
}
