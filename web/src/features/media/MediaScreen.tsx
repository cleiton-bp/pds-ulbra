import { useCallback, useEffect, useState } from 'react'
import {
  type FileFormatViewModel,
  type MediaKind,
  type MediaKindLimitViewModel,
  type MediaSettingsViewModel,
  UPLOADABLE_MEDIA_KINDS,
} from '@/contracts'
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
import { fileFormatLabel } from '@/shared/lib/fileFormats'

/**
 * Um tipo que esta tela mostra: só o que ainda se pode enviar.
 *
 * O vídeo saiu do produto por pesar demais no armazenamento e na entrega. A API
 * já não o lista; o filtro segura a janela da troca, quando esta tela pode falar
 * com uma API que ainda lista — e uma seção de vídeo aqui prometeria um envio que
 * a ferramenta não oferece mais.
 */
type ShownKind = MediaKindLimitViewModel & { Kind: 'Image' | 'File' }

function isShownKind(limite: MediaKindLimitViewModel): limite is ShownKind {
  return UPLOADABLE_MEDIA_KINDS.includes(limite.Kind)
}

/** Os tetos do sistema, iguais aos de `ProjectMediaKind` e `FileFormats` em C#. */
const TETO_QUANTIDADE = 10
const TETO_MB: Record<ShownKind['Kind'], number> = { Image: 10, File: 25 }

/** O que cada tipo é, para quem configura — e não o nome do enum. */
const TIPOS: Record<ShownKind['Kind'], { titulo: string; resumo: string; custo: string }> = {
  Image: {
    titulo: 'Imagem',
    resumo: 'Print, foto da tela, recorte de captura.',
    custo: 'Barata de guardar. Print de celular moderno passa de 3 MB.',
  },
  File: {
    titulo: 'Arquivo',
    resumo:
      'O PDF da fatura, o log do erro, a planilha que não fecha. Sempre baixado pelo time, e nunca aberto na página.',
    custo:
      'Desligado de fábrica: é o anexo com mais risco, porque o conteúdo ninguém olhou. Só entram os formatos marcados, e os bytes de cada um são conferidos onde o formato permite.',
  },
}

/**
 * O `id` de cada campo numérico, que também é a chave dele em `invalidFields`.
 *
 * Mora num lugar só porque a tela precisa achar de volta, pela chave, qual limite
 * do rascunho aquele campo escreve.
 */
