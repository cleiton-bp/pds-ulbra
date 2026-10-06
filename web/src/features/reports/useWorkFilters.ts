import { useCallback, useEffect, useMemo, useState } from 'react'
import { NO_REPORT_FILTERS, type ReportFilters, type ReportFilterType } from '@/data'

/** Quanto a busca espera depois da ultima tecla: uma leitura por palavra, e nao por letra. */
export const SEARCH_DELAY_MS = 300

const TIPOS: ReportFilterType[] = ['bug', 'improvement', 'question', 'team']

const chave = (projeto: string) => `pds.web.trabalho.filtros.${projeto}`

/**
 * O que veio guardado, conferido campo a campo: o `sessionStorage` e de quem usa o
 * navegador, e um valor estranho nao pode derrubar a tela nem virar filtro que
 * ninguem pediu.
 */
function lerGuardados(projeto: string): ReportFilters {
  try {
    const bruto = window.sessionStorage.getItem(chave(projeto))
    if (!bruto) return NO_REPORT_FILTERS
    const valor = JSON.parse(bruto) as Partial<Record<keyof ReportFilters, unknown>>
    const textos = (lista: unknown) =>
      Array.isArray(lista) ? lista.filter((item): item is string => typeof item === 'string') : []
    return {
      assignees: textos(valor.assignees),
      labels: textos(valor.labels),
      priorities: textos(valor.priorities),
      types: textos(valor.types).filter((tipo): tipo is ReportFilterType =>
        TIPOS.includes(tipo as ReportFilterType),
      ),
      overdue: valor.overdue === true,
      search: typeof valor.search === 'string' ? valor.search : '',
    }
  } catch {
    return NO_REPORT_FILTERS
  }
}

function guardar(projeto: string, filtros: ReportFilters) {
  try {
    if (countActiveFilters(filtros) === 0) window.sessionStorage.removeItem(chave(projeto))
    else window.sessionStorage.setItem(chave(projeto), JSON.stringify(filtros))
  } catch {
    // Sem armazenamento (aba privada, bloqueio): os filtros so nao ficam lembrados.
  }
}

/** Quantos filtros estao ligados — cada um conta uma vez, com quantos valores tiver. */
export function countActiveFilters(filtros: ReportFilters): number {
  return (
    (filtros.assignees.length > 0 ? 1 : 0) +
    (filtros.labels.length > 0 ? 1 : 0) +
    (filtros.priorities.length > 0 ? 1 : 0) +
    (filtros.types.length > 0 ? 1 : 0) +
    (filtros.overdue ? 1 : 0) +
    (filtros.search.trim() ? 1 : 0)
  )
}

/**
 * Os filtros da tela de Trabalho de um projeto.
 *
 * **Lembrados na aba, por projeto** (`sessionStorage`): sobrevivem a ir a
 * Configuracao e voltar, ou recarregar a pagina; somem ao fechar a aba — um filtro
 * esquecido de ontem faria a pessoa achar que cards sumiram.
 *
 * `filters` e o que esta na tela agora; `applied`, o que vale para as leituras — o
 * mesmo, com a busca esperando a pessoa parar de digitar. `key` muda so quando o que
 * vale muda, e e o que as leituras olham — **vazia quando nada do que vale esta
 * ligado**: a busca que ainda espera a pessoa parar de digitar nao e filtro ainda.
 */
export function useWorkFilters(projectPublicId: string) {
  const [estado, setEstado] = useState(() => ({
    projeto: projectPublicId,
    filtros: lerGuardados(projectPublicId),
  }))
  const [busca, setBusca] = useState(estado.filtros.search)

  // Trocar de projeto le os filtros dele — a busca junto, sem esperar —, antes de
  // qualquer leitura com os do outro.
  const filters =
    estado.projeto === projectPublicId ? estado.filtros : lerGuardados(projectPublicId)
  if (estado.projeto !== projectPublicId) {
    setEstado({ projeto: projectPublicId, filtros: filters })
    setBusca(filters.search)
  }
  useEffect(() => {
    if (filters.search === busca) return
    // Apagar a busca vale na hora: esperar para mostrar tudo de novo nao ajuda ninguem.
    if (!filters.search.trim()) {
      setBusca(filters.search)
      return
    }
    const espera = setTimeout(() => setBusca(filters.search), SEARCH_DELAY_MS)
    return () => clearTimeout(espera)
  }, [filters.search, busca])

  const setFilters = useCallback(
    (proximo: ReportFilters | ((atual: ReportFilters) => ReportFilters)) => {
      setEstado((antes) => {
        const filtros = typeof proximo === 'function' ? proximo(antes.filtros) : proximo
        guardar(antes.projeto, filtros)
        return { projeto: antes.projeto, filtros }
      })
    },
    [],
  )

  const clear = useCallback(() => {
    setFilters(NO_REPORT_FILTERS)
    setBusca('')
  }, [setFilters])

  const applied = useMemo<ReportFilters>(() => ({ ...filters, search: busca }), [filters, busca])
  const key = useMemo(
    () =>
      countActiveFilters(applied) === 0
        ? ''
        : JSON.stringify({
            ...applied,
            assignees: [...applied.assignees].sort(),
            labels: [...applied.labels].sort(),
            priorities: [...applied.priorities].sort(),
            types: [...applied.types].sort(),
            search: applied.search.trim(),
          }),
    [applied],
  )

  return { filters, applied, key, active: countActiveFilters(filters), setFilters, clear }
}
