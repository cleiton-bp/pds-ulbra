import { DomainsSection } from '@/features/projects/DomainsSection'
import { ReportLimitsSection, useReportLimits } from '@/features/projects/ReportLimitsSection'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'

/**
 * Domínios: de quais endereços os relatos entram direto, quais esperam e quais sao
 * recusados — em abas, com a contagem de cada uma — e, na aba Proteção, quantos relatos
 * o projeto aceita em pouco tempo.
 *
 * **Tela propria, e nao uma parte de Projeto.** Autorizar o dominio do site e o passo
 * que trava a primeira hora — sem ele, o primeiro relato fica retido —, e dentro de
 * "Projeto", o ultimo item da lateral, ninguem o achava. O endereco antigo
 * (`settings#dominios`, que o sino ja mandou) chega aqui pelo Projeto.
 *
 * **Os limites vieram de Quem relata**: sao protecao contra abuso, como o bloqueio, e
 * quem procura "spam" procura aqui. O sino que levava a `identity#limites` chega aqui.
 *
 * **Uma tela de listas**: tudo grava na hora — permitir, bloquear, autorizar —, e os
 * limites gravam como um item, com o Salvar e o Cancelar do proprio editor. O hook dos
 * limites mora aqui, fora das abas, e o painel deles nunca desmonta: o rascunho e o
 * aviso de sair sem salvar sobrevivem a troca de aba.
 */
export function DomainsScreen() {
  const project = useCurrentProject()
  const limites = useReportLimits(project.PublicId)

  return (
    <div className="max-w-160">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Domínios</h1>
      <p className="mb-6 text-body text-fg-muted">
        De quais endereços os relatos entram direto no Trabalho, quais esperam a sua liberação e
        quais são recusados. As listas valem na hora.
      </p>

      <DomainsSection
        projectPublicId={project.PublicId}
        protection={<ReportLimitsSection limits={limites} />}
      />
    </div>
  )
}
