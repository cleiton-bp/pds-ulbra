import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import * as api from './api'
import type { HttpError } from './api'
import type { Collection } from './environments'
import type { FileEntry, ParseResult } from './types'
import { hasYamlComments } from './yamlComments'

/**
 * O estado de um editor: a lista de arquivos, o documento aberto e a gravacao.
 * Os dois ambientes usam este mesmo hook; o que muda entre eles e o `DocFormat`.
 *
 * As decisoes que moram aqui:
 *
 * 1. Autosave com espera — grava 800ms depois da ultima mexida, para digitar um nome
 *    nao virar vinte gravacoes. Uma gravacao por vez: o que chega no meio espera e
 *    roda em seguida, e so aparece "gravado" se nada mudou durante a ida ao disco.
 * 2. Deteccao de mudanca externa — o arquivo tambem e editado por fora (VSCode, IA).
 *    A cada 3s comparamos o mtime do disco com o da abertura. Sem alteracao local o
 *    editor recarrega sozinho; com alteracao local ele para e pergunta, porque
 *    escolher sozinho significaria apagar o trabalho de alguem.
 * 3. Nada e gravado quando gravar apagaria algo — nem pelo autosave, nem pelo ⌘S:
 *    conflito sem escolha feita, yaml quebrado (a tela mostra um documento vazio),
 *    arquivo com comentarios que o editor nao sabe guardar, e arquivo que sumiu do
 *    disco. Em todos, uma faixa diz o que houve e oferece a saida.
 * 4. Edicao nao se perde no caminho — trocar de arquivo, sair do editor ou fechar a
 *    aba grava antes, ou para e avisa quando nao da para gravar.
 */

/** O que muda de um ambiente para o outro: como o arquivo vira documento e volta. */
export type DocFormat<Doc> = {
  parse: (text: string) => ParseResult<Doc>
  serialize: (doc: Doc) => string
  empty: (title: string) => Doc
  /** Recalcula o que deriva do resto — os avisos. Roda depois de cada edicao. */
  refresh: (doc: Doc) => Doc
  /** Releitura do mesmo arquivo: mantem os `uid`, para a selecao da tela sobreviver. */
  carry?: (previous: Doc, next: Doc) => Doc
}

const AUTOSAVE_MS = 800
const POLL_MS = 3000

/** Valor de codigo em ingles; o texto que aparece na tela fica na barra de cada editor. */
export type SaveStatus = 'empty' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict'

type Options = {
  /** Arquivo para abrir assim que a lista chegar — o do endereco ou o ultimo usado. */
  initialFile?: string | null
  /** O arquivo inicial veio do endereco: se ele nao existir, vale um aviso. */
  initialFromAddress?: boolean
  /** Avisa quem esta em volta que um arquivo abriu — para o endereco e o "ultimo usado". */
  onOpened?: (name: string | null) => void
}

/**
 * Estado que tambem e lido fora do render (autosave, poll, troca de arquivo). Grava
 * no estado e na ref ao mesmo tempo: copiar a ref no render deixaria uma janela em
 * que o codigo assincrono le o valor velho.
 */
function useSynced<T>(initial: T): [T, MutableRefObject<T>, (value: T) => void] {
  const [value, setValue] = useState<T>(initial)
  const ref = useRef<T>(initial)
  const set = useCallback((next: T) => {
    ref.current = next
    setValue(next)
  }, [])
  return [value, ref, set]
}

export type Workspace<Doc> = ReturnType<typeof useWorkspace<Doc>>

