import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  type FileFormatViewModel,
  type MediaKindLimitViewModel,
  type MediaSettingsViewModel,
  type PublicMediaSettingsViewModel,
  UPLOADABLE_MEDIA_KINDS,
} from '@/contracts'
import { describeError, projectMediaSettingsService, projectWidgetSettingsService } from '@/data'
import { Button } from '@/shared/components/Button'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { PreviewSection, PreviewUnavailable } from '@/shared/components/PreviewSection'
import { Hint } from '@/shared/components/SettingsControls'
import { SettingsGroup } from '@/shared/components/SettingsGroup'
import { SettingsHeader } from '@/shared/components/SettingsHeader'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'
import { MEDIA_DEFAULTS } from '@/shared/lib/factoryDefaults'
import { fileFormatLabel } from '@/shared/lib/fileFormats'
import { useScreenGuide } from '@/shared/tour/guideStore'

/**
 * Um tipo que esta tela mostra: so o que ainda se pode enviar.
 *
 * O video saiu do produto por pesar demais no armazenamento e na entrega. A API ja nao o
 * lista; o filtro segura a janela da troca, quando esta tela pode falar com uma API que
 * ainda lista — e um grupo de video aqui prometeria um envio que a ferramenta nao
 * oferece mais.
 */
type ShownKind = MediaKindLimitViewModel & { Kind: 'Image' | 'File' }

function isShownKind(limite: MediaKindLimitViewModel): limite is ShownKind {
  return UPLOADABLE_MEDIA_KINDS.includes(limite.Kind)
}

/** Os tipos de imagem que a API aceita, iguais aos de `MediaSignatures.cs` — so para a previa. */
const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/webp']

/** As extensoes da imagem, para a linha dela entre os tipos do botao de anexar. */
const EXTENSOES_DE_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp']

/** O nome do acordeao desta tela: abrir um grupo fecha o outro. Ver `SettingsGroup`. */
const ACORDEAO = 'anexos'

/** Os grupos, na ordem da tela. A ancora de cada um mora no `<summary>` dele. */
type Grupo = 'imagem' | 'arquivo' | 'quando'

const ID_DO_GRUPO: Record<Grupo, string> = {
  imagem: 'grupo-imagem',
  arquivo: 'grupo-arquivo',
  quando: 'quando-anexar',
}

/** Os formatos que o catalogo marca de fabrica: o padrao do arquivo vem da propria leitura. */
function formatosDeFabrica(draft: MediaSettingsViewModel): string[] {
  return (draft.FileFormats ?? [])
    .filter((formato) => formato.IsDefault)
    .map((formato) => formato.Key)
}

/** O mesmo conjunto de formatos? A ordem dos marcados nao importa. */
function mesmosFormatos(a: readonly string[], b: readonly string[]) {
  return [...a].sort().join() === [...b].sort().join()
}

/** O que mudou do padrao no print da tela. */
function mudancasDoPrint(draft: MediaSettingsViewModel): string[] {
  return draft.AllowsScreenCapture !== MEDIA_DEFAULTS.AllowsScreenCapture
    ? ['Aceitar print da tela']
    : []
}

/**
 * O que mudou do padrao nos tipos do botao de anexar: a imagem e os formatos de arquivo.
 * Os limites de quantidade e tamanho nao sao da tela: valem os de fabrica.
 */
function mudancasDoBotao(
  draft: MediaSettingsViewModel,
  imagem: ShownKind,
  arquivo: ShownKind,
): string[] {
  const deFabrica = MEDIA_DEFAULTS.Kinds.File.IsEnabled ? formatosDeFabrica(draft) : []
  const mudou =
    imagem.IsEnabled !== MEDIA_DEFAULTS.Kinds.Image.IsEnabled ||
    !mesmosFormatos(formatosMarcados(arquivo), deFabrica)
  return mudou ? ['Tipos de arquivo'] : []
}

