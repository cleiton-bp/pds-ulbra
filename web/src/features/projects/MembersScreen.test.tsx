// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectInvitationsViewModel,
  ProjectInvitationViewModel,
  ProjectViewModel,
  TeamMemberViewModel,
} from '@/contracts'
import { MembersScreen } from '@/features/projects/MembersScreen'
import { useToastStore } from '@/shared/components/toastStore'
import { escolherNoSelect, instalarRemendosDoRadix } from '@/test/radixNoJsdom'

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
    LastReportReceivedAt: null,
    LastActivityAt: null,
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

function montar(project: ProjectViewModel, ancora = '') {
  const router = createMemoryRouter(
    [
      { path: '/projects', element: <p>hub</p> },
      {
        path: '/p',
        element: <Outlet context={{ project }} />,
        children: [{ index: true, element: <MembersScreen /> }],
      },
    ],
    { initialEntries: [`/p${ancora}`] },
  )
  render(<RouterProvider router={router} />)
  return router
}

/** Quem administra ve duas abas; os convites ficam na segunda. */
function abrirConvites() {
  fireEvent.click(screen.getByRole('tab', { name: /^Convites/ }))
}

/** Escreve no campo do convite e clica em Convidar. */
function convidar(endereco: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'E-mail de quem vai entrar' }), {
    target: { value: endereco },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Convidar' }))
}

const DIA_MS = 86_400_000

// O papel e uma caixa de escolha do produto, e o jsdom nao tem o que ela usa para abrir.
instalarRemendosDoRadix()

