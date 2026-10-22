// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectViewModel, UpdateProjectRequest } from '@/contracts'
import { ProjectSettingsScreen } from '@/features/projects/ProjectSettingsScreen'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { useToastStore } from '@/shared/components/toastStore'

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

// O Copiar passa pelo `copyText`, que no jsdom nao tem area de transferencia: o
// dublê responde que copiou e guarda o que recebeu.
const copiar = vi.hoisted(() => vi.fn(async (_texto: string) => true))
vi.mock('@/shared/lib/clipboard', () => ({ copyText: copiar }))

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
      // A area de Dominios le as tres listas ao abrir: vazias, ela so desenha.
      listObservedOrigins: async () => [],
      listBlockedOrigins: async () => [],
      listPendingOrigins: async () => [],
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
    Account: { PublicId: 'conta-1', Name: 'Conta de teste' },
    Role: 'Administrator',
    IsAccountOwner: true,
    LastReportReceivedAt: null,
    LastActivityAt: null,
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
      { path: '/outra', element: <p>outra tela</p> },
    ],
    { initialEntries: [`/p/${publicId}`] },
  )

  render(<RouterProvider router={router} />)
  return router
}

const campo = () => screen.getByRole('textbox', { name: 'Nome do projeto' })
const botaoSalvar = () => screen.getByRole('button', { name: /^Salv/ }) as HTMLButtonElement

