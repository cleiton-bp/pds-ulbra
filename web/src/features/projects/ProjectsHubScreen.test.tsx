// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectViewModel } from '@/contracts'
import { ProjectsHubScreen } from '@/features/projects/ProjectsHubScreen'
import { useProjectsStore } from '@/features/projects/projectsStore'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **O nome da conta so aparece quando ha mais de uma.** Quem so tem os proprios
 * projetos continua vendo a lista simples; quem esta no time de projetos de outras
 * contas ve os grupos, com "Seus projetos" primeiro.
 *
 * **O papel so aparece no projeto dos outros** — nos proprios a pessoa e sempre
 * dona. E **o link vai para o projeto, e nao para a Instalação**: quem decide a
 * porta e o papel, e o membro nao tem Instalação.
 */
const dublê = vi.hoisted(() => ({ listar: vi.fn<() => Promise<ProjectViewModel[]>>() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectService: { ...real.projectService, listProjects: dublê.listar },
  }
})

function projeto(
  publicId: string,
  nome: string,
  conta: { id: string; nome: string },
  role: ProjectViewModel['Role'],
  dono: boolean,
): ProjectViewModel {
  return {
    PublicId: publicId,
    Name: nome,
    Status: 'Active',
    CreatedAt: '2026-10-01T12:00:00.000Z',
    UpdatedAt: '2026-10-01T12:00:00.000Z',
    Account: { PublicId: conta.id, Name: conta.nome },
    Role: role,
    IsAccountOwner: dono,
  }
}

const minha = { id: 'c-minha', nome: 'Conta de Bruno' }
const daAna = { id: 'c-ana', nome: 'Conta da Ana' }

function abrir(state?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/projects', state }]}>
      <ProjectsHubScreen />
    </MemoryRouter>,
  )
}

describe('ProjectsHubScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.listar.mockReset()
    useProjectsStore.getState().reset()
  })

  it('quem perdeu o acesso a um projeto aberto chega com o nome dele, e o aviso fica até dizer que viu', async () => {
    dublê.listar.mockResolvedValue([])
    abrir({ leftProject: 'Loja Online' })

    expect(
      await screen.findByText(
        'Você não tem mais acesso ao projeto “Loja Online”, e a tela dele foi fechada.',
      ),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(screen.queryByText(/não tem mais acesso/)).toBeNull()
  })

  it('só com os próprios projetos: lista simples, sem nome de conta nem papel', async () => {
    dublê.listar.mockResolvedValue([
      projeto('p-1', 'Sistema do Bruno', minha, 'Administrator', true),
    ])
    abrir()

    expect(await screen.findByText('Sistema do Bruno')).toBeTruthy()
    expect(screen.queryByText('Seus projetos')).toBeNull()
    expect(screen.queryByText(/^(Dono|Administrador|Membro)$/)).toBeNull()
  })

  it('com projetos de outra conta: agrupa, a própria primeiro, e mostra o papel nos dos outros', async () => {
    dublê.listar.mockResolvedValue([
      projeto('p-ana', 'Loja Online', daAna, 'Member', false),
      projeto('p-1', 'Sistema do Bruno', minha, 'Administrator', true),
    ])
    abrir()

    const seus = await screen.findByRole('region', { name: 'Seus projetos' })
    const ana = screen.getByRole('region', { name: 'Conta da Ana' })

    expect(within(seus).getByText('Sistema do Bruno')).toBeTruthy()
    expect(within(seus).queryByText(/^(Dono|Administrador|Membro)$/)).toBeNull()
    expect(within(ana).getByText('Loja Online')).toBeTruthy()
    expect(within(ana).getByText('Membro')).toBeTruthy()

    // A propria vem antes no documento.
    expect(seus.compareDocumentPosition(ana) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a busca não desfaz os grupos: quem tem mais de uma conta continua vendo o título da sua', async () => {
    // A busca so aparece a partir de cinco projetos.
    dublê.listar.mockResolvedValue([
      projeto('p-1', 'Sistema do Bruno', minha, 'Administrator', true),
      projeto('p-2', 'Site do Bruno', minha, 'Administrator', true),
      projeto('p-3', 'Painel do Bruno', minha, 'Administrator', true),
      projeto('p-4', 'Loja Online', daAna, 'Member', false),
      projeto('p-5', 'Aplicativo', daAna, 'Member', false),
    ])
    abrir()

    fireEvent.change(await screen.findByRole('textbox', { name: 'Buscar projeto' }), {
      target: { value: 'bruno' },
    })

    // So os da propria conta casam com a busca — e o grupo continua com titulo.
    expect(screen.getByRole('region', { name: 'Seus projetos' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Conta da Ana' })).toBeNull()
    expect(screen.getByText('3 de 5 projetos')).toBeTruthy()
  })

  it('o link vai para o projeto, e não para uma seção', async () => {
    dublê.listar.mockResolvedValue([projeto('p-ana', 'Loja Online', daAna, 'Member', false)])
    abrir()

    const link = (await screen.findByText('Loja Online')).closest('a')
    expect(link?.getAttribute('href')).toBe('/projects/p-ana')
  })

  it('quem só trabalha nos projetos dos outros lê a frase de quem trabalha, e não a de quem instala', async () => {
    dublê.listar.mockResolvedValue([projeto('p-ana', 'Loja Online', daAna, 'Member', false)])
    abrir()

    expect(await screen.findByText('Abra um projeto para trabalhar nos relatos dele.')).toBeTruthy()
  })
})
