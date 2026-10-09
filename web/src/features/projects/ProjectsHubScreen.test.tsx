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
 * dona. E **o link vai para o projeto, e nao para a Instalacao**: quem decide a
 * porta e o papel, e o membro nao tem Instalacao.
 *
 * **O hub fala do trabalho, e nao da instalacao**: a frase de cima e a mesma para
 * todo mundo, a linha diz o ultimo movimento (ou quando nasceu, sem card) e o
 * identificador do projeto saiu dela — continua na tela Projeto. A falha ao carregar
 * diz que os projetos continuam salvos, com o motivo embaixo.
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
    LastReportReceivedAt: null,
    LastActivityAt: null,
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

    // A frase passou a ser uma so, a do trabalho — para quem administra tambem.
    expect(await screen.findByText('Escolha um projeto para ver o trabalho do time.')).toBeTruthy()
    expect(screen.queryByText(/pegar a chave|passo a passo da integração/)).toBeNull()
  })

  it('quem administra lê a mesma frase do trabalho', async () => {
    dublê.listar.mockResolvedValue([
      projeto('p-1', 'Sistema do Bruno', minha, 'Administrator', true),
    ])
    abrir()

    expect(await screen.findByText('Escolha um projeto para ver o trabalho do time.')).toBeTruthy()
    expect(screen.queryByText(/passo a passo da integração/)).toBeNull()
  })

  it('a linha diz o último movimento, e não mostra o identificador do projeto', async () => {
    const hoje = new Date().toISOString()
    dublê.listar.mockResolvedValue([
      { ...projeto('p-1', 'Sistema do Bruno', minha, 'Administrator', true), LastActivityAt: hoje },
    ])
    abrir()

    const linha = (await screen.findByText('Sistema do Bruno')).closest('a') as HTMLElement
    expect(within(linha).getByText(/^último movimento /)).toBeTruthy()
    expect(within(linha).queryByText(/^criado /)).toBeNull()
    expect(linha.textContent).not.toContain('p-1')
  })

  it('sem nenhum card, a linha diz quando o projeto nasceu', async () => {
    dublê.listar.mockResolvedValue([
      projeto('p-1', 'Sistema do Bruno', minha, 'Administrator', true),
    ])
    abrir()

    const linha = (await screen.findByText('Sistema do Bruno')).closest('a') as HTMLElement
    expect(within(linha).getByText(/^criado /)).toBeTruthy()
  })

  it('criar projeto está nos dois lugares: o botão do celular e o quadro do computador', async () => {
    dublê.listar.mockResolvedValue([])
    abrir()

    // O jsdom nao aplica `lg:hidden` nem `hidden lg:block`: os dois existem no
    // documento, e cada tamanho de tela mostra um.
    await screen.findByText('Nenhum projeto ainda')
    expect(screen.getAllByRole('button', { name: 'Criar projeto' })).toHaveLength(2)
    expect(screen.getByText(/Foi convidado para um time\?/)).toBeTruthy()
  })

  it('a falha ao carregar diz que os projetos continuam salvos, e oferece tentar de novo', async () => {
    const { PanelError } = await import('@/data')
    dublê.listar.mockRejectedValueOnce(new PanelError('Falha de rede ao contatar a API.', 0))
    abrir()

    expect(
      await screen.findByText(/Não deu para carregar seus projetos agora. Eles continuam salvos./),
    ).toBeTruthy()
    // O motivo vem embaixo, ja no texto do painel — e nao "Falha de rede ao contatar a API".
    expect(screen.getByText(/Sem conexão com o servidor agora/)).toBeTruthy()
    expect(screen.queryByText(/contatar a API/)).toBeNull()

    dublê.listar.mockResolvedValueOnce([
      projeto('p-1', 'Sistema do Bruno', minha, 'Administrator', true),
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Sistema do Bruno')).toBeTruthy()
  })
})
