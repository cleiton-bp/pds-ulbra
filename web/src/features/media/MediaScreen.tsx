import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import {
  type FileFormatViewModel,
  type MediaKind,
  type MediaKindLimitViewModel,
  type MediaSettingsViewModel,
  type PublicMediaSettingsViewModel,
  UPLOADABLE_MEDIA_KINDS,
} from '@/contracts'
import { describeError, projectMediaSettingsService, projectWidgetSettingsService } from '@/data'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import {
  bytesFromMegabytes,
  type LimitRange,
  limitHint,
  MB_DECIMALS,
  megabytesFromBytes,
  parseLimit,
} from '@/features/media/mediaLimits'
import { Button } from '@/shared/components/Button'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { NumberField } from '@/shared/components/NumberField'
import { PreviewSection } from '@/shared/components/PreviewSection'
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

/** Os tetos do sistema, iguais aos de `ProjectMediaKind` e `FileFormats` em C#. */
const TETO_QUANTIDADE = 10
const TETO_MB: Record<ShownKind['Kind'], number> = { Image: 10, File: 25 }

/** Os tipos de imagem que a API aceita, iguais aos de `MediaSignatures.cs` — so para a previa. */
const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/webp']

/** O nome de cada limite no "Mudou" do grupo, e o rotulo do campo para o leitor de tela. */
const NOME_DO_LIMITE: Record<
  ShownKind['Kind'],
  { quantos: string; tamanho: string; singular: string; plural: string }
> = {
  Image: {
    quantos: 'Quantas imagens',
    tamanho: 'Tamanho da imagem',
    singular: 'imagem',
    plural: 'imagens',
  },
  File: {
    quantos: 'Quantos arquivos',
    tamanho: 'Tamanho do arquivo',
    singular: 'arquivo',
    plural: 'arquivos',
  },
}

/** O nome do acordeao desta tela: abrir um grupo fecha o outro. Ver `SettingsGroup`. */
const ACORDEAO = 'anexos'

/** Os grupos, na ordem da tela. A ancora de cada um mora no `<summary>` dele. */
type Grupo = 'imagem' | 'arquivo' | 'quando'

const ID_DO_GRUPO: Record<Grupo, string> = {
  imagem: 'grupo-imagem',
  arquivo: 'grupo-arquivo',
  quando: 'quando-anexar',
}

/**
 * O `id` de cada campo numerico, que tambem e a chave dele em `invalidFields`.
 *
 * Mora num lugar so porque a tela precisa achar de volta, pela chave, qual limite do
 * rascunho aquele campo escreve — e em que grupo ele esta, para abrir e focar.
 */
const fieldId = {
  count: (kind: MediaKind) => `quantidade-${kind}`,
  size: (kind: MediaKind) => `tamanho-${kind}`,
}

/** Os campos numericos de cada grupo, na ordem da tela: o primeiro invalido recebe o foco. */
const CAMPOS_DO_GRUPO: Record<Grupo, readonly string[]> = {
  imagem: [fieldId.count('Image'), fieldId.size('Image')],
  arquivo: [fieldId.count('File'), fieldId.size('File')],
  quando: [],
}

const ORDEM_DOS_CAMPOS = Object.values(CAMPOS_DO_GRUPO).flat()

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

/** O que mudou do padrao no grupo de um tipo: aceitar, os limites e, no arquivo, os formatos. */
function mudancasDoTipo(draft: MediaSettingsViewModel, tipo: ShownKind): string[] {
  const padrao = MEDIA_DEFAULTS.Kinds[tipo.Kind]
  const nomes = NOME_DO_LIMITE[tipo.Kind]
  const mudou: string[] = []

  if (tipo.IsEnabled !== padrao.IsEnabled) {
    mudou.push(tipo.Kind === 'Image' ? 'Aceitar imagem' : 'Aceitar arquivo')
  }
  if (tipo.Kind === 'File' && !mesmosFormatos(tipo.Formats ?? [], formatosDeFabrica(draft))) {
    mudou.push('Formatos')
  }
  if (tipo.MaxCount !== padrao.MaxCount) mudou.push(nomes.quantos)
  if (tipo.MaxBytes !== padrao.MaxBytes) mudou.push(nomes.tamanho)
  if (tipo.Kind === 'Image' && draft.AllowsScreenCapture !== MEDIA_DEFAULTS.AllowsScreenCapture) {
    mudou.push('Captura da tela')
  }
  return mudou
}