export function useWorkspace<Doc>(collection: Collection, format: DocFormat<Doc>, options: Options = {}) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [dir, setDir] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  const [current, currentRef, setCurrent] = useSynced<string | null>(null)
  const [doc, docRef, setDoc] = useSynced<Doc | null>(null)
  const [parseError, parseErrorRef, setParseError] = useSynced('')
  const [conflict, conflictRef, setConflict] = useSynced(false)
  const [comments, commentsRef, setComments] = useSynced(false)
  const [missing, missingRef, setMissing] = useSynced(false)
  const [dirty, dirtyRef, setDirty] = useSynced(false)

  const baseMtimeRef = useRef(0)
  /** Conta as edicoes. A gravacao compara antes e depois para saber se algo chegou no meio. */
  const revisionRef = useRef(0)
  /** A gravacao em curso, para quem precisa esperar por ela (troca de arquivo, apagar). */
  const runningRef = useRef<Promise<boolean> | null>(null)
  /** Pediram outra gravacao enquanto uma estava em curso — ela roda assim que a primeira termina. */
  const pendingRef = useRef(false)

  const onOpenedRef = useRef(options.onOpened)
  onOpenedRef.current = options.onOpened

  const refreshFiles = useCallback(async (): Promise<FileEntry[]> => {
    const data = await api.listFiles(collection)
    setFiles(data.files)
    setDir(data.dir)
    return data.files
  }, [collection])

  /**
   * Grava o que esta na tela e diz se nao sobrou nada por gravar.
   *
   * Cada rodada fica presa ao arquivo em que comecou: se outro arquivo abrir no
   * meio, ela para, e nunca grava o mtime de um arquivo na conta do outro.
   */
  const save = useCallback(({ force = false }: { force?: boolean } = {}): Promise<boolean> => {
    if (runningRef.current) {
      pendingRef.current = true
      return runningRef.current
    }
    const name = currentRef.current
    if (!name) return Promise.resolve(true)

    const run = (async (): Promise<boolean> => {
      // Cede a vez antes de qualquer coisa: `runningRef` precisa estar preenchida
      // antes do `finally` que a limpa, mesmo quando a rodada termina sem gravar.
      await null
      setSaving(true)
      let overwrite = force
      try {
        do {
          pendingRef.current = false
          if (currentRef.current !== name) return true
          const snapshot = docRef.current
          if (!snapshot || parseErrorRef.current) return true
          const blocked = commentsRef.current || (!overwrite && (conflictRef.current || missingRef.current))
          if (blocked) return !dirtyRef.current

          const revision = revisionRef.current
          try {
            const content = format.serialize(snapshot)
            const saved = await api.saveFile(collection, name, content, overwrite ? undefined : baseMtimeRef.current)
            if (currentRef.current !== name) return true
            baseMtimeRef.current = saved.mtime
            if (revisionRef.current === revision) setDirty(false)
            setConflict(false)
            setMissing(false)
            setSaveError('')
            void refreshFiles().catch(() => undefined)
          } catch (err) {
            if (currentRef.current !== name) return false
            const httpError = err as HttpError
            if (httpError.status === 409) setConflict(true)
            else if (httpError.status === 404) setMissing(true)
            else setSaveError(httpError.message)
            return false
          }
          overwrite = false
        } while (pendingRef.current)
        return !dirtyRef.current
      } finally {
        runningRef.current = null
        setSaving(false)
      }
    })()

    runningRef.current = run
    return run
  }, [collection, format, refreshFiles, currentRef, docRef, parseErrorRef, commentsRef, conflictRef, missingRef, dirtyRef, setDirty, setConflict, setMissing])

  /**
   * Garante que nada da tela ficou sem gravar: espera a gravacao em curso e grava o
   * que sobrou. Tres voltas bastam — o que chega depois disso e alguem digitando
   * sem parar, e quem pediu a troca espera. Devolve `false` quando nao deu.
   */
  const flush = useCallback(async (): Promise<boolean> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (runningRef.current) await runningRef.current
      if (!dirtyRef.current || !currentRef.current) return true
      await save()
    }
    return !dirtyRef.current
  }, [save, dirtyRef, currentRef])

  /**
   * Abre um arquivo. Antes, grava o que o arquivo atual tinha pendente — e, se nao
   * conseguir, fica onde esta e diz por que. `discard` pula essa gravacao: e o
   * "recarregar do disco" do conflito, que existe justamente para descartar.
   */
  const open = useCallback(async (name: string, { discard = false }: { discard?: boolean } = {}): Promise<boolean> => {
    if (!discard && !(await flush())) {
      setSaveError('Este arquivo tem edição que ainda não foi gravada — resolva o aviso acima antes de abrir outro.')
      return false
    }
    // Mesmo descartando, espera a gravacao em curso: ela ainda vai escrever o mtime.
    if (runningRef.current) await runningRef.current

    let loaded: api.LoadedFile
    try {
      loaded = await api.readFile(collection, name)
    } catch (err) {
      const httpError = err as HttpError
      setSaveError(httpError.status === 404
        ? `O arquivo ${name} não existe mais nesta pasta — escolha outro na lista.`
        : httpError.message)
      return false
    }

    const parsed = format.parse(loaded.content)
    const previous = currentRef.current === name ? docRef.current : null

    baseMtimeRef.current = loaded.mtime
    pendingRef.current = false
    setCurrent(name)
    setDirty(false)
    setConflict(false)
    setMissing(false)
    setSaveError('')

    if (parsed.ok) {
      setParseError('')
      setComments(hasYamlComments(loaded.content))
      setDoc(previous && format.carry ? format.carry(previous, parsed.doc) : parsed.doc)
    } else {
      // Mantem o arquivo aberto para a pessoa ver qual e o erro, mas nao deixa editar:
      // gravar por cima de um yaml quebrado apagaria o conteudo que ela quer recuperar.
      setParseError(parsed.error)
      setComments(false)
      setDoc(format.empty(''))
    }
    onOpenedRef.current?.(name)
    return true
  }, [collection, format, flush, currentRef, docRef, setCurrent, setDirty, setConflict, setMissing, setParseError, setComments, setDoc])

  /** Toda edicao passa por aqui: recalcula os avisos e liga o autosave. */
  /**
   * O guarda de saida do editor: grava o que falta e, se nao der, diz por que a
   * tela nao saiu — senao o botao de inicio pareceria simplesmente nao funcionar.
   */
  const leave = useCallback(async (): Promise<boolean> => {
    const ok = await flush()
    if (!ok) setSaveError('Há edição que ainda não foi gravada — resolva o aviso acima antes de sair.')
    return ok
  }, [flush])

  const update = useCallback((fn: (doc: Doc) => Doc): void => {
    const previous = docRef.current
    if (!previous) return
    revisionRef.current += 1
    setDoc(format.refresh(fn(previous)))
    setDirty(true)
  }, [format, docRef, setDoc, setDirty])

  const close = useCallback((): void => {
    pendingRef.current = false
    setCurrent(null)
    setDoc(null)
    setDirty(false)
    setConflict(false)
    setMissing(false)
    setComments(false)
    setParseError('')
    setSaveError('')
    onOpenedRef.current?.(null)
  }, [setCurrent, setDoc, setDirty, setConflict, setMissing, setComments, setParseError])

  // Primeira carga: a lista, e o arquivo pedido se ele existir.
  const { initialFile, initialFromAddress } = options
  useEffect(() => {
    void refreshFiles()
      .then(async (list) => {
        if (!initialFile) return
        if (list.some((file) => file.name === initialFile)) {
          await open(initialFile, { discard: true })
          return
        }
        // Tira do endereco o arquivo que nao existe, para recarregar nao repetir o erro.
        onOpenedRef.current?.(null)
        if (initialFromAddress) setSaveError(`O arquivo ${initialFile} não existe mais nesta pasta — escolha outro na lista.`)
      })
      .catch((err: Error) => setSaveError(err.message))
    // So na montagem: trocar de arquivo depois disso e com o `open`.
  }, [])

  // Autosave com espera.
  useEffect(() => {
    if (!dirty || !current || conflict || parseError || comments || missing) return
    const timer = setTimeout(() => { void save() }, AUTOSAVE_MS)
    return () => clearTimeout(timer)
  }, [doc, dirty, current, conflict, parseError, comments, missing, save])

  // Deteccao de mudanca externa. A lista atualiza sempre, com ou sem arquivo aberto:
  // e ela que impede criar um nome que alguem acabou de criar por fora.
  useEffect(() => {
    const id = setInterval(() => {
      if (runningRef.current) return
      void refreshFiles()
        .then(async (list) => {
          const name = currentRef.current
          if (!name || runningRef.current) return
          const mine = list.find((file) => file.name === name)
          if (!mine) {
            setMissing(true)
            return
          }
          // Voltou (um `git checkout`, a IA regravando): deixa de estar sumido, e o
          // que houver de diferente segue o caminho normal — recarrega ou vira conflito.
          if (missingRef.current) setMissing(false)
          if (Math.abs(mine.mtime - baseMtimeRef.current) <= 1) return
          if (dirtyRef.current) setConflict(true)
          else await open(name, { discard: true })
        })
        .catch(() => undefined) // servidor fora do ar: o proximo tick tenta de novo
    }, POLL_MS)
    return () => clearInterval(id)
  }, [refreshFiles, open, currentRef, dirtyRef, missingRef, setMissing, setConflict])

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

  // Fechar ou recarregar a aba com edicao pendente pede confirmacao ao navegador; se
  // a pessoa confirmar, ainda tenta gravar na saida (ver `saveFileOnExit`).
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    const onPageHide = (): void => {
      const name = currentRef.current
      const snapshot = docRef.current
      const blocked = parseErrorRef.current || commentsRef.current || conflictRef.current || missingRef.current
      if (!dirtyRef.current || !name || !snapshot || blocked) return
      api.saveFileOnExit(collection, name, format.serialize(snapshot), baseMtimeRef.current)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [collection, format, dirtyRef, currentRef, docRef, parseErrorRef, commentsRef, conflictRef, missingRef])

  // Sair do editor pelo "voltar" do navegador desmonta tudo: grava o que ficou pendente.
  useEffect(() => () => {
    if (dirtyRef.current) void save()
  }, [save, dirtyRef])

  const create = useCallback(async (name: string, title: string): Promise<void> => {
    await api.createFile(collection, name, format.serialize(format.empty(title)))
    await refreshFiles()
    await open(name)
  }, [collection, format, refreshFiles, open])

  /** Apagar o arquivo aberto descarta o que nao foi gravado — a pessoa confirmou antes. */
  const remove = useCallback(async (name: string): Promise<void> => {
    const isCurrent = name === currentRef.current
    if (isCurrent) {
      pendingRef.current = false
      setDirty(false)
      if (runningRef.current) await runningRef.current
    }
    await api.deleteFile(collection, name)
    const rest = await refreshFiles()
    if (!isCurrent) return
    close()
    const next = rest[0]
    if (next) await open(next.name, { discard: true })
  }, [collection, refreshFiles, open, close, currentRef, setDirty])

  /**
   * O arquivo sumiu do disco e a pessoa quer de volta o que esta na tela. Cria —
   * nunca sobrescreve: se nesse meio-tempo o arquivo voltou por outro caminho, vira
   * conflito, e a pessoa escolhe qual versao fica.
   */
  const recreate = useCallback(async (): Promise<void> => {
    const name = currentRef.current
    const snapshot = docRef.current
    if (!name || !snapshot) return
    const revision = revisionRef.current
    try {
      const saved = await api.createFile(collection, name, format.serialize(snapshot))
      if (currentRef.current !== name) return
      baseMtimeRef.current = saved.mtime
      setMissing(false)
      if (revisionRef.current === revision) setDirty(false)
      setSaveError('')
      void refreshFiles().catch(() => undefined)
    } catch (err) {
      const httpError = err as HttpError
      if (httpError.status === 409) {
        setMissing(false)
        setConflict(true)
      } else {
        setSaveError(httpError.message)
      }
    }
  }, [collection, format, refreshFiles, currentRef, docRef, setMissing, setDirty, setConflict])

  /** A pessoa aceitou perder os comentarios: a gravacao volta a andar, e grava ja. */
  const dropComments = useCallback((): void => {
    setComments(false)
    revisionRef.current += 1
    setDirty(true)
  }, [setComments, setDirty])

  const status: SaveStatus = conflict ? 'conflict'
    : saveError || missing ? 'error'
    : saving ? 'saving'
    : dirty ? 'unsaved'
    : current ? 'saved'
    : 'empty'

  return {
    files, dir, current, doc, parseError, saveError, conflict, comments, missing, status,
    open, save, flush, leave, update, create, remove, close, dropComments, recreate,
    dismissError: () => setSaveError(''),
  }
}
