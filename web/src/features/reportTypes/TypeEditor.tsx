import { type ReactNode, useEffect, useId, useState } from 'react'
import {
  type CardColor,
  MAX_REPORT_ANSWER_LENGTH,
  MAX_REPORT_TEXT_LENGTH,
  MAX_REPORT_TYPE_NAME_LENGTH,
  MAX_REPORT_TYPE_QUESTION_LENGTH,
  MAX_REPORT_TYPE_QUESTIONS,
  MAX_TEXT_BOX_PROMPT_LENGTH,
  type ProjectStateViewModel,
  REPORT_TYPE_ICONS,
  type ReportTypeIcon,
} from '@/contracts'
import {
  checkDraft,
  filledQuestions,
  newQuestion,
  type TypeDraft,
} from '@/features/reportTypes/typeDraft'
import { Button } from '@/shared/components/Button'
import { CARD_COLOR_CLASSES, CardColorPicker } from '@/shared/components/CardChip'
import { REPORT_TYPE_ICON_NAMES, ReportTypeIconSvg } from '@/shared/components/ReportTypeGlyph'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { MoveButton } from '@/shared/components/SortableListItem'
import { TextField } from '@/shared/components/TextField'
import { cn } from '@/shared/lib/cn'

/**
 * O contador da pergunta so aparece perto do limite: embaixo de cada pergunta, sempre,
 * ele dobrava a altura da lista para dizer "12/120" a quem esta longe de qualquer limite.
 */
const PERTO_DO_LIMITE = MAX_REPORT_TYPE_QUESTION_LENGTH - 20

type MudarRascunho = (mudar: (rascunho: TypeDraft) => TypeDraft) => void

/**
 * O editor de um tipo, dentro do item aberto: o mesmo para criar e para editar.
 *
 * **Em blocos, pelo lugar em que cada coisa aparece**: No formulário (nome e desenho),
 * No Trabalho (a cor do card — so la ela aparece), O que pergunta e Onde entra. "Cor" e
 * "Desenho" lado a lado davam a entender que os dois iam para o formulario.
 *
 * **O rascunho e da tela** (`draft` e `onChange`): ela pergunta antes de fechar com
 * mudanca e manda o rascunho a previa.
 */
