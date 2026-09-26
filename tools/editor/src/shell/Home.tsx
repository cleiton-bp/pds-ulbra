import { useEffect, useState } from 'react'
import * as api from '../shared/api'
import { whenLabel } from '../shared/dates'
import { ENVIRONMENTS, type Environment, type EnvironmentId } from '../shared/environments'
import { useNavigation } from '../shared/navigation'
import { lastFile } from '../shared/session'
import type { FileEntry } from '../shared/types'

/**
 * A porta de entrada. Responde, sem clique nenhum, as tres perguntas de quem chega:
 * onde eu parei (o botao "continuar"), o que existe (a lista inteira, pelo titulo
 * de cada arquivo) e como comeco algo novo (o "+ novo" de cada ambiente).
 */

/** Um desenho pequeno de cada ambiente: duas tabelas ligadas; um boneco e uma elipse. */
function EnvironmentIcon({ id }: { id: EnvironmentId }) {
  if (id === 'modeling') {
    return (
      <svg className="env-card__icon" viewBox="0 0 64 40" aria-hidden="true">
        <rect x="2" y="4" width="22" height="30" rx="3" />
        <line x1="2" y1="12" x2="24" y2="12" />
        <rect x="40" y="10" width="22" height="26" rx="3" />
        <line x1="40" y1="18" x2="62" y2="18" />
        <path d="M24 22 H32 V26 H40" />
      </svg>
    )
  }
  return (
    <svg className="env-card__icon" viewBox="0 0 64 40" aria-hidden="true">
      <circle cx="10" cy="8" r="5" />
      <line x1="10" y1="13" x2="10" y2="26" />
      <line x1="3" y1="18" x2="17" y2="18" />
      <line x1="10" y1="26" x2="4" y2="36" />
      <line x1="10" y1="26" x2="16" y2="36" />
      <line x1="18" y1="20" x2="30" y2="20" />
      <ellipse cx="46" cy="20" rx="16" ry="10" />
    </svg>
  )
}

const shortName = (name: string): string => name.replace(/\.yaml$/, '')

/** Ordem de leitura: pelo número na frente do nome — `9-…` antes de `10-…` —, e o exemplo no fim. */
function byReadingOrder(a: FileEntry, b: FileEntry): number {
  const example = (file: FileEntry): number => (file.name.startsWith('example') ? 1 : 0)
  return example(a) - example(b) || a.name.localeCompare(b.name, 'pt-BR', { numeric: true })
}

type CardProps = {
  env: Environment
  /** `undefined` enquanto a lista nao chegou; `null` quando ela nao pode chegar. */
  files: FileEntry[] | null | undefined
}

function EnvironmentCard({ env, files }: CardProps) {
  const { go } = useNavigation()
  const last = lastFile(env.id)
  const lastEntry = files?.find((file) => file.name === last)
  const newLabel = env.id === 'modeling' ? 'nova modelagem' : 'novo arquivo'
  const startNew = (): void => void go({ env: env.id, file: null }, { intent: 'new-file' })

  return (
    <section className="env-card" aria-labelledby={`env-${env.id}`}>
      <header className="env-card__head">
        <EnvironmentIcon id={env.id} />
        <div className="env-card__heading">
          <h2 id={`env-${env.id}`}>{env.title}</h2>
          <p>{env.summary}</p>
        </div>
        <kbd className="env-card__key" title={`tecla ${env.key} entra aqui`}>{env.key}</kbd>
      </header>

      <div className="env-card__actions">
        <button
          className="env-card__continue"
          onClick={() => void go({ env: env.id, file: lastEntry?.name ?? null })}
        >
          {lastEntry ? (
            <>
              <span className="env-card__continue-label">continuar em</span>
              <span className="env-card__continue-file">{lastEntry.title || shortName(lastEntry.name)}</span>
            </>
          ) : (
            <span className="env-card__continue-file">Abrir {env.title.toLowerCase()}</span>
          )}
          <span className="env-card__arrow" aria-hidden="true">→</span>
        </button>
        <button className="btn env-card__new" onClick={startNew}>+ {newLabel}</button>
      </div>

      <div className="env-card__files">
        <div className="env-card__files-head">
          <span>arquivos</span>
          {files && <span>{files.length}</span>}
        </div>

        {files === undefined && <p className="env-card__note">lendo…</p>}
        {files === null && <p className="env-card__note">—</p>}
        {files?.length === 0 && (
          <p className="env-card__note">
            Nenhum arquivo ainda. <button className="link" onClick={startNew}>criar o primeiro</button>
          </p>
        )}

        {files && files.length > 0 && (
          <ul>
            {[...files].sort(byReadingOrder).map((file) => (
              <li key={file.name}>
                <button
                  className={`file-link${file.name === last ? ' is-last' : ''}`}
                  onClick={() => void go({ env: env.id, file: file.name })}
                >
                  <span className="file-link__title">{file.title || shortName(file.name)}</span>
                  <time className="file-link__when" dateTime={new Date(file.mtime).toISOString()}>
                    {whenLabel(file.mtime)}
                  </time>
                  <span className="file-link__name">
                    {shortName(file.name)}
                    {file.name === last && <span className="file-link__tag">último aberto</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

export default function Home() {
  const { go } = useNavigation()
  const [lists, setLists] = useState<Partial<Record<EnvironmentId, FileEntry[]>>>({})
  const [failure, setFailure] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setFailure('')
    Promise.all(ENVIRONMENTS.map((env) =>
      api.listFiles(env.collection).then((data) => [env.id, data.files] as const)))
      .then((entries) => { if (alive) setLists(Object.fromEntries(entries)) })
      .catch((err: Error) => { if (alive) setFailure(err.message) })
    return () => { alive = false }
  }, [attempt])

  // 1 e 2 entram no ambiente — menos quando se esta digitando em algum campo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.metaKey || event.ctrlKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const env = ENVIRONMENTS.find((option) => option.key === event.key)
      if (env) void go({ env: env.id, file: null })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [go])

  return (
    <div className="home">
      <div className="home__inner">
        <header className="home__head">
          <h1>Modelagem e casos de uso</h1>
          <p>O desenho do PDS, em arquivos <code>.yaml</code> — o editor e o VSCode mexem nos mesmos arquivos.</p>
        </header>

        {failure && (
          <div className="home__alert" role="alert">
            <span>
              Não deu para ler os arquivos ({failure}). O <code>npm run dev</code> ainda está rodando?
            </span>
            <button className="btn" onClick={() => setAttempt((count) => count + 1)}>tentar de novo</button>
          </div>
        )}

        <main className="home__grid">
          {ENVIRONMENTS.map((env) => (
            <EnvironmentCard key={env.id} env={env} files={failure ? lists[env.id] ?? null : lists[env.id]} />
          ))}
        </main>

        <footer className="home__keys">
          <span><kbd>1</kbd> <kbd>2</kbd> entram no ambiente</span>
          <span><kbd>Alt</kbd>+<kbd>0</kbd> volta para cá de qualquer lugar</span>
          <span><kbd>⌘</kbd>+<kbd>S</kbd> grava na hora — mas tudo grava sozinho</span>
        </footer>
      </div>
    </div>
  )
}
