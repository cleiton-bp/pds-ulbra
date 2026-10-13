import { useId, useState } from 'react'
import { WIDGET_APPEARANCE_LIMITS } from '@/contracts'
import { isHiddenPage } from '@/embed/launcher'
import { Button } from '@/shared/components/Button'
import { Hint } from '@/shared/components/SettingsControls'
import { TextField } from '@/shared/components/TextField'
import { cn } from '@/shared/lib/cn'

/** Os exemplos que se adicionam num clique: os casos que quase todo sistema tem. */
const EXEMPLOS = ['/checkout', '/login/*', '/admin/*']

/**
 * A lista das paginas onde o botao nao aparece — o pagamento, o login — em etiquetas.
 *
 * **Um campo so, e a lista embaixo**: escreve, Enter (ou Adicionar) e a pagina vira uma
 * etiqueta com o × de tirar. As linhas vazias com "Remover" ao lado nao diziam o que
 * fazer, e o Enter nao fazia nada.
 *
 * **O formato e conferido aqui e de novo na API**, com a mesma regra: aqui para a
 * pessoa ver o problema na linha do campo, antes de adicionar; la porque e la que se
 * grava. A pagina repetida tambem e dita, e nao entra duas vezes.
 *
 * **O teto se ve antes de chegar nele**: "3 de 20", e cheio, o campo desliga e diz por
 * que. "Testar endereço" responde a pergunta que a lista faz: nesta pagina, aparece?
 *
 * **A etiqueta continua editavel**, como a linha era: clicar nela leva o caminho de
 * volta ao campo, e Trocar (ou Enter) poe o novo no lugar dele, na mesma posicao.
 */
