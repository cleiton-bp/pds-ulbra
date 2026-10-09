import type { ConsoleSection } from '@/app/navigation'
import { cn } from '@/shared/lib/cn'

/**
 * Um glifo por secao da lateral.
 *
 * Menu so de texto obriga a **ler** para achar, e a lateral e onde se procura de
 * relance — a forma chega antes da palavra. Sao os mesmos 12x12 e o mesmo traco
 * do `LockIcon`: alinhados, os dois grupos da lateral parecem a mesma lista, e nao
 * duas listas.
 *
 * **Dois itens nao podem ter o mesmo desenho.** "Quem relata" ja foi um contorno de
 * pessoa, quase igual ao de Membros, e "Andamento público" tres pontos numa linha,
 * que nao diziam nada: na lateral recolhida, o glifo e tudo o que se ve.
 */
export function SectionIcon({
  section,
  className,
}: {
  section: ConsoleSection['key']
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn('flex-none', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {section === 'start' && (
        // Bandeira fincada: "e daqui que se comeca".
        <>
          <path d="M3 10.6V1.8" />
          <path d="M3 2.4h6.2L7.9 4.4l1.3 2H3" />
        </>
      )}

      {section === 'keys' && (
        // Chave: anel e haste com um dente.
        <>
          <circle cx="4.2" cy="4.2" r="2.3" />
          <path d="M5.85 5.85 10.2 10.2" />
          <path d="M8.7 7.3 7.4 8.6" />
        </>
      )}

      {section === 'cycle' && (
        // Seta fechando uma volta: o relato sai, roda, e volta a quem o escreveu.
        // A ponta aberta e o ponto — a volta so fecha quando a pessoa responde.
        <>
          <path d="M10 6a4 4 0 1 1-1.4-3.05" />
          <path d="M10.4 1.5v2.1H8.3" />
        </>
      )}

      {section === 'identity' && (
        // Um cracha: o retrato e as linhas do nome. E o que a secao decide — como
        // quem relata e reconhecido —, e nao se parece com as duas pessoas de
        // Membros.
        <>
          <rect x="1.2" y="2.4" width="9.6" height="7.2" rx="1.2" />
          <circle cx="4.1" cy="5.2" r="1.1" />
          <path d="M2.7 8.1c.3-.8.8-1.2 1.4-1.2s1.1.4 1.4 1.2" />
          <path d="M7 5h2.2M7 7h1.6" />
        </>
      )}

      {section === 'sprints' && (
        // Uma caixa de tempo com a seta andando dentro: o trabalho que cabe num
        // periodo curto.
        <>
          <rect x="1.2" y="2.4" width="9.6" height="7.2" rx="1.4" />
          <path d="M3.4 6h4.6" />
          <path d="M6.6 4.6 8 6 6.6 7.4" />
        </>
      )}

      {section === 'media' && (
        // Uma moldura com um morro e um sol dentro: o desenho de imagem que
        // todo mundo ja reconhece sem ler. A secao trata de print antes de
        // qualquer outra coisa, e o glifo diz isso de relance.
        <>
          <rect x="1.2" y="2.2" width="9.6" height="7.6" rx="1.4" />
          <circle cx="4.2" cy="5" r="0.9" />
          <path d="M1.6 8.4 4.3 6.2l2.2 1.8 1.6-1.3 1.3 1.1" />
        </>
      )}

      {section === 'moderation' && (
        // Um olho, e o que a secao faz: alguem le antes de o resto do mundo ler.
        // Sem pupila cheia — ela olha, e nao vigia.
        <>
          <path d="M1 6s2-3.4 5-3.4S11 6 11 6s-2 3.4-5 3.4S1 6 1 6Z" />
          <circle cx="6" cy="6" r="1.5" />
        </>
      )}

      {section === 'members' && (
        // Duas pessoas, uma atras da outra: e um time, e nao um perfil.
        <>
          <circle cx="4.4" cy="4" r="1.7" />
          <path d="M1.2 10.2c.3-1.8 1.6-2.9 3.2-2.9s2.9 1.1 3.2 2.9" />
          <path d="M7.6 2.6a1.6 1.6 0 1 1 .4 3.1" />
          <path d="M8.9 7.4c1 .3 1.7 1.2 1.9 2.6" />
        </>
      )}

      {section === 'reports' && (
        // Balao de fala: o que aparece nesta secao e alguem falando, e nao um
        // registro que o sistema produziu.
        <>
          <rect x="1.4" y="2" width="9.2" height="6.6" rx="1.6" />
          <path d="M4.1 8.6 3.5 10.6 6.1 8.6" />
        </>
      )}

      {section === 'tool' && (
        // O canto de uma pagina com a pilula parada nele: e literalmente o que
        // esta secao decide.
        <>
          <path d="M1.7 8.4V2.6a.9.9 0 0 1 .9-.9h6.8a.9.9 0 0 1 .9.9v2.2" />
          <rect x="5.4" y="6.9" width="5" height="3.2" rx="1.6" />
        </>
      )}

      {section === 'states' && (
        // Tres colunas lado a lado: e literalmente a fila que esta secao desenha.
        <>
          <rect x="1.4" y="2.2" width="2.6" height="7.6" rx="0.9" />
          <rect x="4.7" y="2.2" width="2.6" height="7.6" rx="0.9" />
          <rect x="8" y="2.2" width="2.6" height="7.6" rx="0.9" />
        </>
      )}

      {section === 'priorities' && (
        // Tres barras subindo: o quanto importa, do pouco ao muito.
        <>
          <path d="M2.6 9.6V7.8" />
          <path d="M6 9.6V5.2" />
          <path d="M9.4 9.6V2.4" />
        </>
      )}

      {section === 'labels' && (
        // A etiqueta de pendurar: a ponta e o furo.
        <>
          <path d="M1.9 6.1V2.7a.8.8 0 0 1 .8-.8h3.4l4 4-4.2 4.2z" />
          <circle cx="4.3" cy="4.3" r="0.7" />
        </>
      )}

      {section === 'stages' && (
        // Uma barra de andamento pela metade: e o quanto quem relatou ve do caminho,
        // e nao as colunas de `states` — as duas telas se confundiam, e os glifos
        // sao a primeira coisa que as separa de relance.
        <>
          <rect x="1.2" y="4.2" width="9.6" height="3.6" rx="1.8" />
          <path d="M3 6h3" strokeWidth="1.8" />
        </>
      )}

      {section === 'settings' && (
        // Controles deslizantes, e nao engrenagem: a 12px a engrenagem vira borrao.
        <>
          <path d="M1.6 4h8.8M1.6 8h8.8" />
          <circle cx="4.3" cy="4" r="1.35" />
          <circle cx="7.7" cy="8" r="1.35" />
        </>
      )}
    </svg>
  )
}
