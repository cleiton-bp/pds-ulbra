// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectKeyViewModel, ProjectViewModel, RevealedSecretKeyViewModel } from '@/contracts'
import { ProjectKeysScreen } from '@/features/projectKeys/ProjectKeysScreen'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A secreta nasce sob pedido.** O projeto novo vem so com a publica: a secreta
 * aparece uma vez so, e nascer junto do projeto obrigava quem acabou de cria-lo a
 * decidir o que fazer com um valor que quase ninguem usa. Sem secreta, a tela diz
 * que nao ha, e gerar a primeira e **neutro** — avisa que o valor aparece uma vez, sem
 * o ambar de quem vai trocar uma chave em uso. Trocar a que existe continua dizendo
 * que a de hoje para de funcionar.
 *
 * **Depois de gerar, o valor esta na tela uma vez so**: sair pergunta antes.
 */
const dublê = vi.hoisted(() => ({
  chaves: vi.fn<() => Promise<ProjectKeyViewModel[]>>(),
  gerar: vi.fn<() => Promise<RevealedSecretKeyViewModel>>(),
  identidade: vi.fn(),
  verSegredo: vi.fn(),
  trocarSegredo: vi.fn(),
  historico: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectKeyService: {
      ...real.projectKeyService,
      listProjectKeys: dublê.chaves,
      regenerateSecretKey: dublê.gerar,
    },
    // A chave da identidade mora aqui: a leitura diz se a instalacao tem a chave mestra.
    projectIdentitySettingsService: {
      ...real.projectIdentitySettingsService,
      getIdentitySettings: dublê.identidade,
      getIdentitySecret: dublê.verSegredo,
      rotateIdentitySecret: dublê.trocarSegredo,
      getIdentitySecretHistory: dublê.historico,
    },
  }
})

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-10-01T12:00:00.000Z',
  UpdatedAt: '2026-10-01T12:00:00.000Z',
  Account: { PublicId: 'c-1', Name: 'Conta da Ana' },
  Role: 'Administrator',
  IsAccountOwner: true,
  LastReportReceivedAt: null,
  LastActivityAt: null,
}

function chave(tipo: ProjectKeyViewModel['Type'], mudanca: Partial<ProjectKeyViewModel> = {}) {
  return {
    PublicId: `k-${tipo}`,
    Type: tipo,
    Value: tipo === 'Public' ? 'pk_live_loja123' : null,
    Prefix: tipo === 'Public' ? 'pk_live_' : 'sk_live_',
    IsActive: true,
    CreatedAt: '2026-10-01T12:00:00.000Z',
    RevokedAt: null,
    LastUsedAt: null,
    ...mudanca,
  } satisfies ProjectKeyViewModel
}