/** Os formatos de arquivo que valem: nenhum, com o arquivo desligado. */
function formatosMarcados(arquivo: ShownKind): string[] {
  return arquivo.IsEnabled ? (arquivo.Formats ?? []) : []
}

/** O que mudou do padrao em Quando anexar: os dois lugares a mais, alem do relato. */
function mudancasDoQuando(draft: MediaSettingsViewModel): string[] {
  const mudou: string[] = []
  if (draft.AllowsOnInfoRequest !== MEDIA_DEFAULTS.AllowsOnInfoRequest) mudou.push('Ao responder')
  if (draft.AllowsOnReopen !== MEDIA_DEFAULTS.AllowsOnReopen) mudou.push('Ao reabrir')
  return mudou
}

/** "Voltar ao padrão" do print da tela. */
function padraoDoPrint(draft: MediaSettingsViewModel): MediaSettingsViewModel {
  return { ...draft, AllowsScreenCapture: MEDIA_DEFAULTS.AllowsScreenCapture }
}

/** "Voltar ao padrão" dos tipos do botao: a imagem e o arquivo com os formatos de fabrica. */
function padraoDoBotao(draft: MediaSettingsViewModel): MediaSettingsViewModel {
  return {
    ...draft,
    Kinds: draft.Kinds.map((tipo) => {
      if (tipo.Kind !== 'Image' && tipo.Kind !== 'File') return tipo
      const padrao = MEDIA_DEFAULTS.Kinds[tipo.Kind]
      return {
        ...tipo,
        IsEnabled: padrao.IsEnabled,
        MaxCount: padrao.MaxCount,
        MaxBytes: padrao.MaxBytes,
        ...(tipo.Kind === 'File' && { Formats: formatosDeFabrica(draft) }),
      }
    }),
  }
}

/** "Voltar ao padrão" de Quando anexar: os dois lugares a mais. */
function padraoDoQuando(draft: MediaSettingsViewModel): MediaSettingsViewModel {
  return {
    ...draft,
    AllowsOnInfoRequest: MEDIA_DEFAULTS.AllowsOnInfoRequest,
    AllowsOnReopen: MEDIA_DEFAULTS.AllowsOnReopen,
  }
}

/** "Aceito, abre no editor", ou "Desligado". */
function resumoDoPrint(draft: MediaSettingsViewModel): string {
  return draft.AllowsScreenCapture ? 'Aceito, abre no editor' : 'Desligado'
}

