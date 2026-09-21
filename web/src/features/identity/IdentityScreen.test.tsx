// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IdentitySettingsViewModel, ProjectViewModel } from '@/contracts'
import { IdentityScreen } from '@/features/identity/IdentityScreen'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Esta tela ensina, e o ensino e o requisito.** O criterio de pronto da etapa
 * diz: "leio a tela sem saber o que e HMAC e consigo montar a integracao com o que
 * esta escrito ali". Uma tela com tres radios e os nomes dos modos passaria em
 * qualquer teste de comportamento e falharia no criterio — por isso o que cada
 * modo **destrava** e o que **custa** sao verificados como conteudo, e nao como
 * enfeite que alguem pode apagar sem quebrar nada.
 *
 * **Projeto sem configuracao salva nao e projeto sem configuracao.** A API
 * responde com o padrao, e a tela desenha aquilo como escolha corrente — sem
 * nenhum estado de "vazio" que sugira que nada esta valendo.
 *
 * **O botao so age quando ha o que salvar**, e o que se manda e o modo escolhido —
 * nao o que veio do servidor.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<IdentitySettingsViewModel>>(),
  salvar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectIdentitySettingsService: {
      getIdentitySettings: dublê.ler,
      saveIdentitySettings: dublê.salvar,
    },
  }
})

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-08-01T12:00:00.000Z',
  UpdatedAt: '2026-08-01T12:00:00.000Z',
}

/** O padrao de fabrica, que e o que a API responde para quem nunca salvou nada. */
const padrao: IdentitySettingsViewModel = {
  Mode: 'Protocol',
  Visibility: 'Private',
  AsksForName: false,
}

/** O grupo de escolha, pelo `fieldset` — as duas perguntas convivem na mesma tela. */
function grupo(titulo: RegExp) {
  return within(screen.getByRole('group', { name: titulo }))
}

