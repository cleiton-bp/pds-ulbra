import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AccountShell } from '@/app/AccountShell'
import { ConfigureScreen } from '@/app/configure/ConfigureScreen'
import { InviteScreen } from '@/app/InviteScreen'
import { ProfileRoute } from '@/app/ProfileRoute'
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
import { ProjectKeysScreen } from '@/features/projectKeys/ProjectKeysScreen'
import { ProjectStatesScreen } from '@/features/projectStates/ProjectStatesScreen'
import { DomainsScreen } from '@/features/projects/DomainsScreen'
import { MembersScreen } from '@/features/projects/MembersScreen'
import { ProjectSettingsScreen } from '@/features/projects/ProjectSettingsScreen'
import { ProjectsHubScreen } from '@/features/projects/ProjectsHubScreen'
import { PublicStagesScreen } from '@/features/publicStages/PublicStagesScreen'
import { ReportDetailRoute } from '@/features/reports/ReportDetailRoute'
import { ReportsScreen } from '@/features/reports/ReportsScreen'
import { ReportTypesScreen } from '@/features/reportTypes/ReportTypesScreen'
import { FormTextsScreen } from '@/features/widgetSettings/FormTextsScreen'
import { WidgetSettingsScreen } from '@/features/widgetSettings/WidgetSettingsScreen'

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
          // O perfil e um dialogo sobre a tela aberta (o menu da conta e o sino o abrem
          // sem trocar o endereco). A rota fica para o link salvo: abre o dialogo e sai.
          { path: 'profile', element: <ProfileRoute /> },
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
              { path: 'configure', element: <ConfigureScreen /> },
              { path: 'start', element: <StartScreen /> },
              { path: 'domains', element: <DomainsScreen /> },
              { path: 'keys', element: <ProjectKeysScreen /> },
              { path: 'report-types', element: <ReportTypesScreen /> },
              { path: 'form-texts', element: <FormTextsScreen /> },
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
