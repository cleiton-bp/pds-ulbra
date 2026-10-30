/**
 * Publicado para apresentar o projeto, o editor so le: sem o modo de edicao, sem criar
 * nem apagar arquivo, e nada vai para o disco. Liga na montagem, com
 * `VITE_SOMENTE_LEITURA=1` (ver `deploy/imagens/editor.Dockerfile`); no `npm run dev`
 * fica desligado e tudo funciona como sempre.
 *
 * No ar nao ha API de arquivos: a lista e cada `.yaml` saem de arquivos estaticos
 * gerados na montagem (`scripts/exportar-leitura.mjs`), e o Caddy do editor recusa
 * qualquer gravacao. Esconder os botoes aqui e o que impede a pessoa de ver um erro por isso.
 */
export const SOMENTE_LEITURA = import.meta.env.VITE_SOMENTE_LEITURA === '1'
