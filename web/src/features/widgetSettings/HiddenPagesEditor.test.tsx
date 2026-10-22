// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WIDGET_APPEARANCE_LIMITS } from '@/contracts'
import { HiddenPagesEditor, problemaDoCaminho } from '@/features/widgetSettings/HiddenPagesEditor'

/**
 * O QUE ESTES TESTES TRAVAM: a lista das paginas onde o botao nao aparece, em etiquetas.
 *
 * - **Um campo e Adicionar**: Enter tambem adiciona, o campo limpa, e a pagina vira uma
 *   etiqueta com o × que diz qual tira.
 * - **O erro aparece na linha, antes de adicionar**, com a mesma regra da API; vazio e
 *   repetido nao entram, e dizem por que.
 * - **Os exemplos entram num clique**, e o que ja esta na lista desliga.
 * - **O contador "3 de 20"**, e cheio, o campo desliga dizendo o limite.
 * - **"Testar endereço"** responde se o botao aparece, e qual pagina o esconde.
 * - **A etiqueta continua editavel**, no mesmo lugar da lista.
 */

/** O editor com a lista guardada, como a tela usa — e cada mudanca anotada. */
function Controlado({
  inicial,
  aoMudar = () => {},
}: {
  inicial: string[]
  aoMudar?: (lista: string[]) => void
}) {
  const [lista, setLista] = useState(inicial)
  return (
    <HiddenPagesEditor
      value={lista}
      onChange={(nova) => {
        aoMudar(nova)
        setLista(nova)
      }}
    />
  )
}

const campo = () => screen.getByRole('textbox', { name: 'Caminho da página' }) as HTMLInputElement
const adicionar = () => screen.getByRole('button', { name: 'Adicionar' }) as HTMLButtonElement
const etiquetas = () =>
  within(screen.getByRole('list', { name: 'Páginas escondidas' }))
    .getAllByRole('listitem')
    .map((item) => item.firstChild?.textContent)

