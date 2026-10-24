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
 * A porta do projeto e **o Trabalho, para todo mundo**. A excecao e quem administra
 * um projeto cujo site ainda nao mandou relato nenhum: ai configurar e a proxima
 * coisa a fazer, e se entra pela pagina central, com os primeiros passos no topo. Ja
 * foi pelo papel — quem configurava caia sempre na Instalacao, inclusive num projeto
 * com meses de relatos, e a tela que serve uma vez virava a capa do projeto. O membro
 * nunca entra na configuracao: a API recusaria tudo o que ele tentasse mudar ali.
 *
 * A guarda da Configuração cobre o endereco digitado: o menu ja esconde as
 * secoes, mas o link antigo ainda chega. E ela precisa **repassar o projeto**
 * para a tela de dentro — sem isso, toda secao de configuracao quebraria para o
 * proprio administrador.
 */
function projeto(
  role: ProjectViewModel['Role'],
  dono = false,
  ultimoRelato: string | null = null,
): ProjectViewModel {
  return {
    PublicId: 'p-1',
    Name: 'Loja',
    Status: 'Active',
    CreatedAt: '2026-10-01T12:00:00.000Z',
    UpdatedAt: '2026-10-01T12:00:00.000Z',
    Account: { PublicId: 'c-1', Name: 'Conta da Ana' },
    Role: role,
    IsAccountOwner: dono,
    LastReportReceivedAt: ultimoRelato,
    LastActivityAt: ultimoRelato,
  }
}

/** Um relato de fora ja chegou: o site esta instalado. */
const JA_RECEBEU = '2026-10-05T14:00:00.000Z'

/** Conta quantas vezes a tela de dentro chegou a desenhar. */
const montagens = { configuracao: 0 }

function TelaDeConfiguracao() {
  const project = useCurrentProject()
  montagens.configuracao++
  return <p>Configuração de {project.Name}</p>
}

/**
 * `guarda: false` tira a guarda da frente da configuracao: e assim que a porta e
 * provada sozinha. Com a guarda, uma porta que mandasse todo mundo para a
 * configuracao passaria despercebida — a guarda devolveria o membro aos Relatos.
 */
function abrir(project: ProjectViewModel, endereco: string, { guarda = true } = {}) {
  const configuracao = [
    { path: 'configure', element: <p>Configurar o projeto</p> },
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

  // A pagina central, e nao a Instalacao: ela abre com os primeiros passos, e o script
  // e so o primeiro deles.
  it('administrador de projeto que ainda não recebeu relato entra em Configurar o projeto', async () => {
    const router = abrir(projeto('Administrator'), '/projects/p-1', { guarda: false })
    expect(await screen.findByText('Configurar o projeto')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects/p-1/configure')
  })

  it('a dona também, enquanto o site não mandou nada', async () => {
    abrir(projeto('Administrator', true), '/projects/p-1', { guarda: false })
    expect(await screen.findByText('Configurar o projeto')).toBeTruthy()
  })

  it('depois do primeiro relato, quem administra entra no Trabalho', async () => {
    const router = abrir(projeto('Administrator', false, JA_RECEBEU), '/projects/p-1', {
      guarda: false,
    })
    expect(await screen.findByText('Relatos')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects/p-1/reports')
  })

  it('a dona também, depois do primeiro relato', async () => {
    const router = abrir(projeto('Administrator', true, JA_RECEBEU), '/projects/p-1', {
      guarda: false,
    })
    expect(await screen.findByText('Relatos')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/projects/p-1/reports')
  })

  // A configuracao e de quem administra: mesmo num projeto sem relato, o membro nao
  // teria o que fazer nela.
  it('membro entra no Trabalho, com ou sem relato', async () => {
    const semRelato = abrir(projeto('Member'), '/projects/p-1', { guarda: false })
    expect(await screen.findByText('Relatos')).toBeTruthy()
    expect(semRelato.state.location.pathname).toBe('/projects/p-1/reports')
    cleanup()

    const comRelato = abrir(projeto('Member', false, JA_RECEBEU), '/projects/p-1', {
      guarda: false,
    })
    expect(await screen.findByText('Relatos')).toBeTruthy()
    expect(comRelato.state.location.pathname).toBe('/projects/p-1/reports')
  })

  // `replace`: o voltar do navegador nao pode cair de novo na porta, que mandaria
  // para a mesma tela — a pessoa ficaria presa nela.
  it('a porta não fica no histórico', async () => {
    const router = abrir(projeto('Member'), '/projects/p-1', { guarda: false })
    await screen.findByText('Relatos')
    expect(router.state.historyAction).toBe('REPLACE')
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
