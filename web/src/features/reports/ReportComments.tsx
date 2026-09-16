import { useCallback, useState } from 'react'
import { MAX_COMMENT_LENGTH, type ReportCommentsViewModel } from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatDateTime, formatRelative } from '@/shared/lib/datetime'

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
 * **E a tela diz que o publico ainda nao tem leitor.** Prometer que a pessoa esta
 * lendo, quando a pagina que mostraria isso ainda nao existe, seria pior do que
 * nao ter o campo.
 */
export function ReportComments({
  projectPublicId,
  reportPublicId,
  aoComentar,
}: {
  projectPublicId: string
  reportPublicId: string
  /** Avisa quem monta a tela de que o historico mudou. */
  aoComentar: () => void
}) {
  const {
    data: comentarios,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(
      () => projectReportService.listComments(projectPublicId, reportPublicId),
      [projectPublicId, reportPublicId],
    ),
  )

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

      <Caixa
        titulo="Para quem relatou"
        explicacao="Escrito para a pessoa que abriu o relato. Ela ainda não tem onde ler — a página de acompanhamento mostra isto quando essa parte existir."
        destaque
        comentarios={atual?.Public ?? []}
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
    </section>
  )
}

interface Comentario {
  PublicId: string
  AuthorName: string
  Body: string
  CreatedAt: string
}

/**
 * Uma das duas caixas. Recebe a lista e o que fazer ao enviar — e **nao** recebe
 * um tipo: quem decide qual e qual e quem a monta, uma vez, no arquivo acima.
 */
function Caixa({
  titulo,
  explicacao,
  destaque,
  comentarios,
  aoEnviar,
}: {
  titulo: string
  explicacao: string
  destaque: boolean
  comentarios: Comentario[]
  aoEnviar: (body: string) => Promise<void>
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
                <span className="font-medium">{comentario.AuthorName || 'Alguém do time'}</span>
                <time dateTime={comentario.CreatedAt} title={formatDateTime(comentario.CreatedAt)}>
                  {formatRelative(comentario.CreatedAt)}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-detail text-fg leading-relaxed">
                {comentario.Body}
              </p>
            </li>
          ))}
        </ul>
      )}

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
    </div>
  )
}
