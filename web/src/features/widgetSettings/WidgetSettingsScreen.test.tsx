// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ProjectViewModel,
  SaveWidgetSettingsRequest,
  WidgetSettingsViewModel,
} from '@/contracts'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import { WidgetSettingsScreen } from '@/features/widgetSettings/WidgetSettingsScreen'
import { useToastStore } from '@/shared/components/toastStore'

/** O pedido de gravar em C#. `__dirname`: no jsdom, `import.meta.url` nao e caminho. */
const DTO = join(__dirname, '../../../../api/Pds.Domain/Dtos/WidgetSettingsDto.cs')

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * - **o Publicar fica no titulo, e so liga quando ha o que publicar**, com quantas
 *   mudancas sao. Um botao sempre aceso ensina que o clique nao faz diferenca;
 * - **a previa e ao vivo**, com o rascunho, e diz "ainda não publicado" enquanto houver
 *   mudanca — a lingua do Publicar;
 * - **cada grupo diz, fechado, uma amostra do que esta escolhido e o que mudou**, e o
 *   "Voltar ao padrão" dele troca so os campos dele, no rascunho;
 * - **abrir "No celular" troca a previa para o celular**, com o selo "Mostrando:
 *   celular", e fechar volta — a nao ser que a pessoa tenha escolhido o aparelho na
 *   previa, nas abas;
 * - **os controles vem antes da previa** no codigo: o Tab chega a eles primeiro;
 * - **a pilula do cabecalho liga e desliga**, e desligado avisa o que para;
 * - **publicar manda o registro inteiro**, porque a rota substitui a linha — **lido de
 *   novo antes de gravar**: os textos que outra tela salvou nesse meio tempo vao como
 *   estao agora, e nao como estavam quando esta abriu. Se o proprio botao mudou la, nada
 *   e gravado e a tela avisa;
 * - **os enderecos dos campos que mudaram de tela** levam a tela nova.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<WidgetSettingsViewModel>>(),
  salvar: vi.fn(),
  chaves: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectWidgetSettingsService: {
      getWidgetSettings: dublê.ler,
      saveWidgetSettings: dublê.salvar,
    },
    projectKeyService: {
      listProjectKeys: dublê.chaves,
      regenerateSecretKey: async () => {
        throw new Error('nao e usado nesta tela')
      },
    },
  }
})

