import { useCallback, useState } from 'react'

/**
 * Por que a tela esta sem atualizacao ao vivo, quando esta. `nunca-conectou` e a
 * conexao que ainda nao abriu nenhuma vez (a primeira carga lenta, o hub fora do ar);
 * `caiu` e a que estava no ar e caiu.
 */
export type SemAoVivo = 'nunca-conectou' | 'caiu' | null

const TEXTOS: Record<'nunca-conectou' | 'caiu', { curto: string; explicacao: string }> = {
  'nunca-conectou': {
    curto: 'Sem atualização ao vivo — tentando conectar…',
    explicacao:
      'As mudanças de outras pessoas só aparecem ao recarregar a tela, até a conexão voltar. O que você faz continua sendo salvo.',
  },
  caiu: {
    curto: 'Sem atualização ao vivo — reconectando…',
    explicacao:
      'As mudanças de outras pessoas aparecem quando a conexão voltar. O que você faz continua sendo salvo.',
  },
}

/**
 * O selo da conexao, **no pe da area de conteudo, a esquerda, depois de tudo**: fica
 * preso a vista enquanto a tela rola, sem cobrir card nenhum — no meio da tela, ele
 * escondia um card do quadro. Aparecer so encurta o que vem antes dele, embaixo; nada
 * pula debaixo do dedo — no celular, um selo na barra quebrava a linha e o conteudo
 * pulava.
 *
 * O que ele quer dizer fica escrito: "sem atualizacao ao vivo" diz que o resto da tela
 * pode estar velho, e a explicacao (na tela larga) que trabalhar continua valendo.
 *
 * A regiao fica sempre montada, e so o texto entra e sai: leitor de tela anuncia a
 * mudanca dentro de uma regiao viva que ja existia, e nao a regiao que nasce com o
 * texto. A explicacao vai em texto, e nao em `title`, que nao abre no toque nem no
 * teclado.
 */
export function LiveBadge({ estado }: { estado: SemAoVivo }) {
  const texto = estado ? TEXTOS[estado] : null

  return (
    <div role="status" className="pointer-events-none sticky bottom-0 z-toast flex-none">
      {texto && (
        <span className="mt-2 inline-block max-w-full rounded-lg border border-warn-border bg-warn-surface px-3 py-1.5 text-detail text-warn-fg shadow-md">
          {texto.curto}
          <span className="sr-only sm:not-sr-only"> {texto.explicacao}</span>
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

/** O que aconteceu, nesta tela, com o card que outra pessoa mudou. */
export type RemoteHow = 'chegou' | 'foi' | 'mudou' | 'saiu'

/**
 * Um card que outra pessoa mudou: o numero, quando se sabe, e — no quadro — o que
 * aconteceu com ele e a coluna em que esta agora.
 */
export interface RemoteChange {
  numero?: number
  coluna?: string
  como?: RemoteHow
}

/** Quantos cards o anuncio ainda conta um por um. Mais que isso vira so o numero. */
const UM_POR_UM = 3

/**
 * O que dizer dos cards que outra pessoa mudou. **No quadro, o que aconteceu e
 * onde**: "atualizado" nao dizia se o card chegou, saiu ou mudou de coluna, e quem
 * ouve teria de ir procurar. Sem isso — na lista —, so o numero de cada um.
 */
export function describeRemoteChange(
  mudancas: ReadonlyArray<number | undefined | RemoteChange>,
): string {
  const lista = mudancas.map(
    (item): RemoteChange => (typeof item === 'object' ? item : { numero: item }),
  )
  if (lista.every((item) => item.como === undefined)) {
    if (lista.length === 1)
      return lista[0]?.numero === undefined
        ? 'Um card foi atualizado.'
        : `O card #${lista[0].numero} foi atualizado.`
    return `${lista.length} cards foram atualizados.`
  }
  if (lista.length > UM_POR_UM) return `${lista.length} cards mudaram no quadro.`
  return lista.map(frase).join(' ')
}

function frase({ numero, coluna, como }: RemoteChange): string {
  const card = numero === undefined ? 'Um card' : `O card #${numero}`
  if (como === 'chegou' && coluna) return `${card} chegou em ${coluna}.`
  if (como === 'foi' && coluna) return `${card} foi para ${coluna}.`
  if (como === 'saiu') return `${card} saiu do quadro.`
  return `${card} mudou.`
}
