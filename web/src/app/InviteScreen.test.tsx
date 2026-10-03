// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InviteScreen } from '@/app/InviteScreen'
import type { InvitationPreviewViewModel } from '@/contracts'
import { useSessionStore } from '@/features/auth/sessionStore'

/**
 * A pagina do link do convite. O que importa aqui: o link sai do `#` e vai inteiro
 * para a API; cada resposta tem a sua frase; com a conta errada, nada do projeto
 * aparece; e aceitar leva ao projeto, ja com a lista de projetos recarregada.
 */
const estado = vi.hoisted(() => ({
  previa: null as InvitationPreviewViewModel | null,
  status: 200,
  tokens: [] as string[],
  aceitos: [] as string[],
  projetosRecarregados: 0,
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectService: {
      ...real.projectService,
      listProjects: async () => {
        estado.projetosRecarregados += 1
        return []
      },
    },
    projectTeamService: {
      ...real.projectTeamService,
      previewInvitation: async (token: string) => {
        estado.tokens.push(token)
        if (estado.status === 404) throw new real.PanelError('Este convite nao vale mais.', 404)
        if (estado.status !== 200)
          throw new real.PanelError('Erro ao processar a requisicao.', estado.status)
        return estado.previa
      },
      acceptInvitation: async (token: string) => {
        estado.aceitos.push(token)
        return { ProjectPublicId: 'p-1', ProjectName: 'Loja Online' }
      },
    },
  }
})

function previa(extra: Partial<InvitationPreviewViewModel>): InvitationPreviewViewModel {
  return {
    Status: 'Valid',
    ProjectPublicId: 'p-1',
    ProjectName: 'Loja Online',
    InvitedByName: 'Ana Dona',
    Role: 'Member',
    ExpiresAt: '2026-10-09T12:00:00.000Z',
    InvitedEmailHint: null,
    ...extra,
  }
}

function montar(endereco: string) {
  const router = createMemoryRouter(
    [
      { path: '/invite', element: <InviteScreen /> },
      { path: '/projects/:publicId', element: <p>projeto aberto</p> },
    ],
    { initialEntries: [endereco] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const signOutDeVerdade = useSessionStore.getState().signOut

describe('InviteScreen', () => {
  afterEach(() => {
    cleanup()
    // O teste da conta errada troca a saida por um duble; os outros tem a de verdade.
    useSessionStore.setState({ signOut: signOutDeVerdade })
  })

  beforeEach(() => {
    estado.previa = previa({})
    estado.status = 200
    estado.tokens = []
    estado.aceitos = []
    estado.projetosRecarregados = 0
  })

  it('sem o link depois do #, diz que esta incompleto e nem pergunta a API', async () => {
    montar('/invite')
    await screen.findByText('Este link está incompleto')
    expect(estado.tokens).toEqual([])
  })

  it('le o link do # e mostra o projeto, quem convidou e o papel', async () => {
    montar('/invite#t=abc_DEF-123')
    await screen.findByText('Loja Online')
    expect(estado.tokens).toEqual(['abc_DEF-123'])
    expect(screen.getByText('Ana Dona')).toBeTruthy()
    expect(screen.getByText(/como membro/)).toBeTruthy()
  })

  it('aceitar manda o link, recarrega os projetos e abre o projeto', async () => {
    const router = montar('/invite#t=abc')
    fireEvent.click(await screen.findByRole('button', { name: 'Aceitar o convite' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1'))
    expect(estado.aceitos).toEqual(['abc'])
    expect(estado.projetosRecarregados).toBeGreaterThan(0)
  })

  it('com a conta errada: a pista do endereco, nada do projeto, e o caminho para trocar de conta', async () => {
    const signOut = vi.fn(async () => {})
    useSessionStore.setState({ signOut })
    estado.previa = previa({
      Status: 'WrongAccount',
      ProjectPublicId: null,
      ProjectName: null,
      InvitedByName: null,
      Role: null,
      ExpiresAt: null,
      InvitedEmailHint: 'e•••@exemplo.com',
    })
    montar('/invite#t=abc')

    await screen.findByText('Este convite é para outra conta')
    expect(screen.getByText(/e•••@exemplo\.com/)).toBeTruthy()
    expect(screen.queryByText('Loja Online')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aceitar o convite' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Sair e entrar com outra conta' }))
    expect(signOut).toHaveBeenCalled()
  })

  it('e-mail sem confirmacao do Google: explica e oferece entrar de novo', async () => {
    estado.previa = previa({
      Status: 'EmailNotVerified',
      ProjectName: null,
      InvitedEmailHint: 'e•••@exemplo.com',
    })
    montar('/invite#t=abc')
    await screen.findByText('O Google ainda não confirmou este e-mail')
    expect(screen.getByRole('button', { name: 'Sair e entrar de novo' })).toBeTruthy()
  })

  it('vencido: diz ate quando valia e a quem pedir de novo', async () => {
    estado.previa = previa({ Status: 'Expired' })
    montar('/invite#t=abc')
    await screen.findByText('Este convite venceu')
    expect(screen.getByText(/Peça a Ana Dona para reenviar/)).toBeTruthy()
  })

  it('link que nao vale mais (404): frase propria, sem "tentar de novo"', async () => {
    estado.status = 404
    montar('/invite#t=abc')
    await screen.findByText('Este convite não vale mais')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('falha passageira: oferece tentar de novo, e tentar busca outra vez', async () => {
    estado.status = 500
    montar('/invite#t=abc')
    const tentar = await screen.findByRole('button', { name: 'Tentar de novo' })
    estado.status = 200
    fireEvent.click(tentar)
    await waitFor(() => expect(estado.tokens.length).toBe(2))
    await screen.findByText('Loja Online')
  })

  it('ja aceito: leva ao projeto', async () => {
    estado.previa = previa({ Status: 'AlreadyAccepted' })
    montar('/invite#t=abc')
    await screen.findByText('Você já está no time de Loja Online')
    expect(screen.getByRole('link', { name: 'Abrir o projeto' }).getAttribute('href')).toBe(
      '/projects/p-1',
    )
  })

  it('ja no time (dona, ou membro por outro caminho): abrir o projeto passa pelo aceite e fecha o convite', async () => {
    estado.previa = previa({ Status: 'AlreadyMember' })
    const router = montar('/invite#t=abc')

    await screen.findByText('Você já está no time de Loja Online')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o projeto' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/p-1'))
    expect(estado.aceitos).toEqual(['abc'])
  })
})