const fieldId = {
  count: (kind: MediaKind) => `quantidade-${kind}`,
  size: (kind: MediaKind) => `tamanho-${kind}`,
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
 * um dia ser dado, e não migração. Quando um tipo novo entrar, ele ganha aqui o
 * texto dele e aparece com o padrão de fábrica. Hoje são imagem e arquivo, cada um
 * com a sua quantidade e o seu tamanho por envio — não há total.
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

  const shownKinds = draft?.Kinds.filter(isShownKind) ?? []

  /**
   * Ligado e sem imagem aceita não aceita nada.
   *
   * A tela **não** liga a imagem sozinha: quem quer isso já tem o caminho certo,
   * que é desligar o anexo — e aceitar por quem configura seria decidir uma conta
   * no lugar dele.
   *
   * **Conta só o que a tela mostra.** O vídeo que a API ainda liste ligado, na
   * janela da troca, não é tipo aceito: contá-lo esconderia este aviso de um
   * projeto que não recebe arquivo nenhum.
   */
  const semTipo = draft?.IsEnabled === true && shownKinds.every((tipo) => !tipo.IsEnabled)

  /**
   * Arquivo aceito sem formato marcado não aceita nada — e a API recusa salvar assim.
   * A tela não marca por quem configura, pelo mesmo motivo da imagem.
   */
  const semFormato =
    draft?.IsEnabled === true &&
    shownKinds.some(
      (tipo) => tipo.Kind === 'File' && tipo.IsEnabled && (tipo.Formats ?? []).length === 0,
    )

  const noStorage = draft !== null && !draft.IsStorageAvailable
  const invalidCount = invalidFields.size

  const impedido = semTipo || semFormato || noStorage || invalidCount > 0

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
        AllowsOnReopen: draft.AllowsOnReopen,
        // A API de antes do arquivo exige o total ao salvar; a nova nem o manda. Devolver
        // o que veio mantém o salvar funcionando na janela da troca.
        ...(draft.MaxFilesPerReport !== undefined && {
          MaxFilesPerReport: draft.MaxFilesPerReport,
        }),
        // Só o que a tela mostra. Tipo que não vai fica como está do lado de lá.
        Kinds: draft.Kinds.filter(isShownKind),
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
                Por isso o anexo aparece desligado, qualquer que seja a escolha do projeto, não pode
                ser ligado, e nada aqui pode ser salvo. A escolha salva e os limites abaixo passam a
                valer quando houver armazenamento.
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
              {shownKinds.map((limite) => (
                <Tipo
                  key={limite.Kind}
                  limite={limite}
                  formatos={draft.FileFormats ?? []}
                  disabled={!draft.IsEnabled}
                  aoTrocar={(mudanca) => trocarTipo(limite.Kind, mudanca)}
                  onValidityChange={trackField}
                />
              ))}
            </div>

            {/* Fica sempre, e não só para quem aceitava vídeo: a API já não diz quem
                aceitava, e sem esta frase a seção de vídeo sumiria da tela sem
                explicação para a maioria, que o tinha ligado de fábrica. */}
            <p className="mt-2.5 text-caption text-fg-muted leading-relaxed">
              Vídeo não é mais aceito como anexo. Os vídeos já recebidos continuam nos relatos.
            </p>

            {/* Sem total por envio: cada categoria tem o seu. A frase diz o que é um
                envio, que o total dizia antes. */}
            <p className="mt-2.5 text-caption text-fg-muted leading-relaxed">
              Os limites valem para cada envio: o relato é um, cada resposta ao time é outro, e cada
              reabertura também.
            </p>

            <div className="mt-5 flex flex-col gap-2.5">
              <Interruptor
                marcado={draft.AllowsScreenCapture}
                titulo="Deixar capturar a tela"
                explicacao="Liga o botão Capturar tela da ferramenta. A pessoa clica, a ferramenta some e ela arrasta sobre a página para marcar o que quer mostrar — a área vira imagem na hora, sem o navegador perguntar nada, em qualquer navegador, inclusive no iPhone. Nada é capturado sem ela marcar. A captura vira imagem, então o botão só aparece se imagem for aceita. O que a página não deixa ler, como imagem ou conteúdo de outro site, sai em branco no print. Antes de entrar no relato, a imagem abre num editor, onde a pessoa marca e cobre o que não quer mostrar: a captura não esconde nada sozinha."
                aoTrocar={(valor) => setDraft({ ...draft, AllowsScreenCapture: valor })}
              />

              <Interruptor
                marcado={draft.AllowsOnInfoRequest}
                titulo="Deixar anexar ao responder o time"
                explicacao="É onde o print mais serve: o time olhou o relato, não entendeu, e pediu a tela. Desligado, a resposta vai só com o texto."
                aoTrocar={(valor) => setDraft({ ...draft, AllowsOnInfoRequest: valor })}
              />

              {/* Chave própria, e não a da resposta: atender ao pedido do time e
                  dizer que o problema voltou são perguntas diferentes, e um projeto
                  pode querer uma e não a outra. */}
              <Interruptor
                marcado={draft.AllowsOnReopen}
                titulo="Deixar anexar ao reabrir"
                explicacao="Quem relatou pode mandar prints ao reabrir um relato encerrado — o que ainda está acontecendo. Desligado, a reabertura vai só com o texto."
                aoTrocar={(valor) => setDraft({ ...draft, AllowsOnReopen: valor })}
              />
            </div>
          </fieldset>

          {semTipo && (
            <div className="mt-6 rounded-xl border border-warn-border bg-warn-surface p-4">
              <p className="text-caption text-warn-fg leading-relaxed">
                <strong className="font-medium">
                  O anexo está ligado e nem imagem nem arquivo são aceitos.
                </strong>{' '}
                Assim não entra nada. Aceite um dos dois, ou desligue o anexo — não marcamos por
                você, porque cada anexo aceito é espaço que este projeto passa a guardar.
              </p>
            </div>
          )}

          {semFormato && (
            <div className="mt-6 rounded-xl border border-warn-border bg-warn-surface p-4">
              <p className="text-caption text-warn-fg leading-relaxed">
                <strong className="font-medium">
                  O arquivo está aceito e nenhum formato está marcado.
                </strong>{' '}
                Assim não entra arquivo nenhum. Marque ao menos um formato, ou deixe de aceitar
                arquivo.
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
    a.AllowsOnReopen === b.AllowsOnReopen &&
    a.Kinds.length === b.Kinds.length &&
    a.Kinds.every((tipo, indice) => {
      const outro = b.Kinds[indice]

      return (
        outro !== undefined &&
        tipo.Kind === outro.Kind &&
        tipo.IsEnabled === outro.IsEnabled &&
        tipo.MaxCount === outro.MaxCount &&
        tipo.MaxBytes === outro.MaxBytes &&
        // A ordem dos marcados nao importa: e o mesmo conjunto de formatos.
        [...(tipo.Formats ?? [])].sort().join() === [...(outro.Formats ?? [])].sort().join()
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
    Kinds: draft.Kinds.map((kind) => {
      const saved = published.Kinds.find((other) => other.Kind === kind.Kind)

      if (!saved) return kind

      return {
        ...kind,
        MaxCount: invalid.has(fieldId.count(kind.Kind)) ? saved.MaxCount : kind.MaxCount,
        MaxBytes: invalid.has(fieldId.size(kind.Kind)) ? saved.MaxBytes : kind.MaxBytes,
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
  formatos,
  disabled,
  aoTrocar,
  onValidityChange,
}: {
  limite: ShownKind
  /** O catálogo de formatos de arquivo. Só o arquivo usa. */
  formatos: FileFormatViewModel[]
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
      </div>

      {limite.Kind === 'File' && (
        <Formatos
          catalogo={formatos}
          marcados={limite.Formats ?? []}
          aoTrocar={(marcados) => aoTrocar({ Formats: marcados })}
        />
      )}
    </div>
  )
}

/**
 * Os formatos de arquivo que o projeto aceita, para marcar.
 *
 * **O catálogo é fechado, e vem da API** — é ela que confere os bytes de cada um. Aqui
 * mora só o nome de cada formato em português, e as extensões dele escritas junto,
 * para quem configura saber exatamente o que entra.
 *
 * **Marcados também com o arquivo desligado**, como os limites: desligar não apaga a
 * escolha, e religar devolve o que já tinha sido pensado.
 */
function Formatos({
  catalogo,
  marcados,
  aoTrocar,
}: {
  catalogo: FileFormatViewModel[]
  marcados: string[]
  aoTrocar: (marcados: string[]) => void
}) {
  return (
    <fieldset className="mt-3.5 border-border border-t pt-3.5 pl-7">
      <legend className="sr-only">Formatos aceitos</legend>
      <p aria-hidden="true" className="mb-2 font-medium text-caption text-fg">
        Formatos aceitos
      </p>
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {catalogo.map((formato) => (
          <label key={formato.Key} className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={marcados.includes(formato.Key)}
              onChange={(evento) =>
                aoTrocar(
                  evento.target.checked
                    ? [...marcados, formato.Key]
                    : marcados.filter((marcado) => marcado !== formato.Key),
                )
              }
              className="mt-0.5 flex-none accent-accent"
            />
            <span className="min-w-0 text-caption leading-relaxed">
              <span className="text-fg">{fileFormatLabel(formato.Key)}</span>{' '}
              <span className="text-fg-muted">{formato.Extensions.join(' ')}</span>
              {/* O zip é o formato que não dá para conferir por dentro: pode trazer
                  qualquer arquivo, e quem marca precisa saber disso. */}
              {formato.Key === 'zip' && (
                <span className="block text-fg-muted">
                  Pode trazer qualquer arquivo dentro: só o formato do zip é conferido.
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
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
    <div className="min-w-44">
      <label htmlFor={id} className="mb-1 block font-medium text-caption text-fg">
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
            'w-24',
            invalid ? 'border-error-border' : 'border-border',
          )}
        />
        <span className="text-caption text-fg-muted">{unidade}</span>
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
