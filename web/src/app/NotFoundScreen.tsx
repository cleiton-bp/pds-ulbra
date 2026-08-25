import { Link } from 'react-router-dom'

export function NotFoundScreen() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-20 text-center">
      <h1 className="font-semibold text-fg text-notice">Página não encontrada</h1>
      <p className="mt-1.5 text-fg-muted text-body">
        O endereço não corresponde a nenhuma tela do painel.
      </p>
      <Link to="/projects" className="mt-6 inline-block text-fg text-body underline">
        Ir para os projetos
      </Link>
    </div>
  )
}
