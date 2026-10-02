import { useCallback, useEffect, useRef, useState } from 'react'
import { isDefinitiveError } from '@/data/errors'

/**
 * Carrega algo de fora e devolve os tres estados que a tela desenha. Nao conhece
 * dominio nenhum: recebe uma funcao que devolve promessa.
 *
 * `load` precisa ser **estavel** (`useCallback`). Funcao nova a cada render faz o
 * efeito rodar a cada render, e o componente entra em laco de requisicao — e o
 * unico jeito de usar isto errado.
 */
export interface AsyncResource<T> {
  /** `null` enquanto carrega e quando falha. */
  data: T | null
  loading: boolean
  failed: boolean
  /** Busca de novo **do zero**: o esqueleto volta. E o do "Tentar de novo". */
  reload: () => void
  /**
   * Busca de novo **sem tirar o que esta na tela**: a resposta nova substitui a
   * antiga quando chega, e se a falha for passageira — rede, servidor — a antiga
   * fica.
   *
   * E o de renovar enderecos que vencem. Com o `reload`, a lista sumia no meio — e
   * levava junto a imagem ou o video que alguem estava olhando.
   *
   * **A falha definitiva vira falha**, como na primeira leitura: a API disse que
   * nao — a pessoa saiu do projeto, o armazenamento saiu. Engolida, ela
   * deixava na tela uma lista cujos enderecos ninguem mais ia renovar, e quem pede a
   * renovacao continuava pedindo, calado, para sempre.
   *
   * **Uma renovacao de cada vez.** Pedida de novo enquanto a anterior nao voltou, nao
   * sai outra: a resposta que ja vem serve a todos. Uma lista alimenta varias
   * galerias — a do relato, a de cada resposta, a de cada reabertura —, e cada uma
   * pede quando os enderecos dela vencem; como vencem juntos, eram tantos pedidos
   * iguais quantas galerias houvesse na tela.
   */
  refresh: () => void
}

export function useAsyncResource<T>(load: () => Promise<T>): AsyncResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [failed, setFailed] = useState(false)

  /**
   * Trocar de projeto dispara uma busca nova sem cancelar a anterior: sem o
   * contador, a resposta do projeto que a pessoa acabou de sair chega depois e
   * pinta dado errado numa tela que ja mudou de assunto.
   */
  const requestId = useRef(0)

  /** A renovacao a caminho, pelo numero do pedido. Ver `refresh`. */
  const renovando = useRef<number | null>(null)

  /**
   * Ha dado na tela. A renovacao que falha de passagem so o preserva quando ele
   * existe: pedida antes de a primeira leitura voltar, ela a substitui, e falhando
   * deixaria o esqueleto na tela para sempre.
   */
  const temDado = useRef(false)

  const run = useCallback(async () => {
    const id = ++requestId.current

    // Zerar antes de comecar e o que faz o esqueleto voltar no "Tentar de novo";
    // sem isso o botao nao muda nada na tela por 200 ms.
    setFailed(false)
    setData(null)
    temDado.current = false

    try {
      const loaded = await load()
      if (id !== requestId.current) return
      setData(loaded)
      temDado.current = true
    } catch {
      // A mensagem e da tela: este arquivo nao sabe nem o que carregou.
      if (id === requestId.current) setFailed(true)
    }
  }, [load])

  useEffect(() => {
    void run()
  }, [run])

  // Nao devolve a promessa de proposito: quem chama e um `onClick`, e um
  // `reload` "thenable" muda o comportamento do `act` nos testes.
  const reload = useCallback(() => {
    void run()
  }, [run])

  const refresh = useCallback(() => {
    // A que esta a caminho ainda e a mais nova: a resposta dela serve.
    if (renovando.current !== null && renovando.current === requestId.current) return

    const id = ++requestId.current
    renovando.current = id

    void load()
      .finally(() => {
        if (renovando.current === id) renovando.current = null
      })
      .then(
        (loaded) => {
          if (id !== requestId.current) return
          setData(loaded)
          setFailed(false)
          temDado.current = true
        },
        (error) => {
          if (id !== requestId.current) return

          // Passageira: o que esta na tela continua. E melhor um endereco que talvez
          // ainda sirva do que uma lista que some.
          if (!isDefinitiveError(error) && temDado.current) return

          setData(null)
          setFailed(true)
          temDado.current = false
        },
      )
  }, [load])

  return { data, loading: data === null && !failed, failed, reload, refresh }
}
