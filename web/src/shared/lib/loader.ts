import { environment } from '@/data/environment'

/**
 * O carregador que o cliente cola no site.
 *
 * Fica em `shared/` porque duas telas o mostram: a de entrada, para provar que e
 * mesmo uma linha so, e a de instalacao, ja com a chave do projeto no lugar.
 *
 * O endereco **deixou de ser texto fixo**: ele sai de `VITE_LOADER_URL`, e o
 * padrao e a origem do proprio painel, que e quem publica `/v1/pds.js`. Antes
 * disto apontava para um dominio de terceiro que nem resolve, e ninguem ia
 * descobrir ate colar o trecho num site de verdade.
 */
export const LOADER_URL = environment.loaderUrl

/** Sem chave sai o exemplo, que e o que a tela de entrada mostra a quem nem entrou. */
export function buildSnippet(publicKey: string): string {
  // `data-key` em ingles (§1 do decisoes-de-projeto.md): vai aparecer no HTML de
  // todo cliente.
  return `<script\n  src="${LOADER_URL}"\n  data-key="${publicKey || 'pk_...'}"\n  defer></script>`
}

/**
 * O mesmo script, **sem o nosso botao**: o cliente abre pelo dele. Com `data-button`
 * em `none`, o carregador nao desenha nada e nao faz requisicao nenhuma ate alguem
 * pedir para abrir.
 */
export function buildOwnTriggerSnippet(publicKey: string): string {
  return `<script\n  src="${LOADER_URL}"\n  data-key="${publicKey || 'pk_...'}"\n  data-button="none"\n  defer></script>`
}

/** Os dois jeitos de abrir pelo botao do cliente: o atributo, ou a funcao. */
export const OWN_TRIGGER_EXAMPLES = `<button type="button" data-pds-open>Relatar um problema</button>

<script>
  // Ou de qualquer lugar da sua aplicação:
  Pds.open()
</script>`
