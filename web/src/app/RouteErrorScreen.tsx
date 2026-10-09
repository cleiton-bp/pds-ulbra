import { useEffect } from 'react'
import { useRouteError } from 'react-router-dom'
import { Button } from '@/shared/components/Button'

/**
 * O que aparece quando uma tela quebra.
 *
 * Sem ela, o roteador desenhava a tela de erro dele: o rastro da pilha em ingles,
 * "Hey developer", e nenhum botao. Quem estava no meio de um arrasto perdia a tela
 * inteira sem saber o que fazer — e o que fazer quase sempre e recarregar.
 *
 * **Tela inteira, sem a casca.** O erro pode ter vindo da propria casca, e uma tela
 * de erro que depende do que quebrou quebra junto. Por isso os dois caminhos
 * recarregam a pagina de verdade, e nao navegam por dentro: o estado que levou ao
 * erro vai embora com ela.
 *
 * O detalhe tecnico vai para o console, e nao para a tela: e de quem investiga, e
 * nao de quem estava trabalhando.
 */
export function RouteErrorScreen() {
  const error = useRouteError()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface px-5 py-12 text-center">
      <h1 className="font-semibold text-fg text-notice">Algo deu errado nesta tela</h1>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-body text-fg-muted leading-relaxed">
        O que já estava salvo continua salvo. Recarregar a página costuma resolver.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={() => window.location.reload()}>
          Recarregar a página
        </Button>
        <Button variant="quiet" onClick={() => window.location.assign('/projects')}>
          Voltar aos projetos
        </Button>
      </div>
    </main>
  )
}