/** "Imagem, PDF e Texto e log", ou o aviso de que o formulario fica sem o botao. */
function resumoDoBotao(
  draft: MediaSettingsViewModel,
  imagem: ShownKind,
  arquivo: ShownKind,
): string {
  const marcados = formatosMarcados(arquivo)
  // Na ordem da lista, e nao na de quem marcou: o resumo nao muda a cada clique.
  const nomes = [
    ...(imagem.IsEnabled ? ['Imagem'] : []),
    ...(draft.FileFormats ?? [])
      .filter((formato) => marcados.includes(formato.Key))
      .map((formato) => fileFormatLabel(formato.Key)),
  ]
  if (nomes.length === 0) return 'Nenhum tipo, e o formulário fica sem o botão'
  return nomes.length > 3
    ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`
    : nomes.join(', ')
}

/** "No relato · ao responder · ao reabrir": o relato sempre, os outros se ligados. */
function resumoDoQuando(draft: MediaSettingsViewModel): string {
  return [
    'No relato',
    draft.AllowsOnInfoRequest && 'ao responder',
    draft.AllowsOnReopen && 'ao reabrir',
  ]
    .filter(Boolean)
    .join(', ')
}

/**
 * O rascunho como a ferramenta o le, para a previa: so os tipos ligados, cada um com o
 * que aceita. Desligado, ou sem armazenamento, a ferramenta nao mostra anexo — e a
 * previa tambem nao.
 */
function anexosDaPrevia(draft: MediaSettingsViewModel): PublicMediaSettingsViewModel | null {
  if (!draft.IsEnabled || !draft.IsStorageAvailable) return null

  const extensoes = (marcados: string[]) =>
    draft.FileFormats.filter((formato) => marcados.includes(formato.Key)).flatMap(
      (formato) => formato.Extensions,
    )

  // A mesma regra da API: a imagem entra pelo botao (marcada entre os tipos) ou pelo
  // print da tela, e o `InPicker` diz se o botao a oferece.
  const kinds = draft.Kinds.filter(isShownKind)
    .filter((tipo) => tipo.IsEnabled || (tipo.Kind === 'Image' && draft.AllowsScreenCapture))
    .map((tipo) => ({
      Kind: tipo.Kind,
      MaxCount: tipo.MaxCount,
      MaxBytes: tipo.MaxBytes,
      ContentTypes: tipo.Kind === 'Image' ? TIPOS_DE_IMAGEM : [],
      InPicker: tipo.IsEnabled,
      ...(tipo.Kind === 'File' && {
        Types: extensoes(tipo.Formats ?? []).map((Extension) => ({ Extension, ContentType: '' })),
      }),
    }))
    .filter((tipo) => tipo.Kind !== 'File' || (tipo.Types ?? []).length > 0)

  if (kinds.length === 0) return null
  return {
    IsEnabled: true,
    AllowsScreenCapture: draft.AllowsScreenCapture,
    AllowsOnInfoRequest: draft.AllowsOnInfoRequest,
    AllowsOnReopen: draft.AllowsOnReopen,
    Kinds: kinds,
  }
}

/**
 * O que este projeto aceita receber junto do relato.
 *
 * **Esta tela vem antes da ferramenta saber anexar, e nao depois.** E ela que diz o que
 * existe: desligado o anexo (a chave ao lado do titulo), a ferramenta nao mostra nada de
 * midia e o servidor recusa assinar qualquer envio.
 *
 * **Tres grupos, um por pergunta**: Print da tela (a pessoa marca uma area ou cola um
 * print, e ele abre no editor), Arquivos (os tipos do botao "Anexar arquivo", a imagem
 * entre eles) e Quando anexar. **O formulario tem um botao so de anexar**: a imagem e um
 * tipo da lista, e nao um botao a parte.
 * Cada grupo, fechado, diz em palavras o que esta escolhido e o que mudou do padrao, com
 * o proprio "Voltar ao padrão" (`SettingsGroup`); a previa, presa a direita, contorna a
 * area de anexar enquanto um grupo esta aberto (`EditorWithPreview`).
 *
 * **Quantidade e tamanho nao sao da tela.** Cada byte guardado e uma conta do produto, e
 * nao uma escolha de quem configura: valem os limites de fabrica de cada tipo, e o
 * Publicar os grava assim, para nenhum limite antigo ficar escondido valendo.
 *
 * **Sem armazenamento configurado, a tela so mostra, e diz por que.** A API responde o
 * anexo desligado, porque a ferramenta nao o oferece, e recusa salvar: gravar esse
 * desligado apagaria a escolha do projeto, que precisa passar a valer quando houver
 * armazenamento.
 */
export function MediaScreen() {
  // O guia desta tela: o passo cuja parte nao estiver na tela sai quando o guia abre.
  useScreenGuide('anexos', [
    {
      alvo: 'opcoes',
      titulo: 'Anexos',
      texto: 'Diga se quem relata pode anexar print da tela e quais arquivos.',
    },
    {
      alvo: 'previa',
      titulo: 'Como aparece',
      texto: 'A área de anexar do formulário, como quem relata vai ver.',
    },
    {
      alvo: 'salvar',
      titulo: 'Salvar',
      texto: 'Nada muda até você salvar ou publicar, e dá para descartar.',
    },
    {
      alvo: 'guia',
      titulo: 'Guia por tela',
      texto: 'Cada tela tem o seu guia, sempre neste botão, com o nome dela.',
    },
  ])
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

  // A configuracao publicada da ferramenta, para a previa mostrar o formulario de verdade em
  // volta dos anexos. **Sem ela, nao ha previa**: a de fabrica no lugar parecia ser a do
  // sistema da pessoa.
  const {
    data: ferramenta,
    failed: ferramentaFalhou,
    reload: lerFerramenta,
  } = useAsyncResource(
    useCallback(
      () => projectWidgetSettingsService.getWidgetSettings(project.PublicId),
      [project.PublicId],
    ),
  )

  const [draft, setDraft] = useState<MediaSettingsViewModel | null>(null)
  const [published, setPublished] = useState<MediaSettingsViewModel | null>(null)
  const [saving, setSaving] = useState(false)

  /** O grupo aberto: com algum aberto, a previa realca a area de anexar. */
  const [aberto, setAberto] = useState<Grupo | null>(null)

  useEffect(() => {
    setPublished(saved)
    setDraft(saved)
  }, [saved])

  // Um objeto novo so quando o rascunho muda: abrir outro grupo troca o realce, e
  // nao deve mandar os anexos ao quadro de novo por nada.
  const naPrevia = useMemo(() => (draft ? anexosDaPrevia(draft) : null), [draft])

  const dirty = draft !== null && published !== null && !igual(draft, published)

  const shownKinds = draft?.Kinds.filter(isShownKind) ?? []
  const imagem = shownKinds.find((tipo) => tipo.Kind === 'Image')
  const arquivo = shownKinds.find((tipo) => tipo.Kind === 'File')

  /**
   * Ligado e sem nada aceito (nem print, nem tipo no botao) nao aceita nada.
   *
   * A tela **nao** liga a imagem sozinha: quem quer isso ja tem o caminho certo, que e
   * desligar o anexo — e aceitar por quem configura seria decidir uma conta no lugar dele.
   *
   * **Conta so o que a tela mostra.** O video que a API ainda liste ligado, na janela da
   * troca, nao e tipo aceito: conta-lo esconderia este aviso de um projeto que nao recebe
   * arquivo nenhum.
   */
  const semTipo =
    draft?.IsEnabled === true &&
    !draft.AllowsScreenCapture &&
    shownKinds.every((tipo) => !tipo.IsEnabled)

  const noStorage = draft !== null && !draft.IsStorageAvailable

  const impedido = semTipo || noStorage

  function toggleAttachments(enabled: boolean) {
    if (!draft) return
    setDraft({ ...draft, IsEnabled: enabled })
  }

  /** O print da tela: marcar uma area da pagina ou colar um print. */
  function trocarPrint(ligado: boolean) {
    if (!draft) return
    setDraft({ ...draft, AllowsScreenCapture: ligado })
  }

  /**
   * Os tipos do botao de anexar: a imagem liga o tipo dela, e os formatos ligam o arquivo
   * (sem nenhum formato, o arquivo desliga e o botao deixa de oferece-lo).
   */
  function trocarTiposDoBotao(imagemMarcada: boolean, formatos: string[]) {
    if (!draft || !arquivo) return
    setDraft({
      ...draft,
      Kinds: draft.Kinds.map((atual) => {
        if (atual.Kind === 'Image') return { ...atual, IsEnabled: imagemMarcada }
        if (atual.Kind === 'File')
          return formatos.length > 0
            ? { ...atual, IsEnabled: true, Formats: formatos }
            : { ...atual, IsEnabled: false }
        return atual
      }),
    })
  }

  async function salvar() {
    if (!draft || saving) return

    if (impedido) return

    setSaving(true)

    try {
      const gravado = await projectMediaSettingsService.saveMediaSettings(project.PublicId, {
        IsEnabled: draft.IsEnabled,
        AllowsScreenCapture: draft.AllowsScreenCapture,
        AllowsOnInfoRequest: draft.AllowsOnInfoRequest,
        AllowsOnReopen: draft.AllowsOnReopen,
        // A API de antes do arquivo exige o total ao salvar; a nova nem o manda. Devolver o
        // que veio mantem o salvar funcionando na janela da troca.
        ...(draft.MaxFilesPerReport !== undefined && {
          MaxFilesPerReport: draft.MaxFilesPerReport,
        }),
        // So o que a tela mostra, com os limites de fabrica: quantidade e tamanho nao
        // sao da tela. Tipo que nao vai fica como esta do lado de la.
        Kinds: draft.Kinds.filter(isShownKind).map((tipo) => ({
          ...tipo,
          MaxCount: MEDIA_DEFAULTS.Kinds[tipo.Kind].MaxCount,
          MaxBytes: MEDIA_DEFAULTS.Kinds[tipo.Kind].MaxBytes,
        })),
      })
      setPublished(gravado)
      setDraft(gravado)
      toast.done('Publicado. Quem abrir o formulário agora já vê assim.')
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setSaving(false)
    }
  }

  /** Liga o grupo a previa: aberto, a area de anexar fica contornada. */
  function acompanhar(grupo: Grupo) {
    return {
      onToggle: (abriu: boolean) =>
        setAberto((atual) => (abriu ? grupo : atual === grupo ? null : atual)),
    }
  }

  const realce = aberto !== null ? 'form-attachments' : null

  return (
    <div className="max-w-6xl">
      <SettingsHeader
        title="Anexos"
        description="O que quem relata pode anexar ao relato. O texto continua obrigatório: um print sozinho não diz o que está errado."
        status={
          draft && (
            <ChaveGeral
              ligado={draft.IsEnabled}
              desabilitado={!draft.IsStorageAvailable}
              aoTrocar={toggleAttachments}
            />
          )
        }
        ready={draft !== null}
        dirty={dirty}
        saving={saving}
        canSave={!impedido}
        onSave={() => void salvar()}
        onDiscard={() => setDraft(published)}
        publishes
        note={motivo(semTipo)}
      />

      {failed && (
        <div className="max-w-170 rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar a configuração agora. Nada mudou: a falha foi ao consultar, e o
            projeto continua se comportando como estava.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      )}

      {draft && (
        <>
          <ResumoGeral ligado={draft.IsEnabled} semArmazenamento={noStorage} semTipo={semTipo} />

          <EditorWithPreview
            previewEmFolha
            folhaAlta
            acaoNoCelular={
              dirty ? (
                <Button
                  variant="primary"
                  disabled={saving || impedido}
                  onClick={() => void salvar()}
                >
                  {saving ? 'Publicando…' : 'Publicar'}
                </Button>
              ) : null
            }
            preview={
              ferramenta ? (
                <PreviewSection
                  settings={ferramenta}
                  media={naPrevia}
                  dirty={dirty}
                  startOpen
                  highlight={realce}
                  hint="O formulário com a área de anexar como está aqui. A parte que você está mudando aparece contornada."
                />
              ) : ferramentaFalhou ? (
                <PreviewUnavailable onRetry={lerFerramenta} />
              ) : (
                <Skeleton className="h-96 w-full rounded-xl" />
              )
            }
          >
            <SettingsGroup
              name={ACORDEAO}
              id={ID_DO_GRUPO.imagem}
              title="Print da tela"
              value={resumoDoPrint(draft)}
              changes={mudancasDoPrint(draft)}
              onReset={() => setDraft(padraoDoPrint(draft))}
              defaultOpen
              {...acompanhar('imagem')}
            >
              <Alcance ligado={draft.IsEnabled}>
                {/* `#mais-opcoes` e `#capturar-tela` eram os limites da imagem e a captura,
                    que viraram esta escolha so: os enderecos antigos caem aqui. */}
                <div id="mais-opcoes" className="scroll-mt-6">
                  <span id="capturar-tela" />
                  <Opcao
                    id="anexo-imagem"
                    marcado={draft.AllowsScreenCapture}
                    rotulo="Aceitar print da tela"
                    aoTrocar={trocarPrint}
                  />
                  {/* O recuo acompanha o texto da caixa, que no toque tem 18 (`pl-6.5`). */}
                  <Hint className="mt-1 pl-5.5 pointer-coarse:pl-6.5">
                    A pessoa marca uma área da página ou cola um print, e ele abre no editor para
                    cobrir o que ela não quer mostrar.
                  </Hint>
                  <details className="mt-1 pl-5.5 pointer-coarse:pl-6.5">
                    <summary className="cursor-pointer text-detail text-fg pointer-coarse:-my-3 pointer-coarse:py-3">
                      Saiba mais
                    </summary>
                    <p className="mt-1 text-detail text-fg-muted leading-relaxed">
                      Funciona em qualquer navegador, inclusive no iPhone, sem o navegador pedir
                      permissão. O que a página não deixa ler (imagem ou conteúdo de outro site) sai
                      em branco no print. Nada é capturado sem a pessoa marcar, e a captura não
                      esconde nada sozinha.
                    </p>
                  </details>
                </div>
              </Alcance>
            </SettingsGroup>

            {imagem && arquivo && (
              <SettingsGroup
                name={ACORDEAO}
                id={ID_DO_GRUPO.arquivo}
                title="Arquivos"
                value={resumoDoBotao(draft, imagem, arquivo)}
                changes={mudancasDoBotao(draft, imagem, arquivo)}
                onReset={() => setDraft(padraoDoBotao(draft))}
                {...acompanhar('arquivo')}
              >
                <Alcance ligado={draft.IsEnabled}>
                  <div id="anexo-arquivo" className="scroll-mt-6">
                    <Hint className="mt-0">
                      O que a pessoa escolhe no botão “Anexar arquivo” do formulário: a imagem abre
                      no editor, e os outros tipos o time baixa.
                    </Hint>

                    <Formatos
                      catalogo={draft.FileFormats ?? []}
                      imagemMarcada={imagem.IsEnabled}
                      marcados={formatosMarcados(arquivo)}
                      aoTrocar={trocarTiposDoBotao}
                    />
                  </div>
                </Alcance>
              </SettingsGroup>
            )}

            <SettingsGroup
              name={ACORDEAO}
              id={ID_DO_GRUPO.quando}
              title="Quando anexar"
              value={resumoDoQuando(draft)}
              changes={mudancasDoQuando(draft)}
              onReset={() => setDraft(padraoDoQuando(draft))}
              {...acompanhar('quando')}
            >
              <Alcance ligado={draft.IsEnabled}>
                {/* No toque cada linha ja tem 40 (`Opcao`), e o vao entre elas sai. */}
                <div className="flex flex-col gap-2.5 pointer-coarse:gap-0">
                  {/* O relato sempre aceita, enquanto o anexo estiver ligado: a caixa so
                      mostra que ele conta, como os outros dois. */}
                  <Opcao marcado desabilitado rotulo="No relato" />
                  <Opcao
                    id="anexo-na-resposta"
                    marcado={draft.AllowsOnInfoRequest}
                    rotulo="Ao responder o time"
                    aoTrocar={(AllowsOnInfoRequest) => setDraft({ ...draft, AllowsOnInfoRequest })}
                  />
                  {/* Chave propria, e nao a da resposta: atender ao pedido do time e dizer
                      que o problema voltou sao perguntas diferentes, e um projeto pode
                      querer uma e nao a outra. */}
                  <Opcao
                    id="anexo-na-reabertura"
                    marcado={draft.AllowsOnReopen}
                    rotulo="Ao reabrir"
                    aoTrocar={(AllowsOnReopen) => setDraft({ ...draft, AllowsOnReopen })}
                  />
                </div>
                <Hint>
                  Cada um é um envio separado, e vídeo não é mais aceito (os já recebidos continuam
                  nos relatos).
                </Hint>
              </Alcance>
            </SettingsGroup>
          </EditorWithPreview>
        </>
      )}
    </div>
  )
}

