// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsHeader } from '@/shared/components/SettingsHeader'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **O salvar fica no titulo, sempre a vista, e so liga com mudanca.** Era uma barra
 * presa no pe da tela, que cobria o campo e a previa ao rolar. Sem mudanca o titulo diz
 * "Tudo publicado" (ou "Tudo salvo") e os botoes ficam desligados — um botao aceso
 * convida a clicar sem nada para salvar; com mudanca, diz quantas sao.
 *
 * **Sair com mudanca pergunta antes**, e o destaque e voltar: "Voltar e salvar" fica
 * na tela e salva, que e o que a pessoa ia fazer se tivesse visto o botao. So a troca
 * de endereco conta — a mesma tela com outra busca e a propria tela se atualizando.
 * Fechar a aba ou recarregar fica com o aviso do navegador.
 */
interface Props {
  salvar?: () => void
  descartar?: () => void
  canSave?: boolean
  saving?: boolean
  ready?: boolean
  publishes?: boolean
  /** Sem `changeCount`: a tela que nao conta. */
  semConta?: boolean
  comMudanca?: number
}

function Tela({
  salvar = () => {},
  descartar = () => {},
  canSave = true,
  saving = false,
  ready = true,
  publishes = false,
  semConta = false,
  comMudanca = 0,
}: Props) {
  const [mudancas, setMudancas] = useState(comMudanca)

  return (
    <div>
      <SettingsHeader
        title="O botão"
        description="O que se resolve nesta tela."
        status={<span>pílula</span>}
        ready={ready}
        dirty={mudancas > 0}
        changeCount={semConta ? undefined : mudancas}
        saving={saving}
        canSave={canSave}
        onSave={salvar}
        onDiscard={() => {
          descartar()
          setMudancas(0)
        }}
        publishes={publishes}
      />
      <button type="button" onClick={() => setMudancas((atual) => atual + 1)}>
        mudar
      </button>
      <Link to="/outra">ir para outra tela</Link>
      <Link to="/tela?aba=2">mesma tela, outra aba</Link>
    </div>
  )
}

