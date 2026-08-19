// Coloca na barra do Swagger um botao de volta para a documentacao do projeto,
// fechando o caminho de ida e volta: a documentacao ja tem "Abrir o Swagger".
//
// O script e injetado pelo Swashbuckle (ver Startup.cs). A pagina do Swagger e
// montada em JavaScript depois do carregamento, entao a barra ainda nao existe
// quando este arquivo roda — dai a espera abaixo.
(function () {
  const LABEL = '← Documentação do projeto';
  const TARGET = '/#/visao-geral';

  // Quanto esperar a barra aparecer antes de desistir e usar o plano B.
  const RETRY_INTERVAL_MS = 100;
  const MAX_ATTEMPTS = 30;

  function buildLink(fixedPosition) {
    const link = document.createElement('a');
    link.href = TARGET;
    link.textContent = LABEL;

    Object.assign(link.style, {
      display: 'inline-block',
      padding: '7px 14px',
      border: '1px solid #ffffff',
      borderRadius: '8px',
      color: '#ffffff',
      background: 'transparent',
      font: '600 13px/1.2 sans-serif',
      textDecoration: 'none',
      whiteSpace: 'nowrap',
    });

    if (fixedPosition) {
      // Plano B: a barra nao apareceu (versao futura do Swagger UI pode nao ter
      // uma). Um botao fixo no canto nao depende do DOM de ninguem.
      Object.assign(link.style, {
        position: 'fixed',
        top: '12px',
        right: '16px',
        zIndex: '9999',
        borderColor: '#3b4151',
        color: '#3b4151',
        background: '#ffffff',
      });
    }

    return link;
  }

  function place(attempt) {
    const topbar = document.querySelector('.swagger-ui .topbar-wrapper');

    if (topbar) {
      // A barra alinha o conteudo a esquerda; empurrar o botao para a direita
      // deixa claro que ele e uma saida, nao parte do titulo.
      topbar.style.justifyContent = 'space-between';
      topbar.appendChild(buildLink(false));
      return;
    }

    if (attempt < MAX_ATTEMPTS) {
      setTimeout(() => place(attempt + 1), RETRY_INTERVAL_MS);
      return;
    }

    document.body.appendChild(buildLink(true));
  }

  place(0);
})();
