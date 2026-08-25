// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { authService, projectService, resetDemoData } from '@/data'
import { ProjectSettingsScreen } from '@/features/projects/ProjectSettingsScreen'
import { useProjectsStore } from '@/features/projects/projectsStore'

/**
 * O QUE ESTES TESTES PEGAM, E O QUE NAO PEGAM — teste que parece cobrir mais do
 * que cobre e pior que teste nenhum.
 *
 * Travam **comportamento observavel**: renomear confirma, trocar de projeto troca
 * o campo, nome duplicado aparece no campo. **Nao** travam a lista de dependencias
 * do efeito: trocar `[project.PublicId]` por `[project.Name]` passa nos tres,
 * porque o React commita o render da store antes de o `setSaved` rodar.
 *
 * O segundo so vale montado **uma vez so**. Desmontar e montar de novo passa ate
 * com o efeito apagado, porque um mount novo ja inicializa o campo pelo
 * `useState`. O efeito existe para o caso em que a tela nao desmonta — e o que o
 * `router.navigate` reproduz.
 */

/** A mesma derivacao do `ProjectShell`: contexto vindo da store, nao uma copia. */
function ProjetoDaStore() {
  const { publicId = '' } = useParams()
  const project = useProjectsStore((state) =>
    state.projects.find((item) => item.PublicId === publicId),
  )
  return project ? <Outlet context={{ project }} /> : null
}

function montar(publicId: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/p/:publicId',
        element: <ProjetoDaStore />,
        children: [{ index: true, element: <ProjectSettingsScreen /> }],
      },
    ],
    { initialEntries: [`/p/${publicId}`] },
  )

  render(<RouterProvider router={router} />)
  return router
}

const campo = () => screen.getByRole('textbox')
const botaoSalvar = () => screen.getAllByRole('button')[0] as HTMLButtonElement

describe('ProjectSettingsScreen', () => {
  beforeEach(async () => {
    localStorage.clear()
    resetDemoData()
    useProjectsStore.setState({ projects: [], status: 'idle', error: null })
    await authService.signIn(null)
  })

  it('renomeia e confirma com "Salvo"', async () => {
    const criado = await projectService.createProject('Loja Antiga')
    await useProjectsStore.getState().load()

    montar(criado.Project.PublicId)
    await screen.findByDisplayValue('Loja Antiga')

    fireEvent.change(campo(), { target: { value: 'Loja Nova' } })
    fireEvent.click(botaoSalvar())

    await waitFor(() => expect(useProjectsStore.getState().projects[0]?.Name).toBe('Loja Nova'))

    // A acao so esta pronta quando ela **avisa** que deu certo: o nome certo na
    // store nao e o suficiente, porque quem renomeia nao ve a store.
    await waitFor(() => expect(botaoSalvar().textContent).toBe('Salvo'))
  })

  it('troca o campo quando o projeto muda **sem desmontar a tela**', async () => {
    const primeiro = await projectService.createProject('Loja Antiga')
    const segundo = await projectService.createProject('Loja Nova')
    await useProjectsStore.getState().load()

    const router = montar(primeiro.Project.PublicId)
    await screen.findByDisplayValue('Loja Antiga')

    // Mesma rota, outro parametro — e o que o seletor do topo faz. A tela
    // continua montada, entao quem tem de atualizar o campo e o efeito.
    await act(async () => {
      await router.navigate(`/p/${segundo.Project.PublicId}`)
    })

    expect(await screen.findByDisplayValue('Loja Nova')).toBeTruthy()
  })

  it('mostra o erro do servidor no campo, e nao num aviso que some', async () => {
    await projectService.createProject('Ja Existe')
    const alvo = await projectService.createProject('Loja Antiga')
    await useProjectsStore.getState().load()

    montar(alvo.Project.PublicId)
    await screen.findByDisplayValue('Loja Antiga')

    fireEvent.change(campo(), { target: { value: 'Ja Existe' } })
    fireEvent.click(botaoSalvar())

    // Nome duplicado e 409 no mock e na API. O texto fica no campo porque ha o que
    // corrigir, e a correcao e ali — a regra esta escrita em `toastStore.ts`.
    expect(await screen.findByText(/ja existe um projeto com este nome/i)).toBeTruthy()
    expect(campo().getAttribute('aria-invalid')).toBe('true')
  })
})
