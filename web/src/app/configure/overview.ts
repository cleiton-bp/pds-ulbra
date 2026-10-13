import type {
  ObservedOriginViewModel,
  ProjectInvitationViewModel,
  ProjectOriginViewModel,
  ProjectViewModel,
  ReportVisibility,
  TeamMemberViewModel,
  WidgetPosition,
  WidgetSettingsViewModel,
} from '@/contracts'
import { projectOriginService, projectTeamService, projectWidgetSettingsService } from '@/data'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import {
  domainAuthorized,
  panelHost,
  scriptInstalled,
  testReportSent,
} from '@/shared/lib/installSignals'

/**
 * O que a pagina central le para os primeiros passos e o resumo das areas: **quatro
 * leituras que ja existiam**, em paralelo, e nenhuma rota nova na API.
 *
 * Cada uma pode falhar sozinha: sem a lista de dominios, o passo do dominio fica sem
 * resposta, e o resto da pagina continua. Por isso cada pedaco e `null` na falha, e
 * nao uma excecao que derruba a pagina inteira.
 *
 * Os convites so sao lidos quando o time tem uma pessoa so — e so ai que eles decidem
 * o passo "convidar o time". Com duas pessoas, o passo ja esta feito, e a leitura a
 * mais nao mudaria nada.
 */
export interface ConfigureOverview {
  /** Os dominios autorizados. */
  origins: ProjectOriginViewModel[] | null
  /** Os dominios que mandaram relatos, inclusive o do painel (o relato de teste). */
  observed: ObservedOriginViewModel[] | null
  widget: WidgetSettingsViewModel | null
  members: TeamMemberViewModel[] | null
  /** Os convites abertos; `null` tambem quando nao foi preciso ler. */
  invitations: ProjectInvitationViewModel[] | null
}

export async function loadConfigureOverview(projectPublicId: string): Promise<ConfigureOverview> {
  const [origins, observed, widget, team] = await Promise.all([
    ouNulo(projectOriginService.listProjectOrigins(projectPublicId)),
    ouNulo(projectOriginService.listObservedOrigins(projectPublicId)),
    ouNulo(projectWidgetSettingsService.getWidgetSettings(projectPublicId)),
    ouNulo(lerTime(projectPublicId)),
  ])

  return {
    origins,
    observed,
    widget,
    members: team?.members ?? null,
    invitations: team?.invitations ?? null,
  }
}

async function lerTime(projectPublicId: string) {
  const members = await projectTeamService.listMembers(projectPublicId)
  if (members.length > 1) return { members, invitations: null }

  const convites = await ouNulo(projectTeamService.listInvitations(projectPublicId))
  return {
    members,
    invitations: convites?.Items.filter((convite) => !convite.IsExpired) ?? null,
  }
}

function ouNulo<T>(promessa: Promise<T>): Promise<T | null> {
  return promessa.catch(() => null)
}

export type FirstStepKey = 'script' | 'domain' | 'test' | 'button' | 'team'

/**
 * Um passo da primeira hora. `done` e `null` quando a leitura que decide falhou: a
 * pagina nao afirma o que nao sabe, nem para um lado nem para o outro.
 */
export interface FirstStep {
  key: FirstStepKey
  title: string
  /** O nome curto, na linha dos passos feitos: "Script colado". */
  short: string
  /** Uma linha: por que vale fazer. */
  why: string
  done: boolean | null
  /** `tela#campo`, relativo ao projeto. */
  to: string
  /** O texto do botao que leva ate la. */
  action: string
}

/** O endereco do painel mora com os sinais, em `installSignals`; sai daqui tambem. */
export { panelHost }

/**
 * Os passos, conferidos pelos dados — **nenhum e uma caixa que a pessoa marca**. Uma
 * lista marcada a mao mente no dia em que alguem tira o script do sistema; esta continua
 * dizendo a verdade. Os tres da instalacao vem de `installSignals`, os mesmos que a
 * tela de Instalação usa.
 *
 * - **Script colado**: um relato chegou de um endereco que nao e o painel. So o
 *   `LastReportReceivedAt` nao bastaria — o relato de teste tambem o acende, e ele
 *   nao prova que o sistema tem o script. Sem a lista, vale o `LastReportReceivedAt`.
 * - **Domínio autorizado**: a lista de autorizados tem alguem.
 * - **Relato de teste**: um relato chegou com o endereco do painel.
 * - **Botão escolhido**: cor, canto, texto ou icone diferem do padrao de fabrica.
 * - **Time convidado**: mais de uma pessoa, ou um convite aberto.
 *
 * "Quem pode ver os relatos" nao entra na conta: o padrao (privado) e uma escolha boa, e
 * nao ha como saber se alguem o conferiu. Vira passo opcional (`visibilityStep`).
 */
