# PDS

> Nome provisório. O nome definitivo virá junto com o domínio.

Uma camada pública de acompanhamento: quem relata um problema recebe um protocolo e consegue ver em que etapa do processo o relato está, do mesmo jeito que acompanha uma entrega de delivery. As etapas são definidas por cada empresa que opera o sistema.

Nada é instalado no sistema de ninguém: sem biblioteca, sem SDK, sem pacote pra manter atualizado. A aplicação é hospedada e a ligação é feita por API e webhook, o que torna a adoção viável em qualquer sistema, independente de linguagem ou stack.

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

O relator abre um link e vê uma linha do tempo simples: por onde já passou, em que etapa está agora, o que vem depois e uma previsão. Sem jargão, sem nome de responsável, sem conversa interna.

```
Recebido  ─►  Em análise  ─►  Em correção  ─►  Publicado  ─►  Confirmado
   ✓             ✓              ● agora                          por você
```

No fim, é o próprio relator quem confirma que resolveu, ou reabre — como o "entregue" do delivery.

---

## As etapas são de cada empresa

O processo muda de empresa para empresa, então não existe trajeto único embutido no produto.

Cada empresa desenha as próprias etapas públicas e escolhe o texto que o relator lê em cada uma. Depois liga cada etapa pública aos estados internos que ela representa — normalmente vários estados internos caem numa mesma etapa pública, porque o time precisa de granularidade que o relator não precisa.

Feito esse mapeamento uma vez, o trajeto passa a andar sozinho: o registro se move do lado de dentro e o relator é avisado do lado de fora.

---

## O recorte

Não é mais uma ferramenta de gestão de trabalho. É a camada pública que fica **na frente** da ferramenta que o time já usa.

O relato entra por um canal sem instalação — link, QR code, e-mail ou WhatsApp — sem conta e sem download. Do lado de dentro nada muda: o relato vira um registro na ferramenta atual do time, com sincronização nos dois sentidos.

---

## O que dá peso técnico

O núcleo é um **motor de tradução de estados**: mapear a máquina de estados interna, configurável por empresa, para uma jornada pública curta e compreensível, sem vazar o que é interno. Em volta dele:

- deduplicação de relatos iguais num único registro, com notificação em leque;
- estimativa por percentil histórico, em vez de promessa;
- identidade sem senha por protocolo, com controle de abuso;
- sincronização bidirecional com webhook idempotente, retentativa e resolução de conflito;
- redação automática do que nunca pode aparecer no lado público.

---

## Pergunta de pesquisa

Dar visibilidade ao relator reduz rechamada e contato redundante? E o quanto?