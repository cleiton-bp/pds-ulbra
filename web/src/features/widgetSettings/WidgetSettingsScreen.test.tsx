// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectViewModel, WidgetSettingsViewModel } from '@/contracts'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { WidgetSettingsScreen } from '@/features/widgetSettings/WidgetSettingsScreen'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * Tres deles seguram promessas que a tela faz, e que so quebram em silencio:
 *
 * - **a barra de publicar so existe quando ha o que publicar.** Um botao sempre
 *   aceso ensina que o clique nao faz diferenca;
 * - **a previa mostra o que esta publicado**, e diz isso enquanto houver mudanca
 *   por publicar. Previa que parece ao vivo e nao esta e pior do que nenhuma;
 * - **o rotulo do tipo muda de significado** quando o seletor esta escondido: ali
 *   ele deixa de ser "vem marcado" e vira "e o unico que vai existir".
 *
 * O quarto e o contrato com a API: publicar manda **os dez campos**, porque a
 * rota substitui a linha inteira — mandar menos apagaria o resto.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<WidgetSettingsViewModel>>(),
  salvar: vi.fn(),
  chaves: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectWidgetSettingsService: {
      getWidgetSettings: dublê.ler,
      saveWidgetSettings: dublê.salvar,
    },
    projectKeyService: {
      listProjectKeys: dublê.chaves,
      regenerateSecretKey: async () => {
        throw new Error('nao e usado nesta tela')
      },
    },
  }
})

function projeto(publicId: string): ProjectViewModel {
  return {
    PublicId: publicId,
    Name: 'Loja',
    Status: 'Active',
    CreatedAt: '2026-08-01T12:00:00.000Z',
    UpdatedAt: '2026-08-01T12:00:00.000Z',
  }
}

function ProjetoDaRota() {
  const { publicId = '' } = useParams()
  return <Outlet context={{ project: projeto(publicId) }} />
}

function montar() {
  render(
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path: '/p/:publicId',
            element: <ProjetoDaRota />,
            children: [{ index: true, element: <WidgetSettingsScreen /> }],
          },
        ],
        { initialEntries: ['/p/p-1'] },
      )}
    />,
  )
}

const campoBotao = () => screen.getByRole('textbox', { name: 'Botão parado na página' })
/** O primeiro acesso espera a leitura da API; os seguintes ja encontram a tela. */
const esperarCampoBotao = () => screen.findByRole('textbox', { name: 'Botão parado na página' })
const barra = () => screen.queryByRole('button', { name: 'Publicar' })

describe('WidgetSettingsScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.ler.mockReset()
    dublê.salvar.mockReset()
    dublê.chaves.mockReset()

    dublê.ler.mockResolvedValue(DEFAULT_WIDGET_SETTINGS)
    dublê.chaves.mockResolvedValue([
      {
        PublicId: 'k-1',
        Type: 'Public',
        Value: 'pk_DEMO',
        Prefix: 'pk_',
        IsActive: true,
        CreatedAt: '2026-08-01T12:00:00.000Z',
        RevokedAt: null,
        LastUsedAt: null,
      },
    ])
  })

  it('mostra o que esta salvo', async () => {
    montar()

    expect((await esperarCampoBotao()).getAttribute('value')).toBe(
      DEFAULT_WIDGET_SETTINGS.LauncherLabel,
    )
  })

  it('sem mudanca nao ha o que publicar, e a barra nao existe', async () => {
    montar()

    await esperarCampoBotao()
    expect(barra()).toBeNull()
  })

  it('a barra aparece com a primeira mudanca e some ao descartar', async () => {
    montar()

    fireEvent.change(await esperarCampoBotao(), { target: { value: 'Fale com a gente' } })
    expect(barra()).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(barra()).toBeNull()
  })

  it('publicar manda os dez campos, porque a rota substitui a linha inteira', async () => {
    dublê.salvar.mockImplementation(
      async (_publicId: string, settings: WidgetSettingsViewModel) => settings,
    )

    montar()

    fireEvent.change(await esperarCampoBotao(), { target: { value: 'Fale com a gente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as WidgetSettingsViewModel
    expect(Object.keys(enviado).sort()).toEqual(Object.keys(DEFAULT_WIDGET_SETTINGS).sort())
    expect(enviado.LauncherLabel).toBe('Fale com a gente')

    // A base virou o que a API devolveu: nao ha mais o que publicar.
    await waitFor(() => expect(barra()).toBeNull())
  })

  it('a previa avisa que mostra o publicado enquanto houver mudanca por publicar', async () => {
    montar()

    expect(await screen.findByText('igual ao seu site')).toBeTruthy()

    fireEvent.change(campoBotao(), { target: { value: 'Fale com a gente' } })

    expect(screen.getByText('mostrando o que está publicado')).toBeTruthy()
    expect(screen.queryByText('igual ao seu site')).toBeNull()
  })

  it('o rotulo do tipo muda de significado quando o seletor esta escondido', async () => {
    montar()

    expect(await screen.findByText('Tipo pré-marcado')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: /escolher o tipo/ }))

    expect(screen.getByText('Tipo de todos os relatos')).toBeTruthy()
    expect(screen.queryByText('Tipo pré-marcado')).toBeNull()
  })

  it('desligar avisa o que para de funcionar', async () => {
    montar()

    fireEvent.click(await screen.findByRole('checkbox', { name: /Mostrar a ferramenta/ }))

    expect(screen.getByText(/ninguém no seu site consegue relatar/)).toBeTruthy()
  })

  /**
   * O seletor de cor nao e exercitado aqui de proposito: ele so aparece com uma
   * cor para comecar, e essa cor vem da folha de estilo — que o jsdom nao carrega.
   * Escreve-la neste arquivo seria cor crua num `.tsx`, que `designSystem.test.ts`
   * reprova com razao. Quem cobre a leitura e `productAccent.test.ts`, que e
   * `.ts` e por isso pode escrever cor.
   *
   * O que da para travar aqui e o que importa na tela: **o padrao nao e uma cor**.
   * Enquanto ninguem escolher, nao existe campo de cor nenhum.
   */
  it('o padrao nao e uma cor: sem escolher, nao ha campo de cor', async () => {
    montar()

    await esperarCampoBotao()

    expect(screen.getByRole('button', { name: 'Padrão' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByLabelText('Cor do botão')).toBeNull()
  })

  it('falha ao carregar nao diz que o site parou', async () => {
    dublê.ler.mockRejectedValue(new Error('rede'))

    montar()

    expect(await screen.findByText(/continua com o que já estava publicado/)).toBeTruthy()
  })
})
