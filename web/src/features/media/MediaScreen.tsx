import { useCallback, useEffect, useState } from 'react'
import type { MediaKind, MediaKindLimitViewModel, MediaSettingsViewModel } from '@/contracts'
import { describeError, projectMediaSettingsService } from '@/data'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'

/** Os tetos do sistema, iguais aos de `ProjectMediaSettings` e `ProjectMediaKind` em C#. */
const TETO_ARQUIVOS = 10
const TETO_QUANTIDADE = 10
const TETO_DURACAO_SEGUNDOS = 300
const TETO_MB: Record<MediaKind, number> = { Image: 10, Video: 50 }

const UM_MB = 1024 * 1024

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
 * O que este projeto aceita receber junto do relato.
 *
 * **Esta tela vem antes da ferramenta saber anexar, e não depois.** É ela que diz
 * o que existe: desligado o anexo, a ferramenta não mostra nada de mídia e o
 * servidor recusa assinar qualquer envio. É a única trava que a etapa constrói de
 * propósito.
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
 * **Sem armazenamento configurado, o interruptor não liga e a tela diz por quê.**
 * Deixar ligar prometeria um botão que falharia no envio, depois de a pessoa já
 * ter escolhido o arquivo.
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

  const impedido = semTipo || (draft?.IsEnabled === true && !draft.IsStorageAvailable)

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
          {!draft.IsStorageAvailable && (
            <div className="mb-5 rounded-xl border border-warn-border bg-warn-surface p-4">
              <p className="text-caption text-warn-fg leading-relaxed">
                <strong className="font-medium">
                  Não há armazenamento configurado nesta instalação.
                </strong>{' '}
                Enquanto não houver, o anexo não liga — e é melhor assim: a ferramenta mostraria o
                botão, e o envio falharia depois de a pessoa já ter escolhido o arquivo.
              </p>
            </div>
          )}

          <Interruptor
            marcado={draft.IsEnabled}
            desabilitado={!draft.IsStorageAvailable}
            titulo="Aceitar anexo no relato"
            explicacao="Desligado, a ferramenta não mostra nada de mídia e o servidor recusa qualquer envio — não adianta ter tipo ligado nem limite configurado aqui embaixo."
            aoTrocar={(valor) => setDraft({ ...draft, IsEnabled: valor })}
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
                  aoTrocar={(mudanca) => trocarTipo(limite.Kind, mudanca)}
                />
              ))}
            </div>

            <div className="mt-5 rounded-xl border border-border bg-surface p-4">
              <label htmlFor="max-arquivos" className="mb-1 block font-medium text-detail text-fg">
                Arquivos por relato, somando os tipos
              </label>
              <div className="mb-1 flex items-center gap-2">
                <input
                  id="max-arquivos"
                  type="number"
                  min={1}
                  max={TETO_ARQUIVOS}
                  value={draft.MaxFilesPerReport}
                  // Campo vazio vira 1, e não `NaN`: apagar tudo para digitar outro
                  // número é o gesto comum, e `NaN` quebraria a comparação que
                  // decide se há o que salvar. Um, e não zero, porque zero seria
                  // desligar o anexo por outro caminho.
                  onChange={(evento) =>
                    setDraft({
                      ...draft,
                      MaxFilesPerReport: Number.parseInt(evento.target.value, 10) || 1,
                    })
                  }
                  className="h-9 w-28 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg"
                />
                <span className="text-detail text-fg-muted">arquivos</span>
              </div>
              <p className="text-caption text-fg-muted leading-relaxed">
                Existe além do limite de cada tipo, e não no lugar dele: só com o limite por tipo,
                três imagens mais um vídeo passariam num projeto que só queria dois no total. No
                máximo {TETO_ARQUIVOS}.
              </p>
            </div>

            <div className="mt-5 flex flex-col gap-2.5">
              <Interruptor
                marcado={draft.AllowsScreenCapture}
                titulo="Deixar capturar a tela"
                explicacao="A pessoa clica, o navegador pergunta qual tela ou janela, e ela escolhe — não é captura automática, que é impossível de dentro da ferramenta. Onde o navegador não souber fazer, e o iPhone não sabe, o botão some sozinho e anexar arquivo continua."
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
  aoTrocar,
}: {
  limite: MediaKindLimitViewModel
  aoTrocar: (mudanca: Partial<MediaKindLimitViewModel>) => void
}) {
  const texto = TIPOS[limite.Kind]
  const tetoMb = TETO_MB[limite.Kind]
  const mb = Math.round((limite.MaxBytes / UM_MB) * 10) / 10

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
          id={`quantidade-${limite.Kind}`}
          rotulo="Quantos por relato"
          unidade="arquivos"
          valor={limite.MaxCount}
          minimo={1}
          maximo={TETO_QUANTIDADE}
          aoTrocar={(valor) => aoTrocar({ MaxCount: valor })}
        />

        <Numero
          id={`tamanho-${limite.Kind}`}
          rotulo="Tamanho de cada um"
          unidade="MB"
          valor={mb}
          minimo={1}
          maximo={tetoMb}
          passo={0.5}
          // O banco guarda bytes, e quem configura pensa em MB. A conversão mora
          // aqui, na borda: mandar MB para a API faria a unidade virar convenção
          // combinada entre dois lados, e é assim que um dos dois esquece.
          aoTrocar={(valor) => aoTrocar({ MaxBytes: Math.round(valor * UM_MB) })}
        />

        {limite.MaxDurationSeconds !== null && (
          <Numero
            id={`duracao-${limite.Kind}`}
            rotulo="Duração máxima"
            unidade="segundos"
            valor={limite.MaxDurationSeconds}
            minimo={1}
            maximo={TETO_DURACAO_SEGUNDOS}
            ajuda="Limitar a duração é a proteção mais barata que existe aqui: corta espaço e corta o que aparece sem querer, de uma vez."
            aoTrocar={(valor) => aoTrocar({ MaxDurationSeconds: valor })}
          />
        )}
      </div>
    </div>
  )
}

/** Um limite numérico, com o teto do sistema declarado. */
function Numero({
  id,
  rotulo,
  unidade,
  valor,
  minimo,
  maximo,
  passo,
  ajuda,
  aoTrocar,
}: {
  id: string
  rotulo: string
  unidade: string
  valor: number
  minimo: number
  maximo: number
  passo?: number
  ajuda?: string
  aoTrocar: (valor: number) => void
}) {
  return (
    <div className="min-w-44">
      <label htmlFor={id} className="mb-1 block font-medium text-caption text-fg">
        {rotulo}
      </label>
      <div className="mb-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          min={minimo}
          max={maximo}
          step={passo}
          value={valor}
          // Campo vazio cai no mínimo, e não em `NaN`: apagar tudo para digitar
          // outro número é o gesto comum, e `NaN` quebraria a comparação que decide
          // se há o que salvar.
          onChange={(evento) => aoTrocar(Number.parseFloat(evento.target.value) || minimo)}
          className="h-9 w-24 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg"
        />
        <span className="text-caption text-fg-muted">{unidade}</span>
      </div>
      <p className="text-caption text-fg-muted leading-relaxed">
        {ajuda ? `${ajuda} ` : ''}No máximo {maximo} {unidade}.
      </p>
    </div>
  )
}
