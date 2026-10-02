import type { ProjectAccountViewModel, ProjectViewModel } from '@/contracts'

/**
 * O que a pessoa pode fazer no projeto, como a tela decide. A regra mora na API —
 * ela recusa com 403 o que o membro tentar mudar —, e aqui so se decide o que
 * **mostrar**: a configuracao some do menu de quem e so membro, em vez de
 * aparecer e falhar no salvar.
 */
export function canConfigure(project: ProjectViewModel): boolean {
  return project.Role === 'Administrator'
}

/** O papel como aparece na tela. A dona da conta aparece como dona, e nao como administradora. */
export function roleLabel(project: ProjectViewModel): string {
  if (project.IsAccountOwner) return 'Dono'
  return project.Role === 'Administrator' ? 'Administrador' : 'Membro'
}

export interface AccountGroup {
  account: ProjectAccountViewModel
  /** A conta propria da pessoa — a que ela e dona. */
  own: boolean
  projects: ProjectViewModel[]
}

/**
 * Os projetos agrupados pela conta dona: a conta propria primeiro, as outras em
 * ordem de nome. Dentro do grupo, a ordem que veio — a API ja manda do mais
 * recente para o mais antigo.
 *
 * Projeto da conta propria e sempre da dona, entao `own` sai do proprio projeto,
 * sem precisar da sessao.
 */
export function groupByAccount(projects: ProjectViewModel[]): AccountGroup[] {
  const groups = new Map<string, AccountGroup>()

  for (const project of projects) {
    const key = project.Account.PublicId
    const group = groups.get(key)
    if (group) group.projects.push(project)
    else
      groups.set(key, {
        account: project.Account,
        own: project.IsAccountOwner,
        projects: [project],
      })
  }

  return [...groups.values()].sort((a, b) => {
    if (a.own !== b.own) return a.own ? -1 : 1
    return a.account.Name.localeCompare(b.account.Name, 'pt-BR')
  })
}
