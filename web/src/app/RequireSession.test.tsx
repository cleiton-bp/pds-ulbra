// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RequireSession } from '@/app/RequireSession'
import { useSessionStore } from '@/features/auth/sessionStore'
import { useProjectsStore } from '@/features/projects/projectsStore'

/**
 * O QUE ESTE TESTE TRAVA, E POR QUE.
 *
 * Sem sessao, a lista de projetos da pessoa anterior sai da memoria. No mesmo
 * navegador, quem entrasse em seguida veria por um instante os projetos — e os
 * nomes das contas — de quem saiu, ate a lista nova chegar.
 */
vi.mock('@/features/auth/LoginScreen', () => ({ LoginScreen: () => <p>Entrar</p> }))

describe('RequireSession', () => {
  afterEach(cleanup)

  it('sem sessão, esquece os projetos que estavam na memória', async () => {
    useProjectsStore.setState({
      status: 'ready',
      projects: [
        {
          PublicId: 'p-1',
          Name: 'Projeto de quem saiu',
          Status: 'Active',
          CreatedAt: '2026-10-01T12:00:00.000Z',
          UpdatedAt: '2026-10-01T12:00:00.000Z',
          Account: { PublicId: 'c-1', Name: 'Conta de quem saiu' },
          Role: 'Administrator',
          IsAccountOwner: true,
          LastReportReceivedAt: null,
          LastActivityAt: null,
        },
      ],
    })
    useSessionStore.setState({ status: 'anonymous', user: null })

    render(<RequireSession />)

    expect(await screen.findByText('Entrar')).toBeTruthy()
    expect(useProjectsStore.getState().projects).toEqual([])
    expect(useProjectsStore.getState().status).toBe('idle')
  })
})
