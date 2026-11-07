import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

/**
 * Ate 4 px escondidos e so o respiro do primeiro ou do ultimo item, nada que se leia: sem
 * essa folga, a borda esmaecia por causa de um arredondamento.
 */
const FOLGA = 4

/**
 * Mede a caixa que rola de cima para baixo: se ainda ha o que ver acima (`acima`) e abaixo
 * (`abaixo`). Serve para esmaecer so a borda que esconde algo (`esmaece-nas-bordas`), a
 * dica de que a lista continua quando a barra de rolagem nao aparece. Mede ao rolar, ao
 * mudar de tamanho e quando o conteudo cresce (um grupo que abre), sem a caixa mudar. O
 * conteudo precisa estar num unico filho da caixa.
 *
 * Devolve a `ref` para pendurar na caixa: uma funcao, e nao um objeto, para medir tambem
 * quando a caixa so aparece depois (a tela que abriu num erro e carregou na nova tentativa).
 */
export function useScrollEdges() {
  const [caixa, ref] = useState<HTMLElement | null>(null)
  const [bordas, setBordas] = useState({ acima: false, abaixo: false })

  const medir = useCallback(() => {
    if (!caixa) return
    const acima = caixa.scrollTop > FOLGA
    const abaixo = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight > FOLGA
    setBordas((antes) =>
      antes.acima === acima && antes.abaixo === abaixo ? antes : { acima, abaixo },
    )
  }, [caixa])

  // Sem lista de dependencias de proposito: o conteudo muda sem a caixa mudar de tamanho.
  useLayoutEffect(() => {
    medir()
  })

  useEffect(() => {
    if (!caixa) return
    caixa.addEventListener('scroll', medir, { passive: true })
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir)
    observador?.observe(caixa)
    // O conteudo fica num embrulho so, que nao troca: observar os filhos soltos perderia
    // quem entra depois (a configuracao, que chega com o projeto).
    if (caixa.firstElementChild) observador?.observe(caixa.firstElementChild)
    return () => {
      caixa.removeEventListener('scroll', medir)
      observador?.disconnect()
    }
  }, [caixa, medir])

  return { ref, ...bordas }
}
