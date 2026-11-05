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

  // Sem sessao guardada, a pagina e a entrada publica, que e sempre clara. A chave e a
  // mesma de `data/sessionToken.ts`; quem tem sessao fica com o tema que escolheu.
  if (!localStorage.getItem('pds.web.session.v1')) theme = 'light'

  document.documentElement.setAttribute('data-theme', theme)
} catch (e) {
  // Armazenamento bloqueado: cai no claro, e o bundle corrige em seguida.
}
