// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { useCallback } from 'react'
import { describe, expect, it } from 'vitest'
import { isDefinitiveError, PanelError } from '@/data/errors'
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

describe('refresh: renovar sem tirar da tela', () => {
  /** Load estavel que entrega, em ordem, o que a lista pedir. */
  function emSequencia(respostas: Array<() => Promise<string>>) {
    let chamada = 0
    return renderHook(() => {
      const load = useCallback(() => {
        const proxima = respostas[Math.min(chamada++, respostas.length - 1)]
        if (!proxima) throw new Error('o teste nao deu resposta para esta chamada')
        return proxima()
      }, [])
      return useAsyncResource(load)
    })
  }

  it('troca os dados sem passar pelo vazio — a lista nao some no meio', async () => {
    const segunda = deferred<string>()
    const { result } = emSequencia([
      () => Promise.resolve('enderecos velhos'),
      () => segunda.promise,
    ])
    await waitFor(() => expect(result.current.data).toBe('enderecos velhos'))

    act(() => result.current.refresh())

    // Enquanto a resposta nao chega, o que estava continua — e o reload, ao
    // contrario, zeraria aqui.
    expect(result.current.data).toBe('enderecos velhos')
    expect(result.current.loading).toBe(false)

    await act(async () => segunda.resolve('enderecos novos'))
    expect(result.current.data).toBe('enderecos novos')
  })

  it('renovacao que falha deixa o que estava, sem marcar falha', async () => {
    const { result } = emSequencia([
      () => Promise.resolve('enderecos velhos'),
      () => Promise.reject(new Error('sem rede')),
    ])
    await waitFor(() => expect(result.current.data).toBe('enderecos velhos'))

    await act(async () => result.current.refresh())

    expect(result.current.data).toBe('enderecos velhos')
    expect(result.current.failed).toBe(false)
  })

  it.each([
    [0, 'rede caida'],
    [500, 'servidor'],
    [503, 'servidor fora'],
    [408, 'demorou'],
    [429, 'muitas tentativas'],
  ])('falha passageira (%i, %s) deixa o que estava', async (status) => {
    const { result } = emSequencia([
      () => Promise.resolve('enderecos velhos'),
      () => Promise.reject(new PanelError('passageira', status)),
    ])
    await waitFor(() => expect(result.current.data).toBe('enderecos velhos'))

    await act(async () => result.current.refresh())

    expect(result.current.data).toBe('enderecos velhos')
    expect(result.current.failed).toBe(false)
  })

  it.each([
    [400, 'pedido recusado'],
    [401, 'sessao'],
    [403, 'sem acesso'],
    [404, 'relato fora do alcance'],
    [409, 'armazenamento fora'],
  ])('falha definitiva (%i, %s) vira falha, como na primeira leitura', async (status) => {
    // Engolida, ela deixava na tela enderecos que ninguem ia renovar, e a galeria
    // pedindo de novo, calada, para sempre.
    const { result } = emSequencia([
      () => Promise.resolve('enderecos velhos'),
      () => Promise.reject(new PanelError('definitiva', status)),
    ])
    await waitFor(() => expect(result.current.data).toBe('enderecos velhos'))

    await act(async () => result.current.refresh())

    expect(result.current.failed).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('a falha definitiva de uma renovacao velha nao apaga a resposta nova', async () => {
    const velha = deferred<string>()
    const { result } = emSequencia([
      () => Promise.resolve('primeira'),
      () => velha.promise,
      () => Promise.resolve('enderecos novos'),
    ])
    await waitFor(() => expect(result.current.data).toBe('primeira'))

    // A renovacao sai, e o "Tentar de novo" busca do zero antes de ela voltar.
    act(() => result.current.refresh())
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.data).toBe('enderecos novos'))

    await act(async () => {
      velha.reject(new PanelError('tarde', 404))
      await velha.promise.catch(() => {})
    })

    expect(result.current.data).toBe('enderecos novos')
    expect(result.current.failed).toBe(false)
  })

  it('pedida de novo enquanto a anterior nao voltou, nao sai outra: a resposta serve a todos', async () => {
    // Varias galerias leem a mesma lista, e os enderecos delas vencem juntos.
    const segunda = deferred<string>()
    let chamadas = 0
    const { result } = renderHook(() => {
      const load = useCallback(() => {
        chamadas++
        return chamadas === 1 ? Promise.resolve('enderecos velhos') : segunda.promise
      }, [])
      return useAsyncResource(load)
    })
    await waitFor(() => expect(result.current.data).toBe('enderecos velhos'))

    act(() => {
      result.current.refresh()
      result.current.refresh()
      result.current.refresh()
    })
    expect(chamadas).toBe(2)

    await act(async () => segunda.resolve('enderecos novos'))
    expect(result.current.data).toBe('enderecos novos')

    // Voltou: a proxima renovacao sai normalmente.
    act(() => result.current.refresh())
    expect(chamadas).toBe(3)
  })

  it('a renovacao que falhou tambem libera a proxima', async () => {
    const { result } = emSequencia([
      () => Promise.resolve('enderecos velhos'),
      () => Promise.reject(new PanelError('fora do ar', 503)),
      () => Promise.resolve('enderecos novos'),
    ])
    await waitFor(() => expect(result.current.data).toBe('enderecos velhos'))

    await act(async () => result.current.refresh())
    await act(async () => result.current.refresh())

    expect(result.current.data).toBe('enderecos novos')
  })

  it('renovacao pedida antes da primeira leitura, e que falha de passagem, vira falha — e nao esqueleto para sempre', async () => {
    // A pagina de acompanhamento rele depois de um envio, e o envio pode terminar antes
    // de a primeira lista chegar.
    const primeira = deferred<string>()
    const { result } = emSequencia([
      () => primeira.promise,
      () => Promise.reject(new PanelError('sem rede', 0)),
    ])

    await act(async () => result.current.refresh())
    await act(async () => primeira.resolve('tarde demais'))

    expect(result.current.loading).toBe(false)
    expect(result.current.failed).toBe(true)
  })

  it('depois da falha definitiva, o "Tentar de novo" busca do zero', async () => {
    const { result } = emSequencia([
      () => Promise.resolve('primeira'),
      () => Promise.reject(new PanelError('armazenamento fora', 409)),
      () => Promise.resolve('voltou'),
    ])
    await waitFor(() => expect(result.current.data).toBe('primeira'))
    await act(async () => result.current.refresh())
    expect(result.current.failed).toBe(true)

    act(() => result.current.reload())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.data).toBe('voltou'))
    expect(result.current.failed).toBe(false)
  })
})

describe('isDefinitiveError', () => {
  it('so o erro da camada de dados com um 4xx que se repetiria', () => {
    expect(isDefinitiveError(new PanelError('x', 404))).toBe(true)
    expect(isDefinitiveError(new PanelError('x', 499))).toBe(true)
    expect(isDefinitiveError(new PanelError('x', 399))).toBe(false)
    expect(isDefinitiveError(new PanelError('x', 500))).toBe(false)
    expect(isDefinitiveError(new Error('qualquer'))).toBe(false)
    expect(isDefinitiveError('texto')).toBe(false)
  })
})