function projeto(publicId: string): ProjectViewModel {
  return {
    PublicId: publicId,
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
}

function ProjetoDaRota() {
  const { publicId = '' } = useParams()
  return <Outlet context={{ project: projeto(publicId) }} />
}

function montar(entrada = '/p/p-1/tool') {
  const router = createMemoryRouter(
    [
      {
        path: '/p/:publicId',
        element: <ProjetoDaRota />,
        children: [
          { path: 'tool', element: <WidgetSettingsScreen /> },
          { path: 'form-texts', element: <p>tela dos textos</p> },
          { path: 'identity', element: <p>tela de quem relata</p> },
        ],
      },
    ],
    { initialEntries: [entrada] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const campoBotao = () => screen.getByRole('textbox', { name: 'Texto do botão' })
/** O primeiro acesso espera a leitura da API; os seguintes ja encontram a tela. */
const esperarCampoBotao = () => screen.findByRole('textbox', { name: 'Texto do botão' })
/** O Publicar mora no titulo, sempre a vista: liga so com o que publicar. */
const publicarLigado = () =>
  !(screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement).disabled
/** O grupo do acordeao: a ancora fica no `<summary>`. */
const grupo = (id: string) => document.getElementById(id)?.closest('details') as HTMLDetailsElement
/** A secao em volta do grupo: o "Voltar ao padrão" mora nela, fora do `<summary>`. */
const secao = (id: string) => grupo(id).closest('section') as HTMLElement
const resumoDo = (id: string) => grupo(id).querySelector('summary')?.textContent ?? ''
/** As abas do aparelho, na previa. */
const aparelho = (nome: 'Computador' | 'Celular') =>
  screen.getByRole('tab', { name: nome }).getAttribute('aria-selected')

describe('WidgetSettingsScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.ler.mockReset()
    dublê.salvar.mockReset()
    dublê.chaves.mockReset()

    dublê.ler.mockResolvedValue(DEFAULT_WIDGET_SETTINGS)
    dublê.chaves.mockResolvedValue([
      {
        PublicId: 'k-1',
        Type: 'Public',
        Value: 'pk_DEMO',
        Prefix: 'pk_',
        IsActive: true,
        CreatedAt: '2026-08-01T12:00:00.000Z',
        RevokedAt: null,
        LastUsedAt: null,
      },
    ])
  })

  it('mostra o que esta salvo', async () => {
    montar()

    expect((await esperarCampoBotao()).getAttribute('value')).toBe(
      DEFAULT_WIDGET_SETTINGS.LauncherLabel,
    )
  })

  it('sem mudanca nao ha o que publicar: o titulo diz "Tudo publicado" e o botao fica desligado', async () => {
    montar()

    await esperarCampoBotao()
    expect(screen.getByText('Tudo publicado')).toBeTruthy()
    expect(publicarLigado()).toBe(false)
  })

  it('a primeira mudanca liga o Publicar com a conta, e descartar desliga de novo', async () => {
    montar()

    fireEvent.change(await esperarCampoBotao(), { target: { value: 'Fale com a gente' } })
    expect(screen.getByText('1 mudança não publicada')).toBeTruthy()
    expect(publicarLigado()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Desligar o botão no seu sistema' }))
    expect(screen.getByText('2 mudanças não publicadas')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(screen.getByText('Tudo publicado')).toBeTruthy()
    expect(publicarLigado()).toBe(false)
  })

  it('publicar relê, manda o registro inteiro e só os campos do botão mudados', async () => {
    // Enquanto esta tela estava aberta, outra salvou um texto do formulario.
    const agora = { ...DEFAULT_WIDGET_SETTINGS, Title: 'Fale com o suporte' }
    dublê.ler.mockResolvedValueOnce(DEFAULT_WIDGET_SETTINGS).mockResolvedValue(agora)
    dublê.salvar.mockImplementation(
      async (_publicId: string, settings: WidgetSettingsViewModel) => ({
        ...DEFAULT_WIDGET_SETTINGS,
        ...settings,
      }),
    )

    montar()

    fireEvent.change(await esperarCampoBotao(), { target: { value: 'Fale com a gente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    // Os campos todos sao os do `WidgetSettingsDto` em C#, lidos do arquivo: e ele que
    // substitui a linha. Os tipos, o nome do projeto e o que vem de outras telas
    // (identidade, ciclo) ficam de fora — gravar daqui apagaria o que e de la.
    const enviado = dublê.salvar.mock.calls[0]?.[1] as SaveWidgetSettingsRequest
    const doDto = [
      ...readFileSync(DTO, 'utf8').matchAll(/public [\w<>?[\]]+ (\w+) \{ get; set; \}/g),
    ].map((achado) => achado[1])
    expect(doDto.length).toBeGreaterThan(0)
    expect(Object.keys(enviado).sort()).toEqual(doDto.sort())
    expect(enviado.LauncherLabel).toBe('Fale com a gente')
    // O texto salvo pela outra tela vai como esta agora, e nao volta ao que era.
    expect(enviado.Title).toBe('Fale com o suporte')

    // A base virou o que a API devolveu: nao ha mais o que publicar.
    await waitFor(() => expect(publicarLigado()).toBe(false))
  })

  it('se outra pessoa mudou o botão enquanto isso, não grava por cima e avisa', async () => {
    useToastStore.setState({ toasts: [] })
    const deOutraPessoa = { ...DEFAULT_WIDGET_SETTINGS, LauncherLabel: 'Ajuda' }
    dublê.ler.mockResolvedValueOnce(DEFAULT_WIDGET_SETTINGS).mockResolvedValue(deOutraPessoa)

    montar()

    fireEvent.change(await esperarCampoBotao(), { target: { value: 'Fale com a gente' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))

    await waitFor(() =>
      expect(
        useToastStore
          .getState()
          .toasts.map((aviso) => aviso.message)
          .join(' '),
      ).toMatch(/Alguém salvou esta parte/),
    )
    expect(dublê.salvar).not.toHaveBeenCalled()
    // O que a pessoa escreveu fica, e o proximo Publicar e uma escolha consciente.
    expect(campoBotao().getAttribute('value')).toBe('Fale com a gente')
    expect(publicarLigado()).toBe(true)
  })

  it('a previa diz que ja mostra o que ainda nao foi publicado', async () => {
    montar()

    expect(await screen.findByText('igual ao seu sistema')).toBeTruthy()
    expect(
      screen.getByText(/Como fica no seu sistema\. Clique no botão para abrir o formulário\./),
    ).toBeTruthy()

    fireEvent.change(campoBotao(), { target: { value: 'Fale com a gente' } })

    // A previa e ao vivo: desenha o rascunho, e diz isso enquanto ele difere do site.
    expect(screen.getByText('ainda não publicado')).toBeTruthy()
    expect(screen.queryByText('igual ao seu sistema')).toBeNull()
  })

  it('cada grupo diz, fechado, uma amostra do que está escolhido e o que mudou', async () => {
    montar()
    await esperarCampoBotao()

    expect(resumoDo('aparencia')).toContain(
      `cor padrão · “${DEFAULT_WIDGET_SETTINGS.LauncherLabel}” · sem ícone · médio · pílula`,
    )
    // No padrao, o titulo nao repete "No padrão" em todo grupo.
    expect(resumoDo('aparencia')).not.toContain('Mudou')
    expect(resumoDo('posicao')).toContain('Embaixo, à direita · 20 px da borda')
    expect(resumoDo('celular')).toContain('Igual ao computador')
    expect(resumoDo('paginas')).toContain('Aparece em todas as páginas')

    fireEvent.click(
      within(screen.getByRole('radiogroup', { name: 'Tamanho' })).getByRole('radio', {
        name: 'Grande',
      }),
    )
    fireEvent.change(campoBotao(), { target: { value: 'Fale com a gente' } })

    expect(resumoDo('aparencia')).toContain('“Fale com a gente”')
    expect(resumoDo('aparencia')).toContain('Mudou: Texto, Tamanho')
    expect(resumoDo('posicao')).not.toContain('Mudou')
  })

  it('"Voltar ao padrão" de um grupo troca só os campos dele', async () => {
    montar()
    await esperarCampoBotao()

    fireEvent.click(screen.getByRole('radio', { name: 'Em cima, à esquerda' }))
    fireEvent.change(campoBotao(), { target: { value: 'Fale com a gente' } })
    expect(resumoDo('posicao')).toContain('Mudou: Canto')
    // Sem mudanca, o grupo nao oferece voltar.
    expect(within(secao('celular')).queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()

    fireEvent.click(within(secao('posicao')).getByRole('button', { name: 'Voltar ao padrão' }))

    expect(resumoDo('posicao')).not.toContain('Mudou')
    expect(
      (screen.getByRole('radio', { name: 'Embaixo, à direita' }) as HTMLInputElement).checked,
    ).toBe(true)
    // O texto do botao e da Aparência: continua como foi escrito.
    expect(campoBotao().getAttribute('value')).toBe('Fale com a gente')
    expect(publicarLigado()).toBe(true)
  })

  it('abrir "No celular" troca a prévia para o celular, com o selo, e fechar volta', async () => {
    montar()
    await esperarCampoBotao()
    expect(aparelho('Computador')).toBe('true')
    expect(screen.queryByText('Mostrando: celular')).toBeNull()

    grupo('celular').open = true
    await waitFor(() => expect(aparelho('Celular')).toBe('true'))
    expect(screen.getByText('Mostrando: celular')).toBeTruthy()

    grupo('celular').open = false
    await waitFor(() => expect(aparelho('Computador')).toBe('true'))
    expect(screen.queryByText('Mostrando: celular')).toBeNull()
  })

  it('o aparelho e uma aba: as setas trocam, e nada se grava', async () => {
    montar()
    await esperarCampoBotao()

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Computador' }), { key: 'ArrowRight' })
    expect(aparelho('Celular')).toBe('true')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      screen.getByRole('tab', { name: 'Celular' }).id,
    )
    expect(screen.getByText('Tudo publicado')).toBeTruthy()
  })

  it('o celular escolhido na prévia fica, mesmo fechando "No celular"', async () => {
    montar()
    await esperarCampoBotao()

    fireEvent.click(screen.getByRole('tab', { name: 'Celular' }))
    grupo('celular').open = true
    await waitFor(() => expect(grupo('celular').open).toBe(true))
    grupo('celular').open = false

    // O `toggle` do `<details>` chega numa tarefa depois: espera ele passar.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(aparelho('Celular')).toBe('true')
  })

  it('a ancora da busca abre o grupo em volta do campo', async () => {
    montar()
    await esperarCampoBotao()

    // `useScrollToHash` abre os `<details>` em volta do alvo: a ancora do grupo fica
    // dentro dele, no titulo, e a dos campos, no corpo.
    for (const id of ['aparencia', 'posicao', 'celular', 'paginas']) {
      expect(document.getElementById(id)?.closest('summary')).not.toBeNull()
    }
    for (const id of [
      'texto-do-botao',
      'so-o-icone',
      'icone',
      'cor-do-botao',
      'cor-do-texto',
      'mais-opcoes',
      'tamanho',
      'formato',
      'sombra',
      'canto',
      'distancia',
      'no-celular',
      'paginas-escondidas',
    ]) {
      expect(document.getElementById(id)?.closest('details'), id).not.toBeNull()
    }
  })

  it('os controles vem antes da prévia no código: o Tab chega a eles primeiro', async () => {
    montar()
    await esperarCampoBotao()

    const previa = document.getElementById('previa') as HTMLElement
    for (const id of ['aparencia', 'posicao', 'celular', 'paginas']) {
      const grupoAntes = document.getElementById(id) as HTMLElement
      expect(grupoAntes.compareDocumentPosition(previa) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      )
    }
    // So o desenho poe a previa no topo, abaixo de `lg`.
    expect(previa.parentElement?.className).toContain('order-first')
  })

  it('o grupo e nomeado pela secao, e nao por um titulo dentro do summary', async () => {
    montar()
    await esperarCampoBotao()

    expect(grupo('aparencia').querySelector('summary h2, summary h3')).toBeNull()
    expect(screen.getByRole('region', { name: 'Aparência' })).toBe(secao('aparencia'))
  })

  it('os textos do formulário e o de depois do envio não moram mais aqui', async () => {
    montar()
    await esperarCampoBotao()

    expect(screen.queryByRole('textbox', { name: 'Título do formulário' })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: /escolher o tipo/ })).toBeNull()
    expect(screen.queryByText(/Confirmação, acima do protocolo/)).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Tema do formulário' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Formulário' }).getAttribute('href')).toBe(
      '/p/p-1/form-texts',
    )
  })

  it('o endereço antigo de um campo que mudou de tela leva à tela nova', async () => {
    const router = montar('/p/p-1/tool#confirmacao')
    await waitFor(() => expect(router.state.location.pathname).toBe('/p/p-1/identity'))
    expect(router.state.location.hash).toBe('#confirmacao')

    cleanup()
    const outro = montar('/p/p-1/tool#titulo-do-formulario')
    await waitFor(() => expect(outro.state.location.pathname).toBe('/p/p-1/form-texts'))

    // O tema foi para Formulário, com o resto do que e do formulario.
    cleanup()
    const tema = montar('/p/p-1/tool#tema')
    await waitFor(() => expect(tema.state.location.pathname).toBe('/p/p-1/form-texts'))
    expect(tema.state.location.hash).toBe('#tema')
  })

  it('a pílula do cabeçalho liga e desliga, e desligado avisa o que para', async () => {
    montar()
    await esperarCampoBotao()

    expect(screen.getByText('Visível no seu sistema')).toBeTruthy()
    const desligar = screen.getByRole('button', { name: 'Desligar o botão no seu sistema' })
    // A busca da configuracao leva a `tool#mostrar-no-site`: o foco cai no controle.
    expect(desligar.id).toBe('mostrar-no-site')

    fireEvent.click(desligar)

    expect(screen.getByText('Desligado')).toBeTruthy()
    expect(screen.getByText(/ninguém no seu sistema consegue relatar/)).toBeTruthy()
    expect(publicarLigado()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Ligar o botão no seu sistema' }))

    expect(screen.getByText('Visível no seu sistema')).toBeTruthy()
    expect(screen.queryByText(/ninguém no seu sistema consegue relatar/)).toBeNull()
    expect(publicarLigado()).toBe(false)
  })

  /**
   * O seletor de cor nao e exercitado aqui de proposito: ele so aparece com uma
   * cor para comecar, e essa cor vem da folha de estilo — que o jsdom nao carrega.
   * Escreve-la neste arquivo seria cor crua num `.tsx`, que `designSystem.test.ts`
   * reprova com razao. Quem cobre a leitura e `productAccent.test.ts`, que e
   * `.ts` e por isso pode escrever cor.
   *
   * O que da para travar aqui e o que importa na tela: **o padrao nao e uma cor**.
   * Enquanto ninguem escolher "Outra…", nao existe seletor nem codigo de cor. As
   * amostras e o codigo sao travados em `AppearanceSection.test.tsx`, com a paleta.
   */
  it('o padrao nao e uma cor: sem escolher, nao ha campo de cor', async () => {
    montar()

    await esperarCampoBotao()

    const cor = screen.getByRole('radiogroup', { name: 'Cor do botão' })
    expect((within(cor).getByRole('radio', { name: 'Padrão' }) as HTMLInputElement).checked).toBe(
      true,
    )
    expect(screen.queryByLabelText('Outra cor do botão')).toBeNull()
    expect(screen.queryByLabelText('Código da cor do botão')).toBeNull()
  })

  it('falha ao carregar nao diz que o site parou', async () => {
    dublê.ler.mockRejectedValue(new Error('rede'))

    montar()

    expect(await screen.findByText(/continua com o que já estava publicado/)).toBeTruthy()
  })
})