export function computeFirstSteps(
  project: ProjectViewModel,
  overview: ConfigureOverview,
  host: string = panelHost(),
): FirstStep[] {
  const { origins, observed, widget, members, invitations } = overview

  const scriptDone = scriptInstalled(project, observed, host)

  let teamDone: boolean | null = null
  if (members !== null && members.length > 1) teamDone = true
  else if (members !== null && invitations !== null) teamDone = invitations.length > 0

  return [
    {
      key: 'script',
      short: 'Script colado',
      title: 'Colar o script no seu sistema',
      why: 'É ele que põe o botão de relato no seu sistema (site ou aplicação).',
      done: scriptDone,
      to: 'start#script',
      action: 'Ver o script',
    },
    {
      key: 'domain',
      short: 'Domínio autorizado',
      title: 'Autorizar o endereço do seu sistema',
      why: 'Sem isso, o relato que chega do seu sistema fica retido até você liberar.',
      done: domainAuthorized(origins),
      to: 'domains#autorizados',
      action: 'Abrir Domínios',
    },
    {
      key: 'test',
      short: 'Relato de teste',
      title: 'Enviar um relato de teste',
      why: 'Confere o caminho inteiro: o relato sai da ferramenta e aparece no Trabalho.',
      done: testReportSent(observed, host),
      to: 'start#relato-de-teste',
      action: 'Fazer o teste',
    },
    {
      key: 'button',
      short: 'Botão',
      title: 'Escolher a cor e o texto do botão',
      why: 'Com a cara do seu sistema, as pessoas reconhecem o botão e clicam.',
      done: widget === null ? null : buttonCustomized(widget),
      to: 'tool#cor-do-botao',
      action: 'Ajustar o botão',
    },
    {
      key: 'team',
      short: 'Time convidado',
      title: 'Convidar o time',
      why: 'Relato que ninguém vê não anda: chame quem vai tratar os relatos.',
      done: teamDone,
      to: 'members#convidar',
      action: 'Convidar',
    },
  ]
}

/**
 * O passo opcional: quem pode ver os relatos. Fica na lista completa, com o valor de
 * hoje, mas fora do "n de 5" — o padrao ja serve, e a pessoa decide se quer mudar.
 */
export interface OptionalStep {
  key: 'visibility'
  title: string
  why: string
  to: string
  action: string
}

export function visibilityStep({ widget }: ConfigureOverview): OptionalStep {
  return {
    key: 'visibility',
    title: 'Escolher quem pode ver os relatos',
    // Sem a leitura, a linha explica a escolha em vez de afirmar um valor que nao se sabe.
    why: widget
      ? `Hoje: ${VISIBILITY_SUMMARY[widget.Visibility].toLowerCase()}.`
      : 'Só o time, ou público, com ou sem o nome de quem relatou.',
    to: 'identity#visibilidade',
    action: 'Abrir Quem relata',
  }
}

/** O botao saiu do padrao de fabrica no que se ve primeiro. */
function buttonCustomized(widget: WidgetSettingsViewModel): boolean {
  return (
    widget.AccentColor !== DEFAULT_WIDGET_SETTINGS.AccentColor ||
    widget.Position !== DEFAULT_WIDGET_SETTINGS.Position ||
    widget.LauncherLabel !== DEFAULT_WIDGET_SETTINGS.LauncherLabel ||
    widget.LauncherIcon !== DEFAULT_WIDGET_SETTINGS.LauncherIcon
  )
}

/**
 * O dominio que mandou relato e esta esperando: o primeiro fora das duas listas. O do
 * painel nunca fica retido, e nao entra.
 */
export function heldDomain(
  overview: ConfigureOverview,
  host: string = panelHost(),
): ObservedOriginViewModel | null {
  return (
    overview.observed?.find((origem) => origem.Status === 'Unlisted' && origem.Domain !== host) ??
    null
  )
}

/** Como a visibilidade de hoje se le, no passo opcional e no resumo de Quem relata. */
export const VISIBILITY_SUMMARY: Record<ReportVisibility, string> = {
  Private: 'Só o time vê os relatos',
  PublicAnonymous: 'Relatos públicos, sem o nome de quem relatou',
  PublicIdentified: 'Relatos públicos, com o nome de quem quiser assinar',
}

export const POSITION_SUMMARY: Record<WidgetPosition, string> = {
  BottomRight: 'embaixo, à direita',
  BottomLeft: 'embaixo, à esquerda',
  TopRight: 'em cima, à direita',
  TopLeft: 'em cima, à esquerda',
}
