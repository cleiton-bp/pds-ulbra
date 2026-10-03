import { useCallback, useState } from 'react'
import {
  MAX_COMMENT_LENGTH,
  type PanelAttachmentViewModel,
  type ReportCommentsViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { AVISO_DE_ARQUIVO, toPanelGalleryItem } from '@/features/reports/ReportAttachments'
import { AttachmentGallery } from '@/shared/components/AttachmentGallery'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { type AsyncResource, useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'

/** A conversa de um relato, e as falas publicas que ela pos na tela. */
export interface ReportConversation extends AsyncResource<ReportCommentsViewModel> {
  /**
   * As falas publicas que a conversa mostra, pelo identificador. **Nula enquanto
   * carrega; vazia se falhou.** E o que os arquivos de uma resposta consultam para
   * saber se a fala deles esta na tela.
   */
  falas: ReadonlySet<string> | null
}

/**
 * A conversa do relato, lida uma vez para o dialogo inteiro.
 *
 * **Mora fora da caixa de comentarios, e e por causa dos arquivos.** O arquivo de uma
 * resposta vai embaixo da fala que o trouxe — e, quando ela nao esta na tela, embaixo
 * do relato, em vez de sumir: a conversa que nao carregou, a resposta que chegou
 * depois de o dialogo abrir. Para isso quem monta o dialogo precisa saber quais falas
 * a caixa mostra, e a leitura sobe para ele. Ver `useReportAttachments`.
 */
export function useReportComments(
  projectPublicId: string,
  reportPublicId: string,
): ReportConversation {
  const leitura = useAsyncResource(
    useCallback(
      () => projectReportService.listComments(projectPublicId, reportPublicId),
      [projectPublicId, reportPublicId],
    ),
  )

  const falas = leitura.data
    ? new Set(leitura.data.Public.map((fala) => fala.PublicId))
    : leitura.failed
      ? new Set<string>()
      : null

  return { ...leitura, falas }
}

/**
 * Os dois comentarios de um relato.
 *
 * **A diferenca precisa ser obvia, e o destaque vai no que sai.** O erro caro nao
 * e escrever no lugar errado por engano de clique: e escrever um pensamento
 * interno — "isso e culpa do fornecedor", "nao vamos consertar" — dentro da caixa
 * que a pessoa que relatou vai ler. Por isso e a caixa **publica** que tem moldura
 * de atencao, e nao a interna: o aviso fica onde o estrago acontece.
 *
 * **Sao dois campos e dois botoes, nunca um com um seletor.** Um seletor de
 * visibilidade seria o sinalizador que as duas tabelas da API existem para evitar,
 * de volta pela porta da tela: bastaria ele estar no valor errado no momento do
 * envio.
 *
 * **E a tela diz onde a pessoa le.** Quem escreve na caixa publica precisa saber que
 * aquilo sai da empresa: a pessoa le na pagina de acompanhamento, junto das proprias
 * respostas.
 */
export function ReportComments({
  projectPublicId,
  reportPublicId,
  conversa,
  aoComentar,
  anexosPorFala = new Map(),
  aoExpirar = () => {},
  paraQuemRelatou = 'escrever',
}: {
  projectPublicId: string
  reportPublicId: string
  /**
   * O que fazer com a caixa de quem relatou. **O card do time nao tem ninguem do
   * lado de fora**, e a caixa nem aparece; no relato arquivado ela fica para ler, e
   * escrever pede desarquivar.
   */
  paraQuemRelatou?: 'escrever' | 'ler' | 'nenhum'
  /** A leitura da conversa, feita por quem monta o dialogo — ver `useReportComments`. */
  conversa: ReportConversation
  /** Avisa quem monta a tela de que o historico mudou. */
  aoComentar: () => void
  /** Os arquivos que vieram numa resposta, pela fala que os trouxe. */
  anexosPorFala?: Map<string, PanelAttachmentViewModel[]>
  /** Um endereco de arquivo venceu: quem monta a tela rele. */
  aoExpirar?: () => void
}) {
  const { data: comentarios, loading, failed, reload } = conversa

  const [local, setLocal] = useState<ReportCommentsViewModel | null>(null)
  const atual = local ?? comentarios

  return (
    <section className="border-border border-t pt-4">
      {failed && (
        <div className="mb-3">
          <p className="mb-2.5 text-detail text-fg-muted leading-relaxed">
            Não deu para carregar os comentários. Nada se perdeu: a falha foi ao consultar.
          </p>
          <Button size="sm" onClick={reload}>
            Tentar de novo
          </Button>
        </div>
      )}

      {loading && <Skeleton className="mb-3 h-3 w-2/3" />}

      <Caixa
        titulo="Entre o time"
        explicacao="Só quem tem acesso a este painel lê. Não sai daqui."
        destaque={false}
        comentarios={atual?.Internal ?? []}
        aoEnviar={async (body) => {
          const salvo = await projectReportService.addInternalComment(
            projectPublicId,
            reportPublicId,
            { Body: body },
          )
          setLocal((antes) => {
            const base = antes ?? comentarios
            return base ? { ...base, Internal: [...base.Internal, salvo] } : base
          })
          aoComentar()
        }}
      />

      {paraQuemRelatou !== 'nenhum' && (
        <Caixa
          titulo="Para quem relatou"
          explicacao={
            paraQuemRelatou === 'ler'
              ? 'O relato está arquivado. Para escrever a quem relatou, desarquive antes.'
              : 'Escrito para a pessoa que abriu o relato. Ela lê na página de acompanhamento, junto das próprias respostas.'
          }
          destaque
          podeEscrever={paraQuemRelatou === 'escrever'}
          comentarios={atual?.Public ?? []}
          // **So a caixa publica recebe arquivo.** A interna nem tem por onde: arquivo
          // so vem numa resposta de quem relatou, e quem relatou nao escreve no
          // interno. E a estrutura que garante, e nao um filtro que alguem esqueca.
          anexosPorFala={anexosPorFala}
          aoExpirar={aoExpirar}
          aoEnviar={async (body) => {
            const salvo = await projectReportService.addPublicComment(
              projectPublicId,
              reportPublicId,
              { Body: body },
            )
            setLocal((antes) => {
              const base = antes ?? comentarios
              return base ? { ...base, Public: [...base.Public, salvo] } : base
            })
            aoComentar()
          }}
        />
      )}
    </section>
  )
}

interface Comentario {
  PublicId: string
  AuthorName: string | null
  Body: string
  CreatedAt: string
  /**
   * So o comentario publico tem este campo, e so ele pode ser verdadeiro: quem
   * relatou nao escreve no interno, e nunca vai escrever.
   */
  FromReporter?: boolean
}

/**
 * Uma das duas caixas. Recebe a lista e o que fazer ao enviar — e **nao** recebe
 * um tipo: quem decide qual e qual e quem a monta, uma vez, no arquivo acima.
 */
function Caixa({
  titulo,
  explicacao,
  destaque,
  podeEscrever = true,
  comentarios,
  aoEnviar,
  anexosPorFala,
  aoExpirar = () => {},
}: {
  titulo: string
  explicacao: string
  destaque: boolean
  /** Falso deixa so a leitura: a conversa continua na tela, e o campo sai. */
  podeEscrever?: boolean
  comentarios: Comentario[]
  aoEnviar: (body: string) => Promise<void>
  anexosPorFala?: Map<string, PanelAttachmentViewModel[]>
  aoExpirar?: () => void
}) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar() {
    const body = texto.trim()
    if (body.length === 0 || enviando) return

    setEnviando(true)
    setErro(null)

    try {
      await aoEnviar(body)
      setTexto('')
    } catch (failure) {
      setErro(describeError(failure))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      className={`mb-4 rounded-xl border p-3.5 ${
        destaque ? 'border-warn-border bg-warn-surface' : 'border-border bg-surface'
      }`}
    >
      <h3 className={`mb-0.5 font-medium text-detail ${destaque ? 'text-warn-fg' : 'text-fg'}`}>
        {titulo}
      </h3>
      <p
        className={`mb-3 text-caption leading-normal ${destaque ? 'text-warn-fg' : 'text-fg-muted'}`}
      >
        {explicacao}
      </p>

      {comentarios.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2.5">
          {comentarios.map((comentario) => (
            <li key={comentario.PublicId}>
              <div className="mb-0.5 flex items-baseline gap-2 text-caption text-fg-muted">
                {/* **Três casos, e não dois.** Quem relatou é a pessoa de fora
                    respondendo; nome vazio é alguém do time cuja conta foi
                    esvaziada. Mostrar os dois igual poria palavra de um na boca
                    do outro — e aqui a diferença decide quem responde a quem. */}
                <span className={cn('font-medium', comentario.FromReporter && 'text-fg')}>
                  {comentario.FromReporter
                    ? 'Quem relatou'
                    : comentario.AuthorName || 'Alguém do time'}
                </span>
                <time dateTime={comentario.CreatedAt} title={formatDateTime(comentario.CreatedAt)}>
                  {formatRelative(comentario.CreatedAt)}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-detail text-fg leading-relaxed">
                {comentario.Body}
              </p>
              {(anexosPorFala?.get(comentario.PublicId)?.length ?? 0) > 0 && (
                <div className="mt-2">
                  <AttachmentGallery
                    label="Imagens da resposta"
                    fileLabel="Arquivos da resposta"
                    fileNote={AVISO_DE_ARQUIVO}
                    onExpired={aoExpirar}
                    items={(anexosPorFala?.get(comentario.PublicId) ?? []).map(toPanelGalleryItem)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEscrever && (
        <>
          <textarea
            aria-label={titulo}
            value={texto}
            onChange={(event) => {
              setTexto(event.target.value)
              if (erro) setErro(null)
            }}
            maxLength={MAX_COMMENT_LENGTH}
            disabled={enviando}
            rows={2}
            className="mb-2 block w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-detail text-fg leading-relaxed"
          />

          {erro && <p className="mb-2 text-caption text-error-fg">{erro}</p>}

          <Button size="sm" disabled={texto.trim().length === 0 || enviando} onClick={enviar}>
            {destaque ? 'Escrever para quem relatou' : 'Comentar entre o time'}
          </Button>
        </>
      )}
    </div>
  )
}
