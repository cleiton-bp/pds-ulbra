import type { ReactNode } from 'react'
import type { ReportVisibility } from '@/contracts'

/**
 * Um dos tres niveis de visibilidade. **Diz quem ve, e nao so o nome do nivel**:
 * "Publico" e uma palavra que cada um entende de um jeito — e a diferenca entre "qualquer
 * pessoa" e "quem tem o link" e a diferenca entre um vazamento e um relato.
 */
export interface Nivel {
  valor: ReportVisibility
  titulo: string
  /** O que esta escolhido, em palavras, no titulo do grupo fechado. */
  emPalavras: string
  /** Uma frase: no cartao da escolha e na folha da Moderação. */
  resumo: string
  /** O texto longo, no "Como funciona". */
  explicacao: string
  /** Quem consegue ler o relato, com o lugar onde le. */
  quemVe: string
  /** O que o time passa a fazer com esta escolha. */
  custo: string
}

/**
 * Os textos dizem o que acontece de verdade, com as palavras que cada um ve: o time, em
 * Moderação e no Trabalho; quem relata, no formulario ("Ver o que já foi relatado", a caixa
 * de mostrar o nome). A lista publica traz o tipo, o texto e a etapa de cada relato
 * liberado, e nunca o protocolo (ver `ListPublishedAsync`, na API).
 */
export const NIVEIS: readonly Nivel[] = [
  {
    valor: 'Private',
    titulo: 'Privado',
    emPalavras: 'Privado, só quem relatou e o time',
    resumo: 'Só quem relatou e o time.',
    explicacao:
      'Cada relato só abre para quem o enviou, pelo link, pelo código pessoal ou pela conta, e para o time, no Trabalho. Não existe lista com relatos de outras pessoas, e o protocolo de uma pessoa não abre o relato de outra.',
    quemVe: 'Só quem relatou e o time, no Trabalho, e mais ninguém encontra o relato.',
    custo: 'Nada a fazer, porque nada fica à vista de quem é de fora.',
  },
  {
    valor: 'PublicAnonymous',
    titulo: 'Público anônimo',
    emPalavras: 'Público anônimo, qualquer pessoa lê sem saber quem escreveu',
    resumo: 'Qualquer pessoa lê, e ninguém sabe quem escreveu.',
    explicacao:
      'O formulário ganha “Ver o que já foi relatado”, com o tipo, o texto e a etapa de cada relato liberado, para a pessoa conferir se alguém já contou o mesmo antes de escrever. O nome e o protocolo nunca aparecem.',
    quemVe:
      'Qualquer pessoa que abrir o formulário no seu sistema, em “Ver o que já foi relatado”, sem saber quem escreveu.',
    custo:
      'Liberar cada relato em Moderação antes de ele aparecer, conferindo se o texto não traz documento, número de pedido ou dado de outra pessoa.',
  },
  {
    valor: 'PublicIdentified',
    titulo: 'Público identificado',
    emPalavras: 'Público identificado, o nome aparece se quem relatou quiser',
    resumo: 'Qualquer pessoa lê, e quem relatou aparece se quiser.',
    explicacao:
      'Igual ao anônimo, e quem relatou pode marcar “Quero que o meu nome apareça junto deste relato” para o nome sair na lista. Mostrar o nome é sempre escolha da pessoa, e nunca do projeto.',
    quemVe:
      'Qualquer pessoa, como no anônimo, e o nome de quem relatou aparece quando ela marca “Quero que o meu nome apareça junto deste relato”.',
    custo:
      'A mesma liberação em Moderação, e o formulário precisa perguntar o nome, em Textos e tema.',
  },
]

/** Por que o publico identificado nao da para escolher no protocolo: o mesmo nas duas telas. */
export const NIVEL_TRAVADO = 'Precisa de um modo que reconheça quem relata'

export function nivelDe(valor: ReportVisibility): Nivel {
  return NIVEIS.find((nivel) => nivel.valor === valor) ?? (NIVEIS[0] as Nivel)
}

/** O traco dos desenhos das escolhas: a mesma espessura e a mesma cor nos seis. */
export function Desenho({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 32 24"
      className="h-10 w-14 text-fg-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

/** Privado e um cadeado; publico, um olho — e o identificado, o olho e quem escreveu. */
export function DesenhoDoNivel({ nivel }: { nivel: ReportVisibility }) {
  return (
    <Desenho>
      {nivel === 'Private' && (
        <>
          <rect x="10.5" y="11" width="11" height="9" rx="1.6" />
          <path d="M12.8 11V8.2a3.2 3.2 0 0 1 6.4 0V11" />
        </>
      )}
      {nivel === 'PublicAnonymous' && (
        <>
          <path d="M5 12s4-6 11-6 11 6 11 6-4 6-11 6S5 12 5 12Z" />
          <circle cx="16" cy="12" r="2.5" />
        </>
      )}
      {nivel === 'PublicIdentified' && (
        <>
          <path d="M2.5 12s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z" />
          <circle cx="10.5" cy="12" r="2" />
          <circle cx="25" cy="8.5" r="2.5" />
          <path d="M20.5 18c0-3 2-4.6 4.5-4.6s4.5 1.6 4.5 4.6" />
        </>
      )}
    </Desenho>
  )
}
