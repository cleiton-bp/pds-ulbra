// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { useCallback } from 'react'
import { describe, expect, it } from 'vitest'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'

/**
 * Este hook **concentrou num arquivo so** a guarda de corrida do painel inteiro:
 * concentrar sem testar troca quatro bugs pequenos por um grande, e nenhuma das
 * falhas originais aparecia em `tsc` nem no lint. O teste que importa e o da
 * corrida — o unico impossivel de ver clicando.
 *
 * `@vitest-environment jsdom` vale **so neste arquivo**; o `vite.config.ts` segue
 * dizendo Node.
 */

/** Promessa que este arquivo resolve na hora que quiser. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Encena a troca de projeto: monta com a promessa `antiga` e re-renderiza com a
 * `nova`. `useCallback` com a chave na lista e exatamente como as telas chamam.
 */
function trocarDeProjeto(antiga: Promise<string>, nova: Promise<string>) {
  return renderHook(
    ({ chave }: { chave: string }) => {
      const load = useCallback(() => (chave === 'projeto-a' ? antiga : nova), [chave])
      return useAsyncResource(load)
    },
    { initialProps: { chave: 'projeto-a' } },
  )
}

describe('useAsyncResource', () => {
  it('comeca carregando e entrega o que chegou', async () => {
    const { result } = renderHook(() => useAsyncResource(() => Promise.resolve('chegou')))

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()

    await waitFor(() => expect(result.current.data).toBe('chegou'))
    expect(result.current.loading).toBe(false)
    expect(result.current.failed).toBe(false)
  })

  it('marca falha sem derrubar o componente', async () => {
    const { result } = renderHook(() =>
      useAsyncResource(() => Promise.reject(new Error('sem rede'))),
    )

    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.data).toBeNull()
    // `loading` precisa ser falso aqui: e o que faz a tela mostrar o erro em vez
    // de deixar o esqueleto pulsando para sempre.
    expect(result.current.loading).toBe(false)
  })

  it('volta a carregar no reload, e o esqueleto reaparece na hora', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    let call = 0
    const load = () => (++call === 1 ? first.promise : second.promise)

    const { result } = renderHook(() => useAsyncResource(load))

    await act(async () => first.resolve('primeira'))
    expect(result.current.data).toBe('primeira')

    act(() => result.current.reload())
    // Sem isto o "Tentar de novo" nao mudava nada na tela ate a resposta chegar.
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()

    await act(async () => second.resolve('segunda'))
    expect(result.current.data).toBe('segunda')
  })

  it('descarta a resposta antiga que chega depois da nova', async () => {
    // Trocar de projeto dispara a busca de B sem cancelar a de A. Se a de A chegar
    // depois, sem guarda ela sobrescreve e a tela mostra as chaves erradas.
    const antiga = deferred<string>()
    const nova = deferred<string>()
    const { result, rerender } = trocarDeProjeto(antiga.promise, nova.promise)

    rerender({ chave: 'projeto-b' })

    await act(async () => nova.resolve('chaves do projeto B'))
    expect(result.current.data).toBe('chaves do projeto B')

    // A resposta atrasada do projeto A chega agora. Tem que ser ignorada.
    await act(async () => antiga.resolve('chaves do projeto A'))
    expect(result.current.data).toBe('chaves do projeto B')
  })

  it('a falha atrasada da chamada antiga tambem e descartada', async () => {
    // Espelho do teste acima: sem a guarda no `catch`, um erro velho pintaria "nao
    // deu para carregar" por cima de dados que chegaram certos.
    const antiga = deferred<string>()
    const nova = deferred<string>()
    const { result, rerender } = trocarDeProjeto(antiga.promise, nova.promise)

    rerender({ chave: 'projeto-b' })

    await act(async () => nova.resolve('chegou certo'))
    await act(async () => {
      antiga.reject(new Error('a antiga falhou tarde'))
      await antiga.promise.catch(() => {})
    })

    expect(result.current.failed).toBe(false)
    expect(result.current.data).toBe('chegou certo')
  })
})
