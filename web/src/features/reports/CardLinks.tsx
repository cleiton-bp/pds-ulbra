import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CARD_LINK_RELATIONS,
  type CardLinkRelation,
  type CardLinkViewModel,
  type ReportStateCountViewModel,
  type ReportSummaryViewModel,
} from '@/contracts'
import { describeError, NO_REPORT_FILTERS, projectReportService } from '@/data'
import { cardHeadline, StatusLozenge, statusTone } from '@/features/reports/cardLook'
import { Button } from '@/shared/components/Button'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'

/** O nome de cada grupo, visto do card aberto — na ordem em que aparecem. */
const GRUPOS: Record<CardLinkRelation, string> = {
  DuplicateOf: 'Duplicado de',
  DuplicatedBy: 'Duplicados deste',
  BlockedBy: 'Bloqueado por',
  Blocks: 'Bloqueia',
  RelatesTo: 'Relacionado a',
}

/** O que se escolhe no "Vincular": a frase completa, do card aberto para o outro. */
const ESCOLHAS: Record<CardLinkRelation, string> = {
  BlockedBy: 'é bloqueado por',
  Blocks: 'bloqueia',
  RelatesTo: 'está relacionado a',
  DuplicateOf: 'é duplicado de',
  DuplicatedBy: 'tem como duplicado',
}
const ORDEM_DAS_ESCOLHAS: CardLinkRelation[] = [
  'BlockedBy',
  'Blocks',
  'RelatesTo',
  'DuplicateOf',
  'DuplicatedBy',
]

/** O que marcar como duplicado faz, dito antes de escolher o card. */
const AVISO_DO_DUPLICADO: Partial<Record<CardLinkRelation, string>> = {
  DuplicateOf:
    'Este card vai para o arquivo. Se for um relato, quem relatou passa a acompanhar o original e recebe o desfecho dele.',
  DuplicatedBy:
    'O card escolhido vai para o arquivo. Se for um relato, quem relatou passa a acompanhar este e recebe o desfecho dele.',
}

/**
 * Os vinculos do card aberto: duplicado de, bloqueia, relacionado a — e o "Vincular".
 *
 * **Bloquear so marca**: o bloqueado mostra o numero de quem o bloqueia enquanto ele
 * nao terminou, e mover continua livre. **O duplicado vai para o arquivo**, e, quando
 * e relato, quem o escreveu passa a acompanhar o original. Desfazer vale sempre — e o
 * caminho de volta do duplicado.
 *
 * A lista e relida quando o card aberto muda (`versao`), inclusive pelo tempo real.
 */
