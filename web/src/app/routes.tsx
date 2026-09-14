import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AccountShell } from '@/app/AccountShell'
import { ProjectShell } from '@/app/ProjectShell'
import { RequireSession } from '@/app/RequireSession'
import { StartScreen } from '@/features/onboarding/StartScreen'
import { ProjectKeysScreen } from '@/features/projectKeys/ProjectKeysScreen'
import { ProjectStatesScreen } from '@/features/projectStates/ProjectStatesScreen'
import { ProjectSettingsScreen } from '@/features/projects/ProjectSettingsScreen'
import { ProjectsHubScreen } from '@/features/projects/ProjectsHubScreen'
import { ReportsScreen } from '@/features/reports/ReportsScreen'
import { WidgetSettingsScreen } from '@/features/widgetSettings/WidgetSettingsScreen'

/**
 * Dois niveis: fora do projeto nao ha o que navegar, dentro dele vai haver muito.
 *
 *   /projects .......................... hub, casca so com barra de cima
 *   /projects/:publicId/{start,keys,tool,states,settings,reports} ... console, com menu lateral
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
}
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RequireSession />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      {
        element: <AccountShell />,
        children: [{ path: 'projects', element: <ProjectsHubScreen /> }],
      },
      {
        path: 'projects/:publicId',
        element: <ProjectShell />,
        children: [
          { index: true, element: <Navigate to="start" replace /> },
          { path: 'start', element: <StartScreen /> },
          { path: 'keys', element: <ProjectKeysScreen /> },
          { path: 'states', element: <ProjectStatesScreen /> },
          { path: 'settings', element: <ProjectSettingsScreen /> },
          { path: 'reports', element: <ReportsScreen /> },
          { path: 'tool', element: <WidgetSettingsScreen /> },
        ],
      },
    ],
  },
  naoEncontrada,
])
