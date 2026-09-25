import { createRoot } from 'react-dom/client'
import { configFromInit, configFromLocation, shouldWaitForHost } from '@/embed/config'
import { draw } from '@/embed/draw'
import { connectToHost, isEmbedded } from '@/embed/hostBridge'
import '@/styles/index.css'

/**
 * A entrada do quadro. Documento proprio, e nao uma rota do painel: o que roda
 * dentro do site de um cliente nao pode carregar roteador, sessao nem tela de
 * administracao junto.
 *
 * A ordem aqui importa. **O ouvinte da pagina entra antes de montar React**,
 * porque o carregador manda o `init` assim que o quadro carrega — montar
 * primeiro abriria uma janela em que a mensagem chega sem ninguem escutando.
 *
 * **E nada aparece antes da configuracao.** O `iframe` nasce invisivel do lado de
 * la e so e revelado pelo `show`, que roda depois da leitura. E o que faz o
 * rotulo do cliente aparecer ja certo, em vez de "Relatar" trocando para "Fale
 * com a gente" na frente de quem ja estava lendo. Ler, desenhar e revelar moram
 * em `draw.tsx`, onde da para testar.
 */
const container = document.getElementById('pds-embed-root')

if (container) {
  const root = createRoot(container)

  // A regra e `shouldWaitForHost`, e ela mora em `config.ts` para poder ser
  // testada: este arquivo roda no `import` e nao da para exercitar.
  if (shouldWaitForHost(window.location.search, isEmbedded())) {
    const host = connectToHost((message) => {
      void draw(root, configFromInit(message), host)
    })
  } else {
    // Chave na barra, ou nem pagina hospedeira: os dois casos desenham o
    // formulario direto, sem gatilho e sem redimensionar nada.
    void draw(root, configFromLocation(window.location.search), null)
  }
}
