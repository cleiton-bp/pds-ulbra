import { useEffect, useId, useRef, useState } from 'react'
import {
  MAX_LABEL_NAME_LENGTH,
  MAX_LABELS_PER_CARD,
  type ProjectLabelViewModel,
  type ProjectPriorityViewModel,
  type ReportDetailViewModel,
  type ReportSummaryViewModel,
  type TeamMemberViewModel,
} from '@/contracts'
import {
  describeError,
  projectLabelService,
  projectPriorityService,
  projectReportService,
  projectTeamService,
} from '@/data'
import { CardChip } from '@/shared/components/CardChip'
import { Select } from '@/shared/components/Select'
import { toast } from '@/shared/components/toastStore'
import { cn } from '@/shared/lib/cn'
import { formatDay } from '@/shared/lib/datetime'

/** Uma lista de escolha: chegando, chegou, ou nao deu para ler. */
type Lista<T> = T[] | null | 'falhou'

/**
 * Os campos que o time da ao card: quem esta com ele, o quanto importa, as
 * etiquetas e o prazo. Servem o relato e o card do time — sao os mesmos nos dois.
 *
 * **Tudo interno.** Nada disto chega a quem relatou; a tela nao precisa avisar,
 * porque nao ha caminho por onde vazar.
 *
 * **Cada mudanca e uma chamada**, e a resposta e o card inteiro: quem abriu o
 * dialogo troca o que tem pela resposta (`aoMudar`), e a lista se acerta junto.
 * **Arquivado so se le** — mudar pede desarquivar, e a API recusa do mesmo jeito.
 */
