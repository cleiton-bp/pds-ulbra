// Fora do HTML de proposito: a politica de conteudo (CSP) do quadro so aceita script de
// arquivo. Le a chave publica da URL e carrega o carregador, como o site do cliente faz.

;(function () {
  var chave = new URLSearchParams(location.search).get('k') || ''
  if (!/^pk_[A-Za-z0-9_-]{8,80}$/.test(chave)) {
    document.querySelector('.aviso').textContent = 'Chave pública inválida para o teste.'
    return
  }
  var script = document.createElement('script')
  script.src = '/v1/pds.js'
  script.dataset.key = chave
  document.body.appendChild(script)
})()
