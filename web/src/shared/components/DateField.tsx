import * as Popover from '@radix-ui/react-popover'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { BottomSheet } from '@/shared/components/BottomSheet'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'

/**
 * **O campo de data do painel**, no lugar do `<input type="date">`: o calendario do
 * navegador vinha no desenho de cada sistema (e no escuro, cinza sobre cinza), e nao no
 * do projeto.
 *
 * O campo mostra a data curta (23/10/2026, que cabe na coluna estreita do card) e abre
 * o calendario: preso ao campo no computador e no tablet, e na folha que sobe de baixo no
 * celular, com os dias do tamanho do dedo. Funciona dentro de dialogos (o card, a sprint):
 * o Popover e a folha sao camadas do Radix, e o dialogo de baixo nao os trata como fora.
 *
 * O valor e o dia em `aaaa-mm-dd`, ou nulo. O `value` do botao repete o dia, para quem
 * le o campo de fora (os testes, por exemplo).
 */
export function DateField({
  value,
  onChange,
  rotulo,
  id,
  min,
  max,
  size = 'md',
  clearable = false,
  invalid = false,
  describedBy,
  disabled = false,
  placeholder = 'Escolher data',
  className,
}: {
  value: string | null
  onChange: (dia: string | null) => void
  /**
   * O nome do campo. Com `id`, o `<label htmlFor>` de quem usa ja nomeia o botao; sem ele,
   * vira o `aria-label`. E tambem o titulo da folha no celular.
   */
  rotulo: string
  id?: string
  min?: string
  max?: string
  size?: 'md' | 'sm'
  /** "Limpar" no pe do calendario, que manda nulo. */
  clearable?: boolean
  invalid?: boolean
  describedBy?: string
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const celular = useMediaQuery('(max-width: 39.99rem)')
  const valorId = useId()

  const escolher = (dia: string | null) => {
    setAberto(false)
    if (dia !== value) onChange(dia)
  }

  const calendario = (
    <Calendario
      valor={value}
      min={min}
      max={max}
      grande={celular}
      aoEscolher={escolher}
      aoLimpar={clearable && value ? () => escolher(null) : undefined}
    />
  )

  const gatilho = (
    <button
      type="button"
      id={id}
      value={value ?? ''}
      disabled={disabled}
      aria-label={id ? undefined : rotulo}
      aria-describedby={[valorId, describedBy].filter(Boolean).join(' ')}
      aria-invalid={invalid || undefined}
      aria-haspopup="dialog"
      aria-expanded={aberto}
      onClick={celular ? () => setAberto(true) : undefined}
      className={cn(
        'alvo-de-toque relative flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-surface-raised text-left transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        size === 'md' ? 'h-9 px-3 text-body' : 'h-8 px-2.5 text-detail',
        invalid ? 'border-error-border' : 'border-border-control',
        aberto && 'border-fg-muted',
        className,
      )}
    >
      {/* Curta no campo (23/10/2026), que cabe na coluna estreita dos detalhes do card; por
          extenso para o leitor de tela, que leria os numeros um a um. */}
      <span
        id={valorId}
        className={cn('min-w-0 truncate', value ? 'text-fg' : 'text-fg-placeholder')}
      >
        {value ? (
          <>
            <span aria-hidden className="tabular-nums">
              {curta(value)}
            </span>
            <span className="sr-only">{nomeDoDia.format(deDia(value))}</span>
          </>
        ) : (
          placeholder
        )}
      </span>
      <IconeDoCalendario />
    </button>
  )

  if (celular) {
    return (
      <>
        {gatilho}
        <BottomSheet open={aberto} onOpenChange={setAberto} title={rotulo}>
          {calendario}
        </BottomSheet>
      </>
    )
  }

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger asChild>{gatilho}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          aria-label={rotulo}
          // O foco vai para o dia (ver `Calendario`), e nao para o primeiro botao.
          onOpenAutoFocus={(evento) => evento.preventDefault()}
          className={cn(
            'z-dialog w-[18rem] rounded-xl border border-border bg-surface-raised p-3',
            'origin-(--radix-popover-content-transform-origin) data-[state=closed]:animate-menu-out data-[state=open]:animate-menu-in',
            'shadow-lg dark:bg-surface-strong dark:shadow-none',
          )}
        >
          {calendario}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function IconeDoCalendario() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-3.5 flex-none text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  )
}