export function CardFields({
  projectPublicId,
  reportPublicId,
  card,
  aoMudar,
}: {
  projectPublicId: string
  reportPublicId: string
  card: ReportSummaryViewModel
  aoMudar: (card: ReportDetailViewModel) => void
}) {
  const arquivado = card.ArchivedAt !== null

  // As listas de escolha: quem esta no time, as prioridades e as etiquetas do
  // projeto. Lidas uma vez por card aberto. Falhar aqui so tira a escolha: o valor
  // do card continua na tela, so para leitura, e a tela diz por que.
  const [time, setTime] = useState<Lista<TeamMemberViewModel>>(null)
  const [prioridades, setPrioridades] = useState<Lista<ProjectPriorityViewModel>>(null)
  const [etiquetas, setEtiquetas] = useState<Lista<ProjectLabelViewModel>>(null)

  useEffect(() => {
    if (arquivado) return
    let vivo = true

    projectTeamService
      .listMembers(projectPublicId)
      .then((lista) => vivo && setTime(lista))
      .catch(() => vivo && setTime('falhou'))
    projectPriorityService
      .listPriorities(projectPublicId)
      .then((lista) => vivo && setPrioridades(lista))
      .catch(() => vivo && setPrioridades('falhou'))
    projectLabelService
      .listLabels(projectPublicId)
      .then((lista) => vivo && setEtiquetas(lista))
      .catch(() => vivo && setEtiquetas('falhou'))

    return () => {
      vivo = false
    }
  }, [projectPublicId, arquivado])

  // **Uma mudanca de cada vez, na ordem em que a pessoa fez.** A seguinte espera a
  // resposta da anterior e parte do card que ela devolveu: duas etiquetas escolhidas
  // em seguida entram as duas, e nenhuma resposta antiga pisa numa nova. Os campos
  // nao se desligam enquanto isso — desligar tirava o foco de quem estava no meio de
  // uma escolha, e o que ela digitasse depois se perdia.
  const fila = useRef<Promise<void>>(Promise.resolve())
  const atual = useRef(card)

  useEffect(() => {
    atual.current = card
  }, [card])

  /** Poe a mudanca na fila. Nulo, na vez dela, e "nada a fazer": ja e verdade. */
  function salvar(acao: (card: ReportSummaryViewModel) => Promise<ReportDetailViewModel | null>) {
    fila.current = fila.current.then(async () => {
      try {
        const novo = await acao(atual.current)
        if (!novo) return
        atual.current = novo
        aoMudar(novo)
      } catch (falha) {
        toast.error(describeError(falha))
      }
    })
  }

  const ids = (lista: { PublicId: string }[]) => lista.map((item) => item.PublicId)

  const trocarEtiquetas = (ids: string[]) =>
    projectReportService.setLabels(projectPublicId, reportPublicId, { LabelPublicIds: ids })

  function porEtiqueta(publicId: string) {
    salvar(async (c) =>
      c.Labels.some((item) => item.PublicId === publicId)
        ? null
        : trocarEtiquetas([...ids(c.Labels), publicId]),
    )
  }

  function tirarEtiqueta(publicId: string) {
    salvar(async (c) =>
      c.Labels.some((item) => item.PublicId === publicId)
        ? trocarEtiquetas(ids(c.Labels.filter((item) => item.PublicId !== publicId)))
        : null,
    )
  }

  function criarEtiqueta(nome: string) {
    salvar(async (c) => {
      // Criar e de qualquer um do time. O nome que ja existe volta como a etiqueta
      // que existe — e e ela que entra no card.
      const etiqueta = await projectLabelService.addLabel(projectPublicId, { Name: nome })
      setEtiquetas((lista) =>
        lista === null ||
        lista === 'falhou' ||
        lista.some((item) => item.PublicId === etiqueta.PublicId)
          ? lista
          : [...lista, etiqueta],
      )
      return c.Labels.some((item) => item.PublicId === etiqueta.PublicId)
        ? null
        : trocarEtiquetas([...ids(c.Labels), etiqueta.PublicId])
    })
  }

  const responsavel = card.Assignee
  const algoFalhou = time === 'falhou' || prioridades === 'falhou' || etiquetas === 'falhou'

  return (
    <section aria-label="Campos do card" className="border-border border-t pt-4">
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
        <dt className="text-detail text-fg-muted">Responsável</dt>
        <dd className="min-w-0">
          {arquivado || time === 'falhou' ? (
            <span className="text-body text-fg">{rotuloDoResponsavel(card) ?? 'Ninguém'}</span>
          ) : (
            <Select
              size="sm"
              ariaLabel="Responsável"
              value={responsavel?.UserPublicId ?? ''}
              disabled={time === null}
              openOnType
              onChange={(valor) =>
                salvar(async (c) =>
                  (c.Assignee?.UserPublicId ?? '') === valor
                    ? null
                    : projectReportService.setAssignee(projectPublicId, reportPublicId, {
                        UserPublicId: valor === '' ? null : valor,
                      }),
                )
              }
              options={[
                { value: '', label: 'Ninguém' },
                // Quem saiu continua no card, como registro, e aparece marcado: nao se
                // escolhe de novo, e a API recusaria. E, enquanto o time nao chegou, o
                // escolhido precisa estar na lista para o campo mostrar o nome dele.
                ...(responsavel && (!responsavel.InTeam || time === null)
                  ? [
                      {
                        value: responsavel.UserPublicId,
                        label: rotuloDoResponsavel(card) ?? '',
                        disabled: !responsavel.InTeam,
                      },
                    ]
                  : []),
                ...(time ?? []).map((pessoa) => ({
                  value: pessoa.UserPublicId,
                  label: pessoa.Name ?? pessoa.Email ?? 'Sem nome',
                })),
              ]}
            />
          )}
        </dd>

        <dt className="text-detail text-fg-muted">Prioridade</dt>
        <dd className="min-w-0">
          {arquivado || prioridades === null || prioridades === 'falhou' ? (
            card.Priority ? (
              <CardChip color={card.Priority.Color}>{rotuloDaPrioridade(card.Priority)}</CardChip>
            ) : (
              <span className="text-body text-fg-muted">Sem prioridade</span>
            )
          ) : (
            <Select
              size="sm"
              ariaLabel="Prioridade"
              value={card.Priority?.PublicId ?? ''}
              openOnType
              onChange={(valor) =>
                salvar(async (c) =>
                  (c.Priority?.PublicId ?? '') === valor
                    ? null
                    : projectReportService.setPriority(projectPublicId, reportPublicId, {
                        PriorityPublicId: valor === '' ? null : valor,
                      }),
                )
              }
              options={[
                { value: '', label: 'Sem prioridade' },
                ...prioridades
                  .filter((p) => p.IsActive || p.PublicId === card.Priority?.PublicId)
                  .map((p) => ({
                    value: p.PublicId,
                    label: rotuloDaPrioridade(p),
                    disabled: !p.IsActive,
                  })),
              ]}
            />
          )}
        </dd>

        <dt className="self-start pt-1 text-detail text-fg-muted">Etiquetas</dt>
        <dd className="min-w-0">
          <Etiquetas
            card={card}
            etiquetas={etiquetas === 'falhou' ? null : etiquetas}
            podeAdicionar={!arquivado && Array.isArray(etiquetas)}
            arquivado={arquivado}
            aoPor={porEtiqueta}
            aoTirar={tirarEtiqueta}
            aoCriar={criarEtiqueta}
          />
        </dd>

        <dt className="text-detail text-fg-muted">Prazo</dt>
        <dd className="min-w-0">
          {arquivado ? (
            <span className={cn('text-body', card.DueDate ? 'text-fg' : 'text-fg-muted')}>
              {card.DueDate ? formatDay(card.DueDate) : 'Sem prazo'}
            </span>
          ) : (
            <Prazo
              valor={card.DueDate}
              aoMudar={(data) =>
                salvar(async (c) =>
                  c.DueDate === data
                    ? null
                    : projectReportService.setDueDate(projectPublicId, reportPublicId, {
                        DueDate: data,
                      }),
                )
              }
            />
          )}
        </dd>
      </dl>

      {algoFalhou && (
        <p role="status" className="mt-3 text-caption text-fg-muted">
          Não deu para carregar tudo o que se escolhe aqui — o que não carregou fica só para
          leitura. Feche e abra o card para tentar de novo.
        </p>
      )}
    </section>
  )
}