const MODO = /Como a pessoa é reconhecida/
const VISIBILIDADE = /Quem pode ver os relatos/

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ project: projeto }} />,
        children: [{ index: true, element: <IdentityScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
}

describe('IdentityScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.ler.mockResolvedValue(padrao)
  })

  it('desenha o padrão como escolha corrente, e não como ausência de escolha', async () => {
    montar()

    const protocolo = await screen.findByRole('radio', { name: /Protocolo/ })
    expect((protocolo as HTMLInputElement).checked).toBe(true)

    expect(
      (screen.getByRole('radio', { name: /Código pessoal/ }) as HTMLInputElement).checked,
    ).toBe(false)
  })

  it('oferece os três modos, e nenhum a mais', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(grupo(MODO).getAllByRole('radio')).toHaveLength(3)
  })

  it('cada modo diz o que destrava e o que custa', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })

    // Três de cada: é o que impede alguém acrescentar um modo e esquecer de
    // explicá-lo — que é justamente como esta tela deixaria de cumprir o critério.
    expect(grupo(MODO).getAllByText('Destrava:')).toHaveLength(3)
    expect(grupo(MODO).getAllByText('Custo:')).toHaveLength(3)
  })

  it('diz que a lista pessoal não existe no modo protocolo', async () => {
    montar()

    const protocolo = await screen.findByRole('radio', { name: /Protocolo/ })

    // A regra que atravessa a etapa precisa estar legível **junto da opção**, e
    // não num aviso que aparece depois de escolher.
    expect(protocolo.closest('label')?.textContent).toMatch(/não há lista pessoal/i)
  })

  it('avisa que trocar de modo não mexe no passado', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(screen.getByText(/Trocar de modo não mexe no passado/i)).toBeTruthy()
  })

  it('não salva enquanto nada mudou', async () => {
    montar()

    const salvar = await screen.findByRole('button', { name: 'Salvar' })
    expect((salvar as HTMLButtonElement).disabled).toBe(true)
  })

  it('manda o modo escolhido, e não o que veio do servidor', async () => {
    dublê.salvar.mockResolvedValue({
      Mode: 'PersonalCode',
      Visibility: 'Private',
      AsksForName: false,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Código pessoal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    // **Os dois campos vão juntos**, e o que não mudou vai igual: mandar só o
    // campo alterado faria a API conferir o par com metade dele.
    expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
      Mode: 'PersonalCode',
      Visibility: 'Private',
      AsksForName: false,
    })
  })

  it('não deixa escolher a identidade herdada, que ainda não tem quem a obedeça', async () => {
    montar()

    const herdada = await screen.findByRole('radio', { name: /Identidade do seu sistema/ })
    expect((herdada as HTMLInputElement).disabled).toBe(true)

    // E diz por quê, junto da opção: um controle cinza sem explicação é pior do
    // que não ter o controle.
    expect(herdada.closest('label')?.textContent).toMatch(/ainda não está disponível/i)
  })

  it('mas se já for o valor salvo, a tela mostra — e não esconde o estado do projeto', async () => {
    dublê.ler.mockResolvedValue({
      Mode: 'InheritedIdentity',
      Visibility: 'Private',
      AsksForName: false,
    })
    montar()

    const herdada = await screen.findByRole('radio', { name: /Identidade do seu sistema/ })
    expect((herdada as HTMLInputElement).checked).toBe(true)
    expect((herdada as HTMLInputElement).disabled).toBe(false)
  })

  it('depois de salvar, o botão volta a ficar quieto', async () => {
    dublê.salvar.mockResolvedValue({
      Mode: 'PersonalCode',
      Visibility: 'Private',
      AsksForName: false,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Código pessoal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    )
  })

  it('oferece os três níveis de visibilidade, e o padrão é o mais fechado', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(grupo(VISIBILIDADE).getAllByRole('radio')).toHaveLength(3)

    const privado = grupo(VISIBILIDADE).getByRole('radio', { name: /Privado/ })
    expect((privado as HTMLInputElement).checked).toBe(true)
  })

  it('cada nível diz quem vê e o que custa', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })

    // "Público" é palavra que cada um entende de um jeito. O que trava a tela é
    // dizer **quem vê**, e não repetir o nome do nível com outras palavras.
    expect(grupo(VISIBILIDADE).getAllByText('Quem vê:')).toHaveLength(3)
    expect(grupo(VISIBILIDADE).getAllByText('Custo:')).toHaveLength(3)
  })

  it('no modo protocolo, público identificado não dá para escolher — e a tela diz por quê', async () => {
    montar()

    const identificado = await screen.findByRole('radio', { name: /Público identificado/ })
    expect((identificado as HTMLInputElement).disabled).toBe(true)

    // A trava depende da outra pergunta da tela, então o motivo tem de estar
    // junto: cinza sem explicação faz quem configura concluir que está quebrado.
    expect(identificado.closest('label')?.textContent).toMatch(
      /Depende de um modo que identifique/i,
    )
  })

  it('escolher o código pessoal destrava o público identificado, ali mesmo', async () => {
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Código pessoal/ }))

    const identificado = screen.getByRole('radio', { name: /Público identificado/ })
    expect((identificado as HTMLInputElement).disabled).toBe(false)
  })

  it('voltar ao protocolo não troca a visibilidade sozinho: avisa e tranca o salvar', async () => {
    dublê.ler.mockResolvedValue({
      Mode: 'PersonalCode',
      Visibility: 'PublicIdentified',
      AsksForName: false,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Protocolo/ }))

    // A escolha continua onde estava. Mudar quem pode ver os relatos por causa de
    // um clique em **outra** pergunta seria decidir no lugar de quem configura.
    expect(
      (screen.getByRole('radio', { name: /Público identificado/ }) as HTMLInputElement).checked,
    ).toBe(true)

    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect(screen.getByText(/o protocolo não identifica ninguém/i)).toBeTruthy()
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('diz que escolher público ainda não publica nada', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })

    // A ordem é de segurança: a lista pública nasce atrás da moderação, e nunca
    // antes dela. Quem escolhe hoje precisa saber que nada sai daqui ainda.
    expect(screen.getByText(/Escolher público ainda não publica nada/i)).toBeTruthy()
  })

  it('manda a visibilidade escolhida junto do modo', async () => {
    dublê.salvar.mockResolvedValue({
      Mode: 'Protocol',
      Visibility: 'PublicAnonymous',
      AsksForName: false,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Público anônimo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
      Mode: 'Protocol',
      Visibility: 'PublicAnonymous',
      AsksForName: false,
    })
  })

  it('a falha ao carregar não mente dizendo que o projeto mudou', async () => {
    dublê.ler.mockRejectedValue(new Error('rede'))
    montar()

    expect(await screen.findByText(/Nada mudou/i)).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
  })
})
