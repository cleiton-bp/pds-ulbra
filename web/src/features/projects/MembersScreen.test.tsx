// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectInvitationsViewModel,
  ProjectInvitationViewModel,
  ProjectViewModel,
  TeamMemberViewModel,
} from '@/contracts'
import { MembersScreen } from '@/features/projects/MembersScreen'

/**
 * O que estes testes travam: o que cada papel ve, e que cada acao chama a rota
 * certa e muda a tela. O `@/data` e um duble deste arquivo; as regras de servidor
 * (quem pode, o dono que nao sai) sao provadas contra a API de verdade, e aqui so
 * entra o que a tela faz com a resposta.
 */
const estado = vi.hoisted(() => ({
  time: [] as TeamMemberViewModel[],
  convites: null as ProjectInvitationsViewModel | null,
  chamadas: [] as string[],
  falhaAoConvidar: null as string | null,
  /** Segura a leitura da lista ate ser solta — para provar a leitura que chega atrasada. */
  portao: null as Promise<void> | null,
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectService: { ...real.projectService, listProjects: async () => [] },
    projectTeamService: {
      listMembers: async () => estado.time,
      changeMemberRole: async (
        _: string,
        userPublicId: string,
        request: { Role: 'Administrator' | 'Member' },
      ) => {
        estado.chamadas.push(`papel ${userPublicId} ${request.Role}`)
        const membro = estado.time.find(
          (item) => item.UserPublicId === userPublicId,
        ) as TeamMemberViewModel
        return { ...membro, Role: request.Role }
      },
      removeMember: async (_: string, userPublicId: string) => {
        estado.chamadas.push(`remover ${userPublicId}`)
      },
      getTeamSettings: async () => ({ InvitationValidityDays: 7 }),
      saveTeamSettings: async (_: string, request: { InvitationValidityDays: number }) => {
        estado.chamadas.push(`prazo ${request.InvitationValidityDays}`)
        return request
      },
      listInvitations: async () => {
        estado.chamadas.push('listar convites')
        // O que o servidor tinha quando a leitura saiu, mesmo que ela chegue depois.
        const naHora = estado.convites
        if (estado.portao) await estado.portao
        return naHora
      },
      // Como a API de verdade: o convite volta com o e-mail ainda na fila.
      createInvitation: async (_: string, request: { Email: string; Role: string }) => {
        estado.chamadas.push(`convidar ${request.Email} ${request.Role}`)
        if (estado.falhaAoConvidar) throw new real.PanelError(estado.falhaAoConvidar, 409)
        return convite('novo', request.Email.trim().toLowerCase(), {
          EmailStatus: 'Pending',
          EmailSentAt: null,
        })
      },
      resendInvitation: async (_: string, id: string) => {
        estado.chamadas.push(`reenviar ${id}`)
        return convite(id, 'falhou@exemplo.com', { EmailStatus: 'Pending', EmailSentAt: null })
      },
      revokeInvitation: async (_: string, id: string) => {
        estado.chamadas.push(`cancelar ${id}`)
        const atual = estado.convites as ProjectInvitationsViewModel
        estado.convites = { ...atual, Items: atual.Items.filter((item) => item.PublicId !== id) }
      },
      previewInvitation: async () => {
        throw new Error('nao e usado nesta tela')
      },
      acceptInvitation: async () => {
        throw new Error('nao e usado nesta tela')
      },
    },
  }
})

function projeto(papel: 'Administrator' | 'Member', dono = false): ProjectViewModel {
  return {
    PublicId: 'p-1',
    Name: 'Loja Online',
    Status: 'Active',
    CreatedAt: '2026-08-01T12:00:00.000Z',
    UpdatedAt: '2026-08-01T12:00:00.000Z',
    Account: { PublicId: 'conta-a', Name: 'Conta A' },
    Role: papel,
    IsAccountOwner: dono,
  }
}

function pessoa(
  id: string,
  nome: string,
  papel: 'Administrator' | 'Member',
  extra: Partial<TeamMemberViewModel> = {},
): TeamMemberViewModel {
  return {
    UserPublicId: id,
    Name: nome,
    Email: `${id}@exemplo.com`,
    AvatarUrl: null,
    Role: papel,
    IsAccountOwner: false,
    IsYou: false,
    JoinedAt: '2026-09-01T12:00:00.000Z',
    ...extra,
  }
}

