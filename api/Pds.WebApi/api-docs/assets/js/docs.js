// Roteador da documentacao. Cada secao e uma rota (#/rota) e o conteudo vem de um
// arquivo em /pages, para que cada pagina seja editada isoladamente sem mexer no
// resto do site.
(function () {
  // A ordem aqui e a ordem do menu e a do anterior/proximo no rodape.
  const ROUTES = [
    { id: 'visao-geral',  label: 'Visão geral' },
    { id: 'arquitetura',  label: 'Arquitetura' },
    { id: 'modelagem',    label: 'Modelagem' },
    { id: 'autenticacao', label: 'Autenticação' },
    { id: 'isolamento',   label: 'Isolamento por conta' },
    { id: 'endpoints',    label: 'Endpoints' },
    { id: 'fluxo',        label: 'Fluxo rápido' },
    { id: 'como-rodar',   label: 'Como rodar' },
    { id: 'seguranca',    label: 'Segurança' },
  ];

  const DEFAULT_ROUTE = ROUTES[0].id;
  const routeById = Object.fromEntries(ROUTES.map((route) => [route.id, route]));

  const nav = document.getElementById('nav');
  const content = document.getElementById('content');

  function buildMenu() {
    nav.innerHTML = ROUTES
      .map((route) => `<a href="#/${route.id}" data-id="${route.id}">${route.label}</a>`)
      .join('');
  }

  function currentRouteId() {
    const id = (location.hash || '').replace(/^#\/?/, '');
    return routeById[id] ? id : DEFAULT_ROUTE;
  }

  function pagerHtml(id) {
    const index = ROUTES.findIndex((route) => route.id === id);
    const previous = ROUTES[index - 1];
    const next = ROUTES[index + 1];

    return '<div class="pager">'
      + (previous ? `<a href="#/${previous.id}">← ${previous.label}</a>` : '<span></span>')
      + (next ? `<a href="#/${next.id}">${next.label} →</a>` : '<span></span>')
      + '</div>';
  }

  async function navigate() {
    const id = currentRouteId();

    // Hash vazio ou desconhecido: normaliza a URL e deixa o hashchange chamar de novo.
    if (location.hash.replace(/^#\/?/, '') !== id) {
      location.replace('#/' + id);
      return;
    }

    nav.querySelectorAll('a').forEach((link) => {
      link.classList.toggle('active', link.dataset.id === id);
    });

    document.title = `PDS · ${routeById[id].label}`;

    try {
      const response = await fetch(`pages/${id}.html`, { cache: 'reload' });
      if (!response.ok) throw new Error('HTTP ' + response.status);

      content.innerHTML = (await response.text()) + pagerHtml(id);
    } catch (error) {
      content.innerHTML = '<h2>Página não encontrada</h2>'
        + `<p class="lead">Não foi possível carregar <code>pages/${id}.html</code> (${error.message}).</p>`
        + `<p><a href="#/${DEFAULT_ROUTE}">Voltar ao início</a></p>`;
    }

    window.scrollTo({ top: 0 });
  }

  buildMenu();
  window.addEventListener('hashchange', navigate);
  navigate();
})();