describe('ProjectSettingsScreen', () => {
  // Os dominios ganharam tela propria. O link antigo — o sino mandou `settings#dominios`
  // por um tempo — cai no mesmo lugar da tela nova, com o mesmo `#`.
  it('o link antigo dos domínios leva à tela Domínios, no mesmo lugar', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/p/:publicId',
          element: <ProjetoDaStore />,
          children: [
            { path: 'settings', element: <ProjectSettingsScreen /> },
            { path: 'domains', element: <p>tela de domínios</p> },
          ],
        },
      ],
      { initialEntries: ['/p/p-1/settings#dominios'] },
    )
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('tela de domínios')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/p/p-1/domains')
    expect(router.state.location.hash).toBe('#dominios')
  })

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

  it('renomeia pelo Salvar do título, que desliga quando o nome está salvo', async () => {
    montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect((botaoSalvar() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(campo(), { target: { value: 'Loja Renomeada' } })
    expect(screen.getByText('1 mudança não salva')).toBeTruthy()
    fireEvent.click(botaoSalvar())

    await waitFor(() =>
      expect(
        useProjectsStore.getState().projects.find((item) => item.PublicId === 'p-1')?.Name,
      ).toBe('Loja Renomeada'),
    )

    // A acao so esta pronta quando ela **avisa** que deu certo: o titulo volta a
    // "Tudo salvo", e o aviso diz que o nome foi salvo.
    await waitFor(() => expect(screen.getByText('Tudo salvo')).toBeTruthy())
    expect((botaoSalvar() as HTMLButtonElement).disabled).toBe(true)
    expect(useToastStore.getState().toasts.map((aviso) => aviso.message)).toContain(
      'Nome do projeto salvo.',
    )
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
    // A API escreve "Ja existe"; a tela mostra acentuado (`acentuar`).
    expect(await screen.findByText(/já existe um projeto com este nome/i)).toBeTruthy()
    expect(campo().getAttribute('aria-invalid')).toBe('true')
  })

  // A tela chama "Projeto" no menu, e o texto diz para que servem o nome e o
  // identificador — a frase antiga dizia que o script do site levava o identificador,
  // o que ensinava errado o que importa para a instalacao.
  it('o título é o do menu, e os textos dizem onde o nome e o identificador aparecem', async () => {
    montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    expect(screen.getByRole('heading', { level: 1, name: 'Projeto' })).toBeTruthy()
    expect(screen.getByText('Aparece na lista de projetos e no seletor do topo.')).toBeTruthy()
    expect(
      screen.getByText(
        'Aparece nos endereços do painel e não muda quando você renomeia o projeto.',
      ),
    ).toBeTruthy()
    // Nada recolhido: o "Mais opções" saiu desta tela.
    expect(document.querySelector('details')).toBeNull()
  })

  // O estado vem ao lado do titulo, e o arquivado traz a faixa com o Desarquivar,
  // sem obrigar a rolar ate o fim da tela.
  it('a pílula diz Ativo; arquivado, diz Arquivado e a faixa desarquiva', async () => {
    estado.projetos = [{ ...projeto('p-1', 'Loja Antiga'), Status: 'Archived' }]
    await useProjectsStore.getState().load()
    montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    expect(screen.getByText('Arquivado')).toBeTruthy()
    const faixa = screen.getByText('Este projeto está arquivado e não aceita relatos novos.')
    expect(faixa).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Desarquivar' }))

    await waitFor(() => expect(screen.getByText('Ativo')).toBeTruthy())
    expect(screen.queryByText('Este projeto está arquivado e não aceita relatos novos.')).toBeNull()
    expect(
      useProjectsStore.getState().projects.find((item) => item.PublicId === 'p-1')?.Status,
    ).toBe('Active')
    expect(useToastStore.getState().toasts.map((aviso) => aviso.message)).toContain(
      'Projeto reativado.',
    )
  })

  it('"Sobre o projeto" mostra a conta, o papel, a criação, e copia o identificador', async () => {
    estado.projetos = [{ ...projeto('p-1', 'Loja Antiga'), IsAccountOwner: false, Role: 'Member' }]
    await useProjectsStore.getState().load()
    montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    const sobre = screen.getByRole('region', { name: 'Sobre o projeto' })
    expect(within(sobre).getByText('Conta de teste')).toBeTruthy()
    expect(within(sobre).getByText('Membro')).toBeTruthy()
    expect(within(sobre).getByText('Criado em')).toBeTruthy()
    expect(within(sobre).getByText('p-1')).toBeTruthy()

    fireEvent.click(within(sobre).getByRole('button', { name: 'Copiar' }))
    await waitFor(() => expect(within(sobre).getByText('Copiado')).toBeTruthy())
    expect(copiar).toHaveBeenCalledWith('p-1')
  })

  it('a dona da conta aparece como dona', async () => {
    montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    const sobre = screen.getByRole('region', { name: 'Sobre o projeto' })
    expect(within(sobre).getByText('Dono')).toBeTruthy()
  })

  it('a prévia do topo acompanha o rascunho do nome', async () => {
    montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    const previa = screen.getByRole('figure', { name: 'Aparece assim no topo:' })
    expect(within(previa).getByText('Loja Antiga')).toBeTruthy()

    fireEvent.change(campo(), { target: { value: 'Loja Renomeada' } })
    expect(within(previa).getByText('Loja Renomeada')).toBeTruthy()
    expect(within(previa).queryByText('Loja Antiga')).toBeNull()
  })

  // Arquivar saiu do recolhido: a secao fica a vista no fim, e o botao pede confirmacao.
  it('arquivar está à vista, sem abrir nada, e pede confirmação', async () => {
    montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    expect(screen.getByRole('heading', { level: 2, name: 'Arquivar projeto' })).toBeTruthy()
    const botao = screen.getByRole('button', { name: 'Arquivar projeto' })
    expect(botao.closest('details')).toBeNull()

    fireEvent.click(botao)
    expect(await screen.findByRole('alertdialog', { name: 'Arquivar Loja Antiga' })).toBeTruthy()
  })

  // O link antigo do recolhido continua valendo: fica nesta tela e cai no arquivar.
  it('o link antigo `#mais-opcoes` fica na tela e aponta para o arquivar', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/p/:publicId',
          element: <ProjetoDaStore />,
          children: [{ path: 'settings', element: <ProjectSettingsScreen /> }],
        },
      ],
      { initialEntries: ['/p/p-1/settings#mais-opcoes'] },
    )
    render(<RouterProvider router={router} />)
    await screen.findByDisplayValue('Loja Antiga')

    expect(router.state.location.pathname).toBe('/p/p-1/settings')
    const ancora = document.getElementById('mais-opcoes') as HTMLElement
    expect(ancora).toBeTruthy()
    expect(within(ancora).getByRole('button', { name: 'Arquivar projeto' })).toBeTruthy()
  })

  // Sair com o nome mudado pergunta antes, e voltar tambem salva.
  it('sair com o nome mudado pergunta antes, e "Voltar e salvar" salva o nome', async () => {
    const router = montar('p-1')
    await screen.findByDisplayValue('Loja Antiga')

    fireEvent.change(campo(), { target: { value: 'Loja Renomeada' } })
    await act(async () => {
      await router.navigate('/outra')
    })

    expect(await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/p/p-1')

    fireEvent.click(screen.getByRole('button', { name: 'Voltar e salvar' }))

    await waitFor(() =>
      expect(
        useProjectsStore.getState().projects.find((item) => item.PublicId === 'p-1')?.Name,
      ).toBe('Loja Renomeada'),
    )
    expect(router.state.location.pathname).toBe('/p/p-1')
  })
})
