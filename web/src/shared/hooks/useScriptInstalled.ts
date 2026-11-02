import { useEffect, useState } from 'react'
import type { ProjectViewModel } from '@/contracts'
import { projectOriginService } from '@/data'
import { scriptInstalled } from '@/shared/lib/installSignals'

/**
 * O sistema do cliente ja manda relatos? E o mesmo sinal do passo "Script colado": um
 * relato vindo de um endereco que nao e o do relato de teste. A porta do projeto e a
 * linha do Trabalho decidem por ele, e nao pelo ultimo relato, que o teste tambem acende
 * (a decisao 79 fala em relato do site).
 *
 * `null` enquanto a lista nao chegou, ou com `ativo` desligado (quem e so membro nao le as
 * origens). Sem relato nenhum, a resposta sai na hora, sem leitura; se a leitura falhar,
 * vale o ultimo relato, como antes.
 *
 * A resposta fica guardada por meio minuto: a porta decide, e o Trabalho que ela abre
 * pergunta de novo logo em seguida.
 */
const lidas = new Map<string, { valor: boolean; em: number }>()
const VALIDADE_MS = 30_000

export function useScriptInstalled(project: ProjectViewModel, ativo = true): boolean | null {
  const semRelato = project.LastReportReceivedAt === null
  const [valor, setValor] = useState<boolean | null>(() => guardada(project.PublicId))

  useEffect(() => {
    if (!ativo || semRelato) return
    const fresca = guardada(project.PublicId)
    if (fresca !== null) {
      setValor(fresca)
      return
    }
    let vivo = true
    projectOriginService
      .listObservedOrigins(project.PublicId)
      .then((observed) => scriptInstalled(project, observed))
      .catch(() => scriptInstalled(project, null))
      .then((resposta) => {
        lidas.set(project.PublicId, { valor: resposta, em: Date.now() })
        if (vivo) setValor(resposta)
      })
    return () => {
      vivo = false
    }
  }, [project, ativo, semRelato])

  if (!ativo) return null
  if (semRelato) return false
  return valor
}

function guardada(id: string): boolean | null {
  const lida = lidas.get(id)
  return lida && Date.now() - lida.em < VALIDADE_MS ? lida.valor : null
}
