import { useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type SettingMatch, searchSettings } from '@/app/configure/settingsIndex'
import type { ScrollToHashState } from '@/shared/hooks/useScrollToHash'
import { cn } from '@/shared/lib/cn'

/**
 * "Procurar nas configurações": a pessoa sabe o que quer mudar ("prazo", "cor", "spam")
 * e nao sabe em que tela mora. Sao mais de setenta opcoes em quinze telas; procurar pelo
 * nome e mais rapido que abrir uma por uma.
 *
 * **Uma caixa com lista (combobox)**, do jeito que o leitor de tela conhece: as setas
 * andam pela lista sem tirar o foco do campo, Enter abre a opcao, Esc fecha a lista
 * (e, com ela fechada, limpa o campo). O resultado diz a tela e a area, para a pessoa
 * aprender onde a opcao mora e nao precisar procurar da proxima vez.
 *
 * Escolher leva a `tela#campo` com o pedido de realce: a casca rola ate o campo, abre o
 * "Mais opções" em volta dele, poe o foco nele e o acende por dois segundos.
 */
export function SettingsSearch({ projectPublicId }: { projectPublicId: string }) {
  const navigate = useNavigate()
  const inputId = useId()
  const listId = useId()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const results = useMemo(() => searchSettings(query), [query])
  const typed = query.trim().length > 0
  const showList = open && typed

  function go(match: SettingMatch) {
    const state: ScrollToHashState = { realce: true }
    navigate(`/projects/${projectPublicId}/${match.to}`, { state })
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (results.length === 0) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => {
        if (current < 0) return step === 1 ? 0 : results.length - 1
        return (current + step + results.length) % results.length
      })
      return
    }

    if (event.key === 'Enter') {
      const match = results[active] ?? results[0]
      if (!showList || !match) return
      event.preventDefault()
      go(match)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      if (showList) setOpen(false)
      else {
        setQuery('')
        setActive(-1)
      }
    }
  }

  const optionId = (index: number) => `${listId}-${index}`

  return (
    <div className="relative">
      <label htmlFor={inputId} className="sr-only">
        Procurar nas configurações
      </label>
      <div className="relative">
        <SearchGlyph />
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="Procurar uma opção: prazo, cor, spam…"
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          // A lista some ao sair do campo; o clique numa opcao acontece antes, porque o
          // `mousedown` dela nao tira o foco daqui.
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-11 w-full rounded-xl border border-border bg-surface-raised pr-3.5 pl-10 text-body text-fg placeholder:text-fg-placeholder [&::-webkit-search-cancel-button]:hidden"
        />
      </div>

      {/* A lista existe sempre, para o `aria-controls` apontar para algo; vazia, some. */}
      <div
        id={listId}
        role="listbox"
        aria-label="Opções encontradas"
        hidden={!showList || results.length === 0}
        className="absolute inset-x-0 top-full z-dialog mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
      >
        {showList &&
          results.map((match, index) => (
            // O mouse escolhe sem tirar o foco do campo — o teclado escolhe pelo campo.
            // biome-ignore lint/a11y/useKeyWithClickEvents: as teclas moram no campo (aria-activedescendant)
            <div
              key={`${match.entry.section}-${match.entry.label}`}
              id={optionId(index)}
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => go(match)}
              className={cn(
                'flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2',
                index === active && 'bg-surface-sunken',
              )}
            >
              <span className="text-body text-fg">{match.entry.label}</span>
              <span className="text-caption text-fg-muted">
                {match.area ? `${match.area.label} · ` : ''}
                {match.screen.label}
                {match.entry.level === 'advanced' ? ' · avançado' : ''}
              </span>
            </div>
          ))}
      </div>

      {/* Nada achado e uma resposta, e nao a lista sumindo calada: a pessoa precisa
          saber que procurou e que pode tentar outra palavra. */}
      {showList && results.length === 0 && (
        <p
          role="status"
          className="absolute inset-x-0 top-full z-dialog mt-1.5 rounded-xl border border-border bg-surface-raised px-3.5 py-3 text-detail text-fg-muted shadow-lg"
        >
          Nenhuma opção com “{query.trim()}”. Tente outra palavra, ou abra uma das áreas abaixo.
        </p>
      )}
    </div>
  )
}

function SearchGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3.5 size-4 text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  )
}