function montar(props: Props = {}) {
  const router = createMemoryRouter(
    [
      { path: '/tela', element: <Tela {...props} /> },
      { path: '/outra', element: <p>outra tela</p> },
    ],
    { initialEntries: ['/tela'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const botao = (nome: string) => screen.getByRole('button', { name: nome }) as HTMLButtonElement

describe('SettingsHeader', () => {
  afterEach(cleanup)

  it('mostra o título, o que vai ao lado dele e a frase do que se resolve na tela', () => {
    montar()

    expect(screen.getByRole('heading', { level: 1, name: 'O botão' })).toBeTruthy()
    expect(screen.getByText('pílula')).toBeTruthy()
    expect(screen.getByText('O que se resolve nesta tela.')).toBeTruthy()
  })

  it('sem mudança: "Tudo publicado", e Publicar e Descartar desligados', () => {
    const salvar = vi.fn()
    montar({ publishes: true, salvar })

    expect(screen.getByText('Tudo publicado')).toBeTruthy()
    expect(botao('Publicar').disabled).toBe(true)
    expect(botao('Descartar').disabled).toBe(true)

    fireEvent.click(botao('Publicar'))
    expect(salvar).not.toHaveBeenCalled()
  })

  it('sem mudança, na tela que salva: "Tudo salvo"', () => {
    montar()

    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(botao('Salvar').disabled).toBe(true)
  })

  it('com mudança: a conta, e Publicar e Descartar ligados', () => {
    const salvar = vi.fn()
    montar({ publishes: true, salvar })

    fireEvent.click(botao('mudar'))
    expect(screen.getByText('1 mudança não publicada')).toBeTruthy()
    expect(screen.queryByText('Tudo publicado')).toBeNull()

    fireEvent.click(botao('mudar'))
    expect(screen.getByText('2 mudanças não publicadas')).toBeTruthy()

    expect(botao('Descartar').disabled).toBe(false)
    fireEvent.click(botao('Publicar'))
    expect(salvar).toHaveBeenCalledTimes(1)
  })

  it('na tela que salva, a conta diz "não salvas"', () => {
    montar({ comMudanca: 3 })

    expect(screen.getByText('3 mudanças não salvas')).toBeTruthy()
    expect(botao('Salvar').disabled).toBe(false)
  })

  it('a tela que não conta diz só "Mudanças não salvas"', () => {
    montar({ semConta: true, comMudanca: 1 })

    expect(screen.getByText('Mudanças não salvas')).toBeTruthy()
  })

  it('descartar desfaz e volta a "Tudo publicado"', () => {
    const descartar = vi.fn()
    montar({ publishes: true, descartar, comMudanca: 2 })

    fireEvent.click(botao('Descartar'))

    expect(descartar).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Tudo publicado')).toBeTruthy()
    expect(botao('Publicar').disabled).toBe(true)
  })

  it('publicando, o botão diz "Publicando…" e os dois ficam desligados', () => {
    montar({ publishes: true, saving: true, comMudanca: 1 })

    expect(botao('Publicando…').disabled).toBe(true)
    expect(botao('Descartar').disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Publicar' })).toBeNull()
  })

  it('salvando, o botão diz "Salvando…"', () => {
    montar({ saving: true, comMudanca: 1 })

    expect(botao('Salvando…').disabled).toBe(true)
  })

  it('com campo a corrigir, o Salvar fica desligado e o Descartar não', () => {
    montar({ canSave: false, comMudanca: 1 })

    expect(botao('Salvar').disabled).toBe(true)
    expect(botao('Descartar').disabled).toBe(false)
  })

  it('enquanto a tela lê a API, não há botões nem estado: a tela ainda não sabe', () => {
    montar({ ready: false })

    expect(screen.getByRole('heading', { level: 1, name: 'O botão' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    expect(screen.queryByText('Tudo salvo')).toBeNull()
  })

  it('sem mudança, sair é direto', async () => {
    const router = montar()

    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))

    expect(await screen.findByText('outra tela')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/outra')
  })

  it('sair com mudança pergunta antes, e "Voltar e salvar" fica na tela e salva', async () => {
    const salvar = vi.fn()
    const router = montar({ salvar })

    fireEvent.click(botao('mudar'))
    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))

    const pergunta = await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })
    expect(within(pergunta).getByText('As mudanças desta tela vão se perder.')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/tela')
    expect(salvar).not.toHaveBeenCalled()

    fireEvent.click(within(pergunta).getByRole('button', { name: 'Voltar e salvar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(salvar).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/tela')
  })

  it('"Sair sem salvar" sai, sem salvar', async () => {
    const salvar = vi.fn()
    const router = montar({ salvar })

    fireEvent.click(botao('mudar'))
    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))
    const pergunta = await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })

    fireEvent.click(within(pergunta).getByRole('button', { name: 'Sair sem salvar' }))

    expect(await screen.findByText('outra tela')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/outra')
    expect(salvar).not.toHaveBeenCalled()
  })

  it('a mesma tela com outra busca no endereço não pergunta', async () => {
    const router = montar()

    fireEvent.click(botao('mudar'))
    fireEvent.click(screen.getByRole('link', { name: 'mesma tela, outra aba' }))

    await waitFor(() => expect(router.state.location.search).toBe('?aba=2'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    // A mudanca continua: a busca nao a levou embora.
    expect(screen.getByText('1 mudança não salva')).toBeTruthy()
  })

  it('com campo a corrigir, a pergunta ao sair só oferece voltar', async () => {
    const salvar = vi.fn()
    const router = montar({ salvar, canSave: false })

    fireEvent.click(botao('mudar'))
    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))
    const pergunta = await screen.findByRole('alertdialog', { name: 'Sair sem salvar?' })
    expect(within(pergunta).queryByRole('button', { name: 'Voltar e salvar' })).toBeNull()

    fireEvent.click(within(pergunta).getByRole('button', { name: 'Voltar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(salvar).not.toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/tela')
  })

  it('salvando, sair não pergunta', async () => {
    const router = montar({ saving: true, comMudanca: 1 })

    fireEvent.click(screen.getByRole('link', { name: 'ir para outra tela' }))

    expect(await screen.findByText('outra tela')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/outra')
  })

  it('fechar ou recarregar a aba com mudança pede o aviso do navegador', () => {
    montar()

    const semMudanca = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(semMudanca)
    expect(semMudanca.defaultPrevented).toBe(false)

    fireEvent.click(botao('mudar'))

    const comMudanca = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(comMudanca)
    expect(comMudanca.defaultPrevented).toBe(true)
  })
})
