// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  HeldOriginViewModel,
  ObservedOriginViewModel,
  ProjectBlockedOriginViewModel,
  ProjectOriginViewModel,
} from '@/contracts'
import { DomainsSection } from '@/features/projects/DomainsSection'
import { useToastStore } from '@/shared/components/toastStore'

/**
 * O QUE ESTES TESTES TRAVAM: a tela de Dominios do projeto.
 *
 * - **Os dominios que mandaram relatos** aparecem com quantos e a situacao, e as acoes de
 *   cada um sao as que a situacao pede: fora da lista permite ou bloqueia; autorizado so
 *   bloqueia; bloqueado desbloqueia ou permite.
 * - **Bloquear pede confirmacao** — da linha e do campo, com os subdominios ditos —, e so
 *   entao chama a API. Permitir vai direto. Desbloquear tambem confirma.
 * - **O dominio coberto pelo bloqueio de outra linha** (`*.loja.com`) nao se permite dali:
 *   o botao diz qual bloqueio desfazer, com o texto dele.
 * - **Um clique por linha**: o segundo, com o primeiro a caminho, nao manda de novo.
 * - **Cada botao diz o dominio** no nome acessivel.
 * - **"Aguardando liberacao"** mostra os retidos: o dominio se permite ou bloqueia; os
 *   sem dominio se liberam ou se apagam (com confirmacao).
 * - **Apagar de vez os cards de um bloqueio** so liga depois de escrever o dominio ou
 *   "apagar", e manda o que foi escrito.
 * - Depois de cada mudanca, as listas sao relidas.
 * - **As abas**: abrem em Aguardando quando ha retido, senao em Autorizados, e nao pulam
 *   depois; setas, Home e End trocam e levam o foco; a contagem de cada aba acompanha
 *   permitir e bloquear; o `#` do endereco escolhe a aba da ancora — ao chegar e com a
 *   tela ja aberta —, e os paineis escondidos continuam montados.
 */
const dublê = vi.hoisted(() => ({
  pendentes: vi.fn<() => Promise<HeldOriginViewModel[]>>(),
  observados: vi.fn<() => Promise<ObservedOriginViewModel[]>>(),
  bloqueados: vi.fn<() => Promise<ProjectBlockedOriginViewModel[]>>(),
  autorizados: vi.fn<() => Promise<ProjectOriginViewModel[]>>(),
  autorizar: vi.fn(),
  remover: vi.fn(),
  bloquear: vi.fn(),
  desbloquear: vi.fn(),
  liberar: vi.fn(),
  apagarRetidos: vi.fn(),
  manter: vi.fn(),
  apagarMarcados: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectOriginService: {
      listProjectOrigins: dublê.autorizados,
      addProjectOrigin: dublê.autorizar,
      removeProjectOrigin: dublê.remover,
      listObservedOrigins: dublê.observados,
      listBlockedOrigins: dublê.bloqueados,
      blockOrigin: dublê.bloquear,
      unblockOrigin: dublê.desbloquear,
      listPendingOrigins: dublê.pendentes,
      releasePendingOrigin: dublê.liberar,
      deletePendingOrigin: dublê.apagarRetidos,
    },
    projectReportService: {
      keepBlockedOriginReports: dublê.manter,
      deleteBlockedOriginReports: dublê.apagarMarcados,
    },
  }
})

const AGORA = '2026-10-09T12:00:00.000Z'

function observado(
  Domain: string,
  Status: ObservedOriginViewModel['Status'],
  extra: Partial<ObservedOriginViewModel> = {},
): ObservedOriginViewModel {
  return {
    Domain,
    ReportCount: 4,
    LastReportAt: AGORA,
    Status,
    MarkedCount: 0,
    BlockedOriginId: null,
    ...extra,
  }
}

function bloqueio(
  extra: Partial<ProjectBlockedOriginViewModel> = {},
): ProjectBlockedOriginViewModel {
  return {
    PublicId: 'b-1',
    Domain: 'copia.com',
    IncludesSubdomains: false,
    BlockedAt: AGORA,
    BlockedByName: 'Ana',
    MarkedCount: 2,
    ...extra,
  }
}

function montar() {
  render(
    <MemoryRouter>
      <DomainsSection projectPublicId="p-1" />
    </MemoryRouter>,
  )
}