function convite(
  id: string,
  email: string,
  extra: Partial<ProjectInvitationViewModel> = {},
): ProjectInvitationViewModel {
  return {
    PublicId: id,
    Email: email,
    Role: 'Member',
    InvitedByName: 'Ana Dona',
    CreatedAt: new Date().toISOString(),
    ExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    IsExpired: false,
    EmailStatus: 'Sent',
    EmailSentAt: new Date().toISOString(),
    ...extra,
  }
}

function montar(project: ProjectViewModel) {
  const router = createMemoryRouter(
    [
      { path: '/projects', element: <p>hub</p> },
      {
        path: '/p',
        element: <Outlet context={{ project }} />,
        children: [{ index: true, element: <MembersScreen /> }],
      },
    ],
    { initialEntries: ['/p'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('MembersScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    estado.chamadas = []
    estado.falhaAoConvidar = null
    estado.portao = null
    estado.time = [
      pessoa('ana', 'Ana Dona', 'Administrator', { IsAccountOwner: true, JoinedAt: null }),
      pessoa('bruno', 'Bruno Membro', 'Member'),
      pessoa('carla', 'Carla Admin', 'Administrator'),
    ]
    estado.convites = {
      Items: [
        convite('enviado', 'eva@exemplo.com'),
        convite('falhou', 'falhou@exemplo.com', { EmailStatus: 'Failed', EmailSentAt: null }),
        convite('vencido', 'velho@exemplo.com', { IsExpired: true }),
      ],
      CanInvite: true,
      UnavailableReason: null,
      ValidityDays: 7,
      MaxPerHour: 20,
    }
  })

  it('quem e so membro ve o time, sem convidar, sem mudar papel e sem remover', async () => {
    estado.time[1] = { ...estado.time[1], IsYou: true } as TeamMemberViewModel
    montar(projeto('Member'))

    await screen.findByText('Bruno Membro')
    expect(screen.getByText('(você)')).toBeTruthy()
    expect(screen.getByText('Dono')).toBeTruthy()
    expect(screen.getAllByText('Administrador').length).toBe(1)
    expect(screen.queryByText('Convidar alguém')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Remover|^Sair do time/ })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    // A lista de convites nem e pedida: ela e so de quem administra.
    expect(estado.chamadas).not.toContain('listar convites')
  })

  it('o administrador ve cada convite com onde o e-mail esta', async () => {
    montar(projeto('Administrator', true))

    await screen.findByText('eva@exemplo.com')
    expect(screen.getByText(/E-mail enviado/)).toBeTruthy()
    expect(screen.getByText('O e-mail não saiu. Reenvie para tentar de novo.')).toBeTruthy()
    expect(screen.getByText('Venceu. Reenvie para valer de novo.')).toBeTruthy()
    // O link do convite nao aparece em lugar nenhum.
    expect(document.body.textContent).not.toMatch(/invite#t=/)
  })

  it('convidar chama a rota com o endereco e o papel, e o convite entra na lista', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')

    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail de quem vai entrar' }), {
      target: { value: 'Nova@Exemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Convidar' }))

    await screen.findByText('nova@exemplo.com')
    expect(estado.chamadas).toContain('convidar Nova@Exemplo.com Member')
  })

  it('a recusa da API ao convidar aparece no campo', async () => {
    estado.falhaAoConvidar = 'Essa pessoa ja esta no time.'
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')

    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail de quem vai entrar' }), {
      target: { value: 'bruno@exemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Convidar' }))

    await screen.findByText('Essa pessoa ja esta no time.')
  })

  it('reenviar e cancelar chamam as rotas do convite certo', async () => {
    montar(projeto('Administrator', true))
    const linha = (await screen.findByText('falhou@exemplo.com')).closest('li') as HTMLElement

    fireEvent.click(
      within(linha).getByRole('button', { name: 'Reenviar o convite para falhou@exemplo.com' }),
    )
    await waitFor(() => expect(estado.chamadas).toContain('reenviar falhou'))

    const vencido = screen.getByText('velho@exemplo.com').closest('li') as HTMLElement
    fireEvent.click(
      within(vencido).getByRole('button', { name: 'Cancelar o convite para velho@exemplo.com' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar convite' }))

    await waitFor(() => expect(estado.chamadas).toContain('cancelar vencido'))
    await waitFor(() => expect(screen.queryByText('velho@exemplo.com')).toBeNull())
  })

  it('servidor sem fila: a tela diz o motivo e nao oferece o campo', async () => {
    estado.convites = {
      ...(estado.convites as ProjectInvitationsViewModel),
      CanInvite: false,
      UnavailableReason: 'QueueNotConfigured',
    }
    montar(projeto('Administrator', true))

    await screen.findByText(/a fila de envio não está configurada/)
    expect(screen.queryByRole('textbox', { name: 'E-mail de quem vai entrar' })).toBeNull()
  })

  it('o dono nao tem papel para mudar nem botao de remover; os outros tem', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('Bruno Membro')

    const dona = screen.getByText('Ana Dona').closest('li') as HTMLElement
    expect(within(dona).queryByRole('combobox')).toBeNull()
    expect(within(dona).queryByRole('button', { name: /^Remover/ })).toBeNull()

    const bruno = screen.getByText('Bruno Membro').closest('li') as HTMLElement
    expect(within(bruno).getByRole('combobox', { name: /Papel de Bruno Membro/ })).toBeTruthy()
  })

  it('remover pede confirmacao, chama a rota e tira a pessoa da lista', async () => {
    montar(projeto('Administrator', true))
    const bruno = (await screen.findByText('Bruno Membro')).closest('li') as HTMLElement

    fireEvent.click(within(bruno).getByRole('button', { name: 'Remover Bruno Membro do time' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remover do time' }))

    await waitFor(() => expect(estado.chamadas).toContain('remover bruno'))
    await waitFor(() => expect(screen.queryByText('Bruno Membro')).toBeNull())
  })

  it('tirar a si mesmo do time leva para a lista de projetos', async () => {
    estado.time[2] = { ...estado.time[2], IsYou: true } as TeamMemberViewModel
    const router = montar(projeto('Administrator'))
    const eu = (await screen.findByText('Carla Admin')).closest('li') as HTMLElement

    fireEvent.click(within(eu).getByRole('button', { name: 'Sair do time' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sair do time' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'))
  })

  it('o convite novo mostra o e-mail saindo, e passa a "enviado" sozinho', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')

    fireEvent.change(screen.getByRole('textbox', { name: 'E-mail de quem vai entrar' }), {
      target: { value: 'nova@exemplo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Convidar' }))
    const linha = (await screen.findByText('nova@exemplo.com')).closest('li') as HTMLElement
    expect(within(linha).getByText('Enviando o e-mail…')).toBeTruthy()

    // No servidor, o consumidor da fila mandou.
    const atual = estado.convites as ProjectInvitationsViewModel
    estado.convites = {
      ...atual,
      Items: [convite('novo', 'nova@exemplo.com'), ...atual.Items],
    }
    await waitFor(() => expect(within(linha).getByText(/E-mail enviado/)).toBeTruthy(), {
      timeout: 4000,
    })
  })

  it('a leitura que saiu antes de cancelar nao traz o convite cancelado de volta', async () => {
    // Um convite ainda na fila faz a tela perguntar de novo a cada dois segundos.
    const atual = estado.convites as ProjectInvitationsViewModel
    estado.convites = {
      ...atual,
      Items: [
        convite('enviado', 'eva@exemplo.com', { EmailStatus: 'Pending' }),
        ...atual.Items.slice(1),
      ],
    }
    montar(projeto('Administrator', true))
    await screen.findByText('velho@exemplo.com')

    // A proxima pergunta sai e fica presa, ainda com o convite vencido na lista.
    let soltar = () => {}
    estado.portao = new Promise<void>((resolve) => {
      soltar = resolve
    })
    const antes = estado.chamadas.filter((c) => c === 'listar convites').length
    await waitFor(
      () => expect(estado.chamadas.filter((c) => c === 'listar convites').length).toBe(antes + 1),
      { timeout: 4000 },
    )

    const vencido = screen.getByText('velho@exemplo.com').closest('li') as HTMLElement
    fireEvent.click(
      within(vencido).getByRole('button', { name: 'Cancelar o convite para velho@exemplo.com' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar convite' }))
    await waitFor(() => expect(screen.queryByText('velho@exemplo.com')).toBeNull())

    // A pergunta presa chega agora, com a lista de antes do cancelamento.
    estado.portao = null
    soltar()
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.queryByText('velho@exemplo.com')).toBeNull()
  })

  it('reenviar vale com o e-mail ainda saindo: e o que solta um e-mail preso', async () => {
    const atual = estado.convites as ProjectInvitationsViewModel
    estado.convites = {
      ...atual,
      Items: [convite('preso', 'preso@exemplo.com', { EmailStatus: 'Sending', EmailSentAt: null })],
    }
    montar(projeto('Administrator', true))
    const linha = (await screen.findByText('preso@exemplo.com')).closest('li') as HTMLElement

    fireEvent.click(
      within(linha).getByRole('button', { name: 'Reenviar o convite para preso@exemplo.com' }),
    )
    await waitFor(() => expect(estado.chamadas).toContain('reenviar preso'))
  })
})
