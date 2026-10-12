import type { ReportAnswerViewModel } from '@/contracts'
import { cn } from '@/shared/lib/cn'

/**
 * O que quem relatou escreveu, como ela respondeu: **cada resposta embaixo da
 * pergunta** que a pediu — a pergunta como estava no envio, e nao a de hoje.
 *
 * Mora em `shared/` porque duas pessoas leem o mesmo relato assim: o time, no card
 * aberto, e quem relatou, na pagina de acompanhamento.
 *
 * **Sem respostas, o texto.** O relato de um tipo sem perguntas e a caixa livre, e
 * chega so em `text`; o card do time nunca passa por aqui. A caixa livre que vem
 * depois de respostas ganha o rotulo "Mais detalhes" — sem ele, ela pareceria a
 * resposta da ultima pergunta. Sozinha, vai sem rotulo nenhum: ela e o relato.
 *
 * `whitespace-pre-wrap` em tudo: a pessoa escreveu em linhas, e juntar num paragrafo
 * so muda o que ela disse.
 */
export function ReportAnswers({
  answers,
  text,
  className,
}: {
  answers: ReportAnswerViewModel[] | null
  text: string
  className?: string
}) {
  const resposta = 'whitespace-pre-wrap break-words text-body text-fg leading-relaxed'

  if (!answers || answers.length === 0) return <p className={cn(resposta, className)}>{text}</p>

  const temPergunta = answers.some((item) => item.Question !== null)
  if (!temPergunta)
    return (
      <div className={cn('flex flex-col gap-3', className)}>
        {answers.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: respostas sem identificador, numa ordem fixa
          <p key={index} className={resposta}>
            {item.Answer}
          </p>
        ))}
      </div>
    )

  return (
    <dl className={cn('flex flex-col gap-3', className)}>
      {answers.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: respostas sem identificador, numa ordem fixa
        <div key={index}>
          <dt className="mb-0.5 text-detail text-fg-muted">{item.Question ?? 'Mais detalhes'}</dt>
          <dd className={resposta}>{item.Answer}</dd>
        </div>
      ))}
    </dl>
  )
}
