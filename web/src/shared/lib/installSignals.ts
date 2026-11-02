import type { ObservedOriginViewModel, ProjectOriginViewModel, ProjectViewModel } from '@/contracts'
import { environment } from '@/data'

/**
 * Os sinais de que a instalacao foi feita, **lidos dos dados — nenhum e uma caixa que a
 * pessoa marca**. A pagina central (os primeiros passos) e a Instalação (o passo aberto)
 * usam os mesmos: as duas telas nao podem discordar sobre o que falta.
 *
 * `null` quando a leitura que decide falhou: a tela nao afirma o que nao sabe.
 */

/**
 * O endereco do painel, como a API guarda a origem de um relato: o host, com a porta, sem
 * esquema.
 */
export function panelHost(): string {
  return window.location.host.toLowerCase()
}

/**
 * Os enderecos de onde sai o relato de teste: a pagina de teste mora na origem do quadro,
 * ao lado do carregador (`environment.testPageUrl`), e os testes feitos antes dela sairam
 * do proprio painel. Em producao sao dois hosts diferentes; no desenvolvimento, o mesmo.
 */
function testHosts(): string[] {
  const hosts = [panelHost()]
  try {
    hosts.push(new URL(environment.testPageUrl).host.toLowerCase())
  } catch {
    // Sem endereco valido para a pagina de teste, vale so o do painel.
  }
  return hosts
}

/** Se o relato veio da pagina de teste, e nao do sistema de quem usa o produto. */
export function isTestOrigin(domain: string | null | undefined): boolean {
  return !!domain && testHosts().includes(domain.toLowerCase())
}

/**
 * Script colado: um relato chegou de um endereco que nao e o da pagina de teste. So o
 * `LastReportReceivedAt` nao bastaria, porque o relato de teste tambem o acende, e ele nao
 * prova que o sistema tem o script. Sem a lista, vale o `LastReportReceivedAt`.
 */
export function scriptInstalled(
  project: ProjectViewModel,
  observed: ObservedOriginViewModel[] | null,
  ehTeste: (domain: string) => boolean = isTestOrigin,
): boolean {
  return observed === null
    ? project.LastReportReceivedAt !== null
    : observed.some((origem) => !ehTeste(origem.Domain))
}

/** Dominio autorizado: a lista de autorizados tem alguem. */
export function domainAuthorized(origins: ProjectOriginViewModel[] | null): boolean | null {
  return origins === null ? null : origins.length > 0
}

/** Relato de teste: um relato chegou do endereco da pagina de teste. */
export function testReportSent(
  observed: ObservedOriginViewModel[] | null,
  ehTeste: (domain: string) => boolean = isTestOrigin,
): boolean | null {
  return observed === null ? null : observed.some((origem) => ehTeste(origem.Domain))
}

/**
 * O bloco do script foi copiado **neste navegador**. Nao prova nada sobre o sistema (quem
 * prova e o primeiro relato que chega de la), mas diz que o passo saiu das maos de quem
 * administra e foi para quem cuida do sistema: o guia segue para o proximo passo enquanto
 * espera, em vez de ficar parado no que depende de outra pessoa.
 */
const SCRIPT_COPIADO = 'pds.web.scriptCopiado.'

/** Sem onde guardar (navegacao privada), vale ate sair da pagina. */
const copiadosNestaPagina = new Set<string>()

export function markScriptCopied(projectPublicId: string): void {
  copiadosNestaPagina.add(projectPublicId)
  try {
    window.localStorage.setItem(SCRIPT_COPIADO + projectPublicId, '1')
  } catch {
    // Fica so a lembranca desta pagina.
  }
}

export function scriptCopied(projectPublicId: string): boolean {
  if (copiadosNestaPagina.has(projectPublicId)) return true
  try {
    return window.localStorage.getItem(SCRIPT_COPIADO + projectPublicId) === '1'
  } catch {
    return false
  }
}