export function CardLinks({
  projectPublicId,
  card,
  colunas,
  versao,
  aoMudar,
}: {
  projectPublicId: string
  card: ReportSummaryViewModel
  colunas: ReportStateCountViewModel[] | null
  /** Sobe quando o card aberto mudou: a lista e relida, sem esvaziar. */
  versao: number
  /** Um vinculo entrou ou saiu: o card aberto pode ter ido ou voltado do arquivo. */
  aoMudar: () => void
}) {
  const arquivado = card.ArchivedAt !== null
  const titulo = useId()
  const {
    data: carregados,
    failed,
    reload,
    revalidate,
  } = useAsyncResource(
    useCallback(
      async () => projectReportService.listLinks(projectPublicId, card.PublicId),
      [projectPublicId, card.PublicId],
    ),
  )

  // A resposta de vincular e desfazer ja traz a lista como ficou: ela vale ate a
  // proxima leitura.
  const [respondidos, setRespondidos] = useState<CardLinkViewModel[] | null>(null)
  const vinculos = respondidos ?? carregados

  const lida = useRef(versao)
  useEffect(() => {
    if (lida.current === versao) return
    lida.current = versao
    setRespondidos(null)
    revalidate()
  }, [versao, revalidate])

  const [desfazendo, setDesfazendo] = useState<string | null>(null)

  async function desfazer(vinculo: CardLinkViewModel) {
    setDesfazendo(vinculo.PublicId)
    try {
      setRespondidos(
        await projectReportService.unlink(projectPublicId, card.PublicId, vinculo.PublicId),
      )
      toast.done(
        vinculo.Type === 'DuplicateOf' || vinculo.Type === 'DuplicatedBy'
          ? `Vínculo com #${vinculo.Card.Number} desfeito. O duplicado voltou ao quadro.`
          : `Vínculo com #${vinculo.Card.Number} desfeito.`,
      )
      aoMudar()
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setDesfazendo(null)
    }
  }

  const grupos = CARD_LINK_RELATIONS.map((tipo) => ({
    tipo,
    itens: (vinculos ?? []).filter((vinculo) => vinculo.Type === tipo),
  })).filter((grupo) => grupo.itens.length > 0)

  return (
    <section aria-labelledby={titulo} className="mt-1">
      <h3 id={titulo} className="mb-2 font-semibold text-detail text-fg">
        Vínculos
      </h3>

      {failed && (
        <p className="mb-2 text-detail text-fg-muted">
          Não deu para carregar os vínculos.{' '}
          <button type="button" onClick={reload} className="underline underline-offset-2">
            Tentar de novo
          </button>
        </p>
      )}

      {vinculos === null && !failed && <Skeleton className="mb-2 h-8 w-full" />}

      {grupos.map((grupo) => (
        <div key={grupo.tipo} className="mb-3">
          <h4 className="mb-1 text-caption text-fg-muted">{GRUPOS[grupo.tipo]}</h4>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {grupo.itens.map((vinculo) => (
              <li key={vinculo.PublicId} className="flex min-w-0 items-center gap-2 px-2.5 py-2">
                <span className="flex-none font-mono text-caption text-fg-muted">
                  #{vinculo.Card.Number}
                </span>
                <Link
                  to={`../${vinculo.Card.PublicId}`}
                  className={cn(
                    'min-w-0 flex-1 truncate text-detail underline-offset-2 hover:underline',
                    vinculo.Card.Finished ? 'text-fg-muted line-through' : 'text-fg',
                  )}
                >
                  {vinculo.Card.Headline}
                </Link>
                {vinculo.Card.ArchivedAt ? (
                  <span className="flex-none rounded-full border border-warn-border bg-warn-surface px-2 py-px text-caption text-warn-fg">
                    Arquivado
                  </span>
                ) : (
                  vinculo.Card.StateName && (
                    <StatusLozenge
                      name={vinculo.Card.StateName}
                      tone={statusTone(vinculo.Card.StatePublicId, colunas)}
                      className="max-w-28 flex-none"
                    />
                  )
                )}
                <button
                  type="button"
                  onClick={() => void desfazer(vinculo)}
                  disabled={desfazendo !== null}
                  aria-label={`Desfazer o vínculo com #${vinculo.Card.Number}`}
                  title="Desfazer o vínculo"
                  className="flex size-6 flex-none items-center justify-center rounded-md text-fg-muted hover:bg-surface-sunken hover:text-fg disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 12 12"
                    className="size-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M3 3l6 6M9 3 3 9" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {vinculos && vinculos.length === 0 && arquivado && (
        <p className="text-detail text-fg-muted">Sem vínculos.</p>
      )}

      {!arquivado && vinculos && (
        <LinkForm
          projectPublicId={projectPublicId}
          card={card}
          vinculados={vinculos.map((vinculo) => vinculo.Card.PublicId)}
          aoVincular={(lista) => {
            setRespondidos(lista)
            aoMudar()
          }}
        />
      )}
    </section>
  )
}

/**
 * O "Vincular": o tipo, e o card pela busca — numero, titulo ou texto, a mesma busca
 * da tela de Trabalho. O card aberto e os ja vinculados ficam de fora.
 */
function LinkForm({
  projectPublicId,
  card,
  vinculados,
  aoVincular,
}: {
  projectPublicId: string
  card: ReportSummaryViewModel
  vinculados: string[]
  aoVincular: (lista: CardLinkViewModel[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [tipo, setTipo] = useState<CardLinkRelation>('BlockedBy')
  const [termo, setTermo] = useState('')
  const [achados, setAchados] = useState<ReportSummaryViewModel[] | null>(null)
  const [vinculando, setVinculando] = useState(false)
  const campo = useId()

  // A busca espera a pessoa parar de digitar, como a da tela de Trabalho.
  useEffect(() => {
    const busca = termo.trim()
    if (!aberto || busca.length === 0) {
      setAchados(null)
      return
    }
    let valendo = true
    const espera = setTimeout(() => {
      projectReportService
        .listReports(projectPublicId, 1, null, false, {
          pageSize: 8,
          filters: { ...NO_REPORT_FILTERS, search: busca },
        })
        .then((pagina) => {
          if (valendo) setAchados(pagina.reports)
        })
        .catch(() => {
          if (valendo) setAchados([])
        })
    }, 250)
    return () => {
      valendo = false
      clearTimeout(espera)
    }
  }, [aberto, termo, projectPublicId])

  const opcoes = (achados ?? []).filter(
    (achado) => achado.PublicId !== card.PublicId && !vinculados.includes(achado.PublicId),
  )

  // Ao fechar — vinculou ou desistiu —, o foco volta ao "+ Vincular": o formulario
  // some, e sem isto o foco caia no dialogo inteiro.
  const idDoBotao = useId()
  const devolverFoco = useRef(false)
  useEffect(() => {
    if (aberto || !devolverFoco.current) return
    devolverFoco.current = false
    document.getElementById(idDoBotao)?.focus()
  }, [aberto, idDoBotao])
  const fechar = () => {
    devolverFoco.current = true
    setAberto(false)
  }

  async function vincular(alvo: ReportSummaryViewModel) {
    if (vinculando) return
    setVinculando(true)
    try {
      const lista = await projectReportService.link(projectPublicId, card.PublicId, {
        Type: tipo,
        TargetPublicId: alvo.PublicId,
      })
      toast.done(`#${card.Number} ${ESCOLHAS[tipo]} #${alvo.Number}.`)
      setTermo('')
      fechar()
      aoVincular(lista)
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setVinculando(false)
    }
  }

  if (!aberto) {
    return (
      <Button id={idDoBotao} size="sm" variant="quiet" onClick={() => setAberto(true)}>
        + Vincular
      </Button>
    )
  }

  const aviso = AVISO_DO_DUPLICADO[tipo]

  return (
    <form
      onSubmit={(evento: FormEvent) => {
        evento.preventDefault()
        // Enter com um card so na lista vincula ele.
        const unico = opcoes.length === 1 ? opcoes[0] : undefined
        if (unico) void vincular(unico)
      }}
      className="flex flex-col gap-2 rounded-lg border border-border p-2.5"
    >
      <Select
        label={`O card #${card.Number}`}
        value={tipo}
        onChange={(valor) => setTipo(valor as CardLinkRelation)}
        options={ORDEM_DAS_ESCOLHAS.map((valor) => ({ value: valor, label: ESCOLHAS[valor] }))}
      />
      {aviso && <p className="text-caption text-fg-muted leading-normal">{aviso}</p>}

      <label htmlFor={campo} className="text-detail text-fg-muted">
        Card
      </label>
      <input
        id={campo}
        type="search"
        value={termo}
        onChange={(evento) => setTermo(evento.target.value)}
        placeholder="Número ou título"
        disabled={vinculando}
        // biome-ignore lint/a11y/noAutofocus: o campo acabou de ser aberto por quem quer escrever nele
        autoFocus
        className="h-8 w-full rounded-lg border border-border bg-surface-raised px-2.5 text-detail text-fg placeholder:text-fg-placeholder"
      />

      {achados !== null && (
        <ul aria-label="Cards encontrados" className="flex flex-col">
          {opcoes.length === 0 && (
            <li className="px-1 py-1.5 text-detail text-fg-muted">Nenhum card encontrado.</li>
          )}
          {opcoes.map((achado) => (
            <li key={achado.PublicId}>
              <button
                type="button"
                onClick={() => void vincular(achado)}
                disabled={vinculando}
                className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-surface-sunken disabled:opacity-60"
              >
                <span className="flex-none font-mono text-caption text-fg-muted">
                  #{achado.Number}
                </span>
                <span className="min-w-0 truncate text-detail text-fg">
                  {cardHeadline(achado).text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="quiet"
          disabled={vinculando}
          onClick={() => {
            fechar()
            setTermo('')
          }}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}