describe('MembersScreen', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    useToastStore.setState({ toasts: [] })
  })

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
    const lista = screen.getByRole('list')
    expect(within(lista).getByText('Dono')).toBeTruthy()
    expect(within(lista).getAllByText('Administrador').length).toBe(1)
    expect(screen.queryByText('Convidar alguém')).toBeNull()
    // Sem convites para ver, nao ha abas: so o time, com a contagem no titulo.
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Time · 3' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Remover/ })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    // Sair e da propria pessoa: o unico botao e o da linha dela.
    const eu = screen.getByText('Bruno Membro').closest('li') as HTMLElement
    expect(within(eu).getByRole('button', { name: 'Sair do time' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Sair do time' })).toHaveLength(1)
    // A lista de convites nem e pedida: ela e so de quem administra.
    expect(estado.chamadas).not.toContain('listar convites')
  })

  it('o administrador ve cada convite com o selo de onde o e-mail esta', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')
    abrirConvites()

    const linha = (email: string) => screen.getByText(email).closest('li') as HTMLElement
    expect(within(linha('eva@exemplo.com')).getByText('Enviado')).toBeTruthy()
    expect(within(linha('eva@exemplo.com')).getByText(/vale até/)).toBeTruthy()
    expect(within(linha('falhou@exemplo.com')).getByText('Não saiu')).toBeTruthy()
    expect(
      within(linha('falhou@exemplo.com')).getByText(/reenvie para tentar de novo/),
    ).toBeTruthy()
    expect(within(linha('velho@exemplo.com')).getByText('Venceu')).toBeTruthy()
    expect(within(linha('velho@exemplo.com')).getByText(/reenvie para valer de novo/)).toBeTruthy()
    // O link do convite nao aparece em lugar nenhum.
    expect(document.body.textContent).not.toMatch(/invite#t=/)
  })

  it('convidar chama a rota com o endereco e o papel, e o convite entra na lista', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')
    abrirConvites()

    convidar('Nova@Exemplo.com')

    await screen.findByText('nova@exemplo.com')
    expect(estado.chamadas).toContain('convidar Nova@Exemplo.com Member')
  })

  it('a recusa da API ao convidar aparece no campo', async () => {
    // O que a tela nao sabe sozinha — o limite por hora — so a API diz.
    estado.falhaAoConvidar = 'O projeto ja mandou convites demais nesta hora.'
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')
    abrirConvites()

    convidar('nova@exemplo.com')

    // A API escreve sem acento; a tela acentua no caminho (`acentuar`).
    await screen.findByText('O projeto já mandou convites demais nesta hora.')
    expect(estado.chamadas).toContain('convidar nova@exemplo.com Member')
  })

  it('reenviar e cancelar chamam as rotas do convite certo', async () => {
    montar(projeto('Administrator', true))
    const linha = (await screen.findByText('falhou@exemplo.com')).closest('li') as HTMLElement
    abrirConvites()

    fireEvent.click(
      within(linha).getByRole('button', { name: 'Reenviar o convite para falhou@exemplo.com' }),
    )
    await waitFor(() => expect(estado.chamadas).toContain('reenviar falhou'))

    const vencido = screen.getByText('velho@exemplo.com').closest('li') as HTMLElement
    fireEvent.click(
      within(vencido).getByRole('button', { name: 'Cancelar o convite para velho@exemplo.com' }),
    )
    // A confirmacao diz de quem e o convite.
    expect(await screen.findByText('Cancelar o convite de velho@exemplo.com?')).toBeTruthy()
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
    abrirConvites()
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
    // A confirmacao diz o nome: "Remover do time" sozinho nao diz quem sai.
    expect(await screen.findByText('Remover Bruno Membro do time?')).toBeTruthy()
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

  it('quem e so membro tambem sai do time pela propria linha, e vai para a lista de projetos', async () => {
    estado.time[1] = { ...estado.time[1], IsYou: true } as TeamMemberViewModel
    const router = montar(projeto('Member'))
    const eu = (await screen.findByText('Bruno Membro')).closest('li') as HTMLElement

    fireEvent.click(within(eu).getByRole('button', { name: 'Sair do time' }))
    // Sair pede confirmacao: voltar depende de alguem que administra convidar de novo.
    expect(await screen.findByText(/Você perde o acesso a este projeto agora/)).toBeTruthy()
    expect(estado.chamadas).not.toContain('remover bruno')
    fireEvent.click(screen.getByRole('button', { name: 'Sair do time' }))

    await waitFor(() => expect(estado.chamadas).toContain('remover bruno'))
    await waitFor(() => expect(router.state.location.pathname).toBe('/projects'))
  })

  it('deixar de administrar o projeto pergunta antes, e so a confirmacao muda o papel', async () => {
    estado.time[2] = { ...estado.time[2], IsYou: true } as TeamMemberViewModel
    montar(projeto('Administrator'))
    await screen.findByText('Carla Admin')

    await escolherNoSelect(screen, fireEvent, 'Papel de Carla Admin', 'Membro')

    // Sem volta para quem faz: a configuracao some na hora.
    expect(await screen.findByText('Deixar de administrar este projeto?')).toBeTruthy()
    expect(estado.chamadas).not.toContain('papel carla Member')

    fireEvent.click(screen.getByRole('button', { name: 'Deixar de administrar' }))
    await waitFor(() => expect(estado.chamadas).toContain('papel carla Member'))
  })

  it('rebaixar outra pessoa nao pergunta: o papel muda na hora', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('Carla Admin')

    await escolherNoSelect(screen, fireEvent, 'Papel de Carla Admin', 'Membro')

    await waitFor(() => expect(estado.chamadas).toContain('papel carla Member'))
    expect(screen.queryByText('Deixar de administrar este projeto?')).toBeNull()
  })

  it('o convite novo mostra o e-mail na fila, e passa a "enviado" sozinho', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')
    abrirConvites()

    convidar('nova@exemplo.com')
    const linha = (await screen.findByText('nova@exemplo.com')).closest('li') as HTMLElement
    expect(within(linha).getByText('Na fila')).toBeTruthy()

    // No servidor, o consumidor da fila mandou.
    const atual = estado.convites as ProjectInvitationsViewModel
    estado.convites = {
      ...atual,
      Items: [convite('novo', 'nova@exemplo.com'), ...atual.Items],
    }
    await waitFor(() => expect(within(linha).getByText('Enviado')).toBeTruthy(), {
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
    abrirConvites()

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
    abrirConvites()

    fireEvent.click(
      within(linha).getByRole('button', { name: 'Reenviar o convite para preso@exemplo.com' }),
    )
    await waitFor(() => expect(estado.chamadas).toContain('reenviar preso'))
  })

  // ─── Selo do e-mail e fim do "enviando" eterno ─────────────────────────────

  it('depois das 15 perguntas, a linha diz "Ainda na fila" e "Atualizar" pergunta de novo', async () => {
    // So o relogio das perguntas e de mentira: o das esperas do teste continua de verdade.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const atual = estado.convites as ProjectInvitationsViewModel
    estado.convites = {
      ...atual,
      Items: [convite('preso', 'preso@exemplo.com', { EmailStatus: 'Pending', EmailSentAt: null })],
    }
    montar(projeto('Administrator', true))
    const linha = (await screen.findByText('preso@exemplo.com')).closest('li') as HTMLElement
    abrirConvites()
    expect(within(linha).getByText('Na fila')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000 * 15)
    })
    expect(within(linha).getByText('Ainda na fila')).toBeTruthy()
    expect(within(linha).queryByText('Na fila')).toBeNull()

    // O consumidor da fila mandou; "Atualizar" pergunta na hora.
    estado.convites = {
      ...atual,
      Items: [convite('preso', 'preso@exemplo.com')],
    }
    fireEvent.click(within(linha).getByRole('button', { name: 'Atualizar' }))
    expect(await within(linha).findByText('Enviado')).toBeTruthy()
  })

  it('"Reenviar" so fica em destaque no que nao saiu e no que venceu', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')
    abrirConvites()

    const reenviar = (email: string) =>
      screen.getByRole('button', { name: `Reenviar o convite para ${email}` }).className
    // Secundario tem borda; fantasma nao.
    expect(reenviar('falhou@exemplo.com')).toContain('border-border')
    expect(reenviar('velho@exemplo.com')).toContain('border-border')
    expect(reenviar('eva@exemplo.com')).toContain('border-transparent')
  })

  // ─── Papeis explicados ─────────────────────────────────────────────────────

  it('a tela diz o que cada papel faz, e o resto fica em "Como funciona"', async () => {
    montar(projeto('Member'))
    await screen.findByText('Bruno Membro')

    expect(
      screen.getByText(
        'Administrador configura, convida e muda papéis; Membro trabalha nos cards.',
      ),
    ).toBeTruthy()
    const detalhes = screen.getByText('Como funciona').closest('details') as HTMLDetailsElement
    expect(detalhes.open).toBe(false)
    expect(within(detalhes).getByText(/não muda de papel e não sai do time/)).toBeTruthy()
  })

  it('no convite, o papel e escolhido em blocos e vai para a rota', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')
    abrirConvites()

    const grupo = screen.getByRole('radiogroup', { name: 'Papel de quem vai entrar' })
    expect(
      (within(grupo).getByRole('radio', { name: /^Membro/ }) as HTMLInputElement).checked,
    ).toBe(true)
    fireEvent.click(within(grupo).getByRole('radio', { name: /^Administrador/ }))
    convidar('nova@exemplo.com')

    await waitFor(() =>
      expect(estado.chamadas).toContain('convidar nova@exemplo.com Administrator'),
    )
  })

  // ─── Abas ──────────────────────────────────────────────────────────────────

  it('quem administra ve as abas Time e Convites, com o Time aberto e as duas montadas', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('Bruno Membro')

    const time = await screen.findByRole('tab', { name: 'Time · 3' })
    expect(time.getAttribute('aria-selected')).toBe('true')
    // Um nao saiu e outro venceu: a aba acende, e diz isso tambem por escrito.
    const convites = await screen.findByRole('tab', {
      name: 'Convites · 3, algum precisa de atenção',
    })
    expect(convites.getAttribute('aria-selected')).toBe('false')
    // A aba fechada ja leu os convites: o envio e acompanhado com o Time na frente.
    expect(estado.chamadas).toContain('listar convites')
    expect(screen.queryByRole('textbox', { name: 'E-mail de quem vai entrar' })).toBeNull()

    // As setas andam entre as abas e escolhem.
    fireEvent.keyDown(time, { key: 'ArrowRight' })
    expect(convites.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(convites)
    expect(screen.getByRole('textbox', { name: 'E-mail de quem vai entrar' })).toBeTruthy()
    expect(screen.getByRole('tabpanel', { name: /^Convites/ })).toBeTruthy()
  })

  it('sem convite com problema, a aba de Convites so conta', async () => {
    estado.convites = {
      ...(estado.convites as ProjectInvitationsViewModel),
      Items: [convite('enviado', 'eva@exemplo.com')],
    }
    montar(projeto('Administrator', true))

    expect(await screen.findByRole('tab', { name: 'Convites · 1' })).toBeTruthy()
  })

  it('a busca da configuracao leva direto a aba de Convites', async () => {
    montar(projeto('Administrator', true), '#convidar')
    await screen.findByText('eva@exemplo.com')

    expect(screen.getByRole('tab', { name: /^Convites/ }).getAttribute('aria-selected')).toBe(
      'true',
    )
    expect(screen.getByRole('textbox', { name: 'E-mail de quem vai entrar' })).toBeTruthy()
  })

  it('"Convidar alguém" no Time abre os Convites com o campo em foco', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')

    fireEvent.click(screen.getByRole('button', { name: 'Convidar alguém' }))

    const campo = screen.getByRole('textbox', { name: 'E-mail de quem vai entrar' })
    await waitFor(() => expect(document.activeElement).toBe(campo))
  })

  // ─── Confirmacao com nome e desfazer ───────────────────────────────────────

  it('mudar o papel de alguem avisa com "Desfazer", que devolve o papel', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('Carla Admin')

    await escolherNoSelect(screen, fireEvent, 'Papel de Carla Admin', 'Membro')
    await waitFor(() => expect(estado.chamadas).toContain('papel carla Member'))

    const aviso = useToastStore.getState().toasts.at(-1)
    expect(aviso?.message).toBe('Carla Admin agora é membro.')
    expect(aviso?.action?.label).toBe('Desfazer')

    act(() => aviso?.action?.run())
    await waitFor(() => expect(estado.chamadas).toContain('papel carla Administrator'))
    // O desfazer nao oferece outro desfazer.
    await waitFor(() =>
      expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
        'Carla Admin voltou a ser administrador.',
      ),
    )
    expect(useToastStore.getState().toasts.at(-1)?.action).toBeUndefined()
  })

  // ─── O que a API ja manda ──────────────────────────────────────────────────

  it('mostra ha quanto tempo a pessoa entrou, e quem convidou e quando', async () => {
    estado.time[1] = {
      ...estado.time[1],
      JoinedAt: new Date(Date.now() - 90 * DIA_MS).toISOString(),
    } as TeamMemberViewModel
    estado.convites = {
      ...(estado.convites as ProjectInvitationsViewModel),
      Items: [
        convite('enviado', 'eva@exemplo.com', {
          CreatedAt: new Date(Date.now() - 3 * DIA_MS).toISOString(),
        }),
      ],
    }
    montar(projeto('Administrator', true))

    const bruno = (await screen.findByText('Bruno Membro')).closest('li') as HTMLElement
    expect(within(bruno).getByText('bruno@exemplo.com · entrou há 3 meses')).toBeTruthy()
    // O dono nao tem data de entrada: a linha dele fica so com o e-mail.
    const dona = screen.getByText('Ana Dona').closest('li') as HTMLElement
    expect(within(dona).queryByText(/entrou/)).toBeNull()

    abrirConvites()
    const linha = screen.getByText('eva@exemplo.com').closest('li') as HTMLElement
    expect(within(linha).getByText(/convidado por Ana Dona há 3 dias/)).toBeTruthy()
  })

  // ─── Validacao antes de mandar ─────────────────────────────────────────────

  it('o convite confere o endereco, o time e os convites abertos antes de ir a API', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')
    await screen.findByText('Bruno Membro')
    abrirConvites()

    convidar('sem-arroba')
    expect(await screen.findByText(/Esse endereço não parece um e-mail/)).toBeTruthy()

    convidar('Bruno@Exemplo.com')
    expect(await screen.findByText('Essa pessoa já está no time.')).toBeTruthy()

    convidar('eva@exemplo.com')
    expect(await screen.findByText(/Essa pessoa já tem um convite aberto/)).toBeTruthy()

    expect(estado.chamadas.some((chamada) => chamada.startsWith('convidar'))).toBe(false)
  })

  // ─── Prazo como dica ───────────────────────────────────────────────────────

  it('o prazo e uma dica; "mudar" abre a escolha ali, e ela salva na hora', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('eva@exemplo.com')
    abrirConvites()

    expect(screen.getByText(/Vale por 7 dias/)).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: 'Prazo do convite' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Mudar o prazo do convite' }))
    await escolherNoSelect(screen, fireEvent, 'Prazo do convite', '14 dias')

    await waitFor(() => expect(estado.chamadas).toContain('prazo 14'))
    expect(await screen.findByText(/Vale por 14 dias/)).toBeTruthy()
  })

  it('a busca da configuracao leva ao prazo ja aberto', async () => {
    montar(projeto('Administrator', true), '#prazo-do-convite')
    await screen.findByText('eva@exemplo.com')

    expect(screen.getByRole('combobox', { name: 'Prazo do convite' })).toBeTruthy()
  })

  // ─── Busca e ordem ─────────────────────────────────────────────────────────

  it('time pequeno nao tem busca, e quem administra vem primeiro', async () => {
    montar(projeto('Administrator', true))
    await screen.findByText('Bruno Membro')

    expect(screen.queryByRole('textbox', { name: 'Buscar no time' })).toBeNull()
    const nomes = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')
    expect(nomes[0]).toMatch(/^.*Ana Dona/)
    expect(nomes[1]).toMatch(/Carla Admin/)
    expect(nomes[2]).toMatch(/Bruno Membro/)
  })

  it('time grande ganha busca por nome ou e-mail, sem acento', async () => {
    estado.time = [
      ...estado.time,
      ...['Dani', 'Edu', 'Fabi', 'Gabi', 'Hugo'].map((nome) =>
        pessoa(nome.toLowerCase(), `${nome} Souza`, 'Member'),
      ),
      pessoa('jose', 'José Lima', 'Member'),
      pessoa('iris', 'Íris Admin', 'Administrator'),
    ]
    montar(projeto('Administrator', true))
    await screen.findByText('José Lima')
    expect(await screen.findByRole('tab', { name: 'Time · 10' })).toBeTruthy()

    const busca = screen.getByRole('textbox', { name: 'Buscar no time' })
    fireEvent.change(busca, { target: { value: 'jose' } })
    expect(screen.getByText('José Lima')).toBeTruthy()
    expect(screen.queryByText('Bruno Membro')).toBeNull()

    fireEvent.change(busca, { target: { value: 'hugo@' } })
    expect(screen.getByText('Hugo Souza')).toBeTruthy()

    fireEvent.change(busca, { target: { value: 'ninguem' } })
    expect(screen.getByText('Ninguém no time com “ninguem”.')).toBeTruthy()

    // Sem busca, quem administra (Iris, que a API mandou por ultimo) sobe.
    fireEvent.change(busca, { target: { value: '' } })
    const nomes = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '')
    expect(nomes.slice(0, 3).join(' ')).toMatch(/Ana Dona.*Carla Admin.*Íris Admin/)
  })
})