export function HiddenPagesEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [texto, setTexto] = useState('')
  /** O problema que so aparece ao tentar adicionar: vazio, repetido ou cheio. */
  const [recusa, setRecusa] = useState<string | null>(null)
  const [teste, setTeste] = useState('')
  /** A etiqueta que esta no campo para ser trocada, pela posicao. */
  const [editando, setEditando] = useState<number | null>(null)
  const campoId = useId()

  const { MaxHiddenPaths, MaxHiddenPathLength } = WIDGET_APPEARANCE_LIMITS
  // A linha vazia a API descarta: nao conta, e nao vira etiqueta.
  const paginas = value.map((caminho) => caminho.trim()).filter(Boolean)
  const cheia = paginas.length >= MaxHiddenPaths
  const erro = problemaDoCaminho(texto) ?? recusa

  /** Adiciona — ou, com uma etiqueta no campo, troca ela pelo que se escreveu. */
  function adicionar(caminho: string, troca: number | null = editando) {
    const limpo = caminho.trim()
    if (limpo.length === 0) {
      setRecusa('Escreva o caminho da página, como /checkout.')
      return
    }
    if (problemaDoCaminho(limpo)) return
    if (cheia && troca === null) {
      setRecusa(`Limite de ${MaxHiddenPaths} páginas. Tire uma para pôr outra.`)
      return
    }
    if (paginas.some((pagina, posicao) => posicao !== troca && mesmaPagina(pagina, limpo))) {
      setRecusa(`${limpo} já está na lista.`)
      return
    }

    onChange(
      troca === null
        ? [...paginas, limpo]
        : paginas.map((pagina, posicao) => (posicao === troca ? limpo : pagina)),
    )
    setTexto('')
    setRecusa(null)
    setEditando(null)
  }

  function remover(index: number) {
    onChange(paginas.filter((_, posicao) => posicao !== index))
    setRecusa(null)
    if (editando !== null) cancelarTroca()
  }

  function editar(index: number) {
    setEditando(index)
    setTexto(paginas[index] ?? '')
    setRecusa(null)
    document.getElementById(campoId)?.focus()
  }

  function cancelarTroca() {
    setEditando(null)
    setTexto('')
    setRecusa(null)
  }

  const rota = rotaDoTeste(teste)
  const quemEsconde = rota ? paginas.find((pagina) => isHiddenPage([pagina], rota)) : undefined

  return (
    <div>
      <div className="flex items-start gap-2">
        <TextField
          id={campoId}
          ariaLabel="Caminho da página"
          className="flex-1"
          value={texto}
          onChange={(novo) => {
            setTexto(novo)
            setRecusa(null)
          }}
          onSubmit={() => adicionar(texto)}
          placeholder="/checkout"
          maxLength={MaxHiddenPathLength}
          disabled={cheia && editando === null}
          error={erro}
          hint={
            editando !== null
              ? `Trocando ${paginas[editando] ?? ''}. Enter guarda.`
              : cheia
                ? `Limite de ${MaxHiddenPaths} páginas. Tire uma para pôr outra.`
                : 'Só o caminho, sem o endereço do seu sistema. Enter adiciona.'
          }
        />
        <Button
          size="sm"
          className="mt-0.5"
          disabled={cheia && editando === null}
          onClick={() => adicionar(texto)}
        >
          {editando === null ? 'Adicionar' : 'Trocar'}
        </Button>
        {editando !== null && (
          <Button size="sm" variant="ghost" className="mt-0.5" onClick={cancelarTroca}>
            Cancelar
          </Button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-detail text-fg-muted">
        Exemplos:
        {EXEMPLOS.map((exemplo) => {
          const jaTem = paginas.some((pagina) => mesmaPagina(pagina, exemplo))
          return (
            <button
              key={exemplo}
              type="button"
              disabled={cheia || jaTem}
              aria-label={`Adicionar ${exemplo}`}
              onClick={() => adicionar(exemplo, null)}
              className="rounded-md border border-border border-dashed px-1.5 py-0.5 font-mono text-caption text-fg enabled:hover:bg-surface-sunken disabled:text-fg-disabled"
            >
              {exemplo}
            </button>
          )
        })}
      </div>

      {paginas.length > 0 && (
        <ul aria-label="Páginas escondidas" className="mt-3 flex flex-wrap gap-1.5">
          {paginas.map((caminho, index) => {
            const problema = problemaDoCaminho(caminho)
            return (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: so texto, sem campo dentro; a lista salva antes pode repetir a pagina, e a posicao desfaz o empate
                key={`${index}-${caminho}`}
                title={problema ?? undefined}
                className={cn(
                  'flex items-center gap-0.5 rounded-full border py-0.5 pr-0.5 pl-1 font-mono text-caption',
                  problema
                    ? 'border-error-border text-error-fg'
                    : 'border-border bg-surface-sunken text-fg',
                  editando === index && 'ring-1 ring-accent',
                )}
              >
                <button
                  type="button"
                  aria-label={`Editar ${caminho}`}
                  onClick={() => editar(index)}
                  className="rounded-full px-1.5 hover:underline"
                >
                  {caminho}
                </button>
                {/* O nome diz qual: "Remover" cinco vezes seguidas nao diz nada a quem ouve. */}
                <button
                  type="button"
                  aria-label={`Remover ${caminho}`}
                  onClick={() => remover(index)}
                  className="flex size-5 items-center justify-center rounded-full text-fg-muted hover:bg-surface-strong hover:text-fg"
                >
                  <span aria-hidden>×</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-2 text-caption text-fg-muted">
        {paginas.length} de {MaxHiddenPaths} páginas
      </p>

      <Hint>
        <code className="font-mono text-fg">/login/*</code> esconde{' '}
        <code className="font-mono text-fg">/login</code> e tudo o que vem depois dela. Maiúsculas e
        a barra do fim não fazem diferença.
      </Hint>

      <div className="mt-4 border-border border-t pt-4">
        <TextField
          label="Testar endereço"
          value={teste}
          onChange={setTeste}
          placeholder="/login/conta"
          hint="Cole um endereço do seu sistema para ver se o botão aparece nele."
        />
        {rota && (
          <p role="status" className="mt-2 font-medium text-detail text-fg">
            {quemEsconde
              ? `Escondido em ${rota}, por ${quemEsconde}.`
              : `O botão aparece em ${rota}.`}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * O que ha de errado com o caminho — a mesma regra de `HiddenPages.cs`, na API. Nulo
 * quando esta certo, ou vazio.
 */
export function problemaDoCaminho(caminho: string): string | null {
  const texto = caminho.trim()
  if (texto.length === 0) return null
  if (!texto.startsWith('/')) return 'O caminho começa com uma barra, como /checkout.'
  if (/[?#]/.test(texto)) return 'Escreva só o caminho, sem o que vem depois de ? ou #.'
  if (/\s/.test(texto)) return 'O caminho não pode ter espaços.'
  const asterisco = texto.indexOf('*')
  if (asterisco >= 0 && asterisco !== texto.length - 1) return 'O * só vale no fim, como /login/*.'
  return null
}

/** As duas sao a mesma pagina para o botao: sem diferenca de caixa nem da barra do fim. */
function mesmaPagina(a: string, b: string): boolean {
  const normal = (caminho: string) =>
    caminho
      .trim()
      .toLowerCase()
      .replace(/(.)\/+$/, '$1')
  return normal(a) === normal(b)
}

/**
 * O caminho do endereco a testar: aceita o endereco inteiro, colado da barra do
 * navegador, ou so o caminho. Sem o que vem depois de `?` e `#`, como o botao le.
 */
function rotaDoTeste(texto: string): string | null {
  const limpo = texto.trim()
  if (limpo.length === 0) return null
  try {
    return new URL(limpo).pathname
  } catch {
    const caminho = limpo.split(/[?#]/)[0] ?? ''
    return caminho.startsWith('/') ? caminho : `/${caminho}`
  }
}