const DIAS_DA_SEMANA = [
  ['D', 'domingo'],
  ['S', 'segunda-feira'],
  ['T', 'terça-feira'],
  ['Q', 'quarta-feira'],
  ['Q', 'quinta-feira'],
  ['S', 'sexta-feira'],
  ['S', 'sábado'],
] as const

const nomeDoMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const nomeDoDia = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `aaaa-mm-dd` como `dd/mm/aaaa`. */
function curta(dia: string): string {
  const [ano, mes, numero] = dia.split('-')
  return `${numero}/${mes}/${ano}`
}

/** O dia como `aaaa-mm-dd`, montado pelas partes locais: sem fuso, o dia nao escorrega. */
function paraDia(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

function deDia(dia: string): Date {
  const [ano, mes, numero] = dia.split('-').map(Number)
  return new Date(ano ?? 2000, (mes ?? 1) - 1, numero ?? 1)
}

function somarDias(dia: string, dias: number): string {
  const data = deDia(dia)
  data.setDate(data.getDate() + dias)
  return paraDia(data)
}

/** O mesmo dia no outro mes; no mes mais curto, o ultimo dia dele (31 de jan. vira 28 de fev.). */
function somarMeses(dia: string, meses: number): string {
  const data = deDia(dia)
  const alvo = new Date(data.getFullYear(), data.getMonth() + meses, 1)
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate()
  alvo.setDate(Math.min(data.getDate(), ultimo))
  return paraDia(alvo)
}

const mesDe = (dia: string) => dia.slice(0, 7)

/**
 * O calendario de um mes, semana comecando no domingo, como no Brasil. Os dias de fora do
 * mes completam as seis semanas, apagados, e continuam escolhiveis. **Teclado**: as setas
 * andam um dia ou uma semana, Page Up e Page Down um mes (com Shift, um ano), Home e End
 * o comeco e o fim da semana, Enter escolhe; o foco anda junto e o mes acompanha.
 */
function Calendario({
  valor,
  min,
  max,
  grande,
  aoEscolher,
  aoLimpar,
}: {
  valor: string | null
  min?: string
  max?: string
  /** Na folha do celular: os dias do tamanho do dedo. */
  grande: boolean
  aoEscolher: (dia: string) => void
  aoLimpar?: () => void
}) {
  const hoje = paraDia(new Date())
  const limitar = (dia: string) => (min && dia < min ? min : max && dia > max ? max : dia)
  const [foco, setFoco] = useState(() => limitar(valor ?? hoje))
  const [mes, setMes] = useState(() => mesDe(foco))
  const grade = useRef<HTMLFieldSetElement>(null)
  const primeiraVez = useRef(true)

  // O foco do teclado vai para o dia em foco: ao abrir (o escolhido, ou hoje) e a cada
  // seta. No primeiro desenho espera um quadro, para a folha ou o Popover ja estarem de pe.
  useEffect(() => {
    const focar = () =>
      grade.current?.querySelector<HTMLButtonElement>(`[data-dia="${foco}"]`)?.focus()
    if (primeiraVez.current) {
      primeiraVez.current = false
      const quadro = requestAnimationFrame(focar)
      return () => cancelAnimationFrame(quadro)
    }
    if (grade.current?.contains(document.activeElement)) focar()
  }, [foco])

  const irPara = (dia: string) => {
    const destino = limitar(dia)
    setFoco(destino)
    setMes(mesDe(destino))
  }

  const aoTeclar = (evento: KeyboardEvent<HTMLFieldSetElement>) => {
    const passos: Record<string, () => string> = {
      ArrowLeft: () => somarDias(foco, -1),
      ArrowRight: () => somarDias(foco, 1),
      ArrowUp: () => somarDias(foco, -7),
      ArrowDown: () => somarDias(foco, 7),
      Home: () => somarDias(foco, -deDia(foco).getDay()),
      End: () => somarDias(foco, 6 - deDia(foco).getDay()),
      PageUp: () => somarMeses(foco, evento.shiftKey ? -12 : -1),
      PageDown: () => somarMeses(foco, evento.shiftKey ? 12 : 1),
    }
    const passo = passos[evento.key]
    if (!passo) return
    evento.preventDefault()
    irPara(passo())
  }

  const primeiro = deDia(`${mes}-01`)
  const inicio = somarDias(`${mes}-01`, -primeiro.getDay())
  const dias = Array.from({ length: 42 }, (_, indice) => somarDias(inicio, indice))
  const titulo = nomeDoMes.format(primeiro)
  const mesAnterior = somarMeses(`${mes}-01`, -1)
  const proximoMes = somarMeses(`${mes}-01`, 1)
  const semAnterior = !!min && mesDe(mesAnterior) < mesDe(min)
  const semProximo = !!max && mesDe(proximoMes) > mesDe(max)
  const hojeFora = (!!min && hoje < min) || (!!max && hoje > max)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span aria-live="polite" className="pl-1 font-medium text-body text-fg">
          {titulo.charAt(0).toUpperCase() + titulo.slice(1)}
        </span>
        <span className="flex items-center gap-1">
          <BotaoDoMes
            rotulo="Mês anterior"
            disabled={semAnterior}
            onClick={() => irPara(somarMeses(foco, -1))}
            caminho="M7.5 2.5 4 6l3.5 3.5"
          />
          <BotaoDoMes
            rotulo="Próximo mês"
            disabled={semProximo}
            onClick={() => irPara(somarMeses(foco, 1))}
            caminho="M4.5 2.5 8 6 4.5 9.5"
          />
        </span>
      </div>

      <div className="grid grid-cols-7" aria-hidden>
        {DIAS_DA_SEMANA.map(([letra, nome]) => (
          <span
            key={nome}
            title={nome}
            className="flex h-7 items-center justify-center text-caption text-fg-muted"
          >
            {letra}
          </span>
        ))}
      </div>

      {/* A chave e o mes: o mes novo entra esmaecendo, e a troca se ve. */}
      <fieldset
        key={mes}
        ref={grade}
        onKeyDown={aoTeclar}
        className="grid animate-fade-in grid-cols-7 gap-0.5"
      >
        <legend className="sr-only">{titulo}</legend>
        {dias.map((dia) => {
          const escolhido = dia === valor
          const doMes = mesDe(dia) === mes
          const fora = (!!min && dia < min) || (!!max && dia > max)
          return (
            <button
              key={dia}
              type="button"
              data-dia={dia}
              tabIndex={dia === foco ? 0 : -1}
              disabled={fora}
              aria-label={nomeDoDia.format(deDia(dia))}
              aria-pressed={escolhido}
              aria-current={dia === hoje ? 'date' : undefined}
              onClick={() => aoEscolher(dia)}
              onFocus={() => setFoco(dia)}
              className={cn(
                'flex w-full items-center justify-center rounded-lg text-detail tabular-nums transition-colors duration-150',
                grande ? 'h-11' : 'h-9',
                escolhido
                  ? 'bg-accent font-medium text-accent-fg'
                  : cn(
                      'enabled:hover:bg-surface-sunken',
                      doMes ? 'text-fg' : 'text-fg-muted/60',
                      dia === hoje && 'font-semibold ring-1 ring-fg-muted/50 ring-inset',
                    ),
                'disabled:cursor-not-allowed disabled:opacity-30',
              )}
            >
              {deDia(dia).getDate()}
            </button>
          )
        })}
      </fieldset>

      <div className="mt-2 flex items-center justify-between border-border border-t pt-2">
        {aoLimpar ? (
          <button
            type="button"
            onClick={aoLimpar}
            className="alvo-de-toque relative h-8 rounded-lg px-2 text-detail text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
          >
            Limpar
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          disabled={hojeFora}
          onClick={() => aoEscolher(hoje)}
          className="alvo-de-toque relative h-8 rounded-lg px-2 font-medium text-detail text-fg transition-colors hover:bg-surface-sunken disabled:opacity-40"
        >
          Hoje
        </button>
      </div>
    </div>
  )
}

function BotaoDoMes({
  rotulo,
  disabled,
  onClick,
  caminho,
}: {
  rotulo: string
  disabled: boolean
  onClick: () => void
  caminho: string
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={disabled}
      onClick={onClick}
      className="alvo-de-toque-icone relative flex size-8 items-center justify-center rounded-lg text-fg-muted transition-colors enabled:hover:bg-surface-sunken enabled:hover:text-fg disabled:opacity-30"
    >
      <svg
        viewBox="0 0 12 12"
        aria-hidden
        className="size-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={caminho} />
      </svg>
    </button>
  )
}
