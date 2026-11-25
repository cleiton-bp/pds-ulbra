import type { PublicReportViewModel, WatchReportTrackingRequest } from '@/contracts'

/** Um acompanhamento aberto. */
export interface LiveTrackingWatch {
  /** Para de vez: a tela do relato fechou. */
  stop(): void
}

/**
 * O acompanhamento ao vivo do relato, para quem relatou.
 *
 * **Uma inscricao, e depois so recebe.** A tela se inscreve uma vez com a credencial que
 * abriu o relato e passa a receber o relato inteiro, como a pagina mostra, cada vez que
 * algo que ela veria muda. Ela nao busca nada enquanto acompanha. A credencial recusada
 * encerra o acompanhamento, sem tentar de novo.
 */
export interface LiveTrackingService {
  /**
   * Acompanha o relato. `onReport` recebe o relato como ele esta ao se inscrever (e a cada
   * reconexao, para a tela nao perder o que mudou no meio) e a cada mudanca.
   */
  watch(
    request: WatchReportTrackingRequest,
    onReport: (relato: PublicReportViewModel) => void,
  ): LiveTrackingWatch
}
