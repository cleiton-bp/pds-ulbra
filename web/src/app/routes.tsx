import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AccountShell } from '@/app/AccountShell'
import { InviteScreen } from '@/app/InviteScreen'
import { ProjectShell } from '@/app/ProjectShell'
import { ProjectHome, RequireProjectAdministrator } from '@/app/projectAccessRoutes'
import { RequireSession } from '@/app/RequireSession'
import { RouteErrorScreen } from '@/app/RouteErrorScreen'
import { CycleSettingsScreen } from '@/features/cycle/CycleSettingsScreen'
import { SprintSettingsScreen } from '@/features/cycle/SprintSettingsScreen'
import { IdentityScreen } from '@/features/identity/IdentityScreen'
import { LabelsScreen } from '@/features/labels/LabelsScreen'
import { MediaScreen } from '@/features/media/MediaScreen'
import { ModerationScreen } from '@/features/moderation/ModerationScreen'
import { StartScreen } from '@/features/onboarding/StartScreen'
import { PrioritiesScreen } from '@/features/priorities/PrioritiesScreen'
import { ProfileScreen } from '@/features/profile/ProfileScreen'
import { ProjectKeysScreen } from '@/features/projectKeys/ProjectKeysScreen'
import { ProjectStatesScreen } from '@/features/projectStates/ProjectStatesScreen'
import { MembersScreen } from '@/features/projects/MembersScreen'
import { ProjectSettingsScreen } from '@/features/projects/ProjectSettingsScreen'
import { ProjectsHubScreen } from '@/features/projects/ProjectsHubScreen'
import { PublicStagesScreen } from '@/features/publicStages/PublicStagesScreen'
import { ReportDetailRoute } from '@/features/reports/ReportDetailRoute'
import { ReportsScreen } from '@/features/reports/ReportsScreen'
import { WidgetSettingsScreen } from '@/features/widgetSettings/WidgetSettingsScreen'

/**
 * Dois niveis: fora do projeto nao ha o que navegar, dentro dele vai haver muito.
 *
 *   /projects .......................... hub, casca so com barra de cima
 *   /invite#t=... ...................... o convite do e-mail, na mesma casca
 *   /profile ........................... o perfil da pessoa e o som dos avisos, na mesma casca
 *   /projects/:publicId/{start,keys,tool,states,priorities,labels,sprints,public-stages,cycle,identity,media,settings} .. console
 *   /projects/:publicId/reports/:reportPublicId ............... o relato aberto, sobre a lista
 *
 * `/projects/:publicId` sozinho decide a porta (`ProjectHome`): o Trabalho, e a
 * Instalacao so para quem administra um projeto que ainda nao recebeu relato. As
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
 * Unica rota carregada sob demanda: e a que quase toda sessao nunca abre, e as
 * ilustracoes dela nao tem por que entrar no pacote inicial.
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
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      {
        element: <AccountShell />,
        children: [
          { path: 'projects', element: <ProjectsHubScreen /> },
          // O perfil e da pessoa, e nao de um projeto: fora dele, como o hub.
          { path: 'profile', element: <ProfileScreen /> },
          // Fora do projeto de proposito: quem abre o convite ainda nao esta nele.
          // Dentro do `RequireSession`, a entrada com Google aparece neste mesmo
          // endereco — e o `#t=` sobrevive ao login.
          { path: 'invite', element: <InviteScreen /> },
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
              { path: 'start', element: <StartScreen /> },
              { path: 'keys', element: <ProjectKeysScreen /> },
              { path: 'states', element: <ProjectStatesScreen /> },
              { path: 'priorities', element: <PrioritiesScreen /> },
              { path: 'labels', element: <LabelsScreen /> },
              { path: 'sprints', element: <SprintSettingsScreen /> },
              { path: 'public-stages', element: <PublicStagesScreen /> },
              { path: 'cycle', element: <CycleSettingsScreen /> },
              { path: 'identity', element: <IdentityScreen /> },
              { path: 'media', element: <MediaScreen /> },
              { path: 'settings', element: <ProjectSettingsScreen /> },
              { path: 'tool', element: <WidgetSettingsScreen /> },
            ],
          },
          { path: 'moderation', element: <ModerationScreen /> },
          // Fora da guarda: todo o time abre, e quem e so membro le. O que muda o
          // time aparece so para quem administra.
          { path: 'members', element: <MembersScreen /> },
          {
            // O relato aberto e filho da lista: a lista continua montada atras,
            // com o recorte e a rolagem onde estavam, e o dialogo ganha endereco
            // proprio — da para mandar o link de um relato para um colega.
            path: 'reports',
            element: <ReportsScreen />,
            children: [{ path: ':reportPublicId', element: <ReportDetailRoute /> }],
          },
        ],
      },
    ],
  },
  naoEncontrada,
])
