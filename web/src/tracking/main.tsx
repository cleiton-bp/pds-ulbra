import { createRoot } from 'react-dom/client'
import { TrackingPage } from '@/tracking/TrackingPage'
import '@/styles/index.css'

/**
 * A entrada da pagina publica de acompanhamento. Documento proprio, pelo mesmo
 * motivo medido do quadro: o ponto de acesso do painel arrasta `sessionToken`, e
 * quem abre esta pagina e um estranho — nao ha sessao para carregar aqui, e
 * carregar o codigo dela poria a chave `pds.web.session` num documento que
 * qualquer pessoa com um link abre.
 *
 * Sem roteador: o link e um arquivo com query e fragmento, e um roteador serviria
 * para uma rota so.
 */
const container = document.getElementById('pds-tracking-root')

if (container) {
  createRoot(container).render(<TrackingPage />)

  // Tira o esqueleto que o `tracking.html` desenhou antes de este pacote existir.
  //
  // **Ele vive fora do `container`, e nao dentro**, de proposito: dentro, quem
  // apagaria seria a propria biblioteca ao montar, e isso amarraria a tela de
  // carregamento a um detalhe de como ela limpa a raiz. Fora, quem tira e esta
  // linha, que se le.
  document.getElementById('pds-tracking-loading')?.remove()
}
