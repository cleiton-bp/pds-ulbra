import * as Menu from '@radix-ui/react-dropdown-menu'
import { type ReactNode, useCallback, useRef, useState } from 'react'
import {
  projectLabelService,
  projectPriorityService,
  projectTeamService,
  type ReportFilters,
  type ReportFilterType,
} from '@/data'
import { cn } from '@/shared/lib/cn'

/** Os tipos como o time os chama, e o card do time. */
const TIPOS: { value: ReportFilterType; label: string }[] = [
  { value: 'bug', label: 'Defeito' },
  { value: 'improvement', label: 'Melhoria' },
  { value: 'question', label: 'Dúvida' },
  { value: 'team', label: 'Card do time' },
]

interface Opcao {
  value: string
  label: string
}

/**
 * As opcoes de um menu, lidas **quando ele abre** — e de novo a cada vez: a tela de
 * Trabalho abre sem pagar tres leituras que talvez ninguem use, e a etiqueta criada
 * por outra pessoa aparece na proxima abertura.
 */
function useOpcoesAoAbrir(ler: () => Promise<Opcao[]>) {
  const [opcoes, setOpcoes] = useState<Opcao[] | 'falhou' | null>(null)
  const vez = useRef(0)
  const carregar = useCallback(() => {
    const minha = ++vez.current
    ler()
      .then((lista) => minha === vez.current && setOpcoes(lista))
      .catch(
        () =>
          minha === vez.current && setOpcoes((antes) => (Array.isArray(antes) ? antes : 'falhou')),
      )
  }, [ler])
  return [opcoes, carregar] as const
}

/**
 * Os filtros da tela de Trabalho: a busca, os dois atalhos ("Meus cards" e
 * "Vencidos") e os menus de marcar — responsavel, etiqueta, prioridade e tipo.
 * Valem para a lista e para o quadro. **Dentro de um menu, ou; entre filtros, e.**
 *
 * O filtro ligado aparece no proprio controle (o atalho pressionado, o menu com a
 * contagem) e no "Limpar filtros": filtro esquecido nao some da vista.
 */
export function WorkFilterBar({
  projectPublicId,
  filters,
  active,
  onChange,
  onClear,
}: {
  projectPublicId: string
  filters: ReportFilters
  /** Quantos filtros estao ligados. */
  active: number
  onChange: (next: ReportFilters) => void
  onClear: () => void
}) {
  const alternar = <K extends 'assignees' | 'labels' | 'priorities' | 'types'>(
    campo: K,
    valor: ReportFilters[K][number],
  ) => {
    const atuais = filters[campo] as string[]
    const proximos = atuais.includes(valor)
      ? atuais.filter((item) => item !== valor)
      : [...atuais, valor]
    onChange({ ...filters, [campo]: proximos })
  }

  const [pessoas, lerPessoas] = useOpcoesAoAbrir(
    useCallback(
      async () =>
        (await projectTeamService.listMembers(projectPublicId)).map((pessoa) => ({
          // Quem olha entra como "me": e o mesmo filtro do atalho "Meus cards".
          value: pessoa.IsYou ? 'me' : pessoa.UserPublicId,
          label: `${pessoa.Name ?? pessoa.Email ?? 'Sem nome'}${pessoa.IsYou ? ' (você)' : ''}`,
        })),
      [projectPublicId],
    ),
  )
  const [etiquetas, lerEtiquetas] = useOpcoesAoAbrir(
    useCallback(
      async () =>
        (await projectLabelService.listLabels(projectPublicId)).map((etiqueta) => ({
          value: etiqueta.PublicId,
          label: etiqueta.Name,
        })),
      [projectPublicId],
    ),
  )
  const [prioridades, lerPrioridades] = useOpcoesAoAbrir(
    useCallback(
      async () =>
        (await projectPriorityService.listPriorities(projectPublicId))
          // A aposentada so aparece se ja esta escolhida: nao se escolhe o que saiu de uso.
          .filter(
            (prioridade) => prioridade.IsActive || filters.priorities.includes(prioridade.PublicId),
          )
          .map((prioridade) => ({ value: prioridade.PublicId, label: prioridade.Name })),
      [projectPublicId, filters.priorities],
    ),
  )

  return (
    <search className="mb-3 flex flex-wrap items-center gap-2" aria-label="Filtrar cards">
      <label className="relative flex min-w-0 flex-[1_1_14rem] sm:max-w-80">
        <span className="sr-only">Buscar cards</span>
        <svg
          viewBox="0 0 16 16"
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-fg-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m10.5 10.5 3 3" />
        </svg>
        <input
          type="search"
          value={filters.search}
          onChange={(evento) => onChange({ ...filters, search: evento.target.value })}
          placeholder="Buscar: título, texto, #número ou protocolo"
          maxLength={200}
          className="h-8 w-full rounded-lg border border-border bg-surface-raised pr-2.5 pl-8 text-detail text-fg placeholder:text-fg-placeholder"
        />
      </label>

      <Atalho
        pressionado={filters.assignees.includes('me')}
        aoAlternar={() => alternar('assignees', 'me')}
      >
        Meus cards
      </Atalho>
      <Atalho
        pressionado={filters.overdue}
        aoAlternar={() => onChange({ ...filters, overdue: !filters.overdue })}
      >
        Vencidos
      </Atalho>

      <MenuDeMarcar
        rotulo="Responsável"
        escolhidos={filters.assignees}
        fixas={[{ value: 'none', label: 'Sem responsável' }]}
        opcoes={pessoas}
        aoAbrir={lerPessoas}
        aoAlternar={(valor) => alternar('assignees', valor)}
      />
      <MenuDeMarcar
        rotulo="Etiqueta"
        escolhidos={filters.labels}
        opcoes={etiquetas}
        aoAbrir={lerEtiquetas}
        aoAlternar={(valor) => alternar('labels', valor)}
        vazio="O projeto ainda não tem etiquetas."
      />
      <MenuDeMarcar
        rotulo="Prioridade"
        escolhidos={filters.priorities}
        fixas={[{ value: 'none', label: 'Sem prioridade' }]}
        opcoes={prioridades}
        aoAbrir={lerPrioridades}
        aoAlternar={(valor) => alternar('priorities', valor)}
      />
      <MenuDeMarcar
        rotulo="Tipo"
        escolhidos={filters.types}
        opcoes={TIPOS}
        aoAlternar={(valor) => alternar('types', valor as ReportFilterType)}
      />

      {active > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="h-8 rounded-lg px-2 text-detail text-fg-muted underline-offset-2 hover:text-fg hover:underline"
        >
          Limpar filtros
          <span className="sr-only"> ({active === 1 ? '1 ligado' : `${active} ligados`})</span>
        </button>
      )}
    </search>
  )
}

