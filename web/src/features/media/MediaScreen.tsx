import { useCallback, useEffect, useState } from 'react'
import type { MediaKind, MediaKindLimitViewModel, MediaSettingsViewModel } from '@/contracts'
import { describeError, projectMediaSettingsService } from '@/data'
import {
  bytesFromMegabytes,
  type LimitRange,
  limitHint,
  MB_DECIMALS,
  megabytesFromBytes,
  parseLimit,
} from '@/features/media/mediaLimits'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'

/** Os tetos do sistema, iguais aos de `ProjectMediaSettings` e `ProjectMediaKind` em C#. */
const TETO_ARQUIVOS = 10
const TETO_QUANTIDADE = 10
const TETO_DURACAO_SEGUNDOS = 300
const TETO_MB: Record<MediaKind, number> = { Image: 10, Video: 50 }

/** O que cada tipo é, para quem configura — e não o nome do enum. */
const TIPOS: Record<MediaKind, { titulo: string; resumo: string; custo: string }> = {
  Image: {
    titulo: 'Imagem',
    resumo: 'Print, foto da tela, recorte de captura.',
    custo: 'Barata de guardar. Print de celular moderno passa de 3 MB.',
  },
  Video: {
    titulo: 'Vídeo de tela',
    resumo: 'Gravação curta do que aconteceu até o erro.',
    custo:
      'É o caro, nos dois sentidos: pesa muito mais, e mostra muito mais do que um print — notificação chegando, aba aberta ao lado, nome de arquivo.',
  },
}

/**
 * O `id` de cada campo numérico, que também é a chave dele em `invalidFields`.
 *
 * Mora num lugar só porque a tela precisa achar de volta, pela chave, qual limite
 * do rascunho aquele campo escreve.
 */
const fieldId = {
  total: 'max-arquivos',
  count: (kind: MediaKind) => `quantidade-${kind}`,
  size: (kind: MediaKind) => `tamanho-${kind}`,
  duration: (kind: MediaKind) => `duracao-${kind}`,
}

/**
 * O que este projeto aceita receber junto do relato.
 *
 * **Esta tela vem antes da ferramenta saber anexar, e não depois.** É ela que diz
 * o que existe: desligado o anexo, a ferramenta não mostra nada de mídia e o
 * servidor recusa assinar qualquer envio.
 *
 * **Os limites aparecem por tipo, porque é assim que eles são guardados** — uma
 * linha por tipo, e não uma coluna por tipo. É o desenho que faz acrescentar áudio
 * um dia ser dado, e não migração. Quando um tipo novo entrar, ele aparece aqui
 * sozinho, com o padrão de fábrica.
 *
 * **Cada número desta tela é uma conta que alguém paga.** É a primeira parte do
 * produto que custa dinheiro por byte guardado, e é por isso que o custo de cada
 * escolha está escrito junto dela, e não num aviso depois.
 *
 * **Sem armazenamento configurado, a tela só mostra, e diz por quê.** A API
 * responde o anexo desligado, porque a ferramenta não o oferece, e recusa salvar:
 * gravar esse desligado apagaria a escolha do projeto, que precisa passar a valer
 * quando houver armazenamento.
 */
