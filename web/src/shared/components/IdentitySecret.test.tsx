// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IdentitySecretCard } from '@/shared/components/IdentitySecret'
import { instalarRemendosDoRadix } from '@/test/radixNoJsdom'

/**
 * O QUE ESTES TESTES TRAVAM: **a chave da identidade fica escondida ate a pessoa pedir**, e
 * trocar pede confirmacao, porque os crachas assinados com a anterior param na hora. O
 * cartao mora em Chaves, que o esconde enquanto a identidade do sistema esta em breve
 * (`EM_BREVE`); por isso ele e testado aqui, sozinho.
 */
const dublê = vi.hoisted(() => ({
  identidade: vi.fn(),
  verSegredo: vi.fn(),
  trocarSegredo: vi.fn(),
  historico: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectIdentitySettingsService: {
      ...real.projectIdentitySettingsService,
      getIdentitySettings: dublê.identidade,
      getIdentitySecret: dublê.verSegredo,
      rotateIdentitySecret: dublê.trocarSegredo,
      getIdentitySecretHistory: dublê.historico,
    },
  }
})

function montarCartao() {
  const router = createMemoryRouter(
    [{ path: '/projects/:publicId/keys', element: <IdentitySecretCard projectPublicId="p-1" /> }],
    { initialEntries: ['/projects/p-1/keys'] },
  )
  render(<RouterProvider router={router} />)
}

instalarRemendosDoRadix()

describe('IdentitySecretCard', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.identidade.mockResolvedValue({ IsHmacAvailable: true })
    dublê.historico.mockResolvedValue([])
  })

  // A chave da assinatura simples da identidade e uma chave: mora aqui, escondida ate a
  // pessoa pedir, e trocar pede confirmacao porque os crachas antigos param na hora.
  describe('o cartão da chave da identidade', () => {
    it('fica escondida até pedir, e só então a tela a busca', async () => {
      dublê.verSegredo.mockResolvedValue({ Secret: 'rfs_segredo-do-projeto' })
      montarCartao()

      const cartao = await screen.findByRole('heading', { name: 'Chave da identidade' })
      expect(screen.queryByText('rfs_segredo-do-projeto')).toBeNull()
      expect(dublê.verSegredo).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Mostrar a chave' }))
      expect(await screen.findByText('rfs_segredo-do-projeto')).toBeTruthy()
      expect(dublê.verSegredo).toHaveBeenCalledWith('p-1')
      expect(cartao.closest('article')?.id).toBe('chave-da-identidade')
    })

    it('trocar pede confirmação antes', async () => {
      dublê.trocarSegredo.mockResolvedValue({ Secret: 'rfs_chave-nova' })
      montarCartao()

      fireEvent.click(await screen.findByRole('button', { name: 'Trocar a chave' }))
      expect(dublê.trocarSegredo).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole('button', { name: 'Trocar agora' }))

      expect(await screen.findByText('rfs_chave-nova')).toBeTruthy()
      expect(dublê.trocarSegredo).toHaveBeenCalledWith('p-1')
    })

    it('as chaves anteriores mostram só o começo e quando foram trocadas', async () => {
      dublê.historico.mockResolvedValue([
        { Prefix: 'rfs_Fco6rKDZ', ReplacedAt: '2026-11-03T23:01:00Z' },
        { Prefix: 'rfs_duGfNVUm', ReplacedAt: '2026-11-02T10:00:00Z' },
      ])
      montarCartao()

      expect(await screen.findByText('Chaves anteriores')).toBeTruthy()
      expect(screen.getByText('rfs_Fco6rKDZ•••')).toBeTruthy()
      expect(screen.getByText('rfs_duGfNVUm•••')).toBeTruthy()
      // So o comeco: o valor inteiro de uma chave antiga nunca aparece.
      expect(dublê.verSegredo).not.toHaveBeenCalled()
    })

    it('sem troca nenhuma, o histórico diz que ainda não há', async () => {
      montarCartao()

      expect(await screen.findByText(/Nenhuma troca ainda/)).toBeTruthy()
    })

    // Escondida pelo olho, os pontos da chave nova eram iguais aos da anterior, e a troca
    // parecia nao ter feito nada.
    it('trocar com a chave escondida mostra a nova, revelada e marcada como nova', async () => {
      dublê.verSegredo.mockResolvedValue({ Secret: 'rfs_chave-antiga' })
      dublê.trocarSegredo.mockResolvedValue({ Secret: 'rfs_chave-nova' })
      montarCartao()

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
      dublê.identidade.mockResolvedValue({ IsHmacAvailable: false })
      montarCartao()

      expect(await screen.findByText(/não tem a chave mestra/)).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Mostrar a chave' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Trocar a chave' })).toBeNull()
    })
  })
})