/** O que vai no lugar da contagem, ao lado do Publicar: por que ele nao grava agora. */
function motivo(semTipo: boolean): ReactNode {
  if (semTipo)
    return <span className="text-warn-fg">Aceite o print da tela ou um tipo de arquivo.</span>
  return undefined
}

/**
 * A chave geral, ao lado do titulo, na pilula de ligado e desligado — como a de O botão.
 * E a escolha que manda em todas as outras, e por isso nao mora num grupo.
 */
function ChaveGeral({
  ligado,
  desabilitado,
  aoTrocar,
}: {
  ligado: boolean
  desabilitado: boolean
  aoTrocar: (ligado: boolean) => void
}) {
  return (
    <label
      id="aceitar-anexo"
      className={cn(
        // No toque a pilula tem 40 de altura: com 30, era a menor chave da tela.
        'flex flex-none scroll-mt-6 items-center gap-2 rounded-full border px-3 py-1 font-medium text-detail pointer-coarse:min-h-10',
        ligado
          ? 'border-chip-green-border bg-chip-green-surface text-chip-green-fg'
          : 'border-warn-border bg-warn-surface text-warn-fg',
        desabilitado ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <input
        type="checkbox"
        checked={ligado}
        disabled={desabilitado}
        onChange={(evento) => aoTrocar(evento.target.checked)}
        className="size-3.5 flex-none accent-accent"
      />
      Aceitar anexos
    </label>
  )
}

/**
 * Uma linha embaixo do titulo, so quando ha o que dizer sobre a chave geral: desligada,
 * ligada sem nada aceito, ou sem armazenamento. Eram caixas de aviso a parte.
 */
function ResumoGeral({
  ligado,
  semArmazenamento,
  semTipo,
}: {
  ligado: boolean
  semArmazenamento: boolean
  semTipo: boolean
}) {
  let frase: string | null = null
  if (semArmazenamento) {
    frase =
      'Não há armazenamento configurado nesta instalação: nada aqui pode ser salvo, e a escolha do projeto volta a valer quando houver armazenamento.'
  } else if (!ligado) {
    frase = 'Desligado: o formulário não mostra anexo, e o servidor recusa qualquer envio.'
  } else if (semTipo) {
    frase = 'Ligado sem print nem tipo de arquivo aceito: assim não entra nada.'
  }
  if (!frase) return null

  return (
    <p role="status" className="-mt-3 mb-5 max-w-170 text-detail text-warn-fg leading-relaxed">
      {frase}
    </p>
  )
}

/**
 * O conteudo de um grupo, fora de alcance com o anexo desligado. Os campos continuam a
 * vista: esconde-los faria parecer que desligar apaga o que ja foi pensado.
 */
function Alcance({ ligado, children }: { ligado: boolean; children: ReactNode }) {
  return (
    <fieldset disabled={!ligado} className={ligado ? '' : 'opacity-50'}>
      {children}
    </fieldset>
  )
}

/** Compara o rascunho com o que esta salvo, inclusive os limites de cada tipo. */
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
        mesmosFormatos(tipo.Formats ?? [], outro.Formats ?? [])
      )
    })
  )
}