/** A aba pelo comeco do nome: a contagem vem depois, "Bloqueados (2 · 3 cards)". */
const aba = (nome: string) => screen.getByRole('tab', { name: new RegExp(`^${nome}`) })

async function abrirAba(nome: string) {
  fireEvent.click(await screen.findByRole('tab', { name: new RegExp(`^${nome}`) }))
}

/** O nome de cada aba, na ordem: o rotulo e a contagem. */
const nomesDasAbas = () => screen.getAllByRole('tab').map((guia) => guia.textContent)

/** A linha do dominio na tabela dos que mandaram relatos, na aba Histórico. */
async function linhaObservada(dominio: string) {
  await abrirAba('Histórico')
  const tabela = await screen.findByRole('table')
  const linha = within(tabela).getByText(dominio).closest('tr')
  if (!linha) throw new Error(`a linha de ${dominio}`)
  return linha
}

/** A linha do dominio numa das listas (aguardando ou bloqueados). */
async function itemDaLista(texto: string) {
  const item = (await screen.findByText(texto, { selector: 'code, span' })).closest('li')
  if (!item) throw new Error(`a linha de ${texto}`)
  return item
}

/** Quantas vezes cada lista foi lida ate agora. */
const leituras = () => ({
  pendentes: dublê.pendentes.mock.calls.length,
  observados: dublê.observados.mock.calls.length,
  bloqueados: dublê.bloqueados.mock.calls.length,
})

async function esperarReleitura(antes: ReturnType<typeof leituras>) {
  await waitFor(() => {
    const depois = leituras()
    expect(depois.pendentes).toBeGreaterThan(antes.pendentes)
    expect(depois.observados).toBeGreaterThan(antes.observados)
    expect(depois.bloqueados).toBeGreaterThan(antes.bloqueados)
  })
}

