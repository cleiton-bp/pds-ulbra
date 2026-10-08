# PDS

> Nome provisório. O nome definitivo virá junto com o domínio.

Uma camada pública de acompanhamento: quem relata um problema recebe um protocolo e consegue ver em que etapa do processo o relato está, do mesmo jeito que acompanha uma entrega de delivery. As etapas são definidas por cada empresa que opera o sistema.

Nada é instalado no sistema de ninguém: sem biblioteca, sem SDK, sem pacote pra manter atualizado. A aplicação é hospedada, e a ferramenta de relato entra no site do cliente com uma linha de código, o que torna a adoção viável em qualquer sistema, independente de linguagem ou stack.

E o time trabalha os relatos no próprio painel: uma ferramenta de trabalho completa — lista e quadro, sprints, avisos —, ligada à jornada pública. O que o time move do lado de dentro, quem relatou vê andar do lado de fora.

---

## O problema

Quem relata um problema num software fica sem notícia. O relato chega por WhatsApp, e-mail ou telefone, alguém do time transcreve pra ferramenta interna, e ali ele deixa de existir para quem o originou: sem protocolo, sem link, sem previsão, sem aviso de resolução.

O absurdo é que **a informação existe**. O registro se moveu três vezes hoje, tem responsável, posição na fila e histórico. Ela só está trancada numa ferramenta interna à qual o relator não tem acesso — e nem deveria ter, porque ali estão outros clientes, discussão interna e estimativas que ninguém quer prometer.

Some a isso um segundo problema: mesmo que o relator tivesse acesso, não entenderia o que está vendo. Status interno é escrito na língua de quem executa e serve pra organizar trabalho, não pra informar quem está esperando.

O resultado é conhecido de qualquer time de suporte:

- a pessoa relata de novo achando que se perdeu;
- liga só pra perguntar "e aí, saiu?";
- o time gasta mais tempo respondendo status do que resolvendo;
- vinte pessoas relatam o mesmo defeito sem saber que a correção subiu ontem;
- quando é resolvido, ninguém avisa quem pediu.

Existe rastreio em tempo real para uma entrega de trinta reais e nenhum para o chamado que travou o faturamento de uma empresa.

---

## O trajeto

O relator abre um link e vê uma linha do tempo simples: por onde já passou, em que etapa está agora e o que vem depois. Sem jargão, sem nome de responsável, sem conversa interna.

```
Recebido  ─►  Em análise  ─►  Em correção  ─►  Publicado  ─►  Confirmado
   ✓             ✓              ● agora                          por você
```

No fim, é o próprio relator quem confirma que resolveu, ou reabre — como o "entregue" do delivery.

---

## As etapas são de cada empresa

O processo muda de empresa para empresa, então não existe trajeto único embutido no produto.

Cada empresa desenha as próprias etapas públicas e escolhe o texto que o relator lê em cada uma. Depois liga cada etapa pública aos estados internos que ela representa — normalmente vários estados internos caem numa mesma etapa pública, porque o time precisa de granularidade que o relator não precisa.

Feito esse mapeamento uma vez, o trajeto passa a andar sozinho: o registro se move do lado de dentro e o relator vê a mudança do lado de fora.

---

## Os dois lados

**Do lado de fora, a camada pública.** O relato entra pela ferramenta colada no site, na página onde o problema apareceu — sem conta e sem download, com imagens capturadas e marcadas ali mesmo. Quem relatou acompanha pelo link: a linha do tempo, o pedido de informação do time, e no fim a confirmação ou a reabertura.

**Do lado de dentro, a ferramenta de trabalho do time.** O painel onde os relatos chegam e viram cards, ao lado do trabalho que o próprio time cria:

- lista e quadro, arrastando com mouse, toque ou teclado, e raias por responsável ou por prioridade;
- responsável, prioridade, etiquetas, prazo, subtarefas e vínculos entre cards — o relato duplicado acompanha o original até o desfecho;
- filtros, busca e mudanças em lote;
- backlog e sprints, para o projeto que trabalha assim, com a estimativa em pontos;
- menções e avisos no sino, com o som que cada pessoa escolhe;
- a tela de Trabalho em tempo real para o time inteiro, com convite por e-mail e papéis de administrador e membro.

O que o time faz do lado de dentro nunca vaza: comentário interno, responsável, título do time e estados internos ficam no painel, e o lado de fora vê só a etapa pública.

---

## O que dá peso técnico

O núcleo é um **motor de tradução de estados**: mapear a máquina de estados interna, configurável por empresa, para uma jornada pública curta e compreensível, sem vazar o que é interno. Em volta dele:

- isolamento por projeto em toda consulta, no banco, com papéis por projeto;
- relatos iguais ligados ao original, cada pessoa recebendo o mesmo desfecho;
- identidade sem senha, pelo protocolo e pelo código pessoal;
- tempo real para o time, avisando só quem está no projeto;
- filas para o que não pode prender a requisição — o e-mail do convite e as esperas da jornada;
- mídia enviada direto ao armazenamento, por formulário assinado;
- redação do que nunca pode aparecer no lado público.

---

## Continuidade

O que o produto pode vir a ter, fora do escopo atual:

- **conectores com as ferramentas de gestão que o time já usa**, para quem prefere continuar nelas: sincronização nos dois sentidos, com webhook idempotente, retentativa e resolução de conflito;
- previsão de quando o relato anda, por percentil histórico, em vez de promessa.

O que existe, o que está planejado e o que ficou para depois está em [o que existe](api/Pds.WebApi/api-docs/pages/visao-geral/o-que-existe.html), na documentação da API.

---

## Pergunta de pesquisa

Dar visibilidade ao relator reduz rechamada e contato redundante? E o quanto?