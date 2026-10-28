import type { ComponentType } from 'react'
import { createBrowserRouter, matchRoutes, Navigate } from 'react-router-dom'
import { AccountShell } from '@/app/AccountShell'
import { ProjectShell } from '@/app/ProjectShell'
import { ProjectHome, RequireProjectAdministrator } from '@/app/projectAccessRoutes'
import { RequireSession } from '@/app/RequireSession'
import { RouteErrorScreen } from '@/app/RouteErrorScreen'

/**
 * A tela da rota **num pedaco proprio do pacote**, buscado quando a rota abre: quem abre
 * o quadro nao baixa antes a configuracao inteira, nem quem configura baixa o quadro.
 * As cascas, a sessao e o roteador ficam no pacote de entrada.
 *
 * O roteador busca o pedaco da rota pedida ja na partida e, numa troca de tela, antes de
 * trocar: a tela de antes fica ate a nova chegar. Depois de uma publicacao nova o pedaco
 * antigo pode nao existir mais — a falha cai na tela de erro da raiz, que oferece
 * recarregar.
 *
 * `seguinte` e a tela que costuma vir depois desta — do hub, o Trabalho; do Trabalho, o
 * card aberto —: assim que esta chega, aquela e buscada com folga, e o clique nao espera.
 */
function sobDemanda<M extends Record<K, ComponentType>, K extends keyof M>(
  carregar: () => Promise<M>,
  tela: K,
  seguinte?: () => Promise<unknown>,
) {
  return async () => {
    const modulo = await carregar()
    if (seguinte) quandoFolgar(() => void seguinte().catch(() => {}))
    return { Component: modulo[tela] }
  }
}

/** Quando o navegador estiver folgado — ou, no que nao diz, logo depois. */
function quandoFolgar(fazer: () => void) {
  if ('requestIdleCallback' in window) requestIdleCallback(fazer, { timeout: 2_000 })
  else setTimeout(fazer, 200)
}

const carregarTrabalho = () => import('@/features/reports/ReportsScreen')
const carregarCard = () => import('@/features/reports/ReportDetailRoute')

/**
 * **A intencao de abrir ja busca a tela**: o ponteiro sobre um link do painel, o dedo
 * encostando nele ou o foco do teclado busca o pedaco da tela de destino. Quando o clique
 * chega, ele ja esta aqui ou a caminho — e nada e baixado para uma tela que ninguem
 * abre, nem disputa a rede com a tela aberta.
 */
export function aquecerPelosLinks() {
  const aquecer = (evento: Event) => {
    const link = evento.target instanceof Element ? evento.target.closest('a[href]') : null
    if (!(link instanceof HTMLAnchorElement) || link.origin !== window.location.origin) return

    for (const { route } of matchRoutes(router.routes, link.pathname) ?? []) {
      // A que o roteador ja carregou nao tem mais `lazy`; a que falhar aqui e buscada de
      // novo quando a rota abrir.
      if (typeof route.lazy === 'function') void Promise.resolve(route.lazy()).catch(() => {})
    }
  }
  document.addEventListener('pointerover', aquecer, { passive: true })
  document.addEventListener('focusin', aquecer)
}

/**
 * Dois niveis: fora do projeto nao ha o que navegar, dentro dele vai haver muito.
 *
 *   /projects .......................... hub, casca so com barra de cima
 *   /invite#t=... ...................... o convite do e-mail, na mesma casca
 *   /profile ........................... o endereco antigo do perfil: abre o dialogo sobre o hub
 *   /projects/:publicId/configure ............................. a pagina central da configuracao
 *   /projects/:publicId/{start,keys,tool,domains,report-types,media,public-stages,cycle,identity,states,priorities,labels,sprints,settings} .. console
 *   /projects/:publicId/reports/:reportPublicId ............... o relato aberto, sobre a lista
 *
 * `/projects/:publicId` sozinho decide a porta (`ProjectHome`): o Trabalho, e a
 * pagina central so para quem administra um projeto que ainda nao recebeu relato. As
 * secoes de configuracao ficam atras de `RequireProjectAdministrator`, que manda o
 * membro para o Trabalho.
 *
 * **Toda rota tem tela de erro** (`RouteErrorScreen`, na raiz): sem ela, uma tela
 * que quebrava mostrava o rastro da pilha em ingles, sem botao nenhum.
 *
 * `createBrowserRouter` e nao o modo simples porque dele vem o `useBlocker`, que
 * avisa antes de sair da tela com a chave secreta na frente.
 */
/**
 * O `*` fica **no topo, fora do `RequireSession`**, e nao dentro dos shells.
 *
 * O guardiao nao troca a URL: sem sessao ele desenha a entrada no endereco que a
 * pessoa pediu, para o link de um colega sobreviver ao login. Otimo para endereco
 * valido, errado para endereco que nao existe — digitar torto levava a tela de
 * entrada. Aqui em cima a decisao vem antes da sessao, e endereco invalido cai
 * nesta tela em qualquer situacao.
 *
 * **Preco:** o 404 perde a casca em volta, inclusive a lateral do projeto. Nao da
 * para ter as duas coisas — a casca precisa de sessao para se preencher, e a
 * exigencia e cair aqui mesmo sem ela.
 *
 * Sob demanda como as telas: e a que quase toda sessao nunca abre, e as ilustracoes
 * dela nao tem por que entrar no pacote de entrada.
 */
