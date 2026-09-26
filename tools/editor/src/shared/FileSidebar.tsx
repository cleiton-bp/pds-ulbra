import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { ENVIRONMENTS, type Environment } from './environments'
import { useNavigation } from './navigation'
import type { FileEntry } from './types'

/** Transforma "08 Robustness" em "08-robustness.yaml". */
export function toFileName(input: string): string {
  const slug = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acento: "Fundação" -> "Fundacao"
    .toLowerCase()
    .replace(/\.yaml$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug ? `${slug}.yaml` : ''
}

type FileSidebarProps = {
  env: Environment
  files: FileEntry[]
  current: string | null
  dir: string
  /** Texto de dentro do campo de arquivo novo. */
  placeholder: string
  onOpen: (name: string) => void
  onCreate: (name: string, title: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
}

/**
 * A lista de arquivos do ambiente, com o caminho de volta em cima: o inicio e a
 * aba do outro ambiente. Sair por aqui grava antes o que estava pendente.
 */
export default function FileSidebar({
  env, files, current, dir, placeholder, onOpen, onCreate, onDelete,
}: FileSidebarProps) {
  const { go, takeIntent } = useNavigation()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const newInput = useRef<HTMLInputElement>(null)

  // Quem chegou pelo "+ novo" da tela de inicio encontra o campo pronto para digitar.
  useEffect(() => {
    if (takeIntent() === 'new-file') newInput.current?.focus()
  }, [takeIntent])

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const name = toFileName(draft)
    if (!name) {
      setError('escreva um nome')
      return
    }
    if (files.some((file) => file.name === name)) {
      setError('já existe um arquivo com esse nome')
      return
    }
    setError('')
    try {
      await onCreate(name, draft.trim())
      setDraft('')
    } catch (err) {
      // A lista pode estar alguns segundos atras do disco: o servidor e quem sabe.
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (name: string): Promise<void> => {
    if (!window.confirm(`Apagar ${name}? Não dá para desfazer.`)) return
    try {
      await onDelete(name)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <button className="sidebar__home" title="voltar ao início · Alt+0" onClick={() => void go({ env: null, file: null })}>
          ‹ início
        </button>

        {/* Os dois ambientes lado a lado: trocar de um para o outro sem passar pelo inicio. */}
        <nav className="env-tabs" aria-label="ambientes">
          {ENVIRONMENTS.map((option) => (
            <button
              key={option.id}
              className={`env-tabs__tab${option.id === env.id ? ' is-current' : ''}`}
              aria-current={option.id === env.id ? 'page' : undefined}
              title={option.id === env.id ? `você está em ${option.title}` : `ir para ${option.title}`}
              onClick={() => option.id !== env.id && void go({ env: option.id, file: null })}
            >
              {option.title}
            </button>
          ))}
        </nav>

        <p className="sidebar__dir" title={dir}>{dir.split('/').slice(-2).join('/')}</p>
      </div>

      <nav className="sidebar__list">
        {files.length === 0 && <p className="sidebar__empty">nenhum arquivo ainda</p>}
        {files.map((file) => (
          <div key={file.name} className={`file-row${file.name === current ? ' is-current' : ''}`}>
            <button className="file-row__open" title={file.title || undefined} onClick={() => onOpen(file.name)}>
              <span className="file-row__name">{file.name.replace(/\.yaml$/, '')}</span>
              {file.title && <span className="file-row__title">{file.title}</span>}
            </button>
            <button
              className="file-row__delete"
              title="apagar arquivo"
              onClick={() => void remove(file.name)}
            >
              ✕
            </button>
          </div>
        ))}
      </nav>

      <form className="sidebar__new" onSubmit={(event) => void submit(event)}>
        <div className="sidebar__new-line">
          <input
            ref={newInput}
            value={draft}
            placeholder={placeholder}
            aria-label={`${placeholder.replace(/…$/, '')}, em inglês`}
            onChange={(event) => { setDraft(event.target.value); setError('') }}
          />
          <button type="submit" disabled={!draft.trim()}>+</button>
        </div>
        {draft.trim() && <p className="sidebar__hint">{toFileName(draft)}</p>}
        {error && <p className="sidebar__error">{error}</p>}
      </form>
    </aside>
  )
}
