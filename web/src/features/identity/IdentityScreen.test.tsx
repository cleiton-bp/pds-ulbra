// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  IdentitySettingsViewModel,
  ProjectPublicStageViewModel,
  ProjectViewModel,
  SaveWidgetSettingsRequest,
  WidgetSettingsViewModel,
} from '@/contracts'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { IdentityScreen } from '@/features/identity/IdentityScreen'
import { useModerationInMenu } from '@/shared/tour/moderationInMenu'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Esta tela ensina, e o ensino e o requisito.** O requisito diz: "leio a tela sem saber o que e HMAC e consigo montar a integracao com o que
 * esta escrito ali". Uma tela com tres radios e os nomes dos modos passaria em
 * qualquer teste de comportamento e falharia no criterio — por isso o que a escolha
 * **destrava** e o que **custa** sao verificados como conteudo, e nao como enfeite que
 * alguem pode apagar sem quebrar nada. So a escolhida diz: as tres de uma vez eram uma
 * parede de texto antes do primeiro clique.
 *
 * **Projeto sem configuracao salva nao e projeto sem configuracao.** A API
 * responde com o padrao, e a tela desenha aquilo como escolha corrente — sem
 * nenhum estado de "vazio" que sugira que nada esta valendo.
 *
 * **O botao so age quando ha o que salvar**, e o que se manda e o modo escolhido —
 * nao o que veio do servidor. O Salvar mora no titulo, preso no topo ao rolar, e so
 * liga com mudanca.
 *
 * **Cada grupo diz o que esta escolhido e volta ao padrao so no rascunho dele**: o modo e
 * a visibilidade sao de Quem relata, os textos sao da ferramenta.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<IdentitySettingsViewModel>>(),
  salvar: vi.fn(),
  lerFerramenta: vi.fn<() => Promise<WidgetSettingsViewModel>>(),
  salvarFerramenta: vi.fn(),
  listarEtapas: vi.fn<() => Promise<ProjectPublicStageViewModel[]>>(),
  verSegredo: vi.fn(),
  trocarSegredo: vi.fn(),
  historico: vi.fn(async () => []),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectIdentitySettingsService: {
      getIdentitySettings: dublê.ler,
      saveIdentitySettings: dublê.salvar,
      getIdentitySecret: dublê.verSegredo,
      rotateIdentitySecret: dublê.trocarSegredo,
      getIdentitySecretHistory: dublê.historico,
    },
    // A confirmacao, o topo do acompanhamento e o aviso publico sao da ferramenta.
    projectWidgetSettingsService: {
      getWidgetSettings: dublê.lerFerramenta,
      saveWidgetSettings: dublê.salvarFerramenta,
    },
    // A previa do acompanhamento mostra a jornada de verdade do projeto.
    projectPublicStageService: {
      listPublicStages: dublê.listarEtapas,
    },
  }
})

const projeto: ProjectViewModel = {
  PublicId: 'p-1',
  Name: 'Loja',
  Status: 'Active',
  CreatedAt: '2026-08-01T12:00:00.000Z',
  UpdatedAt: '2026-08-01T12:00:00.000Z',
  Account: { PublicId: 'conta-1', Name: 'Conta de teste' },
  Role: 'Administrator',
  IsAccountOwner: true,
  LastReportReceivedAt: null,
  LastActivityAt: null,
}

/** O padrao de fabrica, que e o que a API responde para quem nunca salvou nada. */
const padrao: IdentitySettingsViewModel = {
  Mode: 'Protocol',
  Visibility: 'Private',
  AsksForName: false,
  IdentityPublicKey: null,
  IdentityTokenMaxMinutes: 15,
  IdentityRequired: false,
  IdentityFormat: 'Jwt',
  IsHmacAvailable: true,
}

function etapa(PublicId: string, Label: string, Position: number): ProjectPublicStageViewModel {
  return {
    PublicId,
    Label,
    Description: `O relato está em ${Label.toLowerCase()}.`,
    NextStep: null,
    Position,
    IsTerminal: false,
    AllowsReturn: false,
    AwaitsReporter: false,
    Outcome: null,
    CreatedAt: '2026-08-01T12:00:00.000Z',
  }
}

// Fora de ordem de proposito: o exemplo segue a posicao, e nao a ordem da resposta.
const etapas = [
  etapa('e-3', 'Resolvido', 2),
  etapa('e-1', 'Recebido', 0),
  etapa('e-2', 'Em análise', 1),
]

/** O grupo de escolhas, pelo nome dele: as duas perguntas convivem na mesma tela. */
function escolhas(nome: string) {
  return within(screen.getByRole('radiogroup', { name: nome }))
}

/** O grupo da tela (a `section` em volta do acordeao), pelo titulo dele. */
function regiao(nome: string) {
  return within(screen.getByRole('region', { name: nome }))
}

