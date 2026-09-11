// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectViewModel, UpdateProjectRequest } from '@/contracts'
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
 *
 * O `@/data` e trocado por um dublê deste arquivo: a tela precisa de listar e
 * renomear respondendo, e nao de rede. Ele repete a unica regra de servidor que
 * importa aqui, o 409 de nome repetido, com o texto que a API usa.
 */
const estado = vi.hoisted(() => ({ projetos: [] as ProjectViewModel[] }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectOriginService: {
      listProjectOrigins: async () => [],
      addProjectOrigin: async () => {
        throw new Error('addProjectOrigin nao e usado nestes testes')
      },
      removeProjectOrigin: async () => {
        throw new Error('removeProjectOrigin nao e usado nestes testes')
      },
    },
    projectService: {
      listProjects: async () => estado.projetos,
      getProject: async (publicId: string) => {
        const found = estado.projetos.find((item) => item.PublicId === publicId)
        if (!found) throw new real.PanelError('Projeto nao encontrado.', 404)
        return found
      },
      createProject: async () => {
        throw new Error('createProject nao e usado nesta tela')
      },
      updateProject: async (publicId: string, patch: UpdateProjectRequest) => {
        const name = patch.Name?.trim()

        if (
          name &&
          estado.projetos.some(
            (item) => item.PublicId !== publicId && item.Name.toLowerCase() === name.toLowerCase(),
          )
        ) {
          throw new real.PanelError('Ja existe um projeto com este nome na conta.', 409)
        }

        estado.projetos = estado.projetos.map((item) =>
          item.PublicId === publicId
            ? {
                ...item,
                ...(name ? { Name: name } : {}),
                ...(patch.Status ? { Status: patch.Status } : {}),
              }
            : item,
        )

        return estado.projetos.find((item) => item.PublicId === publicId) as ProjectViewModel
      },
    },
  }
})

function projeto(publicId: string, name: string): ProjectViewModel {
  return {
    PublicId: publicId,
    Name: name,
    Status: 'Active',
    CreatedAt: '2026-08-01T12:00:00.000Z',
    UpdatedAt: '2026-08-01T12:00:00.000Z',
  }
}

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

const campo = () => screen.getByRole('textbox', { name: 'Nome do projeto' })
const botaoSalvar = () => screen.getByRole('button', { name: /^Salv/ }) as HTMLButtonElement

describe('ProjectSettingsScreen', () => {
  // Sem `globals: true` no Vitest, a limpeza automatica da Testing Library nao
  // roda: a tela do teste anterior fica montada, assinada na store, e volta a
  // aparecer na busca do proximo.
  afterEach(cleanup)

  beforeEach(async () => {
    localStorage.clear()
    estado.projetos = [projeto('p-1', 'Loja Antiga'), projeto('p-2', 'Loja Nova')]
    useProjectsStore.setState({ projects: [], status: 'idle', error: null })
    await useProjectsStore.getState().load()
  })

  it('renomeia e confirma com "Salvo"', async () => {
    montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    fireEvent.change(campo(), { target: { value: 'Loja Renomeada' } })
    fireEvent.click(botaoSalvar())

    await waitFor(() =>
      expect(
        useProjectsStore.getState().projects.find((item) => item.PublicId === 'p-1')?.Name,
      ).toBe('Loja Renomeada'),
    )

    // A acao so esta pronta quando ela **avisa** que deu certo: o nome certo na
    // store nao e o suficiente, porque quem renomeia nao ve a store.
    await waitFor(() => expect(botaoSalvar().textContent).toBe('Salvo'))
  })

  it('troca o campo quando o projeto muda **sem desmontar a tela**', async () => {
    const router = montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    // Mesma rota, outro parametro — e o que o seletor do topo faz.
    await act(async () => {
      await router.navigate('/p/p-2')
    })

    expect(await screen.findByDisplayValue('Loja Nova')).toBeTruthy()
  })

  it('mostra o erro do servidor no campo, e nao num aviso que some', async () => {
    montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    fireEvent.change(campo(), { target: { value: 'Loja Nova' } })
    fireEvent.click(botaoSalvar())

    // Nome duplicado e 409 na API. O texto fica no campo porque ha o que corrigir,
    // e a correcao e ali — a regra esta escrita em `toastStore.ts`.
    expect(await screen.findByText(/ja existe um projeto com este nome/i)).toBeTruthy()
    expect(campo().getAttribute('aria-invalid')).toBe('true')
  })
})