describe('HiddenPagesEditor', () => {
  afterEach(cleanup)

  it('adicionar pelo botao ou pelo Enter vira etiqueta, e o campo limpa', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial={[]} aoMudar={aoMudar} />)
    expect(screen.queryByRole('list', { name: 'Páginas escondidas' })).toBeNull()
    expect(screen.getByText('0 de 20 páginas')).toBeTruthy()

    fireEvent.change(campo(), { target: { value: '/checkout' } })
    fireEvent.click(adicionar())
    expect(aoMudar).toHaveBeenLastCalledWith(['/checkout'])
    expect(campo().value).toBe('')

    fireEvent.change(campo(), { target: { value: ' /conta ' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })
    expect(aoMudar).toHaveBeenLastCalledWith(['/checkout', '/conta'])
    expect(etiquetas()).toEqual(['/checkout', '/conta'])
    expect(screen.getByText('2 de 20 páginas')).toBeTruthy()
  })

  it('o erro aparece na linha antes de adicionar, e o errado nao entra', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial={[]} aoMudar={aoMudar} />)

    fireEvent.change(campo(), { target: { value: 'checkout' } })
    const erro = screen.getByText('O caminho começa com uma barra, como /checkout.')
    expect(campo().getAttribute('aria-invalid')).toBe('true')
    expect(campo().getAttribute('aria-describedby')).toBe(erro.id)

    fireEvent.click(adicionar())
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('vazio e repetido nao entram, e dizem por que', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial={['/Checkout/']} aoMudar={aoMudar} />)

    fireEvent.click(adicionar())
    expect(screen.getByText('Escreva o caminho da página, como /checkout.')).toBeTruthy()

    // Maiusculas e a barra do fim nao fazem diferenca para o botao: e a mesma pagina.
    fireEvent.change(campo(), { target: { value: '/checkout' } })
    fireEvent.click(adicionar())
    expect(screen.getByText('/checkout já está na lista.')).toBeTruthy()
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('o × tira a etiqueta certa, pelo nome dela', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial={['/a', '/b', '/c']} aoMudar={aoMudar} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remover /b' }))

    expect(aoMudar).toHaveBeenLastCalledWith(['/a', '/c'])
    expect(etiquetas()).toEqual(['/a', '/c'])
  })

  it('a etiqueta continua editavel: clicar leva ao campo, e Trocar poe no mesmo lugar', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial={['/a', '/b', '/c']} aoMudar={aoMudar} />)

    fireEvent.click(screen.getByRole('button', { name: 'Editar /b' }))
    expect(campo().value).toBe('/b')
    expect(screen.getByText('Trocando /b. Enter guarda.')).toBeTruthy()

    fireEvent.change(campo(), { target: { value: '/conta/*' } })
    fireEvent.keyDown(campo(), { key: 'Enter' })

    expect(aoMudar).toHaveBeenLastCalledWith(['/a', '/conta/*', '/c'])
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeTruthy()
  })

  it('os exemplos entram num clique, e o que ja esta na lista desliga', () => {
    const aoMudar = vi.fn()
    render(<Controlado inicial={['/checkout']} aoMudar={aoMudar} />)

    const checkout = screen.getByRole('button', { name: 'Adicionar /checkout' })
    expect((checkout as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar /login/*' }))
    expect(aoMudar).toHaveBeenLastCalledWith(['/checkout', '/login/*'])
  })

  it('cheia, o campo e os exemplos desligam e dizem o limite', () => {
    const cheia = Array.from(
      { length: WIDGET_APPEARANCE_LIMITS.MaxHiddenPaths },
      (_, indice) => `/p${indice}`,
    )
    const aoMudar = vi.fn()
    render(<Controlado inicial={cheia} aoMudar={aoMudar} />)

    expect(screen.getByText('20 de 20 páginas')).toBeTruthy()
    expect(screen.getByText(/Limite de 20 páginas/)).toBeTruthy()
    expect(campo().disabled).toBe(true)
    expect(adicionar().disabled).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Adicionar /admin/*' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(adicionar())
    expect(aoMudar).not.toHaveBeenCalled()
  })

  it('testar endereço diz se o botao aparece, e qual pagina o esconde', () => {
    render(<Controlado inicial={['/login/*']} />)
    const teste = screen.getByRole('textbox', { name: 'Testar endereço' })

    fireEvent.change(teste, { target: { value: 'https://loja.com.br/login/conta?volta=1' } })
    expect(screen.getByRole('status').textContent).toBe('Escondido em /login/conta, por /login/*.')

    fireEvent.change(teste, { target: { value: '/produtos' } })
    expect(screen.getByRole('status').textContent).toBe('O botão aparece em /produtos.')
  })
})

describe('problemaDoCaminho', () => {
  it('aceita o caminho, o curinga no fim e a linha vazia', () => {
    expect(problemaDoCaminho('/checkout')).toBeNull()
    expect(problemaDoCaminho('/login/*')).toBeNull()
    expect(problemaDoCaminho('  /Conta/  ')).toBeNull()
    expect(problemaDoCaminho('   ')).toBeNull()
  })

  it('recusa sem barra, com ? ou #, com espaco e com o * no meio', () => {
    expect(problemaDoCaminho('checkout')).toBe('O caminho começa com uma barra, como /checkout.')
    expect(problemaDoCaminho('/busca?q=1')).toBe(
      'Escreva só o caminho, sem o que vem depois de ? ou #.',
    )
    expect(problemaDoCaminho('/a#b')).toBe('Escreva só o caminho, sem o que vem depois de ? ou #.')
    expect(problemaDoCaminho('/minha conta')).toBe('O caminho não pode ter espaços.')
    expect(problemaDoCaminho('/login/*/x')).toBe('O * só vale no fim, como /login/*.')
  })
})