const MODO = 'Como a pessoa é reconhecida'
const VISIBILIDADE = 'Quem pode ver os relatos'

/** O titulo do grupo fechado: o que esta escolhido e o que mudou. */
const resumoDo = (id: string) => document.getElementById(id)?.textContent ?? ''
const detalhesDo = (id: string) =>
  document.getElementById(id)?.closest('details') as HTMLDetailsElement

function montar(entrada = '/p/p-1/identity') {
  const router = createMemoryRouter(
    [
      {
        path: '/p/p-1',
        element: <Outlet context={{ project: projeto }} />,
        children: [
          { path: 'identity', element: <IdentityScreen /> },
          { path: 'domains', element: <p>tela de domínios</p> },
          { path: 'form-texts', element: <p>tela dos textos</p> },
        ],
      },
    ],
    { initialEntries: [entrada] },
  )

  render(<RouterProvider router={router} />)
  return router
}

/** O Salvar mora no titulo, sempre a vista: liga so com o que salvar. */
const salvarLigado = () =>
  !(screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled

/** Escreve no campo de texto com variaveis (um editor, e nao um textarea), como o teclado faria. */
function escrever(campo: HTMLElement, texto: string) {
  campo.textContent = texto
  fireEvent.input(campo)
}

/** A linguagem do servidor: uma escolha so, que vale para todos os trechos de codigo. */
const servidor = () => within(screen.getByRole('radiogroup', { name: 'Linguagem do seu servidor' }))
const escolhida = (nome: string) =>
  (servidor().getByRole('radio', { name: nome }) as HTMLInputElement).checked

describe('IdentityScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.ler.mockResolvedValue(padrao)
    dublê.lerFerramenta.mockResolvedValue(DEFAULT_WIDGET_SETTINGS)
    dublê.listarEtapas.mockResolvedValue(etapas)
    dublê.salvarFerramenta.mockImplementation(
      async (_id: string, pedido: SaveWidgetSettingsRequest) => ({
        ...DEFAULT_WIDGET_SETTINGS,
        ...pedido,
      }),
    )
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
    expect(escolhas(MODO).getAllByRole('radio')).toHaveLength(3)
  })

  it('só o modo escolhido diz o que muda para quem relata e o que pede de você, e trocar troca o texto', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    const reconhecimento = regiao('Como a pessoa é reconhecida')

    // Um de cada: as tres explicacoes de uma vez eram a parede de texto antes do clique.
    expect(reconhecimento.getAllByText('Para quem relata:')).toHaveLength(1)
    expect(reconhecimento.getAllByText('Para você:')).toHaveLength(1)
    // A regra que atravessa a tela fica legivel junto da escolha.
    expect(reconhecimento.getByText(/sem uma lista dos relatos dela/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /Código pessoal/ }))
    expect(reconhecimento.queryByText(/sem uma lista dos relatos dela/i)).toBeNull()
    expect(reconhecimento.getByText(/até em outro aparelho/i)).toBeTruthy()
    expect(reconhecimento.getAllByText('Para quem relata:')).toHaveLength(1)
  })

  it('avisa que trocar de modo não mexe no passado', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(screen.getByText(/Trocar o modo só vale para os próximos relatos/i)).toBeTruthy()
  })

  it('não salva enquanto nada mudou', async () => {
    montar()

    // Sem mudanca o Salvar fica a vista, desligado, e o titulo diz que esta tudo salvo.
    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(salvarLigado()).toBe(false)
  })

  it('manda o modo escolhido, e não o que veio do servidor', async () => {
    dublê.salvar.mockResolvedValue({
      Mode: 'PersonalCode',
      Visibility: 'Private',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
      IdentityFormat: 'Jwt',
      IsHmacAvailable: true,
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
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
      IdentityFormat: 'Jwt',
    })
  })

  // A assinatura simples e a de fabrica: a chave abre num dialogo, sem sair da tela (e sem
  // a pergunta de salvar ou descartar), e as linguagens sao as abas do editor, lembradas.
  it('na assinatura simples, a chave abre num diálogo e a linguagem escolhida vale para os códigos', async () => {
    window.localStorage.removeItem('pds.web.linguagem-do-servidor.v1')
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'InheritedIdentity', IdentityFormat: 'Hmac' })
    dublê.verSegredo.mockResolvedValue({ Secret: 'rfs_segredo-do-projeto' })
    montar()

    expect(await screen.findByText('Copie a chave secreta')).toBeTruthy()
    // Nada de chave publica neste formato, e a chave nao e buscada sozinha.
    expect(screen.queryByLabelText('Chave pública do seu sistema')).toBeNull()
    expect(dublê.verSegredo).not.toHaveBeenCalled()

    // O dialogo mostra a chave aqui mesmo, e o rodape leva a tela de Chaves.
    fireEvent.click(screen.getByRole('button', { name: 'Ver a chave' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Chave da identidade' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mostrar a chave' }))
    expect(await within(dialogo).findByText('rfs_segredo-do-projeto')).toBeTruthy()
    expect(dublê.verSegredo).toHaveBeenCalledWith('p-1')
    // Enquanto a identidade do sistema esta em breve, a chave nao aparece em Chaves, e o
    // dialogo nao leva para la.
    expect(within(dialogo).queryByRole('link', { name: 'Abrir a tela de Chaves' })).toBeNull()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // A linguagem e escolhida uma vez, la em cima: abre em Node, e o PHP troca os dois
    // trechos de uma vez e fica lembrado.
    expect(escolhida('Node')).toBe(true)
    expect(screen.getByRole('region', { name: 'cracha.js' }).textContent).toContain('createHmac')
    fireEvent.click(servidor().getByRole('radio', { name: 'PHP' }))
    expect(escolhida('PHP')).toBe(true)
    expect(screen.getByRole('region', { name: 'cracha.php' }).textContent).toContain('hash_hmac')
    expect(window.localStorage.getItem('pds.web.linguagem-do-servidor.v1')).toBe('php')
    // O script ganha as linhas da assinatura no modelo de pagina da mesma linguagem, e so
    // ela aparece: nada de abas repetidas em cada trecho.
    expect(screen.getByText('Coloque o crachá no script da página')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'pagina.php' }).textContent).toContain(
      'crachaDeRelato($usuario)',
    )
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.getAllByText('Linha nova:')).toHaveLength(6)
    expect(screen.getByRole('button', { name: /Copiar as linhas novas/ })).toBeTruthy()
    // O que conferir quando nao aparece, inclusive o script colado duas vezes.
    expect(screen.getByText(/porque só o primeiro vale/)).toBeTruthy()
  })

  it('no JWT, o crachá entra no script que já está na página, escrito pelo servidor', async () => {
    window.localStorage.removeItem('pds.web.linguagem-do-servidor.v1')
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'InheritedIdentity', IdentityFormat: 'Jwt' })
    montar()

    expect(await screen.findByText('Coloque o crachá no script da página')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'pagina.ejs' }).textContent).toContain(
      'data-identity="<%= cracha %>"',
    )
    // Trocar a linguagem troca a funcao e o modelo da pagina juntos.
    fireEvent.click(servidor().getByRole('radio', { name: 'Python' }))
    expect(screen.getByRole('region', { name: 'pagina.html' }).textContent).toContain(
      'data-identity="{{ cracha }}"',
    )
    expect(screen.getByRole('region', { name: 'cracha.py' })).toBeTruthy()
    expect(screen.getAllByText('Linha nova:')).toHaveLength(3)
    expect(screen.getByText(/a chave privada nunca aparece na página/)).toBeTruthy()
    expect(screen.getByText(/montada no navegador/)).toBeTruthy()
    // O teste diz o que se ve quando da certo, e o que procurar quando nao da.
    expect(screen.getByText(/se aparecer “Ver os meus relatos”, está funcionando/)).toBeTruthy()
    expect(screen.getByText('eyJ')).toBeTruthy()
  })

  it('o passo da função acompanha a linguagem, com o que instalar e o que trocar', async () => {
    window.localStorage.removeItem('pds.web.linguagem-do-servidor.v1')
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'InheritedIdentity', IdentityFormat: 'Jwt' })
    montar()

    // Node no JWT: instalar o jose, com o comando pronto para copiar.
    expect(await screen.findByText('npm install jose')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copiar o comando' })).toBeTruthy()

    // Java: o arquivo completo pede so trocar o pacote, e as dependencias vem para copiar.
    fireEvent.click(servidor().getByRole('radio', { name: 'Java' }))
    expect(screen.getByText('package com.seusistema;')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Copiar as dependências' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Relato.java' }).textContent).toContain(
      'public class Relato',
    )
  })

  // Quatro passos, os mesmos nos dois formatos, cada um com o lugar onde acontece; e as
  // regras do cracha depois deles, porque sao escolhas com padrao, e nao instalacao.
  it('os passos dizem onde cada coisa acontece, e as regras ficam depois deles', async () => {
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'InheritedIdentity', IdentityFormat: 'Hmac' })
    montar()

    const passos = within(await screen.findByRole('list', { name: 'Passos' }))
    const titulos = passos.getAllByRole('heading', { level: 4 }).map((titulo) => titulo.textContent)
    expect(titulos).toEqual([
      'Passo 1: Copie a chave secretaNo painel',
      'Passo 2: Faça o servidor gerar o cracháNo seu servidor',
      'Passo 3: Coloque o crachá no script da páginaNo seu servidor',
      'Passo 4: Salve e testeNo seu sistema',
    ])
    // As regras nao sao um passo: moram numa parte propria, embaixo.
    const regras = screen.getByRole('region', { name: 'Regras do crachá' })
    expect(within(regras).getByLabelText('Validade máxima do crachá, em minutos')).toBeTruthy()
    expect(
      within(regras).getByRole('checkbox', { name: /Só aceitar relato de quem está na conta/ }),
    ).toBeTruthy()

    // No JWT, o primeiro passo e o par de chaves, e os outros tres sao os mesmos.
    fireEvent.click(screen.getByRole('radio', { name: /JWT/ }))
    const jwt = within(screen.getByRole('list', { name: 'Passos' }))
    expect(jwt.getAllByRole('heading', { level: 4 })[0]?.textContent).toBe(
      'Passo 1: Crie o par de chavesNo painel',
    )
  })

  it('sem a chave mestra na instalação, a assinatura simples não salva e a tela diz por que', async () => {
    dublê.ler.mockResolvedValue({
      ...padrao,
      Mode: 'InheritedIdentity',
      IdentityFormat: 'Hmac',
      IsHmacAvailable: false,
    })
    montar()

    expect(await screen.findByText(/escolha o JWT para salvar/)).toBeTruthy()
    // O salvar trava ate escolher o JWT, que pede a chave publica.
    fireEvent.click(screen.getByRole('radio', { name: /JWT/ }))
    expect(await screen.findByLabelText('Chave pública do seu sistema')).toBeTruthy()
  })

  // No JWT, o par nasce no navegador: a publica vai sozinha para o passo 2, e a privada so
  // aparece aqui, para baixar, sem passar pelo servidor.
  it('no JWT, gerar o par preenche a chave pública e oferece baixar a privada', async () => {
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'InheritedIdentity', IdentityFormat: 'Jwt' })
    montar()

    fireEvent.click(await screen.findByRole('button', { name: 'Gerar o par de chaves' }))

    const campo = screen.getByLabelText('Chave pública do seu sistema') as HTMLTextAreaElement
    await waitFor(() => expect(campo.value).toContain('-----BEGIN PUBLIC KEY-----'))
    expect(screen.getByRole('button', { name: 'Baixar relatofacil-privada.pem' })).toBeTruthy()
    expect(screen.getByText(/Baixe a chave privada agora/)).toBeTruthy()
    // A privada nao vai para o campo nem para a gravacao: so a publica.
    expect(campo.value).not.toContain('PRIVATE KEY')
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('com uma chave pública já colada, gerar outro par pede confirmação', async () => {
    dublê.ler.mockResolvedValue({
      ...padrao,
      Mode: 'InheritedIdentity',
      IdentityFormat: 'Jwt',
      IdentityPublicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE',
    })
    montar()

    // Com chave guardada, o botao ja diz que gera outro, e pede confirmacao antes.
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar outro par' }))
    expect(screen.getByText(/Gerar outro par troca a chave pública/)).toBeTruthy()
    const campo = screen.getByLabelText('Chave pública do seu sistema') as HTMLTextAreaElement
    expect(campo.value).toBe('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE')

    fireEvent.click(screen.getByRole('button', { name: 'Gerar outro par' }))
    await waitFor(() => expect(campo.value).toContain('-----BEGIN PUBLIC KEY-----'))
  })

  // Ainda nao liberada: aparece como "Em breve", e nao da para escolher.
  it('a identidade do sistema aparece como em breve, e não dá para escolher', async () => {
    montar()

    const herdada = await screen.findByRole('radio', { name: /Identidade do seu sistema/ })
    expect((herdada as HTMLInputElement).disabled).toBe(true)
    expect(herdada.closest('label')?.textContent).toContain('Em breve')
    expect(screen.getByText(/Identidade do seu sistema, em breve\./)).toBeTruthy()
    expect(screen.queryByText('Formato do crachá')).toBeNull()
  })

  // O que ja esta salvo nao muda sozinho: o projeto que ja usa o modo continua com ele, e
  // com o passo a passo, e pode ate sair e voltar antes de salvar.
  it('o projeto que já salvou a identidade do sistema continua com ela, e só salva com a chave pública', async () => {
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'InheritedIdentity', IdentityFormat: 'Jwt' })
    montar()

    const herdada = await screen.findByRole('radio', { name: /Identidade do seu sistema/ })
    expect((herdada as HTMLInputElement).disabled).toBe(false)
    expect((herdada as HTMLInputElement).checked).toBe(true)

    fireEvent.click(screen.getByRole('radio', { name: /Protocolo/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Identidade do seu sistema/ }))
    expect(
      (screen.getByRole('radio', { name: /Identidade do seu sistema/ }) as HTMLInputElement)
        .checked,
    ).toBe(true)

    // Sem a chave a API nao conferiria cracha nenhum: o modo gravado nao faria nada.
    fireEvent.change(screen.getByLabelText('Chave pública do seu sistema'), {
      target: { value: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----' },
    })
    expect(salvarLigado()).toBe(true)
  })

  it('com a identidade do sistema já salva, a tela mostra a chave guardada', async () => {
    dublê.ler.mockResolvedValue({
      Mode: 'InheritedIdentity',
      Visibility: 'Private',
      AsksForName: false,
      IdentityPublicKey: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
      IdentityFormat: 'Jwt',
      IsHmacAvailable: true,
    })
    montar()

    const herdada = await screen.findByRole('radio', { name: /Identidade do seu sistema/ })
    expect((herdada as HTMLInputElement).checked).toBe(true)
    expect(
      (screen.getByLabelText('Chave pública do seu sistema') as HTMLTextAreaElement).value,
    ).toContain('BEGIN PUBLIC KEY')
  })

  it('depois de salvar, o botão volta a ficar quieto', async () => {
    dublê.salvar.mockResolvedValue({
      Mode: 'PersonalCode',
      Visibility: 'Private',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
      IdentityFormat: 'Jwt',
      IsHmacAvailable: true,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Código pessoal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    // O Salvar desliga: o que esta na tela e o que esta salvo.
    await waitFor(() => expect(salvarLigado()).toBe(false))
    expect(screen.getByText('Tudo salvo')).toBeTruthy()
    expect(dublê.salvar).toHaveBeenCalledTimes(1)
  })

  it('oferece os três níveis de visibilidade, e o padrão é o mais fechado', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(escolhas(VISIBILIDADE).getAllByRole('radio')).toHaveLength(3)

    const privado = escolhas(VISIBILIDADE).getByRole('radio', { name: /Privado/ })
    expect((privado as HTMLInputElement).checked).toBe(true)
  })

  it('o nível escolhido diz quem lê e o que o time passa a fazer', async () => {
    montar()

    await screen.findByRole('radio', { name: /Protocolo/ })
    const visibilidade = regiao('Quem pode ver os relatos')

    // "Público" é palavra que cada um entende de um jeito. O que trava a tela é
    // dizer **quem vê**, e não repetir o nome do nível com outras palavras.
    expect(visibilidade.getAllByText('Quem lê:')).toHaveLength(1)
    expect(visibilidade.getAllByText('Para o time:')).toHaveLength(1)
    expect(visibilidade.getByText(/mais ninguém encontra o relato/)).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /Público anônimo/ }))
    expect(
      visibilidade.getByText(/Qualquer pessoa que abrir o formulário no seu sistema/),
    ).toBeTruthy()
    expect(visibilidade.getByText(/Liberar cada relato em Moderação/)).toBeTruthy()
  })

  it('no modo protocolo, público identificado não dá para escolher, e a peça diz por quê', async () => {
    montar()

    const identificado = await screen.findByRole('radio', { name: /Público identificado/ })
    expect((identificado as HTMLInputElement).disabled).toBe(true)

    // A trava depende da outra pergunta da tela, então o motivo tem de estar
    // junto: cinza sem explicação faz quem configura concluir que está quebrado.
    expect(identificado.closest('label')?.textContent).toMatch(
      /Precisa de um modo que reconheça quem relata/i,
    )
  })

  it('escolher o código pessoal destrava o público identificado, ali mesmo', async () => {
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Código pessoal/ }))

    const identificado = screen.getByRole('radio', { name: /Público identificado/ })
    expect((identificado as HTMLInputElement).disabled).toBe(false)
  })

  it('voltar ao protocolo não troca a visibilidade sozinho: avisa no grupo e tranca o salvar', async () => {
    dublê.ler.mockResolvedValue({
      Mode: 'PersonalCode',
      Visibility: 'PublicIdentified',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
      IdentityFormat: 'Jwt',
      IsHmacAvailable: true,
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
    // O aviso mora no grupo da visibilidade, e o titulo dele, fechado, ja diz o conflito.
    expect(
      regiao('Quem pode ver os relatos').getByText(/o Protocolo não reconhece ninguém/i),
    ).toBeTruthy()
    expect(resumoDo('visibilidade')).toContain('não combina com o Protocolo')
    // O titulo diz por que o Salvar esta desligado, no lugar da conta.
    expect(
      screen.getByText('Para salvar, escolha um nível que combine com o Protocolo.'),
    ).toBeTruthy()
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('salvar de privado para público põe a Moderação no menu e pede o guia da novidade; de volta ao privado, ela sai', async () => {
    useModerationInMenu.setState({ publicos: {}, chegada: null, entrouAgora: null, novidade: null })
    dublê.salvar.mockResolvedValue({ ...padrao, Visibility: 'PublicAnonymous' })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Público anônimo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(useModerationInMenu.getState().publicos['p-1']).toBe(true))
    // A casca sobe o menu e poe o item; o guia vem um instante depois.
    expect(useModerationInMenu.getState().chegada).toBe('p-1')
    cleanup()

    // Voltar ao privado tira o item, sem guia nenhum.
    dublê.ler.mockResolvedValue({ ...padrao, Visibility: 'PublicAnonymous' })
    dublê.salvar.mockResolvedValue({ ...padrao, Visibility: 'Private' })
    useModerationInMenu.setState({ chegada: null, entrouAgora: null })
    montar()
    fireEvent.click(await screen.findByRole('radio', { name: /Privado/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(useModerationInMenu.getState().publicos['p-1']).toBe(false))
    expect(useModerationInMenu.getState().chegada).toBeNull()
  })

  it('público diz que nada sai sem passar pela Moderação', async () => {
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Público anônimo/ }))

    expect(screen.getByText(/cada relato espera alguém do time liberar em Moderação/i)).toBeTruthy()
  })

  it('a confirmação mora aqui, e grava na ferramenta com o resto como está agora', async () => {
    const agora = { ...DEFAULT_WIDGET_SETTINGS, LauncherLabel: 'Ajuda' }
    dublê.lerFerramenta.mockResolvedValueOnce(DEFAULT_WIDGET_SETTINGS).mockResolvedValue(agora)
    montar()

    const confirmacao = await screen.findByRole('textbox', {
      name: /Texto da confirmação/,
    })
    escrever(confirmacao, 'Obrigado, {{primeiroNome}}!')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvarFerramenta).toHaveBeenCalledTimes(1))
    const enviado = dublê.salvarFerramenta.mock.calls[0]?.[1] as SaveWidgetSettingsRequest
    expect(enviado.SuccessMessage).toBe('Obrigado, {{primeiroNome}}!')
    // O botao, salvo em outra tela, vai como esta agora.
    expect(enviado.LauncherLabel).toBe('Ajuda')
    // So o texto mudou: Quem relata nao e gravado.
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('fechado, cada grupo diz em palavras o que está escolhido', async () => {
    // O projeto exatamente no padrao de fabrica: codigo pessoal e assinatura simples.
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'PersonalCode', IdentityFormat: 'Hmac' })
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    expect(resumoDo('reconhecimento')).toContain('Código pessoal, a pessoa guarda um código')
    expect(resumoDo('visibilidade')).toContain('Privado, só quem relatou e o time')
    // Os textos, com as variaveis trocadas pelos valores de exemplo.
    expect(resumoDo('depois-de-enviar')).toContain('Recebemos o seu relato')
    expect(resumoDo('texto-do-acompanhamento')).toContain('Este é o registro do que você enviou.')
    // Sem mudanca, nada de "Mudou".
    expect(resumoDo('reconhecimento')).not.toContain('Mudou')
  })

  // O aviso so existe com um nivel publico: num grupo proprio, ele dizia "Sem efeito" no
  // projeto privado. Agora mora junto da escolha que o liga.
  it('o aviso do formulário mora na Visibilidade, e só aparece com um nível público', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })
    const visibilidade = regiao('Quem pode ver os relatos')
    const campoDoAviso = () =>
      visibilidade.queryByRole('textbox', { name: /Aviso de que o relato pode virar público/ })

    expect(campoDoAviso()).toBeNull()
    expect(visibilidade.getByText(/Num nível público, o formulário mostra um aviso/)).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Aviso público' })).toBeNull()

    // Publico, o campo aparece ali mesmo, com a frase do nome que vem depois dele.
    fireEvent.click(screen.getByRole('radio', { name: /Público anônimo/ }))
    expect(campoDoAviso()?.textContent).toContain('Este relato pode virar público.')
    expect(visibilidade.getByText(/O seu nome nunca aparece/)).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /Público identificado/ }))
    expect(visibilidade.getByText(/O seu nome só aparece se você marcar abaixo/)).toBeTruthy()
  })

  it('mudar o aviso conta na Visibilidade, e o voltar dela volta o nível e o aviso', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    fireEvent.click(screen.getByRole('radio', { name: /Público anônimo/ }))
    escrever(
      screen.getByRole('textbox', { name: /Aviso de que o relato pode virar público/ }),
      'Pode virar público.',
    )
    expect(resumoDo('visibilidade')).toContain('Mudou: Nível, Texto do aviso')

    fireEvent.click(
      regiao('Quem pode ver os relatos').getByRole('button', { name: 'Voltar ao padrão' }),
    )
    expect((screen.getByRole('radio', { name: /Privado/ }) as HTMLInputElement).checked).toBe(true)
    expect(salvarLigado()).toBe(false)
  })

  it('os textos de depois de enviar têm título próprio, e a prévia não aparece de cara', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    const textos = regiao('O que quem relatou lê')
    expect(textos.getByRole('region', { name: 'Mensagem de confirmação' })).toBeTruthy()
    expect(textos.getByRole('region', { name: 'Topo da página de acompanhamento' })).toBeTruthy()
    // A privacidade fica fora dela.
    expect(textos.queryByRole('region', { name: 'Quem pode ver os relatos' })).toBeNull()
    // As abas da previa sairam, e a coluna dela so entra com um texto de depois de enviar
    // aberto.
    expect(screen.queryByRole('tablist', { name: 'O que a prévia mostra' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Prévia' })).toBeNull()
  })

  it('cada grupo volta ao padrão só no rascunho dele', async () => {
    // O projeto no padrao de fabrica: escolher o protocolo e o que muda o modo.
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'PersonalCode', IdentityFormat: 'Hmac' })
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    fireEvent.click(screen.getByRole('radio', { name: /Protocolo/ }))
    escrever(screen.getByRole('textbox', { name: /Texto da confirmação/ }), 'Valeu!')
    escrever(screen.getByRole('textbox', { name: /Texto do topo/ }), 'O seu relato')

    expect(resumoDo('reconhecimento')).toContain('Mudou: Modo')
    expect(resumoDo('depois-de-enviar')).toContain('Mudou: Texto da confirmação')
    expect(resumoDo('texto-do-acompanhamento')).toContain('Mudou: Texto do topo')
    // Grupo sem mudanca nao oferece voltar.
    expect(
      regiao('Quem pode ver os relatos').queryByRole('button', { name: 'Voltar ao padrão' }),
    ).toBeNull()

    // A confirmacao volta, e so ela: o modo e o topo continuam mudados.
    fireEvent.click(
      regiao('Mensagem de confirmação').getByRole('button', { name: 'Voltar ao padrão' }),
    )
    expect(screen.getByRole('textbox', { name: /Texto da confirmação/ }).textContent).toBe(
      DEFAULT_WIDGET_SETTINGS.SuccessMessage,
    )
    expect((screen.getByRole('radio', { name: /Protocolo/ }) as HTMLInputElement).checked).toBe(
      true,
    )
    expect(resumoDo('texto-do-acompanhamento')).toContain('Mudou: Texto do topo')

    // O modo volta ao de fabrica no rascunho de Quem relata, e o texto do topo fica.
    fireEvent.click(
      regiao('Como a pessoa é reconhecida').getByRole('button', { name: 'Voltar ao padrão' }),
    )
    expect(
      (screen.getByRole('radio', { name: /Código pessoal/ }) as HTMLInputElement).checked,
    ).toBe(true)
    expect(resumoDo('texto-do-acompanhamento')).toContain('Mudou: Texto do topo')
    expect(salvarLigado()).toBe(true)

    fireEvent.click(
      regiao('Topo da página de acompanhamento').getByRole('button', { name: 'Voltar ao padrão' }),
    )
    expect(salvarLigado()).toBe(false)
  })

  // Sem a pergunta do nome, a caixa de mostrar o nome nem aparece no formulario: o
  // identificado ficaria igual ao anonimo, sem ninguem saber por que.
  it('no público identificado sem a pergunta do nome, avisa e leva a Textos e tema', async () => {
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'PersonalCode', IdentityFormat: 'Hmac' })
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    fireEvent.click(screen.getByRole('radio', { name: /Público identificado/ }))
    const visibilidade = regiao('Quem pode ver os relatos')
    expect(visibilidade.getByText(/O formulário não pergunta o nome/)).toBeTruthy()
    expect(visibilidade.getByRole('link', { name: 'Textos e tema' }).getAttribute('href')).toBe(
      '/projects/p-1/form-texts#nome-de-quem-relata',
    )
    cleanup()

    // Perguntando o nome, nada a avisar.
    dublê.ler.mockResolvedValue({
      ...padrao,
      Mode: 'PersonalCode',
      IdentityFormat: 'Hmac',
      AsksForName: true,
    })
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })
    fireEvent.click(screen.getByRole('radio', { name: /Público identificado/ }))
    expect(screen.queryByText(/O formulário não pergunta o nome/)).toBeNull()
  })

  // So os dois textos de depois de enviar tem previa, e so com o grupo aberto: nas escolhas
  // de cima ela nao mostrava nada que o cartao nao diga.
  it('a prévia aparece só com a mensagem de confirmação ou o topo do acompanhamento abertos', async () => {
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'PersonalCode', IdentityFormat: 'Hmac' })
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    // A Visibilidade vem aberta, e sem previa nenhuma.
    expect(screen.queryByRole('region', { name: 'Prévia' })).toBeNull()

    // Aberta a mensagem, a previa entra na coluna de sempre, com o desenho das outras.
    detalhesDo('depois-de-enviar').open = true
    const previa = within(await screen.findByRole('region', { name: 'Prévia' }))
    expect(previa.getByText('Relato enviado')).toBeTruthy()
    // O que o modo acrescenta, como no formulario: o codigo pessoal para guardar.
    expect(previa.getByText('Seu código pessoal')).toBeTruthy()

    // Escrever muda a previa na hora.
    escrever(screen.getByRole('textbox', { name: /Texto da confirmação/ }), 'Valeu, {{tipo}}!')
    await waitFor(() => expect(previa.getByText('Valeu, Defeito!')).toBeTruthy())

    detalhesDo('texto-do-acompanhamento').open = true
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Prévia' })).getByText('Seu relato'),
      ).toBeTruthy(),
    )

    // Fechado o texto, a previa sai: fica fora do leitor de tela e do Tab.
    detalhesDo('texto-do-acompanhamento').open = false
    detalhesDo('depois-de-enviar').open = false
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Prévia' })).toBeNull())
  })

  // A instrucao e em palavras, e vale para qualquer linguagem: o que o servidor monta e onde
  // escreve. O codigo pronto fica num exemplo recolhido, para quem quer.
  it('os passos dizem o que fazer em palavras, e o código fica no exemplo recolhido', async () => {
    // A linguagem fica lembrada entre os testes: este parte do Node, como quem chega.
    window.localStorage.removeItem('pds.web.linguagem-do-servidor.v1')
    dublê.ler.mockResolvedValue({ ...padrao, Mode: 'InheritedIdentity', IdentityFormat: 'Hmac' })
    montar()

    expect(await screen.findByText('Faça o servidor gerar o crachá')).toBeTruthy()
    expect(screen.getByText('Validade')).toBeTruthy()
    expect(screen.getByText('id.validade')).toBeTruthy()
    expect(screen.getByText(/não há nada para instalar/)).toBeTruthy()
    // Os atributos do passo 3, um por linha, com o que vai em cada um.
    const nomes = screen.getAllByRole('term').map((termo) => termo.textContent)
    expect(nomes).toEqual(
      expect.arrayContaining(['data-user-id', 'data-user-expires', 'data-user-signature']),
    )

    // O codigo e a escolha da linguagem moram no exemplo, fechado.
    const exemplo = screen
      .getByText('Ver um exemplo em código')
      .closest('details') as HTMLDetailsElement
    expect(exemplo.open).toBe(false)
    expect(
      within(exemplo).getByRole('radiogroup', { name: 'Linguagem do seu servidor' }),
    ).toBeTruthy()
    expect(within(exemplo).getByRole('region', { name: 'cracha.js' })).toBeTruthy()
  })

  it('as âncoras de sempre continuam existindo', async () => {
    montar()
    await screen.findByRole('radio', { name: /Protocolo/ })

    for (const id of [
      'reconhecimento',
      'visibilidade',
      'depois-de-enviar',
      'confirmacao',
      'mais-opcoes',
      'topo-do-acompanhamento',
      'aviso-de-relato-publico',
      'aviso-publico',
    ]) {
      expect(document.getElementById(id), id).not.toBeNull()
    }
  })

  it('a pergunta do nome e os limites não moram mais aqui, e o endereço antigo leva a eles', async () => {
    const router = montar()
    await screen.findByRole('radio', { name: /Protocolo/ })
    expect(screen.queryByRole('checkbox', { name: /Perguntar o nome/ })).toBeNull()
    expect(screen.queryByText('Limites de relatos')).toBeNull()
    cleanup()

    const doSino = montar('/p/p-1/identity#limites')
    await waitFor(() => expect(doSino.state.location.pathname).toBe('/p/p-1/domains'))
    expect(doSino.state.location.hash).toBe('#limites')
    cleanup()

    const doNome = montar('/p/p-1/identity#perguntar-nome')
    await waitFor(() => expect(doNome.state.location.pathname).toBe('/p/p-1/form-texts'))
    expect(router).toBeTruthy()
  })

  it('manda a visibilidade escolhida junto do modo', async () => {
    dublê.salvar.mockResolvedValue({
      Mode: 'Protocol',
      Visibility: 'PublicAnonymous',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
      IdentityFormat: 'Jwt',
      IsHmacAvailable: true,
    })
    montar()

    fireEvent.click(await screen.findByRole('radio', { name: /Público anônimo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
      Mode: 'Protocol',
      Visibility: 'PublicAnonymous',
      AsksForName: false,
      IdentityPublicKey: null,
      IdentityTokenMaxMinutes: 15,
      IdentityRequired: false,
      IdentityFormat: 'Jwt',
    })
  })

  it('a falha ao carregar não mente dizendo que o projeto mudou', async () => {
    dublê.ler.mockRejectedValue(new Error('rede'))
    montar()

    expect(await screen.findByText(/Nada mudou/i)).toBeTruthy()
    expect(screen.queryByRole('radio')).toBeNull()
  })
})