/** O que mudou do padrao em Quando anexar: os dois lugares a mais, alem do relato. */
function mudancasDoQuando(draft: MediaSettingsViewModel): string[] {
  const mudou: string[] = []
  if (draft.AllowsOnInfoRequest !== MEDIA_DEFAULTS.AllowsOnInfoRequest) mudou.push('Ao responder')
  if (draft.AllowsOnReopen !== MEDIA_DEFAULTS.AllowsOnReopen) mudou.push('Ao reabrir')
  return mudou
}

/**
 * "Voltar ao padrão" de um tipo: so os campos do grupo dele, no rascunho. A captura vai
 * com a imagem, porque e la que ela mora; os formatos, com o arquivo.
 */
function padraoDoTipo(draft: MediaSettingsViewModel, kind: ShownKind['Kind']) {
  const padrao = MEDIA_DEFAULTS.Kinds[kind]
  return {
    ...draft,
    ...(kind === 'Image' && { AllowsScreenCapture: MEDIA_DEFAULTS.AllowsScreenCapture }),
    Kinds: draft.Kinds.map((tipo) =>
      tipo.Kind === kind
        ? {
            ...tipo,
            IsEnabled: padrao.IsEnabled,
            MaxCount: padrao.MaxCount,
            MaxBytes: padrao.MaxBytes,
            ...(kind === 'File' && { Formats: formatosDeFabrica(draft) }),
          }
        : tipo,
    ),
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

/** "5" ou "5,5": o MB do resumo em portugues, com as casas que o valor salvo tiver. */
function mbEmTexto(bytes: number): string {
  return String(megabytesFromBytes(bytes)).replace('.', ',')
}

/** "Aceita · até 3 de 5 MB · captura ligada", ou "Desligado". */
function resumoDaImagem(draft: MediaSettingsViewModel, imagem: ShownKind): string {
  if (!imagem.IsEnabled) return 'Desligado'
  const captura = draft.AllowsScreenCapture ? 'captura ligada' : 'captura desligada'
  return `Aceita · até ${imagem.MaxCount} de ${mbEmTexto(imagem.MaxBytes)} MB · ${captura}`
}

/**
 * "PDF, Texto e log · até 2 de 10 MB", ou "Desligado". Aceito sem formato e o aviso que
 * era uma caixa a parte: agora mora no resumo do grupo, onde a correcao esta.
 */
function resumoDoArquivo(draft: MediaSettingsViewModel, arquivo: ShownKind): ReactNode {
  if (!arquivo.IsEnabled) return 'Desligado'

  const marcados = arquivo.Formats ?? []
  // Na ordem do catalogo, e nao na de quem marcou: o resumo nao muda a cada clique.
  const nomes = (draft.FileFormats ?? [])
    .filter((formato) => marcados.includes(formato.Key))
    .map((formato) => fileFormatLabel(formato.Key))

  if (nomes.length === 0) {
    return <span className="text-warn-fg">Aceito sem formato: nada entra</span>
  }

  const lista =
    nomes.length > 3
      ? `${nomes.slice(0, 3).join(', ')} e mais ${nomes.length - 3}`
      : nomes.join(', ')
  return `${lista} · até ${arquivo.MaxCount} de ${mbEmTexto(arquivo.MaxBytes)} MB`
}

/** "No relato · ao responder · ao reabrir": o relato sempre, os outros se ligados. */
function resumoDoQuando(draft: MediaSettingsViewModel): string {
  return [
    'No relato',
    draft.AllowsOnInfoRequest && 'ao responder',
    draft.AllowsOnReopen && 'ao reabrir',
  ]
    .filter(Boolean)
    .join(' · ')
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

  const kinds = draft.Kinds.filter(isShownKind)
    .filter((tipo) => tipo.IsEnabled)
    .map((tipo) => ({
      Kind: tipo.Kind,
      MaxCount: tipo.MaxCount,
      MaxBytes: tipo.MaxBytes,
      ContentTypes: tipo.Kind === 'Image' ? TIPOS_DE_IMAGEM : [],
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
 * Leva ao campo com texto que nao serve: abre o grupo em volta (o vizinho fecha, pelo
 * `name` do acordeao) e poe o foco nele. O campo dentro de um grupo fechado nao tem lugar
 * na tela, e o foco nao chegaria.
 */
function irAoCampo(id: string) {
  const campo = document.getElementById(id)
  if (!(campo instanceof HTMLInputElement)) return

  const grupo = campo.closest('details')
  if (grupo && !grupo.open) grupo.open = true
  campo.focus()
}

/**
 * O que este projeto aceita receber junto do relato.
 *
 * **Esta tela vem antes da ferramenta saber anexar, e nao depois.** E ela que diz o que
 * existe: desligado o anexo (a chave ao lado do titulo), a ferramenta nao mostra nada de
 * midia e o servidor recusa assinar qualquer envio.
 *
 * **Tres grupos, um por pergunta**: Imagem (aceitar, quantas e de que tamanho, a captura
 * dentro dela), Arquivo (aceitar, os formatos, quantos e de que tamanho) e Quando anexar.
 * Cada grupo, fechado, diz em palavras o que esta escolhido e o que mudou do padrao, com
 * o proprio "Voltar ao padrão" (`SettingsGroup`); a previa, presa a direita, contorna a
 * area de anexar enquanto um grupo esta aberto ou em foco (`EditorWithPreview`).
 *
 * **Os limites aparecem por tipo, porque e assim que eles sao guardados** — uma linha por
 * tipo, e nao uma coluna por tipo. E o desenho que faz acrescentar audio um dia ser dado,
 * e nao migracao. Hoje sao imagem e arquivo, cada um com a sua quantidade e o seu tamanho
 * por envio — nao ha total.
 *
 * **Cada numero desta tela e uma conta que alguem paga.** E a primeira parte do produto
 * que custa dinheiro por byte guardado, e por isso o limite fica na mesma linha da
 * escolha, e nao num "Mais opções" que ninguem abre.
 *
 * **Campo invalido em grupo fechado nao se perde**: o resumo do grupo diz "corrigir", e
 * abrir o grupo ou clicar em Publicar leva o foco ate ele — o Publicar nao grava enquanto
 * houver o que corrigir.
 *
 * **Sem armazenamento configurado, a tela so mostra, e diz por que.** A API responde o
 * anexo desligado, porque a ferramenta nao o oferece, e recusa salvar: gravar esse
 * desligado apagaria a escolha do projeto, que precisa passar a valer quando houver
 * armazenamento.
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

  // A configuracao da ferramenta, so para a previa mostrar o formulario de verdade em
  // volta dos anexos. Falhando, a previa usa a de fabrica: e ilustracao, nao vale erro.
  const { data: ferramenta } = useAsyncResource(
    useCallback(
      () => projectWidgetSettingsService.getWidgetSettings(project.PublicId),
      [project.PublicId],
    ),
  )

  const [draft, setDraft] = useState<MediaSettingsViewModel | null>(null)
  const [published, setPublished] = useState<MediaSettingsViewModel | null>(null)
  const [saving, setSaving] = useState(false)

  /**
   * Os campos numericos com texto que nao serve.
   *
   * O rascunho fica com o ultimo numero valido, e e por isso que precisa desta lista: sem
   * ela, o Publicar mandaria um numero diferente do que esta escrito.
   */
  const [invalidFields, setInvalidFields] = useState<ReadonlySet<string>>(() => new Set())

  /**
   * Quantas vezes cada tipo voltou ao padrao. Vira a `key` dos campos dele: o campo com
   * texto que nao serve guarda o texto, e voltar ao padrao precisa trocar o texto tambem —
   * mesmo quando o numero do rascunho ja era o de fabrica.
   */
  const [voltas, setVoltas] = useState<Record<ShownKind['Kind'], number>>({ Image: 0, File: 0 })

  /** O grupo aberto e o grupo em que a pessoa esta: qualquer um realca os anexos na previa. */
  const [aberto, setAberto] = useState<Grupo | null>(null)
  const [emFoco, setEmFoco] = useState<Grupo | null>(null)

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

  // Um objeto novo so quando o rascunho muda: passar o mouse nos grupos troca o realce, e
  // nao deve mandar os anexos ao quadro de novo por nada.
  const naPrevia = useMemo(() => (draft ? anexosDaPrevia(draft) : null), [draft])

  const dirty = draft !== null && published !== null && !igual(draft, published)

  const shownKinds = draft?.Kinds.filter(isShownKind) ?? []
  const imagem = shownKinds.find((tipo) => tipo.Kind === 'Image')
  const arquivo = shownKinds.find((tipo) => tipo.Kind === 'File')

  /**
   * Ligado e sem tipo aceito nao aceita nada.
   *
   * A tela **nao** liga a imagem sozinha: quem quer isso ja tem o caminho certo, que e
   * desligar o anexo — e aceitar por quem configura seria decidir uma conta no lugar dele.
   *
   * **Conta so o que a tela mostra.** O video que a API ainda liste ligado, na janela da
   * troca, nao e tipo aceito: conta-lo esconderia este aviso de um projeto que nao recebe
   * arquivo nenhum.
   */
  const semTipo = draft?.IsEnabled === true && shownKinds.every((tipo) => !tipo.IsEnabled)

  /**
   * Arquivo aceito sem formato marcado nao aceita nada — e a API recusa salvar assim. A
   * tela nao marca por quem configura, pelo mesmo motivo da imagem.
   */
  const semFormato =
    draft?.IsEnabled === true && arquivo?.IsEnabled === true && (arquivo.Formats ?? []).length === 0

  const noStorage = draft !== null && !draft.IsStorageAvailable
  const invalidCount = invalidFields.size

  // Campo invalido nao trava o Publicar: clicar leva ao campo (`salvar`). O resto trava,
  // porque nao ha campo para onde levar.
  const impedido = semTipo || semFormato || noStorage

  function toggleAttachments(enabled: boolean) {
    if (!draft) return

    const next = { ...draft, IsEnabled: enabled }

    // Desligado, os campos saem de alcance. O que tinha texto que nao serve volta ao
    // valor salvo, e nao ao ultimo numero valido do rascunho: esse pode ser so uma tecla
    // no caminho, como o "1" de quem apagou o "3" para digitar "12".
    setDraft(enabled || !published ? next : restoreInvalid(next, published, invalidFields))
  }

  function trocarTipo(kind: MediaKind, mudanca: Partial<MediaKindLimitViewModel>) {
    if (!draft) return

    setDraft({
      ...draft,
      Kinds: draft.Kinds.map((atual) => (atual.Kind === kind ? { ...atual, ...mudanca } : atual)),
    })
  }

  function voltarTipoAoPadrao(kind: ShownKind['Kind']) {
    if (!draft) return
    setDraft(padraoDoTipo(draft, kind))
    setVoltas((atual) => ({ ...atual, [kind]: atual[kind] + 1 }))
  }

  async function salvar() {
    if (!draft || saving) return

    // Com o que corrigir, o Publicar leva ate o campo, e nao grava: iria para a API um
    // numero que nao esta na tela.
    const primeiroInvalido = ORDEM_DOS_CAMPOS.find((campo) => invalidFields.has(campo))
    if (primeiroInvalido) {
      irAoCampo(primeiroInvalido)
      return
    }
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
        // So o que a tela mostra. Tipo que nao vai fica como esta do lado de la.
        Kinds: draft.Kinds.filter(isShownKind),
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

  /** Liga o grupo a previa e, ao abrir, leva o foco ao campo que precisa de correcao. */
  function acompanhar(grupo: Grupo) {
    return {
      onToggle: (abriu: boolean) => {
        setAberto((atual) => (abriu ? grupo : atual === grupo ? null : atual))
        const invalido = CAMPOS_DO_GRUPO[grupo].find((campo) => invalidFields.has(campo))
        if (abriu && invalido) irAoCampo(invalido)
      },
      onFocusWithin: (dentro: boolean) =>
        setEmFoco((atual) => (dentro ? grupo : atual === grupo ? null : atual)),
    }
  }

  /** O resumo do grupo, com "corrigir" na frente quando ha campo com texto que nao serve. */
  function resumo(grupo: Grupo, valor: ReactNode): ReactNode {
    const corrigir = CAMPOS_DO_GRUPO[grupo].some((campo) => invalidFields.has(campo))
    if (!corrigir) return valor
    return (
      <>
        <span className="font-medium text-error-fg">corrigir</span> · {valor}
      </>
    )
  }

  const realce = (emFoco ?? aberto) !== null ? 'form-attachments' : null

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
        dirty={dirty || invalidCount > 0}
        saving={saving}
        canSave={!impedido}
        onSave={() => void salvar()}
        // O campo com texto que nao serve continua dizendo isso depois de descartar: o
        // texto mora nele, e o aviso fica ate ele ser corrigido.
        onDiscard={() => setDraft(published)}
        publishes
        note={motivo({ invalidCount, semTipo, semFormato })}
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
            preview={
              <PreviewSection
                settings={ferramenta ?? DEFAULT_WIDGET_SETTINGS}
                media={naPrevia}
                dirty={dirty}
                startOpen
                highlight={realce}
                hint="O formulário com a área de anexar como está aqui. A parte que você está mudando aparece contornada."
              />
            }
          >
            {imagem && (
              <SettingsGroup
                name={ACORDEAO}
                id={ID_DO_GRUPO.imagem}
                title="Imagem"
                value={resumo('imagem', resumoDaImagem(draft, imagem))}
                changes={mudancasDoTipo(draft, imagem)}
                onReset={() => voltarTipoAoPadrao('Image')}
                defaultOpen
                {...acompanhar('imagem')}
              >
                <Alcance ligado={draft.IsEnabled}>
                  <Opcao
                    id="anexo-imagem"
                    marcado={imagem.IsEnabled}
                    rotulo="Aceitar imagem"
                    aoTrocar={(IsEnabled) => trocarTipo('Image', { IsEnabled })}
                  />
                  <Hint className="mt-1 pl-5.5">Print, foto, recorte da tela.</Hint>

                  {/* `#mais-opcoes` era o "Mais opções", que comecava pelos limites da
                      imagem: o endereco antigo cai aqui. */}
                  <div id="mais-opcoes" className="mt-4 scroll-mt-6">
                    <LimitesDoTipo
                      key={voltas.Image}
                      limite={imagem}
                      disabled={!draft.IsEnabled}
                      invalidFields={invalidFields}
                      aoTrocar={(mudanca) => trocarTipo('Image', mudanca)}
                      onValidityChange={trackField}
                    />
                  </div>

                  {/* Dentro da imagem, e desligada sem ela: a captura vira imagem, e sem
                      imagem aceita ela nao tem para onde ir. */}
                  <div className="mt-4 border-border border-t pt-4 pl-5.5">
                    <Opcao
                      id="capturar-tela"
                      marcado={draft.AllowsScreenCapture}
                      desabilitado={!imagem.IsEnabled}
                      rotulo="Deixar capturar a tela"
                      aoTrocar={(AllowsScreenCapture) =>
                        setDraft({ ...draft, AllowsScreenCapture })
                      }
                    />
                    <Hint className="mt-1 pl-5.5">
                      {imagem.IsEnabled
                        ? 'A pessoa marca uma área da página, e ela vira imagem com editor para cobrir o que não quer mostrar.'
                        : 'Só com imagem aceita: a captura vira imagem.'}
                    </Hint>
                    <details className="mt-1 pl-5.5">
                      <summary className="cursor-pointer text-detail text-fg">Saiba mais</summary>
                      <p className="mt-1 text-detail text-fg-muted leading-relaxed">
                        Funciona em qualquer navegador, inclusive no iPhone, sem o navegador pedir
                        permissão. O que a página não deixa ler — imagem ou conteúdo de outro site —
                        sai em branco no print. Nada é capturado sem a pessoa marcar, e a captura
                        não esconde nada sozinha.
                      </p>
                    </details>
                  </div>
                </Alcance>
              </SettingsGroup>
            )}

            {arquivo && (
              <SettingsGroup
                name={ACORDEAO}
                id={ID_DO_GRUPO.arquivo}
                title="Arquivo"
                value={resumo('arquivo', resumoDoArquivo(draft, arquivo))}
                changes={mudancasDoTipo(draft, arquivo)}
                onReset={() => voltarTipoAoPadrao('File')}
                {...acompanhar('arquivo')}
              >
                <Alcance ligado={draft.IsEnabled}>
                  <div id="anexo-arquivo" className="scroll-mt-6">
                    <Opcao
                      marcado={arquivo.IsEnabled}
                      rotulo="Aceitar arquivo"
                      aoTrocar={(IsEnabled) => trocarTipo('File', { IsEnabled })}
                    />
                    <Hint className="mt-1 pl-5.5">
                      O PDF, o log, a planilha. O time sempre baixa, nunca abre na página.
                    </Hint>

                    <Formatos
                      catalogo={draft.FileFormats ?? []}
                      marcados={arquivo.Formats ?? []}
                      semFormato={semFormato}
                      aoTrocar={(Formats) => trocarTipo('File', { Formats })}
                    />
                  </div>

                  <div className="mt-4">
                    <LimitesDoTipo
                      key={voltas.File}
                      limite={arquivo}
                      disabled={!draft.IsEnabled}
                      invalidFields={invalidFields}
                      aoTrocar={(mudanca) => trocarTipo('File', mudanca)}
                      onValidityChange={trackField}
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
                <div className="flex flex-col gap-2.5">
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
                  Cada um é um envio, com os próprios limites. Vídeo não é mais aceito; os já
                  recebidos continuam nos relatos.
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
function motivo({
  invalidCount,
  semTipo,
  semFormato,
}: {
  invalidCount: number
  semTipo: boolean
  semFormato: boolean
}): ReactNode {
  if (invalidCount > 0) {
    return (
      <span className="text-error-fg">
        {invalidCount === 1 ? 'Há um campo a corrigir.' : `Há ${invalidCount} campos a corrigir.`}
      </span>
    )
  }
  if (semTipo) return <span className="text-warn-fg">Aceite imagem ou arquivo.</span>
  if (semFormato) return <span className="text-warn-fg">Marque um formato de arquivo.</span>
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
        'flex flex-none scroll-mt-6 items-center gap-2 rounded-full border px-3 py-1 font-medium text-detail',
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
    frase = 'Ligado sem imagem nem arquivo aceito: assim não entra nada.'
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
 * O rascunho com o valor salvo de volta em cada campo com texto que nao serve.
 *
 * Campo invalido nao escreve no rascunho, que fica com o ultimo numero valido — e esse
 * numero pode ser so uma tecla no caminho. O salvo foi escolhido por alguem.
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

/** Uma caixa de sim ou nao, com o nome ao lado. A dica de uma linha vem embaixo, de fora. */
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
        'flex scroll-mt-6 items-center gap-2',
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
 * Quantos e de que tamanho, de um tipo, numa frase so: "Até [3] imagens de [5] MB cada".
 * **Os campos ficam a vista e editaveis mesmo com o tipo desligado**, e isso e
 * deliberado: desligar nao apaga os limites, e esconde-los faria parecer que apaga.
 *
 * A linha de baixo e uma so: diz o que e um envio e quem cobra o limite, e da lugar ao
 * erro do campo quando ha um — como no `TextField`, para a tela nao pular de altura.
 */
function LimitesDoTipo({
  limite,
  disabled,
  invalidFields,
  aoTrocar,
  onValidityChange,
}: {
  limite: ShownKind
  /** O anexo esta desligado, e os campos ficam fora de alcance. */
  disabled: boolean
  invalidFields: ReadonlySet<string>
  aoTrocar: (mudanca: Partial<MediaKindLimitViewModel>) => void
  onValidityChange: (field: string, valid: boolean) => void
}) {
  const nomes = NOME_DO_LIMITE[limite.Kind]
  const quantos: LimitRange = { min: 1, max: TETO_QUANTIDADE, decimals: 0 }
  const tamanho: LimitRange = { min: 1, max: TETO_MB[limite.Kind], decimals: MB_DECIMALS }
  const mensagem = `limites-${limite.Kind}-mensagem`
  const teto =
    tamanho.max === quantos.max
      ? `máximo ${quantos.max}`
      : `máximo ${quantos.max} de ${tamanho.max} MB`

  const erros = [
    invalidFields.has(fieldId.count(limite.Kind)) && limitHint(quantos),
    invalidFields.has(fieldId.size(limite.Kind)) && limitHint(tamanho),
  ].filter(Boolean)

  return (
    <div
      id={limite.Kind === 'Image' ? 'limites-imagem' : 'limites-arquivo'}
      className="scroll-mt-6"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-body text-fg">
        <span>Até</span>
        <Numero
          id={fieldId.count(limite.Kind)}
          rotulo={`${nomes.quantos} por envio`}
          valor={limite.MaxCount}
          range={quantos}
          disabled={disabled}
          descricao={mensagem}
          aoTrocar={(valor) => aoTrocar({ MaxCount: valor })}
          onValidityChange={onValidityChange}
        />
        <span>{limite.MaxCount === 1 ? nomes.singular : nomes.plural} de</span>
        <Numero
          id={fieldId.size(limite.Kind)}
          rotulo={`${nomes.tamanho}, em MB`}
          valor={megabytesFromBytes(limite.MaxBytes)}
          range={tamanho}
          disabled={disabled}
          descricao={mensagem}
          // O banco guarda bytes, e quem configura pensa em MB. A conversao mora aqui, na
          // borda: mandar MB para a API faria a unidade virar convencao combinada entre
          // dois lados, e e assim que um dos dois esquece.
          aoTrocar={(valor) => aoTrocar({ MaxBytes: bytesFromMegabytes(valor) })}
          onValidityChange={onValidityChange}
        />
        <span>MB cada</span>
        <span className="text-detail text-fg-muted">({teto})</span>
      </div>
      <p
        id={mensagem}
        className={cn(
          'mt-1.5 text-detail leading-relaxed',
          erros.length > 0 ? 'text-error-fg' : 'text-fg-muted',
        )}
      >
        {erros.length > 0 ? erros.join(' ') : 'Por envio; o armazenamento recusa o que passar.'}
      </p>
    </div>
  )
}

/**
 * Os formatos de arquivo que o projeto aceita, para marcar.
 *
 * **O catalogo e fechado, e vem da API** — e ela que confere os bytes de cada um. Aqui
 * mora so o nome de cada formato em portugues, e as extensoes dele escritas junto, para
 * quem configura saber exatamente o que entra.
 *
 * **Marcados tambem com o arquivo desligado**, como os limites: desligar nao apaga a
 * escolha, e religar devolve o que ja tinha sido pensado.
 */
function Formatos({
  catalogo,
  marcados,
  semFormato,
  aoTrocar,
}: {
  catalogo: FileFormatViewModel[]
  marcados: string[]
  /** Arquivo aceito sem formato: a dica de baixo vira o aviso. */
  semFormato: boolean
  aoTrocar: (marcados: string[]) => void
}) {
  return (
    <fieldset className="mt-3 pl-5.5">
      <legend className="mb-1.5 font-medium text-detail text-fg">Formatos aceitos</legend>
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
              className="mt-1 size-3.5 flex-none accent-accent"
            />
            <span className="min-w-0 text-detail leading-relaxed">
              <span className="text-fg">{fileFormatLabel(formato.Key)}</span>{' '}
              <span className="text-fg-muted">{formato.Extensions.join(' ')}</span>
            </span>
          </label>
        ))}
      </div>
      {semFormato ? (
        <p className="mt-2 text-detail text-warn-fg leading-relaxed">
          Marque ao menos um formato, ou deixe de aceitar arquivo.
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

/**
 * Um limite numerico, no meio da frase. O nome vai so para o leitor de tela: quem ve le a
 * frase em volta.
 *
 * **O texto mora aqui, e o rascunho so recebe numero que serve.** Campo apagado fica
 * apagado e avisa, em vez de pular para o minimo; numero fora da faixa ou com casa decimal
 * demais tambem avisa, e o Publicar leva ate ele em vez de gravar.
 *
 * **Campo fora de alcance nao fica invalido.** Desligado o anexo, ninguem mais consegue
 * corrigi-lo, e o Publicar ficaria preso por um erro sem saida. A tela devolve ao
 * rascunho o valor salvo (`restoreInvalid`), e o texto passa a dizer o numero que o
 * rascunho guarda.
 */
function Numero({
  id,
  rotulo,
  valor,
  range,
  disabled,
  descricao,
  aoTrocar,
  onValidityChange,
}: {
  id: string
  /** O nome do campo para o leitor de tela. */
  rotulo: string
  valor: number
  range: LimitRange
  /** Fora de alcance: o `fieldset` em volta esta desabilitado. */
  disabled: boolean
  /** O `id` da linha que diz a regra, ou o erro. */
  descricao: string
  aoTrocar: (valor: number) => void
  onValidityChange: (field: string, valid: boolean) => void
}) {
  const [text, setText] = useState(() => String(valor))
  const [invalid, setInvalid] = useState(false)
  const [lastValue, setLastValue] = useState(valor)

  // A tela so sabe se pode publicar pelo que cada campo conta aqui. Campo que sai da
  // tela, como ao trocar de projeto, conta como valido: senao o Publicar ficaria preso
  // por um erro que ninguem mais ve.
  useEffect(() => {
    onValidityChange(id, !invalid)
    return () => onValidityChange(id, true)
  }, [id, invalid, onValidityChange])

  // O valor tambem muda por fora, quando o servidor devolve o que gravou. O texto
  // acompanha, a menos que ja diga o mesmo numero — "5.0" nao vira "5" enquanto a pessoa
  // digita.
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

  return (
    <>
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <NumberField
        id={id}
        size="sm"
        width="w-10"
        min={range.min}
        max={range.max}
        // Com casa decimal, qualquer valor da faixa serve; com passo fixo o navegador
        // marcaria 5.3 como invalido, e a tela aceita.
        step={range.decimals === 0 ? 1 : 'any'}
        value={text}
        invalid={invalid}
        ariaDescribedBy={descricao}
        onChange={(typed) => {
          const parsed = parseLimit(typed, range)

          setText(typed)
          setInvalid(parsed === null)

          if (parsed !== null) aoTrocar(parsed)
        }}
        className="scroll-mt-6"
      />
    </>
  )
}
