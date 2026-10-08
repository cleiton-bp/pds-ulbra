import { useCallback, useState } from 'react'

/**
 * Por que a tela esta sem atualizacao ao vivo, quando esta. `nunca-conectou` e a
 * conexao que ainda nao abriu nenhuma vez (a primeira carga lenta, o hub fora do ar);
 * `caiu` e a que estava no ar e caiu.
 */
export type SemAoVivo = 'nunca-conectou' | 'caiu' | null

const TEXTOS: Record<'nunca-conectou' | 'caiu', { curto: string; explicacao: string }> = {
  'nunca-conectou': {
    curto: 'Sem atualização ao vivo',
    explicacao:
      'As mudanças de outras pessoas só aparecem ao recarregar a tela, até a conexão voltar. A tela continua tentando.',
  },
  caiu: {
    curto: 'Reconectando…',
    explicacao: 'As mudanças de outras pessoas aparecem quando a conexão voltar.',
  },
}

/**
 * O selo da conexao, **preso ao pe da tela**: aparecer e sumir nao empurra nada — no
 * celular, um selo na barra quebrava a linha e o conteudo pulava debaixo do dedo.
 *
 * A regiao fica sempre montada, e so o texto entra e sai: leitor de tela anuncia a
 * mudanca dentro de uma regiao viva que ja existia, e nao a regiao que nasce com o
 * texto. A explicacao vai em texto, e nao em `title`, que nao abre no toque nem no
 * teclado.
 */
export function LiveBadge({ estado }: { estado: SemAoVivo }) {
  const texto = estado ? TEXTOS[estado] : null

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-4 left-1/2 z-toast flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 justify-center"
    >
      {texto && (
        <span className="rounded-lg border border-warn-border bg-warn-surface px-3 py-1.5 text-detail text-warn-fg shadow-md">
          {texto.curto}
          <span className="sr-only"> {texto.explicacao}</span>
        </span>
      )}
    </div>
  )
}

/**
 * O mesmo estado para quem esta dentro do card aberto. O dialogo deixa o resto da
 * pagina fora do alcance do leitor de tela — o selo de baixo inclusive —, e quem esta
 * no card, que promete se atualizar sozinho, precisa saber quando ele parou.
 */
export function LiveStatusText({ estado }: { estado: SemAoVivo }) {
  const texto = estado ? TEXTOS[estado] : null

  return (
    <div role="status" className="sr-only">
      {texto && `${texto.curto} ${texto.explicacao}`}
    </div>
  )
}

/**
 * Uma regiao que conta, para quem usa leitor de tela, o que outra pessoa mudou. O
 * destaque do card e so visual; sem isto, as mudancas aconteciam em silencio.
 */
export function LiveAnnouncer({ anuncio }: { anuncio: Anuncio }) {
  return (
    <div aria-live="polite" className="sr-only">
      {/* A chave troca a cada anuncio: o mesmo texto duas vezes seguidas e anunciado
          de novo, porque e um no novo dentro da regiao. */}
      {anuncio.texto && <span key={anuncio.vez}>{anuncio.texto}</span>}
    </div>
  )
}

export interface Anuncio {
  texto: string
  vez: number
}

export function useAnnouncer() {
  const [anuncio, setAnuncio] = useState<Anuncio>({ texto: '', vez: 0 })
  const anunciar = useCallback(
    (texto: string) => setAnuncio((antes) => ({ texto, vez: antes.vez + 1 })),
    [],
  )
  return [anuncio, anunciar] as const
}

/** O que dizer dos cards que outra pessoa mudou, pelo numero de cada um quando se sabe. */
export function describeRemoteChange(numeros: (number | undefined)[]): string {
  if (numeros.length === 1)
    return numeros[0] === undefined
      ? 'Um card foi atualizado.'
      : `O card #${numeros[0]} foi atualizado.`
  return `${numeros.length} cards foram atualizados.`
}
