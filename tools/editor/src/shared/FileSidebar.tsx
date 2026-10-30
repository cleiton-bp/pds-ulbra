import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { tourTarget } from '../tour/targets'
import { confirmDelete } from './Confirm'
import { ENVIRONMENTS, type Environment } from './environments'
import Icon from './Icon'
import { CollapseButton } from './Layout'
import { useNavigation } from './navigation'
import { SOMENTE_LEITURA } from './readOnly'
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
  /** Texto de dentro do campo de arquivo novo. */
  placeholder: string
  onOpen: (name: string) => void
  onCreate: (name: string, title: string) => Promise<void>
  onDelete: (name: string) => Promise<void>
  /** Recolhe a lista: ela vira a faixa de abrir na borda (ver `EditorLayout`). */
  onCollapse?: () => void
}

/**
 * A lista de arquivos do ambiente, com o caminho de volta em cima: o inicio e a
 * aba do outro ambiente. Sair por aqui grava antes o que estava pendente.
 */
export default function FileSidebar({
  env, files, current, placeholder, onOpen, onCreate, onDelete, onCollapse,
}: FileSidebarProps) {
  const { go, takeIntent } = useNavigation()
  const [draft, setDraft] = useState('')
  // O campo de arquivo novo fica fechado ate alguem pedir: e raro, e aberto ocupava a
  // base da lista o tempo todo.
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const newInput = useRef<HTMLInputElement>(null)

  // Quem chegou pelo "+ novo" da tela de inicio encontra o campo pronto para digitar.
  useEffect(() => {
    if (takeIntent('new-file')) setCreating(true)
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
      setCreating(false)
    } catch (err) {
      // A lista pode estar alguns segundos atras do disco: o servidor e quem sabe.
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const remove = async (name: string): Promise<void> => {
    if (!(await confirmDelete({ title: `Apagar ${name}?`, message: 'O arquivo sai da pasta, e não dá para desfazer.', confirmLabel: 'Apagar arquivo' }))) return
    try {
      await onDelete(name)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <aside {...tourTarget('files')} className="sidebar">
      <div className="sidebar__head">
        {/* O caminho de volta e o botao de recolher dividem a primeira linha: cada
            um num canto, e o de recolher perto da borda que ele fecha. */}
        <div className="sidebar__top">
          <button className="sidebar__home" title="voltar ao início (Alt+0)" onClick={() => void go({ env: null, file: null })}>
            <Icon name="chevronLeft" size={14} />
            <span>Início</span>
          </button>
          {onCollapse && <CollapseButton side="left" label="Arquivos" shortcut="Alt+1" onClick={onCollapse} />}
        </div>

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

      </div>

      <nav className="sidebar__list" aria-label="arquivos">
        {files.length === 0 && <p className="sidebar__empty">nenhum arquivo ainda</p>}
        {files.map((file) => {
          const base = file.name.replace(/\.yaml$/, '')
          // "13-report-limits": o numero vira a marca da ordem, e o resto fica como
          // o nome do arquivo, menor, embaixo do titulo, que e o que se procura.
          const number = /^(\d+)-/.exec(base)?.[1]
          return (
            <div key={file.name} className={`file-row${file.name === current ? ' is-current' : ''}`}>
              <button
                className="file-row__open"
                title={file.name}
                aria-current={file.name === current ? 'page' : undefined}
                onClick={() => onOpen(file.name)}
              >
                <span className="file-row__number" aria-hidden="true">{number ?? base.charAt(0).toUpperCase()}</span>
                <span className="file-row__title">{file.title || base}</span>
              </button>
              {!SOMENTE_LEITURA && (
                <button
                  className="file-row__delete"
                  title={`apagar ${file.name}`}
                  aria-label={`apagar ${file.name}`}
                  onClick={() => void remove(file.name)}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          )
        })}
      </nav>

      {SOMENTE_LEITURA ? null : creating ? (
        <form className="sidebar__new" onSubmit={(event) => void submit(event)}>
          <label className="sidebar__new-label" htmlFor={`novo-${env.id}`}>{placeholder}</label>
          <div className="sidebar__new-line">
            <input
              id={`novo-${env.id}`}
              ref={newInput}
              autoFocus
              value={draft}
              placeholder="ex.: 16-audit-log"
              onChange={(event) => { setDraft(event.target.value); setError('') }}
              onKeyDown={(event) => { if (event.key === 'Escape') { setCreating(false); setDraft(''); setError('') } }}
            />
            <button className="btn btn--primary" type="submit" disabled={!draft.trim()}>Criar</button>
          </div>
          {draft.trim() && <p className="sidebar__hint">vai gravar <code>{toFileName(draft)}</code>, e Esc cancela</p>}
          {error && <p className="sidebar__error">{error}</p>}
        </form>
      ) : (
        <div className="sidebar__new">
          <button className="btn btn--ghost sidebar__new-open" onClick={() => setCreating(true)}>
            <Icon name="plus" />
            <span>{placeholder.replace(/ \(.*\)$/, '')}</span>
          </button>
        </div>
      )}
    </aside>
  )
}