describe('DomainsSection', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    window.localStorage.clear()
    window.sessionStorage.clear()
    dublê.pendentes.mockResolvedValue([])
    dublê.observados.mockResolvedValue([])
    dublê.bloqueados.mockResolvedValue([])
    dublê.autorizados.mockResolvedValue([])
  })

  describe('os dominios que mandaram relatos', () => {
    it('lista cada dominio com quantos relatos e a situacao, e as acoes que ela pede', async () => {
      dublê.observados.mockResolvedValue([
        observado('novo.com', 'Unlisted', { ReportCount: 7 }),
        observado('loja.com', 'Allowed'),
        observado('copia.com', 'Blocked', { MarkedCount: 2, BlockedOriginId: 'b-1' }),
      ])

      montar()

      const novo = await linhaObservada('novo.com')
      expect(within(novo).getByText('7')).toBeTruthy()
      expect(within(novo).getByText('Fora da lista: o próximo espera')).toBeTruthy()
      expect(
        within(novo)
          .getAllByRole('button')
          .map((botao) => botao.textContent),
      ).toEqual(['Permitir', 'Bloquear'])

      const loja = await linhaObservada('loja.com')
      expect(within(loja).getByText('Autorizado')).toBeTruthy()
      expect(
        within(loja)
          .getAllByRole('button')
          .map((botao) => botao.textContent),
      ).toEqual(['Bloquear'])

      const copia = await linhaObservada('copia.com')
      expect(within(copia).getByText('Bloqueado · 2 cards marcados')).toBeTruthy()
      expect(
        within(copia)
          .getAllByRole('button')
          .map((botao) => botao.textContent),
      ).toEqual(['Desbloquear', 'Permitir'])
    })

    it('sem relato com dominio, diz que ainda nao chegou nenhum', async () => {
      montar()
      expect(await screen.findByText(/Nenhum relato chegou com domínio ainda/)).toBeTruthy()
      expect(screen.queryByRole('table')).toBeNull()
    })

    it('bloquear pede confirmacao, e so entao chama a API e rele as listas', async () => {
      dublê.observados.mockResolvedValue([observado('novo.com', 'Unlisted')])
      dublê.bloquear.mockResolvedValue(bloqueio({ Domain: 'novo.com', MarkedCount: 0 }))

      montar()
      fireEvent.click(
        within(await linhaObservada('novo.com')).getByRole('button', { name: 'Bloquear novo.com' }),
      )

      const confirmacao = await screen.findByRole('alertdialog', { name: 'Bloquear novo.com?' })
      expect(dublê.bloquear).not.toHaveBeenCalled()
      const antes = leituras()

      fireEvent.click(within(confirmacao).getByRole('button', { name: 'Bloquear' }))

      await waitFor(() =>
        expect(dublê.bloquear).toHaveBeenCalledWith('p-1', {
          Domain: 'novo.com',
          IncludesSubdomains: false,
        }),
      )
      await esperarReleitura(antes)
    })

    it('cancelar a confirmacao nao bloqueia', async () => {
      dublê.observados.mockResolvedValue([observado('novo.com', 'Unlisted')])

      montar()
      fireEvent.click(
        within(await linhaObservada('novo.com')).getByRole('button', { name: 'Bloquear novo.com' }),
      )
      const confirmacao = await screen.findByRole('alertdialog')
      fireEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(dublê.bloquear).not.toHaveBeenCalled()
    })

    it('permitir autoriza o dominio exato, direto, e rele as listas', async () => {
      dublê.observados.mockResolvedValue([observado('novo.com', 'Unlisted')])
      dublê.autorizar.mockResolvedValue({
        PublicId: 'o-1',
        Domain: 'novo.com',
        AllowsSubdomains: false,
        CreatedAt: AGORA,
      })

      montar()
      const linha = await linhaObservada('novo.com')
      await waitFor(() => expect(dublê.autorizados).toHaveBeenCalled())
      const antes = leituras()

      fireEvent.click(within(linha).getByRole('button', { name: 'Permitir novo.com' }))

      await waitFor(() =>
        expect(dublê.autorizar).toHaveBeenCalledWith('p-1', {
          Domain: 'novo.com',
          AllowsSubdomains: false,
        }),
      )
      await esperarReleitura(antes)
    })

    it('o segundo clique em Permitir, com o primeiro a caminho, nao manda de novo', async () => {
      dublê.observados.mockResolvedValue([observado('novo.com', 'Unlisted')])
      let responder: () => void = () => {}
      dublê.autorizar.mockReturnValue(
        new Promise((resolve) => {
          responder = () =>
            resolve({
              PublicId: 'o-1',
              Domain: 'novo.com',
              AllowsSubdomains: false,
              CreatedAt: AGORA,
            })
        }),
      )

      montar()
      const botao = within(await linhaObservada('novo.com')).getByRole('button', {
        name: 'Permitir novo.com',
      }) as HTMLButtonElement
      fireEvent.click(botao)
      fireEvent.click(botao)

      await waitFor(() => expect(botao.disabled).toBe(true))
      expect(dublê.autorizar).toHaveBeenCalledOnce()
      responder()
      await waitFor(() => expect(dublê.autorizar).toHaveBeenCalledOnce())
    })

    it('desbloquear o dominio bloqueado confirma e usa a linha de bloqueio dele', async () => {
      dublê.observados.mockResolvedValue([
        observado('copia.com', 'Blocked', { MarkedCount: 1, BlockedOriginId: 'b-7' }),
      ])
      dublê.bloqueados.mockResolvedValue([bloqueio({ PublicId: 'b-7' })])
      dublê.desbloquear.mockResolvedValue(undefined)

      montar()
      await itemDaLista('copia.com')
      fireEvent.click(
        within(await linhaObservada('copia.com')).getByRole('button', {
          name: 'Desbloquear copia.com',
        }),
      )
      const confirmacao = await screen.findByRole('alertdialog', {
        name: 'Desbloquear copia.com?',
      })
      expect(dublê.desbloquear).not.toHaveBeenCalled()
      fireEvent.click(within(confirmacao).getByRole('button', { name: 'Desbloquear' }))

      await waitFor(() => expect(dublê.desbloquear).toHaveBeenCalledWith('p-1', 'b-7'))
    })

    it('coberto pelo bloqueio de *.loja.com: sem Permitir, e o botao desfaz aquele bloqueio', async () => {
      dublê.observados.mockResolvedValue([
        observado('app.loja.com', 'Blocked', { BlockedOriginId: 'b-curinga' }),
      ])
      dublê.bloqueados.mockResolvedValue([
        bloqueio({
          PublicId: 'b-curinga',
          Domain: 'loja.com',
          IncludesSubdomains: true,
          MarkedCount: 0,
        }),
      ])
      dublê.desbloquear.mockResolvedValue(undefined)

      montar()
      await screen.findByText('*.loja.com', { selector: 'li code' })
      const linha = await linhaObservada('app.loja.com')
      // Permitir nao mudaria nada: o bloqueio do curinga vence.
      expect(
        within(linha)
          .getAllByRole('button')
          .map((botao) => botao.textContent),
      ).toEqual(['Desbloquear *.loja.com'])

      fireEvent.click(within(linha).getByRole('button', { name: 'Desbloquear *.loja.com' }))
      const confirmacao = await screen.findByRole('alertdialog', {
        name: 'Desbloquear *.loja.com?',
      })
      // A confirmacao diz que os subdominios voltam junto.
      expect(within(confirmacao).getByText(/todos os subdomínios dele/)).toBeTruthy()
      fireEvent.click(within(confirmacao).getByRole('button', { name: 'Desbloquear' }))

      await waitFor(() => expect(dublê.desbloquear).toHaveBeenCalledWith('p-1', 'b-curinga'))
      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((aviso) => aviso.message)).toContain(
          '*.loja.com desbloqueado: o domínio e os subdomínios voltam a abrir a ferramenta.',
        ),
      )
      expect(dublê.autorizar).not.toHaveBeenCalled()
    })

    it('permitir o bloqueado exato diz que desbloqueou e autorizou', async () => {
      dublê.observados.mockResolvedValue([
        observado('copia.com', 'Blocked', { BlockedOriginId: 'b-1' }),
      ])
      dublê.bloqueados.mockResolvedValue([bloqueio()])
      dublê.autorizar.mockResolvedValue({
        PublicId: 'o-1',
        Domain: 'copia.com',
        AllowsSubdomains: false,
        CreatedAt: AGORA,
      })

      montar()
      await itemDaLista('copia.com')
      fireEvent.click(
        within(await linhaObservada('copia.com')).getByRole('button', {
          name: 'Permitir copia.com',
        }),
      )

      await waitFor(() =>
        expect(useToastStore.getState().toasts.map((aviso) => aviso.message)).toContain(
          'copia.com desbloqueado e autorizado: os relatos de lá entram direto no Trabalho.',
        ),
      )
    })
  })

  describe('aguardando liberacao', () => {
    it('mostra os retidos de cada dominio, e os sem dominio a parte', async () => {
      dublê.pendentes.mockResolvedValue([
        { Domain: 'novo.com', ReportCount: 3, LastReportAt: AGORA },
        { Domain: null, ReportCount: 1, LastReportAt: AGORA },
      ])

      montar()

      expect(screen.getByRole('heading', { name: 'Aguardando liberação' })).toBeTruthy()
      const comDominio = await itemDaLista('novo.com')
      expect(within(comDominio).getByText(/^3 relatos/)).toBeTruthy()
      expect(
        within(comDominio)
          .getAllByRole('button')
          .map((botao) => botao.textContent),
      ).toEqual(['Permitir', 'Bloquear'])

      const semDominio = await itemDaLista('Sem domínio informado')
      expect(within(semDominio).getByText(/^1 relato /)).toBeTruthy()
      expect(
        within(semDominio)
          .getAllByRole('button')
          .map((botao) => botao.textContent),
      ).toEqual(['Liberar', 'Apagar de vez'])
    })

    it('sem retido, diz que nada espera', async () => {
      montar()
      expect(await screen.findByText(/Nenhum relato esperando/)).toBeTruthy()
    })

    it('permitir o dominio retido autoriza e rele; bloquear pede confirmacao', async () => {
      dublê.pendentes.mockResolvedValue([
        { Domain: 'novo.com', ReportCount: 3, LastReportAt: AGORA },
      ])
      dublê.autorizar.mockResolvedValue({
        PublicId: 'o-1',
        Domain: 'novo.com',
        AllowsSubdomains: false,
        CreatedAt: AGORA,
      })
      dublê.bloquear.mockResolvedValue(bloqueio({ Domain: 'novo.com', MarkedCount: 0 }))

      montar()
      const item = await itemDaLista('novo.com')
      const antes = leituras()

      fireEvent.click(within(item).getByRole('button', { name: 'Permitir novo.com' }))
      await waitFor(() =>
        expect(dublê.autorizar).toHaveBeenCalledWith('p-1', {
          Domain: 'novo.com',
          AllowsSubdomains: false,
        }),
      )
      await esperarReleitura(antes)

      fireEvent.click(
        within(await itemDaLista('novo.com')).getByRole('button', { name: 'Bloquear novo.com' }),
      )
      const confirmacao = await screen.findByRole('alertdialog', { name: 'Bloquear novo.com?' })
      // A confirmacao avisa que os retidos saem de vez.
      expect(within(confirmacao).getByText(/esperavam liberação são apagados de vez/)).toBeTruthy()
      fireEvent.click(within(confirmacao).getByRole('button', { name: 'Bloquear' }))
      await waitFor(() =>
        expect(dublê.bloquear).toHaveBeenCalledWith('p-1', {
          Domain: 'novo.com',
          IncludesSubdomains: false,
        }),
      )
    })

    it('liberar os sem dominio nao mexe nas listas: so os libera', async () => {
      dublê.pendentes.mockResolvedValue([{ Domain: null, ReportCount: 2, LastReportAt: AGORA }])
      dublê.liberar.mockResolvedValue({ Reports: 2 })

      montar()
      const item = await itemDaLista('Sem domínio informado')
      const antes = leituras()

      fireEvent.click(within(item).getByRole('button', { name: 'Liberar os relatos sem domínio' }))

      await waitFor(() => expect(dublê.liberar).toHaveBeenCalledWith('p-1', { Domain: null }))
      await esperarReleitura(antes)
      expect(dublê.autorizar).not.toHaveBeenCalled()
      expect(dublê.bloquear).not.toHaveBeenCalled()
    })

    it('apagar os sem dominio pede confirmacao, e so entao apaga', async () => {
      dublê.pendentes.mockResolvedValue([{ Domain: null, ReportCount: 2, LastReportAt: AGORA }])
      dublê.apagarRetidos.mockResolvedValue({ Reports: 2 })

      montar()
      fireEvent.click(
        within(await itemDaLista('Sem domínio informado')).getByRole('button', {
          name: 'Apagar de vez os relatos sem domínio',
        }),
      )

      const confirmacao = await screen.findByRole('alertdialog', {
        name: 'Apagar de vez os relatos sem domínio?',
      })
      expect(within(confirmacao).getByText(/Os 2 relatos que chegaram/)).toBeTruthy()
      expect(dublê.apagarRetidos).not.toHaveBeenCalled()

      fireEvent.click(within(confirmacao).getByRole('button', { name: 'Apagar de vez' }))

      await waitFor(() => expect(dublê.apagarRetidos).toHaveBeenCalledWith('p-1', { Domain: null }))
    })
  })

  describe('os bloqueados', () => {
    it('lista o bloqueio com os cards marcados; o curinga aparece com *.', async () => {
      dublê.bloqueados.mockResolvedValue([
        bloqueio(),
        bloqueio({
          PublicId: 'b-2',
          Domain: 'golpe.com',
          IncludesSubdomains: true,
          MarkedCount: 0,
        }),
      ])

      montar()
      await abrirAba('Bloqueados')

      const copia = await itemDaLista('copia.com')
      expect(within(copia).getByText('2 cards marcados')).toBeTruthy()
      expect(within(copia).getByText(/por Ana/)).toBeTruthy()
      const golpe = await itemDaLista('*.golpe.com')
      // Sem card marcado, nao ha o que manter nem apagar.
      expect(
        within(golpe)
          .getAllByRole('button')
          .map((botao) => botao.textContent),
      ).toEqual(['Desbloquear'])
    })

    it('bloquear pelo campo manda o dominio e os subdominios marcados', async () => {
      dublê.bloquear.mockResolvedValue(bloqueio({ Domain: 'outro.com', MarkedCount: 0 }))

      montar()
      await abrirAba('Bloqueados')
      const campo = await screen.findByRole('textbox', { name: 'Domínio a bloquear' })
      const botao = screen.getByRole('button', { name: 'Bloquear domínio' }) as HTMLButtonElement
      expect(botao.disabled).toBe(true)

      fireEvent.change(campo, { target: { value: ' outro.com ' } })
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'Incluir os subdomínios — sem isso, só o endereço exato é bloqueado.',
        }),
      )
      fireEvent.click(botao)

      // Bloquear apaga de vez os retidos, os dos subdominios inclusive: confirma antes.
      const confirmacao = await screen.findByRole('alertdialog', {
        name: 'Bloquear *.outro.com?',
      })
      expect(within(confirmacao).getByText(/em todos os subdomínios dele/)).toBeTruthy()
      expect(
        within(confirmacao).getByText(/do domínio e dos subdomínios, são apagados de vez/),
      ).toBeTruthy()
      expect(dublê.bloquear).not.toHaveBeenCalled()
      fireEvent.click(within(confirmacao).getByRole('button', { name: 'Bloquear' }))

      await waitFor(() =>
        expect(dublê.bloquear).toHaveBeenCalledWith('p-1', {
          Domain: 'outro.com',
          IncludesSubdomains: true,
        }),
      )
      await waitFor(() => expect((campo as HTMLInputElement).value).toBe(''))
    })

    it('bloquear pelo campo e cancelar nao bloqueia, e o campo guarda o que foi escrito', async () => {
      montar()
      await abrirAba('Bloqueados')
      const campo = await screen.findByRole('textbox', { name: 'Domínio a bloquear' })
      fireEvent.change(campo, { target: { value: 'outro.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Bloquear domínio' }))

      const confirmacao = await screen.findByRole('alertdialog', { name: 'Bloquear outro.com?' })
      fireEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }))

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
      expect(dublê.bloquear).not.toHaveBeenCalled()
      expect((campo as HTMLInputElement).value).toBe('outro.com')
    })

    it('a recusa da API ao bloquear pelo campo fica no campo', async () => {
      const { PanelError } = await import('@/data')
      dublê.bloquear.mockRejectedValue(
        new PanelError('Este dominio ja esta bloqueado neste projeto.', 409),
      )
      montar()
      await abrirAba('Bloqueados')
      const campo = await screen.findByRole('textbox', { name: 'Domínio a bloquear' })
      fireEvent.change(campo, { target: { value: 'outro.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Bloquear domínio' }))
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Bloquear' }),
      )

      expect(await screen.findByText('Este domínio já está bloqueado neste projeto.')).toBeTruthy()
      expect((campo as HTMLInputElement).value).toBe('outro.com')
    })

    it('manter os cards marcados chama a API pelo bloqueio', async () => {
      dublê.bloqueados.mockResolvedValue([bloqueio()])
      dublê.manter.mockResolvedValue({ Affected: 2, SubtasksDeleted: 0 })

      montar()
      await abrirAba('Bloqueados')
      fireEvent.click(
        within(await itemDaLista('copia.com')).getByRole('button', {
          name: 'Manter os cards de copia.com',
        }),
      )

      await waitFor(() =>
        expect(dublê.manter).toHaveBeenCalledWith('p-1', { BlockedOriginId: 'b-1' }),
      )
    })

    it('apagar de vez so liga depois de escrever o dominio, e manda o que foi escrito', async () => {
      dublê.bloqueados.mockResolvedValue([bloqueio()])
      dublê.apagarMarcados.mockResolvedValue({ Affected: 2, SubtasksDeleted: 1 })

      montar()
      await abrirAba('Bloqueados')
      fireEvent.click(
        within(await itemDaLista('copia.com')).getByRole('button', {
          name: 'Apagar de vez os cards de copia.com',
        }),
      )

      const dialogo = await screen.findByRole('dialog', { name: 'Apagar de vez 2 cards?' })
      const confirmar = within(dialogo).getByRole('button', {
        name: 'Apagar 2 cards de vez',
      }) as HTMLButtonElement
      const campo = within(dialogo).getByRole('textbox', {
        name: 'Para confirmar, escreva copia.com ou apagar',
      })
      expect(confirmar.disabled).toBe(true)

      fireEvent.change(campo, { target: { value: 'copia' } })
      expect(confirmar.disabled).toBe(true)

      fireEvent.change(campo, { target: { value: 'copia.com' } })
      expect(confirmar.disabled).toBe(false)
      fireEvent.click(confirmar)

      await waitFor(() =>
        expect(dublê.apagarMarcados).toHaveBeenCalledWith('p-1', {
          BlockedOriginId: 'b-1',
          Confirmation: 'copia.com',
        }),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('no bloqueio com curinga, so "apagar" confirma: o dominio nao e um so', async () => {
      dublê.bloqueados.mockResolvedValue([bloqueio({ IncludesSubdomains: true })])

      montar()
      await abrirAba('Bloqueados')
      fireEvent.click(
        within(await itemDaLista('*.copia.com')).getByRole('button', {
          name: 'Apagar de vez os cards de *.copia.com',
        }),
      )

      const dialogo = await screen.findByRole('dialog')
      const campo = within(dialogo).getByRole('textbox', {
        name: 'Para confirmar, escreva apagar',
      })
      fireEvent.change(campo, { target: { value: 'copia.com' } })
      expect(
        (
          within(dialogo).getByRole('button', {
            name: 'Apagar 2 cards de vez',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true)
    })
  })

  describe('as abas', () => {
    const selecionada = (nome: string) => aba(nome).getAttribute('aria-selected') === 'true'
    const painelDe = (nome: string) =>
      document.getElementById(aba(nome).getAttribute('aria-controls') ?? '')

    it('sem retido, abre em Autorizados; os outros paineis ficam montados, escondidos', async () => {
      montar()

      await waitFor(() => expect(selecionada('Autorizados')).toBe(true))
      expect(selecionada('Aguardando')).toBe(false)
      expect(painelDe('Autorizados')?.hidden).toBe(false)
      expect(painelDe('Aguardando')?.hidden).toBe(true)
      // Escondido, e nao desmontado: a lista de espera continua no documento.
      expect(painelDe('Aguardando')?.querySelector('#aguardando-liberacao')).toBeTruthy()
      expect(painelDe('Aguardando')?.getAttribute('aria-labelledby')).toBe(aba('Aguardando').id)
      // Sem os limites, nao ha a aba Proteção.
      await waitFor(() =>
        expect(nomesDasAbas()).toEqual([
          'Aguardando (0)',
          'Autorizados (0)',
          'Bloqueados (0)',
          'Histórico',
        ]),
      )
    })

    it('o vazio de Autorizados diz o que fazer: o primeiro relato espera, e o teste local', async () => {
      montar()

      const vazio = await screen.findByText(/Nenhum endereço autorizado ainda/)
      expect(vazio.textContent).toMatch(/Aguardando liberação/)
      expect(vazio.textContent).toMatch(/localhost:3000/)
    })

    it('com retido, abre em Aguardando, e liberar o ultimo nao muda de aba', async () => {
      dublê.pendentes.mockResolvedValue([
        { Domain: 'novo.com', ReportCount: 3, LastReportAt: AGORA },
      ])
      dublê.autorizar.mockResolvedValue({
        PublicId: 'o-1',
        Domain: 'novo.com',
        AllowsSubdomains: false,
        CreatedAt: AGORA,
      })

      montar()
      const item = await itemDaLista('novo.com')
      expect(selecionada('Aguardando')).toBe(true)

      dublê.pendentes.mockResolvedValue([])
      fireEvent.click(within(item).getByRole('button', { name: 'Permitir novo.com' }))

      await waitFor(() => expect(aba('Aguardando').textContent).toBe('Aguardando (0)'))
      // A decisao foi tomada ao chegar: a aba nao foge de quem estava nela.
      expect(selecionada('Aguardando')).toBe(true)
    })

    it('setas, Home e End trocam de aba e levam o foco; so a escolhida entra no Tab', async () => {
      montar()
      await waitFor(() => expect(selecionada('Autorizados')).toBe(true))
      expect(aba('Autorizados').tabIndex).toBe(0)
      expect(aba('Aguardando').tabIndex).toBe(-1)

      fireEvent.keyDown(aba('Autorizados'), { key: 'ArrowRight' })
      expect(selecionada('Bloqueados')).toBe(true)
      expect(document.activeElement).toBe(aba('Bloqueados'))
      expect(painelDe('Bloqueados')?.hidden).toBe(false)
      expect(painelDe('Autorizados')?.hidden).toBe(true)

      fireEvent.keyDown(aba('Bloqueados'), { key: 'End' })
      expect(document.activeElement).toBe(aba('Histórico'))
      expect(selecionada('Histórico')).toBe(true)

      // Da ultima, a seta para a direita volta a primeira; e da primeira, a esquerda vai a ultima.
      fireEvent.keyDown(aba('Histórico'), { key: 'ArrowRight' })
      expect(document.activeElement).toBe(aba('Aguardando'))
      fireEvent.keyDown(aba('Aguardando'), { key: 'ArrowLeft' })
      expect(document.activeElement).toBe(aba('Histórico'))

      fireEvent.keyDown(aba('Histórico'), { key: 'Home' })
      expect(document.activeElement).toBe(aba('Aguardando'))
      expect(selecionada('Aguardando')).toBe(true)
      expect(aba('Aguardando').tabIndex).toBe(0)
      expect(aba('Histórico').tabIndex).toBe(-1)
    })

    it('a contagem de cada aba acompanha permitir e bloquear', async () => {
      dublê.pendentes.mockResolvedValue([
        { Domain: 'novo.com', ReportCount: 3, LastReportAt: AGORA },
      ])
      const autorizado = {
        PublicId: 'o-1',
        Domain: 'novo.com',
        AllowsSubdomains: false,
        CreatedAt: AGORA,
      }
      dublê.autorizar.mockResolvedValue(autorizado)
      dublê.bloquear.mockResolvedValue(bloqueio({ Domain: 'novo.com', MarkedCount: 3 }))

      montar()
      await waitFor(() =>
        expect(nomesDasAbas()).toEqual([
          'Aguardando (1)',
          'Autorizados (0)',
          'Bloqueados (0)',
          'Histórico',
        ]),
      )

      // Permitir: sai da espera e entra nos autorizados.
      dublê.pendentes.mockResolvedValue([])
      dublê.autorizados.mockResolvedValue([autorizado])
      fireEvent.click(
        within(await itemDaLista('novo.com')).getByRole('button', { name: 'Permitir novo.com' }),
      )
      await waitFor(() =>
        expect(nomesDasAbas()).toEqual([
          'Aguardando (0)',
          'Autorizados (1)',
          'Bloqueados (0)',
          'Histórico',
        ]),
      )

      // Bloquear pelo campo: sai dos autorizados e entra nos bloqueados, com os cards.
      dublê.autorizados.mockResolvedValue([])
      dublê.bloqueados.mockResolvedValue([bloqueio({ Domain: 'novo.com', MarkedCount: 3 })])
      await abrirAba('Bloqueados')
      fireEvent.change(screen.getByRole('textbox', { name: 'Domínio a bloquear' }), {
        target: { value: 'novo.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Bloquear domínio' }))
      fireEvent.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Bloquear' }),
      )
      await waitFor(() =>
        expect(nomesDasAbas()).toEqual([
          'Aguardando (0)',
          'Autorizados (0)',
          'Bloqueados (1 · 3 cards)',
          'Histórico',
        ]),
      )
    })

    it('o # do endereco escolhe a aba da ancora, ao chegar e com a tela ja aberta', async () => {
      // Com retido, a regra abriria em Aguardando; quem escolhe e o endereco.
      dublê.pendentes.mockResolvedValue([
        { Domain: 'novo.com', ReportCount: 3, LastReportAt: AGORA },
      ])
      const router = createMemoryRouter(
        [{ path: '/p', element: <DomainsSection projectPublicId="p-1" /> }],
        { initialEntries: ['/p#bloqueados'] },
      )
      render(<RouterProvider router={router} />)

      // Ja no primeiro desenho: a casca procura o alvo no quadro seguinte.
      expect(selecionada('Bloqueados')).toBe(true)
      await itemDaLista('novo.com')
      expect(selecionada('Bloqueados')).toBe(true)
      expect(document.getElementById('bloqueados')?.closest('[role="tabpanel"]')).toBe(
        painelDe('Bloqueados'),
      )

      await act(() => router.navigate('/p#dominios-observados'))
      expect(selecionada('Histórico')).toBe(true)
      expect(painelDe('Histórico')?.contains(document.getElementById('dominios-observados'))).toBe(
        true,
      )

      await act(() => router.navigate('/p#autorizados'))
      expect(selecionada('Autorizados')).toBe(true)

      await act(() => router.navigate('/p#aguardando-liberacao'))
      expect(selecionada('Aguardando')).toBe(true)

      // O mesmo aviso clicado de novo, depois de trocar de aba a mao, escolhe de novo.
      await act(() => router.navigate('/p#dominios'))
      fireEvent.click(aba('Histórico'))
      await act(() => router.navigate('/p#dominios'))
      expect(selecionada('Aguardando')).toBe(true)

      // Ancora que nao e desta tela nao mexe na aba; e sem os limites, `#limites` tambem nao.
      await act(() => router.navigate('/p#qualquer-coisa'))
      expect(selecionada('Aguardando')).toBe(true)
      await act(() => router.navigate('/p#limites'))
      expect(selecionada('Aguardando')).toBe(true)
    })
  })
})