const NOVA: RevealedSecretKeyViewModel = {
  PublicId: 'k-nova',
  Value: 'sk_live_segredo_que_aparece_uma_vez',
  Prefix: 'sk_live_',
  CreatedAt: '2026-10-08T12:00:00.000Z',
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:publicId',
        element: <Outlet context={{ project: projeto }} />,
        children: [
          { path: 'keys', element: <ProjectKeysScreen /> },
          { path: '*', element: <p>outra tela</p> },
        ],
      },
    ],
    { initialEntries: ['/projects/p-1/keys'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

// A secao avancada rola ate a chave nova (`scrollIntoView`), que o jsdom nao tem.
instalarRemendosDoRadix()

async function abrirIntegracaoAvancada() {
  fireEvent.click(await screen.findByRole('button', { name: /Integração avançada/ }))
}

describe('ProjectKeysScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.identidade.mockResolvedValue({ IsHmacAvailable: true })
    dublê.historico.mockResolvedValue([])
  })

  // A chave da assinatura simples da identidade e uma chave: mora aqui, escondida ate a
  // pessoa pedir, e trocar pede confirmacao porque os crachas antigos param na hora.
  describe('a chave da identidade', () => {
    it('fica escondida até pedir, e só então a tela a busca', async () => {
      dublê.chaves.mockResolvedValue([])
      dublê.verSegredo.mockResolvedValue({ Secret: 'rfs_segredo-do-projeto' })
      montar()

      const cartao = await screen.findByRole('heading', { name: 'Chave da identidade' })
      expect(screen.queryByText('rfs_segredo-do-projeto')).toBeNull()
      expect(dublê.verSegredo).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Mostrar a chave' }))
      expect(await screen.findByText('rfs_segredo-do-projeto')).toBeTruthy()
      expect(dublê.verSegredo).toHaveBeenCalledWith('p-1')
      expect(cartao.closest('article')?.id).toBe('chave-da-identidade')
    })

    it('trocar pede confirmação antes', async () => {
      dublê.chaves.mockResolvedValue([])
      dublê.trocarSegredo.mockResolvedValue({ Secret: 'rfs_chave-nova' })
      montar()

      fireEvent.click(await screen.findByRole('button', { name: 'Trocar a chave' }))
      expect(dublê.trocarSegredo).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Trocar agora' }))

      expect(await screen.findByText('rfs_chave-nova')).toBeTruthy()
      expect(dublê.trocarSegredo).toHaveBeenCalledWith('p-1')
    })

    it('as chaves anteriores mostram só o começo e quando foram trocadas', async () => {
      dublê.chaves.mockResolvedValue([])
      dublê.historico.mockResolvedValue([
        { Prefix: 'rfs_Fco6rKDZ', ReplacedAt: '2026-11-03T23:01:00Z' },
        { Prefix: 'rfs_duGfNVUm', ReplacedAt: '2026-11-02T10:00:00Z' },
      ])
      montar()

      expect(await screen.findByText('Chaves anteriores')).toBeTruthy()
      expect(screen.getByText('rfs_Fco6rKDZ•••')).toBeTruthy()
      expect(screen.getByText('rfs_duGfNVUm•••')).toBeTruthy()
      // So o comeco: o valor inteiro de uma chave antiga nunca aparece.
      expect(dublê.verSegredo).not.toHaveBeenCalled()
    })

    it('sem troca nenhuma, o histórico diz que ainda não há', async () => {
      dublê.chaves.mockResolvedValue([])
      montar()

      expect(await screen.findByText(/Nenhuma troca ainda/)).toBeTruthy()
    })

    // Escondida pelo olho, os pontos da chave nova eram iguais aos da anterior, e a troca
    // parecia nao ter feito nada.
    it('trocar com a chave escondida mostra a nova, revelada e marcada como nova', async () => {
      dublê.chaves.mockResolvedValue([])
      dublê.verSegredo.mockResolvedValue({ Secret: 'rfs_chave-antiga' })
      dublê.trocarSegredo.mockResolvedValue({ Secret: 'rfs_chave-nova' })
      montar()

      fireEvent.click(await screen.findByRole('button', { name: 'Mostrar a chave' }))
      await screen.findByText('rfs_chave-antiga')
      fireEvent.click(screen.getByRole('button', { name: 'Esconder a chave' }))
      expect(screen.queryByText('rfs_chave-antiga')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: 'Trocar a chave' }))
      fireEvent.click(screen.getByRole('button', { name: 'Trocar agora' }))

      expect(await screen.findByText('rfs_chave-nova')).toBeTruthy()
      expect(screen.getByText('Chave nova')).toBeTruthy()
      // A anterior entra no historico: a tela le de novo.
      await waitFor(() => expect(dublê.historico).toHaveBeenCalledTimes(2))
    })

    it('sem a chave mestra na instalação, diz por que não há chave', async () => {
      dublê.chaves.mockResolvedValue([])
      dublê.identidade.mockResolvedValue({ IsHmacAvailable: false })
      montar()

      expect(await screen.findByText(/não tem a chave mestra/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Mostrar a chave' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Trocar a chave' })).toBeNull()
    })
  })

  it('projeto sem secreta diz que ainda não tem, e oferece gerar a primeira', async () => {
    dublê.chaves.mockResolvedValue([chave('Public')])
    montar()

    await abrirIntegracaoAvancada()

    expect(screen.getByText(/Este projeto ainda não tem chave secreta/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Gerar chave secreta' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Gerar nova chave' })).toBeNull()
  })

  it('gerar a primeira é neutro: só avisa que o valor aparece uma vez', async () => {
    dublê.chaves.mockResolvedValue([chave('Public')])
    dublê.gerar.mockResolvedValue(NOVA)
    montar()

    await abrirIntegracaoAvancada()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar chave secreta' }))

    const pergunta = await screen.findByRole('alertdialog', { name: 'Gerar chave secreta' })
    expect(within(pergunta).getByText(/O valor completo aparece uma única vez/)).toBeTruthy()
    // Nao ha chave em uso para parar: nada de aviso de troca.
    expect(within(pergunta).queryByText(/para de funcionar/)).toBeNull()

    fireEvent.click(within(pergunta).getByRole('button', { name: 'Gerar chave' }))

    await waitFor(() => expect(dublê.gerar).toHaveBeenCalledWith('p-1'))
    expect(await screen.findByText(/Copie a chave agora/)).toBeTruthy()
    // A lista e relida: a secreta nova passa a existir nela.
    await waitFor(() => expect(dublê.chaves).toHaveBeenCalledTimes(2))
  })

  it('com uma secreta valendo, gerar outra avisa que a de hoje para de funcionar', async () => {
    dublê.chaves.mockResolvedValue([chave('Public'), chave('Secret')])
    montar()

    await abrirIntegracaoAvancada()
    expect(screen.getByText('sk_live_•••')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar nova chave' }))

    const pergunta = await screen.findByRole('alertdialog', { name: 'Gerar nova chave secreta' })
    expect(within(pergunta).getByText(/A chave de hoje para de funcionar/)).toBeTruthy()
    expect(dublê.gerar).not.toHaveBeenCalled()
  })

  it('com a chave nova na tela, sair pergunta antes', async () => {
    dublê.chaves.mockResolvedValue([chave('Public')])
    dublê.gerar.mockResolvedValue(NOVA)
    const router = montar()

    await abrirIntegracaoAvancada()
    fireEvent.click(screen.getByRole('button', { name: 'Gerar chave secreta' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Gerar chave' }),
    )
    await screen.findByText(/Copie a chave agora/)

    await act(async () => {
      await router.navigate('/projects/p-1/start')
    })

    expect(
      await screen.findByRole('alertdialog', { name: 'A chave nova ainda está na tela' }),
    ).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects/p-1/keys')
  })
})
