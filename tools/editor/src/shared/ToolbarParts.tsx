import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { type TourTarget, tourTarget } from '../tour/targets'
import Icon, { type IconName } from './Icon'
import { useNavigation } from './navigation'
import type { SaveStatus } from './useWorkspace'

/**
 * As pecas da barra de cima que os dois ambientes dividem. Morarem num lugar so e o
 * que faz um botao ter o mesmo tamanho, o mesmo desenho e a mesma dica nas duas telas.
 */

/** Botao so de icone: 32px, com o nome na dica e no leitor de tela. */
export function IconButton({
  icon, label, onClick, pressed, shortcut, tour,
}: { icon: IconName; label: string; onClick: () => void; pressed?: boolean; shortcut?: string; tour?: TourTarget }) {
  return (
    <button
      {...(tour && tourTarget(tour))}
      className={`icon-btn${pressed ? ' is-on' : ''}`}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}

/** O caminho de volta ao inicio, sempre no mesmo canto da barra. */
export function HomeButton() {
  const { go } = useNavigation()
  return (
    <div className="toolbar__nav">
      <IconButton icon="home" label="voltar ao início" shortcut="Alt+0" onClick={() => void go({ env: null, file: null })} />
    </div>
  )
}

// O estado vem em ingles do `useWorkspace`; a traducao para a tela e aqui.
const STATUS_LABEL: Record<SaveStatus, string> = {
  empty: '',
  saved: 'gravado',
  unsaved: 'não gravado',
  saving: 'gravando…',
  error: 'erro',
  conflict: 'conflito',
}

export function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'empty') return null
  return (
    <span className={`status status--${status}`} role="status" title={STATUS_LABEL[status]}>
      <span className="status__text">{STATUS_LABEL[status]}</span>
    </span>
  )
}

/**
 * Leitura ou edicao. Em leitura o desenho nao se arrasta e nada se edita no canvas
 * nem no painel: abrir para entender nao corre o risco de mexer no arquivo, que
 * grava sozinho.
 */
export function EditToggle({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
  return (
    <button
      {...tourTarget('edit')}
      className={`btn${editing ? ' btn--warn' : ''}`}
      aria-pressed={editing}
      aria-label={editing ? 'Editando' : 'Leitura'}
      title={editing
        ? 'voltar à leitura: o desenho para de se mexer e nada se edita (Alt+E)'
        : 'editar: arrastar, criar e mudar o que está no arquivo (Alt+E)'}
      onClick={onToggle}
    >
      <Icon name={editing ? 'pencil' : 'lock'} />
      <span className="btn__label">{editing ? 'Editando' : 'Leitura'}</span>
    </button>
  )
}

/** Grupo de escolha unica, com os botoes colados: "Mudanças | Tudo". */
export function Segmented<T extends string>({
  label, value, options, onChange, tour,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string; title?: string; disabled?: boolean }>
  onChange: (value: T) => void
  tour?: TourTarget
}) {
  return (
    <div {...(tour && tourTarget(tour))} className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={value === option.value}
          className={`segmented__opt${value === option.value ? ' is-on' : ''}`}
          title={option.title}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Botao com menu suspenso. Fecha com clique fora ou Escape: os ouvintes so existem
 * enquanto ele esta aberto.
 */
export function DropMenu({
  label, ariaLabel, title, active, tour, children,
}: { label: ReactNode; ariaLabel: string; title: string; active?: boolean; tour?: TourTarget; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div {...(tour && tourTarget(tour))} className="menu" ref={ref}>
      <button
        className={`btn${active ? ' is-on' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <Icon name="chevronDown" size={14} />
      </button>
      {open && <div className="menu__pop">{children}</div>}
    </div>
  )
}

/** Escolha de radio dentro de um `DropMenu`, com a explicacao embaixo do rotulo. */
export function MenuChoice({
  name, checked, label, hint, onChange,
}: { name: string; checked: boolean; label: string; hint: string; onChange: () => void }) {
  return (
    <label className="menu__item">
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>
        {label}
        <small>{hint}</small>
      </span>
    </label>
  )
}