/**
 * Uma caixa de sim ou nao, com o nome ao lado. A dica de uma linha vem embaixo, de fora.
 * No toque a linha inteira tem 40 de altura: e ela que o dedo acerta, e nao a caixa.
 */
function Opcao({
  id,
  marcado,
  rotulo,
  desabilitado = false,
  aoTrocar,
}: {
  /** A ancora da caixa: a busca da configuracao leva ate ela. */
  id?: string
  marcado: boolean
  rotulo: string
  desabilitado?: boolean
  /** Sem ele, a caixa so mostra: o relato sempre aceita anexo. */
  aoTrocar?: (valor: boolean) => void
}) {
  return (
    <label
      id={id}
      className={cn(
        'flex scroll-mt-6 items-center gap-2 pointer-coarse:min-h-10',
        desabilitado ? 'cursor-not-allowed text-fg-disabled' : 'cursor-pointer text-fg',
      )}
    >
      <input
        type="checkbox"
        checked={marcado}
        disabled={desabilitado}
        onChange={(evento) => aoTrocar?.(evento.target.checked)}
        className="size-3.5 flex-none accent-accent"
      />
      <span className="text-body">{rotulo}</span>
    </label>
  )
}

/**
 * Os formatos de arquivo que o projeto aceita, para marcar.
 *
 * **O catalogo e fechado, e vem da API** — e ela que confere os bytes de cada um. Aqui
 * mora so o nome de cada formato em portugues, e as extensoes dele escritas junto, para
 * quem configura saber exatamente o que entra.
 *
 * **Marcados tambem com o arquivo desligado**: desligar nao apaga a escolha, e religar
 * devolve o que ja tinha sido pensado.
 */
