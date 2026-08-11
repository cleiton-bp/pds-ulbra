import { useState } from 'react'
import type { FormEvent } from 'react'
import type { FileEntry } from '../types'

/** Transforma "Stage 1 — Foundation" em "stage-1-foundation.yaml". */
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
  files: FileEntry[]
  current: string | null
  dir: string
  onOpen: (name: string) => void
  onCreate: (name: string, title: string) => Promise<void>
  onDelete: (name: string) => void
}

export default function FileSidebar({
  files, current, dir, onOpen, onCreate, onDelete,
}: FileSidebarProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

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
    await onCreate(name, draft.trim())
    setDraft('')
  }

  const remove = (name: string): void => {
    if (window.confirm(`Apagar ${name}? Não dá para desfazer.`)) onDelete(name)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__head">
        <h1 className="sidebar__title">Modelagem</h1>
        <p className="sidebar__dir" title={dir}>{dir.split('/').slice(-2).join('/')}</p>
      </div>

      <nav className="sidebar__list">
        {files.length === 0 && <p className="sidebar__empty">nenhum arquivo ainda</p>}
        {files.map((file) => (
          <div key={file.name} className={`file-row${file.name === current ? ' is-current' : ''}`}>
            <button className="file-row__open" onClick={() => onOpen(file.name)}>
              {file.name.replace(/\.yaml$/, '')}
            </button>
            <button
              className="file-row__delete"
              title="apagar arquivo"
              onClick={() => remove(file.name)}
            >
              ✕
            </button>
          </div>
        ))}
      </nav>

      <form className="sidebar__new" onSubmit={(event) => void submit(event)}>
        <div className="sidebar__new-line">
          <input
            value={draft}
            placeholder="nova modelagem (nome em inglês)…"
            aria-label="nome da nova modelagem, em inglês"
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