/**
 * Como o responsavel aparece: o nome (ou o e-mail de quem nao tem nome, que a API ja
 * manda no lugar) e, se ele saiu do time, a marca.
 */
function rotuloDoResponsavel(card: ReportSummaryViewModel): string | null {
  if (!card.Assignee) return null
  const nome = card.Assignee.Name || 'Sem nome'
  return card.Assignee.InTeam ? nome : `${nome} (saiu do time)`
}

/** A aposentada continua no card que a tem, e aparece marcada onde estiver. */
function rotuloDaPrioridade(prioridade: { Name: string; IsActive: boolean }): string {
  return prioridade.IsActive ? prioridade.Name : `${prioridade.Name} (aposentada)`
}

/**
 * O mesmo nome para a API: sem as bordas, os espacos de dentro juntados, e sem
 * diferenciar maiuscula. **O acento conta** — "pais" e "país" sao duas etiquetas.
 */
function mesmoNome(a: string, b: string): boolean {
  const limpo = (texto: string) => texto.trim().replace(/\s+/g, ' ').toLowerCase()
  return limpo(a) === limpo(b)
}

/** Para procurar: sem maiuscula e sem acento, "pag" acha "Pagamento" e "pagaménto". */
function paraProcurar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * As etiquetas do card e o campo de etiquetar.
 *
 * **Etiquetar e escrever.** O campo procura entre as etiquetas do projeto, e o nome
 * que nao existe vira etiqueta nova — qualquer pessoa do time cria. **Enter poe a
 * etiqueta com o nome escrito**, e a cria se ela nao existe; nunca uma parecida. As
 * parecidas aparecem embaixo, para escolher com um clique.
 */
