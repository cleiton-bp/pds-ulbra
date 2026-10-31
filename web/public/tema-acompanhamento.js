// Fora do HTML de proposito: a politica de conteudo (CSP) so aceita script de arquivo.
// Sincrono e sem defer, como era dentro da pagina (o porque esta no comentario de la).

try {
  var stored = localStorage.getItem('pds.web.theme.v1')
  var theme =
    stored === 'light' || stored === 'dark'
      ? stored
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  document.documentElement.setAttribute('data-theme', theme)
  aplicarCoresDoEsqueleto(theme)
} catch (e) {
  // Armazenamento bloqueado: cai no claro, que e o padrao da folha.
  aplicarCoresDoEsqueleto('light')
}

/**
 * O esqueleto abaixo nao pode esperar a folha de estilo, entao as cores dele
 * vem daqui, como variaveis no proprio elemento raiz. Sao dois cinzas por
 * tema, e nada alem disso: ele existe para a tela nao ficar branca, e nao
 * para se parecer com o conteudo que vem depois.
 */
function aplicarCoresDoEsqueleto(tema) {
  var raiz = document.documentElement.style
  var escuro = tema === 'dark'
  raiz.setProperty('--pds-load-fundo', escuro ? '#18181b' : '#ffffff')
  raiz.setProperty('--pds-load-barra', escuro ? '#27272a' : '#f4f4f5')
  raiz.setProperty('background-color', escuro ? '#18181b' : '#ffffff')
}
