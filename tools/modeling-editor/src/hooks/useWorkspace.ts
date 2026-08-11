import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/client'
import type { HttpError } from '../api/client'
import { emptyDoc, parseDoc } from '../model/parse'
import { serializeDoc } from '../model/serialize'
import { withWarnings } from '../model/operations'
import type { FileEntry, ModelDoc } from '../types'

/**
 * O estado do editor: a lista de arquivos, o documento aberto e a gravacao.
 *
 * Duas decisoes moram aqui e valem explicacao:
 *
 * 1. Autosave com espera — grava 800ms depois da ultima mexida, para digitar um nome
 *    de campo nao virar vinte gravacoes.
 * 2. Deteccao de mudanca externa — o arquivo tambem e editado por fora (VSCode, IA).
 *    A cada 3s comparamos o mtime do disco com o da abertura. Sem alteracao local o
 *    editor recarrega sozinho; com alteracao local ele para e pergunta, porque
 *    escolher sozinho significaria apagar o trabalho de alguem.
 */

const AUTOSAVE_MS = 800
const POLL_MS = 3000

/** Valor de código em inglês; o texto que aparece na tela fica no `Toolbar`. */
export type SaveStatus = 'empty' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict'

export type Workspace = ReturnType<typeof useWorkspace>

export function useWorkspace() {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [dir, setDir] = useState('')
  const [current, setCurrent] = useState<string | null>(null)
  const [doc, setDoc] = useState<ModelDoc | null>(null)
  const [parseError, setParseError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Refs: o autosave e o poll rodam fora do render e precisam do valor mais recente.
  const docRef = useRef<ModelDoc | null>(null)
  const currentRef = useRef<string | null>(null)
  const baseMtimeRef = useRef(0)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)

  docRef.current = doc
  currentRef.current = current
  dirtyRef.current = dirty

  const refreshFiles = useCallback(async (): Promise<FileEntry[]> => {
    const data = await api.listFiles()
    setFiles(data.files)
    setDir(data.dir)
    return data.files
  }, [])

  const open = useCallback(async (name: string): Promise<void> => {
    const loaded = await api.readFile(name)
    const parsed = parseDoc(loaded.content)

    baseMtimeRef.current = loaded.mtime
    setCurrent(name)
    setDirty(false)
    setConflict(false)
    setSaveError('')

    if (parsed.ok) {
      setParseError('')
      setDoc(parsed.doc)
    } else {
      // Mantem o arquivo aberto para a pessoa ver qual e o erro, mas nao deixa editar:
      // gravar por cima de um yaml quebrado apagaria o conteudo que ela quer recuperar.
      setParseError(parsed.error)
      setDoc(emptyDoc(''))
    }
  }, [])

  const save = useCallback(async ({ force = false }: { force?: boolean } = {}): Promise<void> => {
    const name = currentRef.current
    const snapshot = docRef.current
    if (!name || !snapshot) return

    savingRef.current = true
    setSaving(true)
    try {
      const content = serializeDoc(snapshot)
      const saved = await api.saveFile(name, content, force ? undefined : baseMtimeRef.current)
      baseMtimeRef.current = saved.mtime
      setDirty(false)
      setSaveError('')
      setConflict(false)
      void refreshFiles().catch(() => undefined)
    } catch (err) {
      const httpError = err as HttpError
      if (httpError.status === 409) setConflict(true)
      else setSaveError(httpError.message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }, [refreshFiles])

  /** Toda edicao passa por aqui: recalcula avisos e liga o autosave. */
  const update = useCallback((fn: (doc: ModelDoc) => ModelDoc): void => {
    setDoc((prev) => (prev ? withWarnings(fn(prev)) : prev))
    setDirty(true)
  }, [])

  useEffect(() => {
    void refreshFiles().catch((err: Error) => setSaveError(err.message))
  }, [refreshFiles])

  // Autosave com espera.
  useEffect(() => {
    if (!dirty || !current || conflict || parseError) return
    const timer = setTimeout(() => { void save() }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [doc, dirty, current, conflict, parseError, save])

  // Deteccao de mudanca externa.
  useEffect(() => {
    const id = setInterval(() => {
      if (savingRef.current || !currentRef.current) return
      void refreshFiles()
        .then(async (list) => {
          const name = currentRef.current
          const mine = list.find((f) => f.name === name)
          if (!name || !mine) return
          if (Math.abs(mine.mtime - baseMtimeRef.current) <= 1) return
          if (dirtyRef.current) setConflict(true)
          else await open(name)
        })
        .catch(() => undefined) // servidor fora do ar: o proximo tick tenta de novo
    }, POLL_MS)
    return () => clearInterval(id)
  }, [refreshFiles, open])

  // Cmd+S / Ctrl+S grava na hora, sem esperar o autosave.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  const create = useCallback(async (name: string, title: string): Promise<void> => {
    await api.createFile(name, serializeDoc(emptyDoc(title)))
    await refreshFiles()
    await open(name)
  }, [refreshFiles, open])

  const remove = useCallback(async (name: string): Promise<void> => {
    await api.deleteFile(name)
    const rest = await refreshFiles()
    if (name !== currentRef.current) return
    setCurrent(null)
    setDoc(null)
    const next = rest[0]
    if (next) await open(next.name)
  }, [refreshFiles, open])

  const status: SaveStatus = conflict ? 'conflict'
    : saveError ? 'error'
    : saving ? 'saving'
    : dirty ? 'unsaved'
    : current ? 'saved'
    : 'empty'

  return {
    files, dir, current, doc, parseError, saveError, conflict, status,
    open, save, update, create, remove, dismissError: () => setSaveError(''),
  }
}