export function MediaScreen() {
  const project = useCurrentProject()

  const {
    data: saved,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(
      () => projectMediaSettingsService.getMediaSettings(project.PublicId),
      [project.PublicId],
    ),
  )

  const [draft, setDraft] = useState<MediaSettingsViewModel | null>(null)
  const [published, setPublished] = useState<MediaSettingsViewModel | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * Os campos numéricos com texto que não serve.
   *
   * O rascunho fica com o último número válido, e é por isso que precisa desta
   * lista: sem ela, o Salvar mandaria um número diferente do que está escrito.
   */
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(() => new Set())

  const trackField = useCallback((field: string, valid: boolean) => {
    setInvalidFields((current) => {
      if (current.has(field) !== valid) return current

      const next = new Set(current)
      if (valid) next.delete(field)
      else next.add(field)
      return next
    })
  }, [])

  useEffect(() => {
    setPublished(saved)
    setDraft(saved)
  }, [saved])

  const dirty = draft !== null && published !== null && !igual(draft, published)

  /**
   * Ligado e sem nenhum tipo aceito não aceita nada.
   *
   * A tela **não** liga um tipo sozinha: quem quer isso já tem o caminho certo,
   * que é desligar o anexo — e escolher por quem configura qual tipo passa a ser
   * aceito seria decidir uma conta no lugar dele.
   */
  const semTipo = draft?.IsEnabled === true && draft.Kinds.every((tipo) => !tipo.IsEnabled)

  const noStorage = draft !== null && !draft.IsStorageAvailable
  const invalidCount = invalidFields.size

  const impedido = semTipo || noStorage || invalidCount > 0

  function toggleAttachments(enabled: boolean) {
    if (!draft) return

    const next = { ...draft, IsEnabled: enabled }

    // Desligado, os campos saem de alcance. O que tinha texto que não serve volta
    // ao valor salvo, e não ao último número válido do rascunho: esse pode ser só
    // uma tecla no caminho, como o "1" de quem apagou o "3" para digitar "12".
    setDraft(enabled || !published ? next : restoreInvalid(next, published, invalidFields))
  }

  function trocarTipo(kind: MediaKind, mudanca: Partial<MediaKindLimitViewModel>) {
    if (!draft) return

    setDraft({
      ...draft,
      Kinds: draft.Kinds.map((atual) => (atual.Kind === kind ? { ...atual, ...mudanca } : atual)),
    })
  }

  async function salvar() {
    if (!draft || saving || impedido) return

    setSaving(true)

    try {
      const gravado = await projectMediaSettingsService.saveMediaSettings(project.PublicId, {
        IsEnabled: draft.IsEnabled,
        AllowsScreenCapture: draft.AllowsScreenCapture,
        AllowsOnInfoRequest: draft.AllowsOnInfoRequest,
        MaxFilesPerReport: draft.MaxFilesPerReport,
        Kinds: draft.Kinds,
      })
      setPublished(gravado)
      setDraft(gravado)
      toast.done('Configuração de mídia salva.')
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Mídia</h1>
      <p className="mb-6 text-body text-fg-muted leading-relaxed">
        O que a pessoa pode mandar junto do relato, e até onde. O texto continua sendo obrigatório:
        um print sozinho vira “adivinha o que está errado nesta tela”.
      </p>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar a configuração agora. Nada mudou: a falha foi ao consultar, e o
            projeto continua se comportando como estava.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {draft && (
        <section>
          {noStorage && (
            <div className="mb-5 rounded-xl border border-warn-border bg-warn-surface p-4">
              <p className="text-caption text-warn-fg leading-relaxed">
                <strong className="font-medium">
                  Não há armazenamento configurado nesta instalação.
                </strong>{' '}
                Por isso o anexo aparece desligado, não pode ser ligado, e nada aqui pode ser salvo.
                O interruptor está desligado só por isso: a escolha do projeto e os limites abaixo
                passam a valer quando houver armazenamento.
              </p>
            </div>
          )}

          <Interruptor
            marcado={draft.IsEnabled}
            desabilitado={!draft.IsStorageAvailable}
            titulo="Aceitar anexo no relato"
            explicacao="Desligado, a ferramenta não mostra nada de mídia e o servidor recusa qualquer envio — não adianta ter tipo ligado nem limite configurado aqui embaixo."
            aoTrocar={toggleAttachments}
          />

          <fieldset
            className={draft.IsEnabled ? 'mt-6' : 'pointer-events-none mt-6 opacity-50'}
            disabled={!draft.IsEnabled}
          >
            <legend className="mb-2.5 font-medium text-detail text-fg">
              O que este projeto aceita
            </legend>

            <div className="flex flex-col gap-2.5">
              {draft.Kinds.map((limite) => (
                <Tipo
                  key={limite.Kind}
                  limite={limite}
                  disabled={!draft.IsEnabled}
                  aoTrocar={(mudanca) => trocarTipo(limite.Kind, mudanca)}
                  onValidityChange={trackField}
                />
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-border bg-surface p-4">
              {/* Um, e não zero, no mínimo: zero seria desligar o anexo por outro
                  caminho. */}
              <Numero
                id={fieldId.total}
                rotulo="Arquivos por envio, somando os tipos"
                unidade="arquivos"
                valor={draft.MaxFilesPerReport}
                range={{ min: 1, max: TETO_ARQUIVOS, decimals: 0 }}
                ajuda="O relato é um envio, e cada resposta ao time é outro. Este total vale junto com o limite de cada tipo."
                emphasized
                disabled={!draft.IsEnabled}
                aoTrocar={(valor) => setDraft({ ...draft, MaxFilesPerReport: valor })}
                onValidityChange={trackField}
              />
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              <Interruptor
                marcado={draft.AllowsScreenCapture}
                titulo="Deixar capturar e gravar a tela"
                explicacao="Liga os dois botões da ferramenta: Capturar tela, que vira imagem, e Gravar tela, que vira vídeo. Cada um só aparece se o tipo dele for aceito. A pessoa clica e o navegador pergunta qual tela ou janela mostrar. Onde o navegador não sabe capturar ou gravar, como no iPhone, o botão correspondente não aparece, e anexar arquivo continua."
                aoTrocar={(valor) => setDraft({ ...draft, AllowsScreenCapture: valor })}
              />

              <Interruptor
                marcado={draft.AllowsOnInfoRequest}
                titulo="Deixar anexar ao responder o time"
                explicacao="É onde o print mais serve: o time olhou o relato, não entendeu, e pediu a tela. Desligado, a pessoa só anexa na hora de criar o relato."
                aoTrocar={(valor) => setDraft({ ...draft, AllowsOnInfoRequest: valor })}
              />
            </div>
          </fieldset>

          {semTipo && (
            <div className="mt-6 rounded-xl border border-warn-border bg-warn-surface p-4">
              <p className="text-caption text-warn-fg leading-relaxed">
                <strong className="font-medium">O anexo está ligado e nenhum tipo é aceito.</strong>{' '}
                Assim não entra arquivo nenhum. Aceite um tipo, ou desligue o anexo — não ligamos um
                por você, porque cada tipo aceito é espaço que este projeto passa a guardar.
              </p>
            </div>
          )}

          <div className="mt-6 mb-6 rounded-xl border border-border border-dashed bg-surface p-4">
            <p className="text-caption text-fg-muted leading-relaxed">
              <strong className="font-medium text-fg">O limite de tamanho não é sugestão.</strong>{' '}
              Ele viaja assinado junto com a permissão de envio, e quem recusa o que passa é o
              próprio armazenamento — não adianta mexer no navegador. O arquivo nunca passa pela
              nossa API: vai direto, sob as regras que ela assinou.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              disabled={!dirty || saving || impedido}
              onClick={() => void salvar()}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>

            {dirty && !saving && !impedido && (
              <span className="text-caption text-fg-muted">Há mudança não salva.</span>
            )}

            {invalidCount > 0 && (
              <span className="text-caption text-error-fg">
                {invalidCount === 1
                  ? 'Há um campo a corrigir.'
                  : `Há ${invalidCount} campos a corrigir.`}
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

/** Compara o rascunho com o que está salvo, inclusive os limites de cada tipo. */
function igual(a: MediaSettingsViewModel, b: MediaSettingsViewModel) {
  return (
    a.IsEnabled === b.IsEnabled &&
    a.AllowsScreenCapture === b.AllowsScreenCapture &&
    a.AllowsOnInfoRequest === b.AllowsOnInfoRequest &&
    a.MaxFilesPerReport === b.MaxFilesPerReport &&
    a.Kinds.length === b.Kinds.length &&
    a.Kinds.every((tipo, indice) => {
      const outro = b.Kinds[indice]

      return (
        outro !== undefined &&
        tipo.Kind === outro.Kind &&
        tipo.IsEnabled === outro.IsEnabled &&
        tipo.MaxCount === outro.MaxCount &&
        tipo.MaxBytes === outro.MaxBytes &&
        tipo.MaxDurationSeconds === outro.MaxDurationSeconds
      )
    })
  )
}

/**
 * O rascunho com o valor salvo de volta em cada campo com texto que não serve.
 *
 * Campo inválido não escreve no rascunho, que fica com o último número válido — e
 * esse número pode ser só uma tecla no caminho. O salvo foi escolhido por alguém.
 */
function restoreInvalid(
  draft: MediaSettingsViewModel,
  published: MediaSettingsViewModel,
  invalid: ReadonlySet<string>,
): MediaSettingsViewModel {
  return {
    ...draft,
    MaxFilesPerReport: invalid.has(fieldId.total)
      ? published.MaxFilesPerReport
      : draft.MaxFilesPerReport,
    Kinds: draft.Kinds.map((kind) => {
      const saved = published.Kinds.find((other) => other.Kind === kind.Kind)

      if (!saved) return kind

      return {
        ...kind,
        MaxCount: invalid.has(fieldId.count(kind.Kind)) ? saved.MaxCount : kind.MaxCount,
        MaxBytes: invalid.has(fieldId.size(kind.Kind)) ? saved.MaxBytes : kind.MaxBytes,
        MaxDurationSeconds: invalid.has(fieldId.duration(kind.Kind))
          ? saved.MaxDurationSeconds
          : kind.MaxDurationSeconds,
      }
    }),
  }
}

/**
 * Uma escolha de sim ou não, com o que ela custa escrito junto.
 */
function Interruptor({
  marcado,
  titulo,
  explicacao,
  desabilitado = false,
  aoTrocar,
}: {
  marcado: boolean
  titulo: string
  explicacao: string
  desabilitado?: boolean
  aoTrocar: (valor: boolean) => void
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <label
        className={
          desabilitado ? 'flex items-start gap-3' : 'flex cursor-pointer items-start gap-3'
        }
      >
        <input
          type="checkbox"
          checked={marcado}
          disabled={desabilitado}
          onChange={(evento) => aoTrocar(evento.target.checked)}
          className="mt-0.5 flex-none accent-accent"
        />
        <span className="min-w-0">
          <span className="mb-0.5 block font-medium text-detail text-fg">{titulo}</span>
          <span className="block text-caption text-fg-muted leading-relaxed">{explicacao}</span>
        </span>
      </label>
    </div>
  )
}

/**
 * Um tipo de mídia, com os limites dele.
 *
 * **Os campos ficam visíveis mesmo com o tipo desligado**, e isso é deliberado:
 * desligar não apaga os limites, e escondê-los faria parecer que apaga.
 */
function Tipo({
  limite,
  disabled,
  aoTrocar,
  onValidityChange,
}: {
  limite: MediaKindLimitViewModel
  /** O anexo está desligado, e os campos ficam fora de alcance. */
  disabled: boolean
  aoTrocar: (mudanca: Partial<MediaKindLimitViewModel>) => void
  onValidityChange: (field: string, valid: boolean) => void
}) {
  const texto = TIPOS[limite.Kind]

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={limite.IsEnabled}
          onChange={(evento) => aoTrocar({ IsEnabled: evento.target.checked })}
          className="mt-0.5 flex-none accent-accent"
        />
        <span className="min-w-0">
          <span className="mb-0.5 block font-medium text-detail text-fg">{texto.titulo}</span>
          <span className="block text-caption text-fg-muted leading-relaxed">{texto.resumo}</span>
          <span className="mt-1 block text-caption text-fg-muted leading-relaxed">
            {texto.custo}
          </span>
        </span>
      </label>

      <div className="mt-3.5 flex flex-wrap gap-4 border-border border-t pt-3.5 pl-7">
        <Numero
          id={fieldId.count(limite.Kind)}
          rotulo="Quantos por envio"
          unidade="arquivos"
          valor={limite.MaxCount}
          range={{ min: 1, max: TETO_QUANTIDADE, decimals: 0 }}
          disabled={disabled}
          aoTrocar={(valor) => aoTrocar({ MaxCount: valor })}
          onValidityChange={onValidityChange}
        />

        <Numero
          id={fieldId.size(limite.Kind)}
          rotulo="Tamanho de cada um"
          unidade="MB"
          valor={megabytesFromBytes(limite.MaxBytes)}
          range={{ min: 1, max: TETO_MB[limite.Kind], decimals: MB_DECIMALS }}
          disabled={disabled}
          // O banco guarda bytes, e quem configura pensa em MB. A conversão mora
          // aqui, na borda: mandar MB para a API faria a unidade virar convenção
          // combinada entre dois lados, e é assim que um dos dois esquece.
          aoTrocar={(valor) => aoTrocar({ MaxBytes: bytesFromMegabytes(valor) })}
          onValidityChange={onValidityChange}
        />

        {limite.MaxDurationSeconds !== null && (
          <Numero
            id={fieldId.duration(limite.Kind)}
            rotulo="Duração máxima"
            unidade="segundos"
            valor={limite.MaxDurationSeconds}
            range={{ min: 1, max: TETO_DURACAO_SEGUNDOS, decimals: 0 }}
            disabled={disabled}
            ajuda="Limitar a duração é a proteção mais barata que existe aqui: corta espaço e corta o que aparece sem querer, de uma vez."
            aoTrocar={(valor) => aoTrocar({ MaxDurationSeconds: valor })}
            onValidityChange={onValidityChange}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Um limite numérico, com o teto do sistema declarado.
 *
 * **O texto mora aqui, e o rascunho só recebe número que serve.** Campo apagado
 * fica apagado e avisa, em vez de pular para o mínimo; número fora da faixa ou com
 * casa decimal demais também avisa, e o Salvar espera. O erro troca o texto de
 * ajuda, como no `TextField`, para a tela não pular de altura.
 *
 * **Campo fora de alcance não fica inválido.** Desligado o anexo, ninguém mais
 * consegue corrigi-lo, e o Salvar ficaria preso por um erro sem saída. A tela
 * devolve ao rascunho o valor salvo (`restoreInvalid`), e o texto passa a dizer o
 * número que o rascunho guarda.
 */
function Numero({
  id,
  rotulo,
  unidade,
  valor,
  range,
  ajuda,
  emphasized = false,
  disabled,
  aoTrocar,
  onValidityChange,
}: {
  id: string
  rotulo: string
  unidade: string
  valor: number
  range: LimitRange
  ajuda?: string
  /** O campo que resume a tela, com o rótulo no tamanho do texto corrido. */
  emphasized?: boolean
  /** Fora de alcance: o `fieldset` em volta está desabilitado. */
  disabled: boolean
  aoTrocar: (valor: number) => void
  onValidityChange: (field: string, valid: boolean) => void
}) {
  const [text, setText] = useState(() => String(valor))
  const [invalid, setInvalid] = useState(false)
  const [lastValue, setLastValue] = useState(valor)

  // A tela só sabe se pode salvar pelo que cada campo conta aqui. Campo que sai da
  // tela, como ao trocar de projeto, conta como válido: senão o Salvar ficaria
  // preso por um erro que ninguém mais vê.
  useEffect(() => {
    onValidityChange(id, !invalid)
    return () => onValidityChange(id, true)
  }, [id, invalid, onValidityChange])

  // O valor também muda por fora, quando o servidor devolve o que gravou. O texto
  // acompanha, a menos que já diga o mesmo número — "5.0" não vira "5" enquanto a
  // pessoa digita.
  if (valor !== lastValue) {
    setLastValue(valor)

    if (parseLimit(text, range) !== valor) {
      setText(String(valor))
      setInvalid(false)
    }
  }

  if (disabled && invalid) {
    setText(String(valor))
    setInvalid(false)
  }

  const messageId = `${id}-mensagem`

  return (
    <div className={emphasized ? undefined : 'min-w-44'}>
      <label
        htmlFor={id}
        className={cn(
          'mb-1 block font-medium text-fg',
          emphasized ? 'text-detail' : 'text-caption',
        )}
      >
        {rotulo}
      </label>
      <div className="mb-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={range.min}
          max={range.max}
          // Com casa decimal, qualquer valor da faixa serve; com passo fixo o
          // navegador marcaria 5.3 como inválido, e a tela aceita.
          step={range.decimals === 0 ? 1 : 'any'}
          value={text}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={messageId}
          onChange={(evento) => {
            const typed = evento.target.value
            const parsed = parseLimit(typed, range)

            setText(typed)
            setInvalid(parsed === null)

            if (parsed !== null) aoTrocar(parsed)
          }}
          className={cn(
            'h-9 rounded-lg border bg-surface-raised px-3 text-body text-fg',
            emphasized ? 'w-28' : 'w-24',
            invalid ? 'border-error-border' : 'border-border',
          )}
        />
        <span className={cn('text-fg-muted', emphasized ? 'text-detail' : 'text-caption')}>
          {unidade}
        </span>
      </div>
      <p
        id={messageId}
        className={cn('text-caption leading-relaxed', invalid ? 'text-error-fg' : 'text-fg-muted')}
      >
        {invalid
          ? limitHint(range)
          : `${ajuda ? `${ajuda} ` : ''}No máximo ${range.max} ${unidade}.`}
      </p>
    </div>
  )
}