const naoEncontrada = {
  path: '*',
  lazy: async () => ({ Component: (await import('@/app/NotFoundScreen')).NotFoundScreen }),
  // A tela vem sob demanda: depois de uma publicacao nova, o pedaco antigo pode nao
  // existir mais, e a falha ao busca-lo tambem precisa de saida.
  errorElement: <RouteErrorScreen />,
}
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RequireSession />,
    errorElement: <RouteErrorScreen />,
    // Enquanto o pedaco da primeira tela chega: a mesma pagina vazia de quando a
    // sessao ainda nao respondeu.
    hydrateFallbackElement: <div className="min-h-dvh bg-surface" />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      {
        element: <AccountShell />,
        children: [
          {
            path: 'projects',
            lazy: sobDemanda(
              () => import('@/features/projects/ProjectsHubScreen'),
              'ProjectsHubScreen',
              carregarTrabalho,
            ),
          },
          // O perfil e um dialogo sobre a tela aberta (o menu da conta e o sino o abrem
          // sem trocar o endereco). A rota fica para o link salvo: abre o dialogo e sai.
          { path: 'profile', lazy: sobDemanda(() => import('@/app/ProfileRoute'), 'ProfileRoute') },
          // Fora do projeto de proposito: quem abre o convite ainda nao esta nele.
          // Dentro do `RequireSession`, a entrada com Google aparece neste mesmo
          // endereco — e o `#t=` sobrevive ao login.
          { path: 'invite', lazy: sobDemanda(() => import('@/app/InviteScreen'), 'InviteScreen') },
        ],
      },
      {
        path: 'projects/:publicId',
        element: <ProjectShell />,
        children: [
          { index: true, element: <ProjectHome /> },
          {
            element: <RequireProjectAdministrator />,
            children: [
              {
                path: 'configure',
                lazy: sobDemanda(
                  () => import('@/app/configure/ConfigureScreen'),
                  'ConfigureScreen',
                ),
              },
              {
                path: 'start',
                lazy: sobDemanda(() => import('@/features/onboarding/StartScreen'), 'StartScreen'),
              },
              {
                path: 'domains',
                lazy: sobDemanda(
                  () => import('@/features/projects/DomainsScreen'),
                  'DomainsScreen',
                ),
              },
              {
                path: 'keys',
                lazy: sobDemanda(
                  () => import('@/features/projectKeys/ProjectKeysScreen'),
                  'ProjectKeysScreen',
                ),
              },
              {
                path: 'report-types',
                lazy: sobDemanda(
                  () => import('@/features/reportTypes/ReportTypesScreen'),
                  'ReportTypesScreen',
                ),
              },
              {
                path: 'form-texts',
                lazy: sobDemanda(
                  () => import('@/features/widgetSettings/FormTextsScreen'),
                  'FormTextsScreen',
                ),
              },
              {
                path: 'states',
                lazy: sobDemanda(
                  () => import('@/features/projectStates/ProjectStatesScreen'),
                  'ProjectStatesScreen',
                ),
              },
              {
                path: 'priorities',
                lazy: sobDemanda(
                  () => import('@/features/priorities/PrioritiesScreen'),
                  'PrioritiesScreen',
                ),
              },
              {
                path: 'labels',
                lazy: sobDemanda(() => import('@/features/labels/LabelsScreen'), 'LabelsScreen'),
              },
              {
                path: 'sprints',
                lazy: sobDemanda(
                  () => import('@/features/cycle/SprintSettingsScreen'),
                  'SprintSettingsScreen',
                ),
              },
              {
                path: 'public-stages',
                lazy: sobDemanda(
                  () => import('@/features/publicStages/PublicStagesScreen'),
                  'PublicStagesScreen',
                ),
              },
              {
                path: 'cycle',
                lazy: sobDemanda(
                  () => import('@/features/cycle/CycleSettingsScreen'),
                  'CycleSettingsScreen',
                ),
              },
              {
                path: 'identity',
                lazy: sobDemanda(
                  () => import('@/features/identity/IdentityScreen'),
                  'IdentityScreen',
                ),
              },
              {
                path: 'media',
                lazy: sobDemanda(() => import('@/features/media/MediaScreen'), 'MediaScreen'),
              },
              {
                path: 'settings',
                lazy: sobDemanda(
                  () => import('@/features/projects/ProjectSettingsScreen'),
                  'ProjectSettingsScreen',
                ),
              },
              {
                path: 'tool',
                lazy: sobDemanda(
                  () => import('@/features/widgetSettings/WidgetSettingsScreen'),
                  'WidgetSettingsScreen',
                ),
              },
            ],
          },
          {
            path: 'moderation',
            lazy: sobDemanda(
              () => import('@/features/moderation/ModerationScreen'),
              'ModerationScreen',
            ),
          },
          // Fora da guarda: todo o time abre, e quem e so membro le. O que muda o
          // time aparece so para quem administra.
          {
            path: 'members',
            lazy: sobDemanda(() => import('@/features/projects/MembersScreen'), 'MembersScreen'),
          },
          {
            // O relato aberto e filho da lista: a lista continua montada atras,
            // com o recorte e a rolagem onde estavam, e o dialogo ganha endereco
            // proprio — da para mandar o link de um relato para um colega.
            path: 'reports',
            lazy: sobDemanda(carregarTrabalho, 'ReportsScreen', carregarCard),
            children: [
              { path: ':reportPublicId', lazy: sobDemanda(carregarCard, 'ReportDetailRoute') },
            ],
          },
        ],
      },
    ],
  },
  naoEncontrada,
])
