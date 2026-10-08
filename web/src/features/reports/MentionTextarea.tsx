import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { TeamMemberViewModel } from '@/contracts'
import { projectTeamService } from '@/data'
import { PersonAvatar } from '@/features/reports/cardLook'
import {
  type ChosenMention,
  foldForSearch,
  mentionQuery,
  splitMentions,
} from '@/features/reports/mentions'
import { cn } from '@/shared/lib/cn'

/** Quantas pessoas a lista do "@" mostra de uma vez. */
const MAX_OPTIONS = 6

/**
 * O campo do comentario entre o time, com o "@" que menciona alguem do time.
 *
 * **Digitar "@" abre a lista do time**, filtrada pelo que vem depois (sem acento, pelo
 * comeco do nome, de qualquer parte do nome ou do e-mail). Setas escolhem, Enter ou Tab
 * mencionam, Esc fecha so a lista — o card aberto continua aberto. O time e lido no
 * primeiro "@", uma vez.
 */
export function MentionTextarea({
  projectPublicId,
  value,
  onChange,
  onMention,
  ariaLabel,
  disabled,
  maxLength,
  className,
}: {
  projectPublicId: string
  value: string
  onChange: (value: string) => void
  /** Alguem foi escolhido na lista: quem monta o campo guarda para o envio. */
  onMention: (mention: ChosenMention) => void
  ariaLabel: string
  disabled?: boolean
  maxLength?: number
  className?: string
}) {
  const campo = useRef<HTMLTextAreaElement>(null)
  const listaId = useId()
  const [time, setTime] = useState<TeamMemberViewModel[] | null>(null)
  const pediu = useRef(false)
  const [consulta, setConsulta] = useState<{ start: number; query: string } | null>(null)
  const [ativo, setAtivo] = useState(0)

  function olhar(texto: string, cursor: number | null) {
    const achada = mentionQuery(texto, cursor ?? texto.length)
    setConsulta(achada)
    setAtivo(0)
    if (achada && !pediu.current) {
      pediu.current = true
      projectTeamService
        .listMembers(projectPublicId)
        .then(setTime)
        .catch(() => {
          pediu.current = false
        })
    }
  }

  const opcoes = useMemo(() => {
    if (!consulta || !time) return []
    const busca = foldForSearch(consulta.query.trim())
    return time
      .filter((pessoa) => !pessoa.IsYou)
      .filter((pessoa) => {
        if (busca === '') return true
        const nome = foldForSearch(pessoa.Name ?? '')
        return (
          nome.startsWith(busca) ||
          nome.split(/\s+/).some((parte) => parte.startsWith(busca)) ||
          foldForSearch(pessoa.Email ?? '').startsWith(busca)
        )
      })
      .slice(0, MAX_OPTIONS)
  }, [consulta, time])

  const aberta = consulta !== null && opcoes.length > 0

  // O Esc com a lista aberta fecha so a lista. O dialogo do card ouve o Esc no
  // documento, na captura — daqui, a janela ouve antes e para ali.
  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape' || document.activeElement !== campo.current) return
      evento.preventDefault()
      evento.stopPropagation()
      setConsulta(null)
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [aberta])

  function escolher(pessoa: TeamMemberViewModel) {
    if (!consulta) return
    const nome = pessoa.Name?.trim() || pessoa.Email || 'Alguém do time'
    const cursor = campo.current?.selectionStart ?? value.length
    const novo = `${value.slice(0, consulta.start)}@${nome} ${value.slice(cursor)}`
    const depois = consulta.start + nome.length + 2
    onChange(novo)
    onMention({ name: nome, id: pessoa.UserPublicId })
    setConsulta(null)
    requestAnimationFrame(() => {
      campo.current?.focus()
      campo.current?.setSelectionRange(depois, depois)
    })
  }

  return (
    <div className="relative">
      <textarea
        ref={campo}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={aberta ? listaId : undefined}
        aria-activedescendant={aberta ? `${listaId}-${ativo}` : undefined}
        value={value}
        onChange={(evento) => {
          onChange(evento.target.value)
          olhar(evento.target.value, evento.target.selectionStart)
        }}
        onClick={(evento) => olhar(evento.currentTarget.value, evento.currentTarget.selectionStart)}
        onKeyUp={(evento) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evento.key))
            olhar(evento.currentTarget.value, evento.currentTarget.selectionStart)
        }}
        onKeyDown={(evento) => {
          if (!aberta) return
          if (evento.key === 'ArrowDown') {
            evento.preventDefault()
            setAtivo((atual) => (atual + 1) % opcoes.length)
          } else if (evento.key === 'ArrowUp') {
            evento.preventDefault()
            setAtivo((atual) => (atual - 1 + opcoes.length) % opcoes.length)
          } else if (evento.key === 'Enter' || evento.key === 'Tab') {
            const pessoa = opcoes[ativo]
            if (!pessoa) return
            evento.preventDefault()
            escolher(pessoa)
          }
        }}
        onBlur={() => setConsulta(null)}
        maxLength={maxLength}
        disabled={disabled}
        rows={2}
        className={className}
      />

      {aberta && (
        <div
          id={listaId}
          role="listbox"
          aria-label="Pessoas do time"
          className="absolute top-full left-0 z-tip -mt-1 w-[min(18rem,100%)] rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
        >
          {opcoes.map((pessoa, indice) => (
            // O mouse escolhe sem tirar o foco do campo — o teclado escolhe pelo campo.
            // biome-ignore lint/a11y/useKeyWithClickEvents: as teclas moram no campo (aria-activedescendant)
            <div
              key={pessoa.UserPublicId}
              id={`${listaId}-${indice}`}
              role="option"
              tabIndex={-1}
              aria-selected={indice === ativo}
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => escolher(pessoa)}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-detail',
                indice === ativo ? 'bg-surface-sunken text-fg' : 'text-fg',
              )}
            >
              <span aria-hidden className="flex-none">
                <PersonAvatar
                  pessoa={{
                    UserPublicId: pessoa.UserPublicId,
                    Name: pessoa.Name,
                    AvatarUrl: pessoa.AvatarUrl,
                    InTeam: true,
                  }}
                />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {pessoa.Name || pessoa.Email || 'Alguém do time'}
              </span>
            </div>
          ))}
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {aberta
          ? `${opcoes.length} ${opcoes.length === 1 ? 'pessoa' : 'pessoas'}. Setas para escolher, Enter para mencionar.`
          : ''}
      </span>
    </div>
  )
}

/**
 * O texto de um comentario entre o time, com as mencoes destacadas: "@Ana Dona", e
 * nao a marca que o texto guarda.
 */
export function CommentBody({ body }: { body: string }) {
  return (
    <>
      {splitMentions(body).map((pedaco, indice) =>
        'mention' in pedaco ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: os pedacos nao mudam de ordem
            key={indice}
            className="rounded bg-chip-blue-surface px-0.5 font-medium text-chip-blue-fg"
          >
            @{pedaco.mention}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: os pedacos nao mudam de ordem
          <span key={indice}>{pedaco.text}</span>
        ),
      )}
    </>
  )
}
