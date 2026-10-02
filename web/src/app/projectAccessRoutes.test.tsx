// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { ProjectHome, RequireProjectAdministrator } from '@/app/projectAccessRoutes'
import type { ProjectViewModel } from '@/contracts'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * A porta do projeto decide pelo papel: quem configura entra na Instalação,
 * quem e so membro entra nos Relatos — abrir a Instalação para o membro seria
 * mostrar as chaves que a API nao deixa ele ler.
 *
 * A guarda da Configuração cobre o endereco digitado: o menu ja esconde as
 * secoes, mas o link antigo ainda chega. E ela precisa **repassar o projeto**
 * para a tela de dentro — sem isso, toda secao de configuracao quebraria para o
 * proprio administrador.
 */
function projeto(role: ProjectViewModel['Role'], dono = false): ProjectViewModel {
  return {
    PublicId: 'p-1',
    Name: 'Loja',
    Status: 'Active',
    CreatedAt: '2026-10-01T12:00:00.000Z',
    UpdatedAt: '2026-10-01T12:00:00.000Z',
    Account: { PublicId: 'c-1', Name: 'Conta da Ana' },
    Role: role,
    IsAccountOwner: dono,
  }
}

/** Conta quantas vezes a tela de dentro chegou a desenhar. */
const montagens = { configuracao: 0 }

function TelaDeConfiguracao() {
  const project = useCurrentProject()
  montagens.configuracao++
  return <p>Configuração de {project.Name}</p>
}

/**
 * `guarda: false` tira a guarda da frente da Instalação: e assim que a porta e
 * provada sozinha. Com a guarda, uma porta que mandasse todo mundo para a
 * Instalação passaria despercebida — a guarda devolveria o membro aos Relatos.
 */
function abrir(project: ProjectViewModel, endereco: string, { guarda = true } = {}) {
  const configuracao = [
    { path: 'start', element: <p>Instalação</p> },
    { path: 'states', element: <TelaDeConfiguracao /> },
  ]
  const router = createMemoryRouter(
    [
      {
        path: '/projects/:publicId',
        element: <Outlet context={{ project }} />,
        children: [
          { index: true, element: <ProjectHome /> },
          ...(guarda
            ? [{ element: <RequireProjectAdministrator />, children: configuracao }]
            : configuracao),
          { path: 'reports', element: <p>Relatos</p> },
        ],
      },
    ],
    { initialEntries: [endereco] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('ProjectHome', () => {
  afterEach(cleanup)

  it('administrador entra na Instalação', async () => {
    const router = abrir(projeto('Administrator'), '/projects/p-1', { guarda: false })
    expect(await screen.findByText('Instalação')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects/p-1/start')
  })

  it('a dona também entra na Instalação', async () => {
    abrir(projeto('Administrator', true), '/projects/p-1', { guarda: false })
    expect(await screen.findByText('Instalação')).toBeTruthy()
  })

  it('membro entra nos Relatos', async () => {
    const router = abrir(projeto('Member'), '/projects/p-1', { guarda: false })
    expect(await screen.findByText('Relatos')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects/p-1/reports')
  })
})

describe('RequireProjectAdministrator', () => {
  afterEach(cleanup)

  it('o membro que digita o endereço da Configuração vai para os Relatos', async () => {
    montagens.configuracao = 0
    const router = abrir(projeto('Member'), '/projects/p-1/states')
    expect(await screen.findByText('Relatos')).toBeTruthy()
    expect(screen.queryByText(/Configuração de/)).toBeNull()
    expect(router.state.location.pathname).toBe('/projects/p-1/reports')
    // Nem por um instante: a tela de configuração nunca chegou a desenhar.
    expect(montagens.configuracao).toBe(0)
  })

  it('o administrador entra, e a tela de dentro recebe o projeto', async () => {
    abrir(projeto('Administrator'), '/projects/p-1/states')
    expect(await screen.findByText('Configuração de Loja')).toBeTruthy()
  })
})