export function TypeEditor({
  draft,
  onChange,
  isNew,
  colunas,
  colunasFalharam,
  salvando,
  erro,
  nameId,
  onSalvar,
  onCancelar,
}: {
  draft: TypeDraft
  onChange: MudarRascunho
  isNew: boolean
  colunas: ProjectStateViewModel[] | null
  colunasFalharam: boolean
  salvando: boolean
  erro: string | null
  /** O `id` do campo do nome: a tela leva o foco a ele depois de confirmar a troca. */
  nameId?: string
  onSalvar: () => void
  onCancelar: () => void
}) {
  const base = useId()
  const idPergunta = (id: number) => `${base}-pergunta-${id}`
  const idSeta = (id: number, direcao: 'up' | 'down') => `${base}-seta-${direcao}-${id}`
  const idContador = (id: number) => `${base}-contador-${id}`
  const idAdicionar = `${base}-adicionar`

  const mudar = (patch: Partial<TypeDraft>) => onChange((atual) => ({ ...atual, ...patch }))
  const { perguntas } = draft

  /**
   * Para onde o foco vai depois do proximo desenho: o primeiro destes que existir e
   * estiver habilitado. A seta que leva a pergunta ao topo se desabilita, e o foco nela
   * cairia no nada — vai para a outra seta.
   */
  const [foco, setFoco] = useState<string[] | null>(null)
  useEffect(() => {
    if (!foco) return
    for (const id of foco) {
      const alvo = document.getElementById(id)
      if (alvo && !(alvo as HTMLButtonElement).disabled) {
        alvo.focus()
        break
      }
    }
    setFoco(null)
  }, [foco])

  const preenchidas = filledQuestions(draft)
  const { incompleto, aviso } = checkDraft(draft)
  const cheia = perguntas.length >= MAX_REPORT_TYPE_QUESTIONS

  function enviar() {
    if (incompleto || salvando) return
    onSalvar()
  }

  /** Uma pergunta em branco logo depois de `index` (ou no fim), ja com o foco. */
  function adicionarPergunta(depoisDe = perguntas.length - 1) {
    if (cheia) return
    const nova = newQuestion()
    onChange((atual) => {
      const lista = [...atual.perguntas]
      lista.splice(depoisDe + 1, 0, nova)
      return { ...atual, perguntas: lista }
    })
    setFoco([idPergunta(nova.id)])
  }

  /**
   * **Enter numa pergunta escreve a proxima**, como numa lista, e nao salva o tipo: quem
   * acabou uma pergunta quer a seguinte, e o Enter que salvava fechava o tipo pela metade.
   * Em branco, ou com as quatro escritas, ele so anda para a de baixo.
   */
  function enterNaPergunta(index: number) {
    const atual = perguntas[index]
    if (!atual) return
    if (!cheia && atual.texto.trim().length > 0) {
      adicionarPergunta(index)
      return
    }
    const seguinte = perguntas[index + 1]
    if (seguinte) setFoco([idPergunta(seguinte.id)])
  }

  function tirarPergunta(index: number) {
    const seguinte = perguntas[index + 1] ?? perguntas[index - 1]
    onChange((atual) => ({
      ...atual,
      perguntas: atual.perguntas.filter((_, posicao) => posicao !== index),
    }))
    // O foco vai para a pergunta vizinha; sem nenhuma, para o "Adicionar pergunta".
    setFoco(seguinte ? [idPergunta(seguinte.id)] : [idAdicionar])
  }

  function moverPergunta(index: number, delta: number) {
    const alvo = index + delta
    const item = perguntas[index]
    if (!item || alvo < 0 || alvo >= perguntas.length) return

    onChange((atual) => {
      const nova = [...atual.perguntas]
      const [movida] = nova.splice(index, 1)
      if (movida) nova.splice(alvo, 0, movida)
      return { ...atual, perguntas: nova }
    })
    const direcao = delta < 0 ? 'up' : 'down'
    const outra = delta < 0 ? 'down' : 'up'
    setFoco([idSeta(item.id, direcao), idSeta(item.id, outra), idPergunta(item.id)])
  }

  // O destino de quem nao escolhe: a primeira coluna **ativa**, a mesma conta que a API
  // faz. O rotulo diz o nome dela hoje, porque "a primeira" muda quando alguem reordena.
  const primeira = colunas?.find((item) => item.IsActive) ?? null

  return (
    <div className="flex flex-col gap-3">
      <Bloco titulo="No formulário" dica="O botão do tipo, como quem relata vê.">
        <div className="flex flex-col gap-4">
          <TextField
            id={nameId}
            label="Nome"
            value={draft.nome}
            onChange={(nome) => mudar({ nome })}
            placeholder="Elogio"
            hint="Também é o nome do tipo no card."
            maxLength={MAX_REPORT_TYPE_NAME_LENGTH}
            disabled={salvando}
            // So o tipo novo pega o foco: quem abre um tipo salvo continua no item que abriu.
            autoFocus={isNew}
            onSubmit={enviar}
          />
          <IconPicker
            value={draft.desenho}
            color={draft.cor}
            onChange={(desenho) => mudar({ desenho })}
            disabled={salvando}
          />
        </div>
      </Bloco>

      <Bloco
        titulo="No Trabalho"
        dica="A cor só aparece no Trabalho, para separar os cards: o formulário não a usa."
      >
        <CardColorPicker
          label="Cor do card"
          value={draft.cor}
          onChange={(cor: CardColor) => mudar({ cor })}
          disabled={salvando}
        />
      </Bloco>

      <Bloco
        titulo="O que pergunta"
        dica="Cada pergunta vira um campo curto, e quem relata responde as que quiser."
      >
        <fieldset disabled={salvando} className="flex flex-col gap-2">
          <legend className="sr-only">Perguntas curtas</legend>

          {perguntas.length > 0 && (
            <ol className="flex flex-col gap-2">
              {perguntas.map((pergunta, index) => {
                const perto = pergunta.texto.length >= PERTO_DO_LIMITE
                return (
                  <li key={pergunta.id} className="flex items-center gap-1.5">
                    <div className="flex flex-none flex-col">
                      <MoveButton
                        id={idSeta(pergunta.id, 'up')}
                        direction="up"
                        label={`Subir a pergunta ${index + 1}`}
                        disabled={index === 0}
                        onClick={() => moverPergunta(index, -1)}
                      />
                      <MoveButton
                        id={idSeta(pergunta.id, 'down')}
                        direction="down"
                        label={`Descer a pergunta ${index + 1}`}
                        disabled={index === perguntas.length - 1}
                        onClick={() => moverPergunta(index, 1)}
                      />
                    </div>

                    {/* O contador mora dentro do campo, a direita: aparecer perto do limite
                        nao muda a altura da lista. */}
                    <div className="relative min-w-0 flex-1">
                      <input
                        id={idPergunta(pergunta.id)}
                        type="text"
                        value={pergunta.texto}
                        onChange={(event) => {
                          const texto = event.target.value
                          onChange((atual) => ({
                            ...atual,
                            perguntas: atual.perguntas.map((item) =>
                              item.id === pergunta.id ? { ...item, texto } : item,
                            ),
                          }))
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return
                          event.preventDefault()
                          enterNaPergunta(index)
                        }}
                        aria-label={`Pergunta ${index + 1}`}
                        aria-describedby={perto ? idContador(pergunta.id) : undefined}
                        placeholder={index === 0 ? 'O que você tentou fazer?' : 'O que aconteceu?'}
                        maxLength={MAX_REPORT_TYPE_QUESTION_LENGTH}
                        className={cn(
                          'h-9 w-full rounded-lg border border-border bg-surface-raised px-3 text-body text-fg placeholder:text-fg-placeholder disabled:opacity-60',
                          perto && 'pr-18',
                        )}
                      />
                      {perto && (
                        <span
                          id={idContador(pergunta.id)}
                          className="-translate-y-1/2 pointer-events-none absolute top-1/2 right-3 text-caption text-fg-muted tabular-nums"
                        >
                          {pergunta.texto.length}/{MAX_REPORT_TYPE_QUESTION_LENGTH}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      aria-label={`Tirar a pergunta ${index + 1}`}
                      title="Tirar a pergunta"
                      onClick={() => tirarPergunta(index)}
                      className="flex size-8 flex-none items-center justify-center rounded-lg text-fg-muted enabled:hover:bg-surface-sunken enabled:hover:text-fg disabled:opacity-30"
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
                        <path d="m3 3 6 6M9 3 3 9" />
                      </svg>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button id={idAdicionar} size="sm" disabled={cheia} onClick={() => adicionarPergunta()}>
              Adicionar pergunta
            </Button>
            <span className="text-caption text-fg-muted tabular-nums">
              {cheia
                ? `${MAX_REPORT_TYPE_QUESTIONS} de ${MAX_REPORT_TYPE_QUESTIONS}: mais do que isso vira questionário.`
                : `${perguntas.length} de ${MAX_REPORT_TYPE_QUESTIONS}`}
            </span>
          </div>
        </fieldset>

        <div className="mt-4 flex flex-col gap-2 border-border border-t pt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.caixa}
              disabled={salvando}
              onChange={(event) => mudar({ caixa: event.target.checked })}
              className="size-3.5 flex-none accent-accent"
            />
            <span className="text-body text-fg">Mostrar a caixa de texto livre</span>
          </label>
          <p className="text-caption text-fg-muted leading-relaxed">
            {preenchidas.length > 0
              ? `Depois das perguntas, para o que não coube nelas — até ${MAX_REPORT_ANSWER_LENGTH} caracteres.`
              : `Sem perguntas, a caixa é o relato inteiro — até ${MAX_REPORT_TEXT_LENGTH} caracteres.`}
          </p>

          {draft.caixa && (
            <TextField
              label="Texto dentro da caixa"
              value={draft.textoDaCaixa}
              onChange={(textoDaCaixa) => mudar({ textoDaCaixa })}
              placeholder="Conte o que aconteceu, e onde."
              hint="Obrigatório com a caixa ligada: é o texto cinza que faz a pergunta certa."
              maxLength={MAX_TEXT_BOX_PROMPT_LENGTH}
              disabled={salvando}
              onSubmit={enviar}
            />
          )}
        </div>
      </Bloco>

      <Bloco titulo="Onde entra" dica="A coluna do Trabalho em que o relato deste tipo cai.">
        {colunas ? (
          <Select
            label="Coluna em que entra"
            value={draft.coluna ?? ''}
            disabled={salvando}
            onChange={(valor) => mudar({ coluna: valor || null })}
            hint="Vale para o próximo relato: os que já entraram ficam onde estão."
            options={[
              // O padrao e uma opcao de verdade: escolhe-la grava nulo, e o relato segue
              // a primeira coluna ativa mesmo depois de alguem reordenar o quadro.
              {
                value: '',
                label: primeira
                  ? `A primeira coluna (hoje: ${primeira.Name})`
                  : 'A primeira coluna',
              },
              // Coluna desativada nao e destino; a ja escolhida fica, para a tela nao
              // mostrar em branco.
              ...colunas
                .filter((item) => item.IsActive || item.PublicId === draft.coluna)
                .map((item) => ({
                  value: item.PublicId,
                  label: item.IsActive ? item.Name : `${item.Name} (desativada)`,
                })),
            ]}
          />
        ) : colunasFalharam ? (
          <p className="text-detail text-fg-muted leading-relaxed">
            Não deu para carregar as colunas agora: a coluna em que este tipo entra fica como está.
          </p>
        ) : (
          <Skeleton className="h-9 w-full" />
        )}
      </Bloco>

      {aviso && <p className="text-detail text-warn-fg leading-relaxed">{aviso}</p>}

      {erro && (
        <p role="alert" className="text-detail text-error-fg leading-relaxed">
          {erro}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="primary" disabled={incompleto || salvando} onClick={enviar}>
          {salvando ? 'Salvando…' : isNew ? 'Criar tipo' : 'Salvar'}
        </Button>
        <Button variant="ghost" disabled={salvando} onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

/**
 * Um bloco do editor: o nome do lugar e uma linha do que ele muda. Titulo de verdade
 * (`h3`), para quem navega pelos titulos pular de bloco em bloco.
 */
function Bloco({ titulo, dica, children }: { titulo: string; dica: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-lg border border-border bg-surface p-4">
      <h3 id={id} className="font-semibold text-body text-fg">
        {titulo}
      </h3>
      <p className="mb-3 text-caption text-fg-muted leading-relaxed">{dica}</p>
      {children}
    </section>
  )
}

/**
 * Escolher o desenho: um botao por desenho, **todos ja na cor do tipo** — a pessoa ve
 * como cada um fica antes de escolher. O escolhido leva o anel, que diz qual e para quem
 * nao distingue a cor, e o nome vai para o leitor de tela.
 */
export function IconPicker({
  value,
  color,
  onChange,
  disabled,
}: {
  value: ReportTypeIcon
  color: CardColor
  onChange: (icon: ReportTypeIcon) => void
  disabled?: boolean
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-1.5 text-detail text-fg-muted">Desenho</legend>
      <div className="flex flex-wrap gap-1.5">
        {REPORT_TYPE_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            aria-pressed={value === icon}
            aria-label={REPORT_TYPE_ICON_NAMES[icon]}
            title={REPORT_TYPE_ICON_NAMES[icon]}
            onClick={() => onChange(icon)}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg border disabled:opacity-60',
              CARD_COLOR_CLASSES[color],
              value === icon && 'ring-2 ring-accent',
            )}
          >
            <ReportTypeIconSvg icon={icon} className="size-3.5" />
          </button>
        ))}
      </div>
    </fieldset>
  )
}
