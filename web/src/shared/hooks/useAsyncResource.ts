import { useCallback, useEffect, useRef, useState } from 'react'

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
   * antiga quando chega, e se falhar a antiga fica.
   *
   * E o de renovar enderecos que vencem. Com o `reload`, a lista sumia no meio — e
   * levava junto a imagem ou o video que alguem estava olhando.
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

  const run = useCallback(async () => {
    const id = ++requestId.current

    // Zerar antes de comecar e o que faz o esqueleto voltar no "Tentar de novo";
    // sem isso o botao nao muda nada na tela por 200 ms.
    setFailed(false)
    setData(null)

    try {
      const loaded = await load()
      if (id === requestId.current) setData(loaded)
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
    const id = ++requestId.current

    void load().then(
      (loaded) => {
        if (id !== requestId.current) return
        setData(loaded)
        setFailed(false)
      },
      // Falhou renovando: o que esta na tela continua. E melhor um endereco que
      // talvez ainda sirva do que uma lista que some.
      () => {},
    )
  }, [load])

  return { data, loading: data === null && !failed, failed, reload, refresh }
}
