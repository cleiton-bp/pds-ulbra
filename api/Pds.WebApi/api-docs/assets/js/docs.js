// Roteador da documentacao. Cada secao e uma rota (#/secao) e cada passo de uma
// secao e uma rota abaixo dela (#/secao/passo). O conteudo vem de um arquivo em
// /pages (a secao em pages/secao.html, o passo em pages/secao/passo.html), para
// que cada pagina seja editada isoladamente sem mexer no resto do site.
(function () {
  // A ordem aqui e a ordem do menu e a do anterior/proximo no rodape. Uma secao
  // sem `children` e uma pagina so; com `children`, a pagina da secao abre o
  // assunto e cada passo aprofunda uma parte.
  const ROUTES = [
    { id: 'visao-geral', label: 'Visão geral', children: [
      { id: 'o-relato-entra',            label: 'O relato entra, e o time trabalha' },
      { id: 'quem-relatou-acompanha',    label: 'Quem relatou acompanha' },
      { id: 'o-ciclo-fecha',             label: 'O ciclo fecha' },
      { id: 'identidade-e-visibilidade', label: 'Identidade e visibilidade' },
      { id: 'imagens-e-arquivos',        label: 'Imagens e arquivos no relato' },
      { id: 'o-que-existe',              label: 'O que existe, e o que fica para depois' },
    ] },
    { id: 'arquitetura', label: 'Arquitetura', children: [
      { id: 'camadas',   label: 'O que cada camada carrega' },
      { id: 'onde-fica', label: 'Onde fica no código' },
    ] },
    { id: 'modelagem', label: 'Modelagem', children: [
      { id: 'conta-e-usuario',  label: 'Conta, usuário e time' },
      { id: 'projeto-e-chaves', label: 'Projeto, chaves e endereços' },
      { id: 'configuracoes',    label: 'Configurações do projeto' },
      { id: 'fila-interna',     label: 'A fila interna' },
      { id: 'jornada-publica',  label: 'A jornada pública' },
      { id: 'relato',           label: 'O relato' },
      { id: 'campos-do-card',   label: 'O que o time dá ao card' },
      { id: 'vinculos',         label: 'Vínculos entre cards' },
      { id: 'avisos',           label: 'Os avisos do sino' },
      { id: 'sprints',          label: 'Sprints e backlog' },
      { id: 'conversa-e-ciclo', label: 'Conversa e ciclo' },
      { id: 'midia',            label: 'Mídia' },
      { id: 'eventos',          label: 'Eventos' },
    ] },
    // Autenticacao fica inteira: sao cem linhas e uma historia so, do clique no
    // botao do Google ate o token expirar. Cortar aqui seria cortar por simetria.
    { id: 'autenticacao', label: 'Autenticação' },
    // A pagina "De onde vem o acesso" guarda o endereco antigo (de-onde-vem-a-conta):
    // trocar o id quebraria os links que ja apontam para ela.
    { id: 'isolamento', label: 'Isolamento por projeto', children: [
      { id: 'onde-o-filtro-mora',       label: 'Onde o filtro mora' },
      { id: 'consultas-que-atravessam', label: 'As consultas que atravessam o filtro' },
      { id: 'de-onde-vem-a-conta',      label: 'De onde vem o acesso' },
    ] },
    { id: 'endpoints', label: 'Endpoints', children: [
      { id: 'sessao-e-projeto',  label: 'Sessão, projeto e chaves' },
      { id: 'o-time',            label: 'O time e o convite' },
      { id: 'fila-e-jornada',    label: 'A fila e a jornada' },
      { id: 'configuracoes',     label: 'Configurações do projeto' },
      { id: 'tipos-de-relato',   label: 'Tipos de relato' },
      { id: 'relatos-no-painel', label: 'Relatos e cards, no painel' },
      { id: 'campos-do-card',    label: 'Campos do card, prioridades e etiquetas' },
      { id: 'sprints',           label: 'Sprints' },
      { id: 'midia',             label: 'Mídia: anexar e ler' },
      { id: 'rotas-publicas',    label: 'Rotas públicas' },
      { id: 'envelope-e-erros',  label: 'O envelope e os erros' },
    ] },
    { id: 'fluxo', label: 'Fluxo rápido', children: [
      { id: 'entrar-e-criar',     label: 'Entrar e criar o projeto' },
      { id: 'convidar',           label: 'Convidar alguém para o time' },
      { id: 'card-do-time',       label: 'O card do time e o arquivar' },
      { id: 'organizar-o-card',   label: 'Título, responsável, prioridade e prazo' },
      { id: 'o-quadro',           label: 'O quadro' },
      { id: 'tempo-real',         label: 'O tempo real' },
      { id: 'filtros-e-busca',    label: 'Filtros e busca' },
      { id: 'subtarefas',         label: 'Subtarefas' },
      { id: 'vinculos',           label: 'Vínculos e duplicados' },
      { id: 'mencoes-e-avisos',   label: 'Menções e avisos' },
      { id: 'backlog-e-sprints',  label: 'Backlog e sprints' },
      { id: 'primeiro-relato',    label: 'O primeiro relato chegando' },
      { id: 'anexar',             label: 'Imagens e arquivos no relato' },
      { id: 'volta-para-olhar',   label: 'Quem relatou volta para olhar' },
      { id: 'ciclo-fecha',        label: 'O ciclo fecha' },
      { id: 'pedido-e-espera',    label: 'Pedido de informação e a espera' },
      { id: 'codigo-e-moderacao', label: 'Código pessoal e moderação' },
      { id: 'chave-e-arquivar',   label: 'A chave secreta, arquivar' },
    ] },
    { id: 'como-rodar', label: 'Como rodar', children: [
      { id: 'variaveis',          label: 'Variáveis de ambiente' },
      { id: 'banco-e-migracoes',  label: 'O banco e as migrações' },
      { id: 'a-fila',             label: 'A fila' },
      { id: 'armazenamento',      label: 'O armazenamento' },
      { id: 'o-email',            label: 'O e-mail' },
      { id: 'esta-documentacao',  label: 'Esta documentação' },
    ] },
    { id: 'seguranca', label: 'Segurança', children: [
      { id: 'as-chaves',                  label: 'As chaves' },
      { id: 'identificadores-e-exclusao', label: 'Identificadores e exclusão' },
      { id: 'protecao-do-publico',        label: 'O que protege o público' },
      { id: 'midia',                      label: 'Os anexos' },
      { id: 'superficie-de-rede',         label: 'Superfície de rede' },
    ] },
  ];

  // A lista plana e a ordem de leitura: a secao, depois os passos dela, depois a
  // secao seguinte. E ela que o anterior/proximo percorre.
  const PAGES = ROUTES.flatMap((section) => [
    { id: section.id, label: section.label, section, file: `pages/${section.id}.html` },
    ...(section.children || []).map((step) => ({
      id: `${section.id}/${step.id}`,
      label: step.label,
      section,
      file: `pages/${section.id}/${step.id}.html`,
    })),
  ]);

  const DEFAULT_ROUTE = PAGES[0].id;
  const pageById = Object.fromEntries(PAGES.map((page) => [page.id, page]));

  const nav = document.getElementById('nav');
  const content = document.getElementById('content');

  function buildMenu() {
    nav.innerHTML = ROUTES.map((section) => {
      const steps = (section.children || [])
        .map((step) => `<a href="#/${section.id}/${step.id}" data-id="${section.id}/${step.id}">${step.label}</a>`)
        .join('');

      return `<div class="group" data-section="${section.id}">`
        + `<a href="#/${section.id}" data-id="${section.id}">${section.label}</a>`
        + (steps ? `<div class="steps"><div>${steps}</div></div>` : '')
        + '</div>';
    }).join('');
  }

  function currentRouteId() {
    const id = (location.hash || '').replace(/^#\/?/, '');
    return pageById[id] ? id : DEFAULT_ROUTE;
  }

  // No rodape, o passo leva o nome da secao na frente: sem isso, "Eventos →" no
  // fim de uma pagina de rotas nao diz para onde vai.
  function pageName(page) {
    return page.id === page.section.id ? page.label : `${page.section.label} › ${page.label}`;
  }

  function pagerHtml(id) {
    const index = PAGES.findIndex((page) => page.id === id);
    const previous = PAGES[index - 1];
    const next = PAGES[index + 1];

    return '<div class="pager">'
      + (previous ? `<a href="#/${previous.id}">← ${pageName(previous)}</a>` : '<span></span>')
      + (next ? `<a href="#/${next.id}">${pageName(next)} →</a>` : '<span></span>')
      + '</div>';
  }

  async function navigate() {
    const id = currentRouteId();
    const page = pageById[id];

    // Hash vazio ou desconhecido: normaliza a URL e deixa o hashchange chamar de novo.
    if (location.hash.replace(/^#\/?/, '') !== id) {
      location.replace('#/' + id);
      return;
    }

    nav.querySelectorAll('a').forEach((link) => {
      link.classList.toggle('active', link.dataset.id === id);
    });

    // So a secao da pagina atual mostra os passos: com todos abertos o menu nao
    // caberia na tela, e a secao aberta ja diz onde a pessoa esta.
    nav.querySelectorAll('.group').forEach((group) => {
      group.classList.toggle('open', group.dataset.section === page.section.id);
    });

    document.title = `${pageName(page)} (Relato Fácil)`;

    try {
      const response = await fetch(page.file, { cache: 'reload' });
      if (!response.ok) throw new Error('HTTP ' + response.status);

      content.innerHTML = (await response.text()) + pagerHtml(id);
      prepararPagina();
    } catch (error) {
      content.innerHTML = '<h2>Página não encontrada</h2>'
        + `<p class="lead">Não foi possível carregar <code>${page.file}</code> (${error.message}).</p>`
        + `<p><a href="#/${DEFAULT_ROUTE}">Voltar ao início</a></p>`;
    }

    window.scrollTo({ top: 0 });
    aoRolar();
  }

  // ---------- O que deixa a leitura mais leve ----------

  const poucoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Os primeiros blocos da pagina chegam em sequencia; o resto aparece ao rolar.
  function prepararPagina() {
    content.classList.remove('entrando');
    void content.offsetWidth;
    content.classList.add('entrando');

    tabelasQueRolam();
    botoesDeCopiar();
    detalhesQueDeslizam();
    revelarAoRolar();
  }

  // Tabela larga rola dentro da própria caixa, e nunca empurra a página para o lado.
  function tabelasQueRolam() {
    content.querySelectorAll('table').forEach((tabela) => {
      if (tabela.parentElement.classList.contains('table-scroll')) return;
      const caixa = document.createElement('div');
      caixa.className = 'table-scroll';
      tabela.before(caixa);
      caixa.appendChild(tabela);
    });
  }

  function botoesDeCopiar() {
    content.querySelectorAll('pre').forEach((pre) => {
      pre.classList.add('com-copia');
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'copiar';
      botao.textContent = 'Copiar';
      botao.addEventListener('click', async () => {
        const texto = (pre.querySelector('code') || pre).innerText;
        try {
          await navigator.clipboard.writeText(texto);
          botao.textContent = 'Copiado';
        } catch {
          botao.textContent = 'Selecione e copie';
        }
        botao.classList.add('feito');
        setTimeout(() => { botao.textContent = 'Copiar'; botao.classList.remove('feito'); }, 1600);
      });
      pre.appendChild(botao);
    });
  }

  // O <details> abre e fecha de uma vez; aqui ele desliza nos dois sentidos.
  function detalhesQueDeslizam() {
    content.querySelectorAll('details.mais').forEach((det) => {
      const resumo = det.querySelector(':scope > summary');
      if (!resumo || det.dataset.pronto) return;
      det.dataset.pronto = '1';
      const miolo = document.createElement('div');
      const dentro = document.createElement('div');
      while (resumo.nextSibling) dentro.appendChild(resumo.nextSibling);
      miolo.appendChild(dentro);
      det.appendChild(miolo);
      if (det.open) det.classList.add('aberto');
      resumo.addEventListener('click', (evento) => {
        evento.preventDefault();
        if (det.open) {
          det.classList.remove('aberto');
          const fechar = () => { det.open = false; };
          if (poucoMovimento.matches) fechar(); else setTimeout(fechar, 330);
        } else {
          det.open = true;
          requestAnimationFrame(() => requestAnimationFrame(() => det.classList.add('aberto')));
        }
      });
    });
  }

  let observador = null;
  function revelarAoRolar() {
    if (observador) observador.disconnect();
    if (poucoMovimento.matches || !('IntersectionObserver' in window)) return;
    observador = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;
        entrada.target.classList.add('visivel');
        observador.unobserve(entrada.target);
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    const alturaDaTela = window.innerHeight;
    content.querySelectorAll(':scope > h2, :scope > .note, :scope > .table-scroll, :scope > table, :scope > .diagram, :scope > pre, :scope > .cartoes, :scope > details, :scope > .steps-index, :scope > .resumo').forEach((el) => {
      // O que ja esta na tela na chegada fica com a entrada da pagina.
      if (el.getBoundingClientRect().top < alturaDaTela) return;
      el.classList.add('revela');
      observador.observe(el);
    });
  }

  // A barra de leitura e o voltar ao topo, criados uma vez so.
  const progresso = document.createElement('div');
  progresso.className = 'progresso';
  document.body.appendChild(progresso);
  const topo = document.createElement('button');
  topo.type = 'button';
  topo.className = 'topo';
  topo.setAttribute('aria-label', 'Voltar ao topo');
  topo.textContent = '↑';
  topo.addEventListener('click', () => window.scrollTo({ top: 0, behavior: poucoMovimento.matches ? 'auto' : 'smooth' }));
  document.body.appendChild(topo);

  let quadro = 0;
  function aoRolar() {
    if (quadro) return;
    quadro = requestAnimationFrame(() => {
      quadro = 0;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      progresso.style.transform = `scaleX(${total > 0 ? Math.min(1, window.scrollY / total) : 0})`;
      topo.classList.toggle('visivel', window.scrollY > 600);
    });
  }
  window.addEventListener('scroll', aoRolar, { passive: true });
  window.addEventListener('resize', aoRolar);

  // No celular, o menu abre e fecha pelo botão, e fecha sozinho ao escolher uma página.
  const lateral = document.querySelector('.sidebar');
  const botaoMenu = document.querySelector('.menu-botao');
  function abrirMenu(abrir) {
    lateral.classList.toggle('aberta', abrir);
    botaoMenu.setAttribute('aria-expanded', String(abrir));
  }
  botaoMenu.addEventListener('click', () => abrirMenu(!lateral.classList.contains('aberta')));
  window.addEventListener('hashchange', () => abrirMenu(false));

  buildMenu();
  window.addEventListener('hashchange', navigate);
  navigate();
})();