const CONTROLE =
  'flex h-8 flex-none items-center gap-1.5 rounded-lg border px-3 text-detail transition-colors'
const CONTROLE_LIGADO = 'border-accent bg-accent text-accent-fg'
const CONTROLE_DESLIGADO =
  'border-border bg-surface text-fg-muted hover:bg-surface-sunken hover:text-fg'

/** Um atalho de um clique: aparece pressionado enquanto vale. */
function Atalho({
  pressionado,
  aoAlternar,
  children,
}: {
  pressionado: boolean
  aoAlternar: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressionado}
      onClick={aoAlternar}
      className={cn(CONTROLE, pressionado ? CONTROLE_LIGADO : CONTROLE_DESLIGADO)}
    >
      {children}
    </button>
  )
}

/**
 * Um menu de marcar: escolher um nao fecha o menu, para marcar outro em seguida. O
 * gatilho diz quantos estao marcados — e e assim que o filtro ligado fica a vista.
 */
function MenuDeMarcar({
  rotulo,
  escolhidos,
  fixas = [],
  opcoes,
  aoAbrir,
  aoAlternar,
  vazio,
}: {
  rotulo: string
  escolhidos: string[]
  /** As que existem sempre, antes das do projeto: "Sem responsavel", "Sem prioridade". */
  fixas?: Opcao[]
  /** Nulo enquanto le; "falhou" quando a leitura falhou. */
  opcoes: Opcao[] | 'falhou' | null
  aoAbrir?: () => void
  aoAlternar: (valor: string) => void
  vazio?: string
}) {
  const marcados = escolhidos.length

  return (
    <Menu.Root onOpenChange={(aberto) => aberto && aoAbrir?.()}>
      <Menu.Trigger
        className={cn(CONTROLE, marcados > 0 ? CONTROLE_LIGADO : CONTROLE_DESLIGADO)}
        aria-label={
          marcados > 0
            ? `${rotulo}, ${marcados} ${marcados === 1 ? 'escolhido' : 'escolhidos'}`
            : rotulo
        }
      >
        {rotulo}
        {marcados > 0 && <span className="tabular-nums">· {marcados}</span>}
        <svg
          viewBox="0 0 12 12"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden
        >
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="start"
          sideOffset={6}
          className="z-dialog max-h-80 w-60 overflow-y-auto rounded-xl border border-border bg-surface-raised p-1.5"
        >
          {[...fixas, ...(Array.isArray(opcoes) ? opcoes : [])].map((opcao) => (
            <Menu.CheckboxItem
              key={opcao.value}
              checked={escolhidos.includes(opcao.value)}
              onSelect={(evento) => evento.preventDefault()}
              onCheckedChange={() => aoAlternar(opcao.value)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body text-fg outline-none data-[highlighted]:bg-surface-sunken"
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-4 flex-none items-center justify-center rounded border',
                  escolhidos.includes(opcao.value)
                    ? 'border-accent bg-accent text-accent-fg'
                    : 'border-border',
                )}
              >
                <Menu.ItemIndicator>
                  <svg
                    aria-hidden
                    viewBox="0 0 12 12"
                    className="size-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M2.5 6.3 4.8 8.6 9.5 3.9" />
                  </svg>
                </Menu.ItemIndicator>
              </span>
              <span className="min-w-0 truncate">{opcao.label}</span>
            </Menu.CheckboxItem>
          ))}
          {opcoes === null && aoAbrir && (
            <p className="px-2.5 py-2 text-detail text-fg-muted">Carregando…</p>
          )}
          {opcoes === 'falhou' && (
            <p className="px-2.5 py-2 text-detail text-fg-muted">
              Não deu para carregar as opções agora.
            </p>
          )}
          {Array.isArray(opcoes) && opcoes.length === 0 && fixas.length === 0 && vazio && (
            <p className="px-2.5 py-2 text-detail text-fg-muted">{vazio}</p>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
