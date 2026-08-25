import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AccountShell } from '@/app/AccountShell'
import { NotFoundScreen } from '@/app/NotFoundScreen'
import { ProjectShell } from '@/app/ProjectShell'
import { RequireSession } from '@/app/RequireSession'
import { StartScreen } from '@/features/onboarding/StartScreen'
import { ProjectKeysScreen } from '@/features/projectKeys/ProjectKeysScreen'
import { ProjectSettingsScreen } from '@/features/projects/ProjectSettingsScreen'
import { ProjectsHubScreen } from '@/features/projects/ProjectsHubScreen'

/**
 * Dois niveis: fora do projeto nao ha o que navegar, dentro dele vai haver muito.
 *
 *   /projects .......................... hub, casca so com barra de cima
 *   /projects/:publicId/{start,keys,settings} ... console, com menu lateral
 *
 * `createBrowserRouter` e nao o modo simples porque dele vem o `useBlocker`, que
 * avisa antes de sair da tela com a chave secreta na frente.
 */
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
          { path: 'settings', element: <ProjectSettingsScreen /> },
        ],
      },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
])