function Etiquetas({
  card,
  etiquetas,
  podeAdicionar,
  arquivado,
  aoPor,
  aoTirar,
  aoCriar,
}: {
  card: ReportSummaryViewModel
  etiquetas: ProjectLabelViewModel[] | null
  podeAdicionar: boolean
  arquivado: boolean
  aoPor: (publicId: string) => void
  aoTirar: (publicId: string) => void
  aoCriar: (nome: string) => void
}) {
  const dicaId = useId()
  const [texto, setTexto] = useState('')
  const noCard = new Set(card.Labels.map((etiqueta) => etiqueta.PublicId))
  const busca = texto.trim()
  const chave = paraProcurar(busca)

  const sugestoes = (etiquetas ?? [])
    .filter((etiqueta) => !noCard.has(etiqueta.PublicId))
    .filter((etiqueta) => chave.length === 0 || paraProcurar(etiqueta.Name).includes(chave))
    .slice(0, 6)

  // A de nome igual, pela regra da API. Criar so quando ela nao existe.
  const igual = (etiquetas ?? []).find((etiqueta) => mesmoNome(etiqueta.Name, busca))
  const podeCriar = busca.length > 0 && !igual
  const cheio = card.Labels.length >= MAX_LABELS_PER_CARD

  function escolher(publicId: string) {
    aoPor(publicId)
    setTexto('')
  }

  function criar() {
    aoCriar(busca)
    setTexto('')
  }

  return (
    <div className="flex flex-col gap-2">
      {card.Labels.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {card.Labels.map((etiqueta) => (
            <li key={etiqueta.PublicId} className="flex items-center">
              <CardChip color={etiqueta.Color}>{etiqueta.Name}</CardChip>
              {!arquivado && (
                <button
                  type="button"
                  aria-label={`Tirar a etiqueta ${etiqueta.Name}`}
                  onClick={() => aoTirar(etiqueta.PublicId)}
                  className="ml-0.5 rounded-full px-1 text-caption text-fg-muted hover:text-fg"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-body text-fg-muted">Sem etiquetas</span>
      )}

      {podeAdicionar && !cheio && (
        <div>
          <input
            type="text"
            value={texto}
            maxLength={MAX_LABEL_NAME_LENGTH}
            aria-label="Adicionar etiqueta"
            aria-describedby={dicaId}
            placeholder="Adicionar etiqueta"
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key !== 'Enter' || busca.length === 0) return
              evento.preventDefault()
              if (igual) escolher(igual.PublicId)
              else criar()
            }}
            className="h-8 w-full rounded-lg border border-border bg-surface-raised px-2.5 text-detail text-fg placeholder:text-fg-placeholder"
          />
          <p id={dicaId} className="sr-only">
            Enter põe no card a etiqueta com o nome escrito, e a cria se ela não existe.
          </p>

          {busca.length > 0 && (sugestoes.length > 0 || podeCriar) && (
            <ul aria-label="Etiquetas para escolher" className="mt-1.5 flex flex-wrap gap-1.5">
              {sugestoes.map((etiqueta) => (
                <li key={etiqueta.PublicId}>
                  <button
                    type="button"
                    onClick={() => escolher(etiqueta.PublicId)}
                    className="rounded-full"
                  >
                    <CardChip color={etiqueta.Color}>{etiqueta.Name}</CardChip>
                  </button>
                </li>
              ))}
              {podeCriar && (
                <li>
                  <button
                    type="button"
                    onClick={criar}
                    className="rounded-full border border-border border-dashed px-2 py-px text-caption text-fg hover:bg-surface-sunken"
                  >
                    Criar “{busca}”
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {!arquivado && cheio && (
        <p className="text-caption text-fg-muted">
          Um card leva até {MAX_LABELS_PER_CARD} etiquetas.
        </p>
      )}
    </div>
  )
}

/** O intervalo que a API aceita: fora dele e engano de digitacao, e nao prazo. */
function prazoValido(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false
  const ano = Number(data.slice(0, 4))
  return ano >= 2000 && ano <= 2100
}

/**
 * O prazo: so a data. O campo de data do navegador ja fala o idioma de quem usa, e
 * o valor que ele devolve e o `aaaa-mm-dd` que a API guarda — sem fuso no meio.
 *
 * **Digitar e rascunho; sair do campo ou Enter grava.** Digitando, o navegador
 * devolve uma data inteira a cada tecla — o ano 2026 passa por 0002, 0020 e 0202 —, e
 * gravar a cada uma gravaria datas que ninguem escolheu. Escolher no calendario, sem
 * tecla nenhuma, grava na hora. A data pela metade, ou fora de 2000 a 2100, nao vira
 * pedido: o campo volta ao prazo que vale.
 */
function Prazo({
  valor,
  aoMudar,
}: {
  valor: string | null
  aoMudar: (data: string | null) => void
}) {
  const [rascunho, setRascunho] = useState(valor ?? '')
  const digitando = useRef(false)

  // O prazo que chega de fora — a resposta, ou outra mudanca — vale sobre o rascunho.
  useEffect(() => {
    setRascunho(valor ?? '')
  }, [valor])

  function confirmar(campo: HTMLInputElement) {
    digitando.current = false
    const data = campo.value

    if (data === (valor ?? '')) return

    if (!prazoValido(data)) {
      if (data !== '') toast.error('Escolha um prazo entre os anos 2000 e 2100.')
      // Volta ao que vale. O campo e reposto a mao tambem: o navegador que nao avisa a
      // data pela metade nem mudou o rascunho, e o React nao teria o que repor.
      setRascunho(valor ?? '')
      campo.value = valor ?? ''
      return
    }

    aoMudar(data)
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        aria-label="Prazo"
        value={rascunho}
        min="2000-01-01"
        max="2100-12-31"
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') {
            evento.preventDefault()
            confirmar(evento.currentTarget)
          } else if (evento.key !== 'Tab') {
            digitando.current = true
          }
        }}
        onChange={(evento) => {
          setRascunho(evento.target.value)
          if (!digitando.current) confirmar(evento.currentTarget)
        }}
        onBlur={(evento) => confirmar(evento.currentTarget)}
        className="h-8 rounded-lg border border-border bg-surface-raised px-2.5 text-detail text-fg"
      />
      {valor && (
        <button
          type="button"
          onClick={() => aoMudar(null)}
          className="whitespace-nowrap text-caption text-fg-muted underline-offset-2 hover:text-fg hover:underline"
        >
          Tirar prazo
        </button>
      )}
    </div>
  )
}