function Formatos({
  catalogo,
  imagemMarcada,
  marcados,
  aoTrocar,
}: {
  catalogo: FileFormatViewModel[]
  imagemMarcada: boolean
  marcados: string[]
  aoTrocar: (imagemMarcada: boolean, marcados: string[]) => void
}) {
  const nenhum = !imagemMarcada && marcados.length === 0
  return (
    <fieldset className="mt-3">
      <legend className="mb-1.5 font-medium text-detail text-fg">Tipos de arquivo aceitos</legend>
      {/* No toque cada tipo ja tem 40 de altura (`Tipo`), e o vao entre as linhas sai. */}
      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 pointer-coarse:gap-y-0">
        <Tipo
          marcado={imagemMarcada}
          nome="Imagem"
          extensoes={EXTENSOES_DE_IMAGEM}
          aoTrocar={(marcado) => aoTrocar(marcado, marcados)}
        />
        {catalogo.map((formato) => (
          <Tipo
            key={formato.Key}
            marcado={marcados.includes(formato.Key)}
            nome={fileFormatLabel(formato.Key)}
            extensoes={formato.Extensions}
            aoTrocar={(marcado) =>
              aoTrocar(
                imagemMarcada,
                marcado
                  ? [...marcados, formato.Key]
                  : marcados.filter((atual) => atual !== formato.Key),
              )
            }
          />
        ))}
      </div>
      {nenhum ? (
        <p className="mt-2 text-detail text-fg-muted leading-relaxed">
          Sem nenhum tipo marcado, o formulário não mostra o botão de anexar.
        </p>
      ) : (
        // O zip nao esta no catalogo, e quem configura o procura: log costuma ir
        // compactado. A frase diz por que ele ficou fora, e o que a pessoa faz.
        <p className="mt-2 text-detail text-fg-muted leading-relaxed">
          Zip não é aceito: pode trazer qualquer coisa dentro, e quem relata envia sem compactar.
        </p>
      )}
    </fieldset>
  )
}

/** Um tipo da lista: a caixa, o nome e as extensoes. No toque, 40 de altura, centrado. */
function Tipo({
  marcado,
  nome,
  extensoes,
  aoTrocar,
}: {
  marcado: boolean
  nome: string
  extensoes: readonly string[]
  aoTrocar: (marcado: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 pointer-coarse:min-h-10 pointer-coarse:items-center">
      <input
        type="checkbox"
        checked={marcado}
        onChange={(evento) => aoTrocar(evento.target.checked)}
        className="mt-1 size-3.5 flex-none accent-accent pointer-coarse:mt-0"
      />
      <span className="min-w-0 text-detail leading-relaxed">
        <span className="text-fg">{nome}</span>{' '}
        <span className="text-fg-muted">{extensoes.join(' ')}</span>
      </span>
    </label>
  )
}
