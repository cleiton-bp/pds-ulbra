import { useEffect, useMemo, useState } from 'react'
import * as api from '../../shared/api'
import type { FileEntry } from '../../shared/types'
import { diffDocs, previousFile, type ChangeSet } from '../model/diff'
import { parseDoc } from '../model/parse'
import type { ModelDoc } from '../types'

/** Sem escolha feita, compara com o arquivo anterior da sequencia. */
const AUTO = '__anterior__'

export type Changes = {
  /** A comparacao pronta; `null` sem base (primeiro arquivo, ou "nao comparar"). */
  changes: ChangeSet | null
  /** O arquivo usado como base, ou `null`. */
  base: string | null
  /** As opcoes do seletor: todos os outros arquivos. */
  options: string[]
  /** `''` desliga a comparacao; um nome escolhe a base. */
  choose: (name: string) => void
  loading: boolean
  error: string
}

/**
 * Le o arquivo-base e compara com o que esta aberto. Le pela mesma API do editor,
 * so leitura: a base nunca e aberta para edicao nem gravada.
 *
 * A escolha da base vale para o arquivo aberto: trocar de arquivo volta ao anterior
 * da sequencia, que e o que quase sempre se quer.
 */
export function useChanges(files: FileEntry[], current: string | null, doc: ModelDoc | null): Changes {
  const [choice, setChoice] = useState<string>(AUTO)
  const [baseDoc, setBaseDoc] = useState<{ name: string; doc: ModelDoc } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setChoice(AUTO) }, [current])

  const names = useMemo(() => files.map((file) => file.name), [files])
  const base = !current ? null
    : choice === AUTO ? previousFile(names, current)
    : choice || null

  useEffect(() => {
    if (!base) {
      setBaseDoc(null)
      setError('')
      return
    }
    let alive = true
    setLoading(true)
    api.readFile('modeling', base)
      .then((loaded) => {
        if (!alive) return
        const parsed = parseDoc(loaded.content)
        if (parsed.ok) {
          setBaseDoc({ name: base, doc: parsed.doc })
          setError('')
        } else {
          setBaseDoc(null)
          setError(`Não deu para ler ${base}: ${parsed.error}`)
        }
      })
      .catch((err: Error) => {
        if (!alive) return
        setBaseDoc(null)
        setError(err.message)
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [base])

  const changes = useMemo(
    () => (doc && baseDoc && baseDoc.name === base ? diffDocs(baseDoc.name, baseDoc.doc, doc) : null),
    [doc, baseDoc, base],
  )

  return {
    changes,
    base,
    options: names.filter((name) => name !== current),
    choose: setChoice,
    loading,
    error,
  }
}
