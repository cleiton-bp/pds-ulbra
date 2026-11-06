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
  emPalavras: string
  resumo: string
  explicacao: string
  quemVe: string
  custo: string
}

export const NIVEIS: readonly Nivel[] = [
  {
    valor: 'Private',
    titulo: 'Privado',
    emPalavras: 'Privado (só quem relatou e o time)',
    resumo: 'Só quem relatou e o time.',
    explicacao:
      'Cada relato é alcançável por quem tem o link dele, e por mais ninguém. Não existe página que liste relato de terceiro, e o protocolo de uma pessoa não abre o relato de outra.',
    quemVe: 'Quem relatou, pelo link dele. E o time, no quadro.',
    custo: 'Nada. É o que o projeto já faz hoje.',
  },
  {
    valor: 'PublicAnonymous',
    titulo: 'Público anônimo',
    emPalavras: 'Público anônimo (qualquer pessoa lê, sem o autor)',
    resumo: 'Qualquer pessoa lê, e ninguém sabe quem escreveu.',
    explicacao:
      'O relato fica visível para quem entrar, sem nada que aponte para o autor. Serve para mostrar o que está sendo corrigido sem cada um ter de perguntar.',
    quemVe: 'Qualquer pessoa, inclusive quem nunca relatou nada.',
    custo:
      'Alguém do time libera cada relato antes de ele aparecer. O texto livre é onde vem documento, número de pedido e print com dado de outra pessoa.',
  },
  {
    valor: 'PublicIdentified',
    titulo: 'Público identificado',
    emPalavras: 'Público identificado (o autor aparece se quiser)',
    resumo: 'Qualquer pessoa lê, e quem relatou aparece se quiser.',
    explicacao:
      'O mesmo do anônimo, com uma diferença: quem escreveu pode escolher assinar o relato. Aparecer continua sendo decisão dela, e não do projeto.',
    quemVe: 'Qualquer pessoa. O nome só aparece no relato em que o próprio autor marcou.',
    custo:
      'A mesma liberação do anônimo, e um modo que identifique, porque no protocolo não há identidade para mostrar.',
  },
]

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
