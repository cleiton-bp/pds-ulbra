// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaSettingsViewModel, ProjectViewModel } from '@/contracts'
import { MediaScreen } from '@/features/media/MediaScreen'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Sem armazenamento, a API responde o anexo desligado, e a tela so mostra.** O dublê
 * responde como a API: desligado, e o resto como esta salvo. A tela nao deixa ligar nem
 * publicar, como a API, porque gravar o desligado apagaria a escolha do projeto. O aviso
 * nao diz qual e a escolha salva, porque a API sem armazenamento responde desligado para
 * todo projeto.
 *
 * **Ligado sem print nem arquivo aceito nao aceita nada**, e a tela nao aceita sozinha:
 * cada coisa aceita e espaco que o projeto passa a guardar. O aviso e uma linha embaixo
 * do titulo, e conta so o que a tela mostra: o video que a API ainda liste ligado, na
 * janela da troca, nao esconde o aviso.
 *
 * **O print e uma escolha so.** Aceitar imagem e deixar capturar a tela vao juntos: com
 * ele, a pessoa marca uma area da pagina, cola um print ou escolhe uma imagem, e ele abre
 * no editor. O Publicar grava as duas iguais, mesmo vindo de um projeto que tinha uma sem
 * a outra.
 *
 * **Quantidade e tamanho nao sao da tela.** Nao ha campo para eles, e o Publicar grava os
 * de fabrica de cada tipo, para nenhum limite antigo ficar escondido valendo.
 *
 * **O arquivo vem desligado de fabrica, com os tipos seguros marcados**, e ligado sem
 * tipo nenhum nao aceita nada: a tela avisa e nao deixa publicar, como a API.
 *
 * **Nao ha grupo de video, so uma linha dizendo que ele saiu.** A tela nao o mostra nem
 * quando a API ainda o lista, nem o manda de volta ao publicar.
 *
 * **O Publicar mora no titulo** (a mudanca vai ao ar no formulario), e so liga com
 * mudanca: sem ela, fica desligado com "Tudo publicado" ao lado.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<MediaSettingsViewModel>>(),
  salvar: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectMediaSettingsService: {
      getMediaSettings: dublê.ler,
      saveMediaSettings: dublê.salvar,
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

const UM_MB = 1024 * 1024

/** O padrao de fabrica, que e o que a API responde para quem nunca salvou nada. */
function padrao(mudanca: Partial<MediaSettingsViewModel> = {}): MediaSettingsViewModel {
  return {
    IsStorageAvailable: true,
    IsEnabled: true,
    AllowsScreenCapture: true,
    AllowsOnInfoRequest: true,
    AllowsOnReopen: true,
    Kinds: [IMAGEM, ARQUIVO],
    FileFormats: CATALOGO,
    ...mudanca,
  }
}

const IMAGEM = {
  Kind: 'Image' as const,
  IsEnabled: true,
  MaxCount: 3,
  MaxBytes: 5 * UM_MB,
  Formats: [],
}

/** Desligado de fabrica, com os formatos seguros marcados. */
const ARQUIVO = {
  Kind: 'File' as const,
  IsEnabled: false,
  MaxCount: 2,
  MaxBytes: 10 * UM_MB,
  Formats: ['pdf', 'text', 'spreadsheet'],
}

/** O catalogo da API. */
const CATALOGO = [
  { Key: 'pdf', IsDefault: true, Extensions: ['.pdf'] },
  { Key: 'text', IsDefault: true, Extensions: ['.txt', '.log'] },
  { Key: 'spreadsheet', IsDefault: true, Extensions: ['.csv', '.xlsx', '.ods'] },
  { Key: 'document', IsDefault: false, Extensions: ['.docx', '.odt'] },
  { Key: 'json', IsDefault: false, Extensions: ['.json'] },
]

/**
 * O que a API responde sem armazenamento na instalacao: o anexo desligado, e o resto
 * exatamente como o projeto salvou.
 */
function semArmazenamento(salvo: MediaSettingsViewModel): MediaSettingsViewModel {
  return { ...salvo, IsStorageAvailable: false, IsEnabled: false }
}

function montar() {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet context={{ project: projeto }} />,
        children: [{ index: true, element: <MediaScreen /> }],
      },
    ],
    { initialEntries: ['/'] },
  )

  render(<RouterProvider router={router} />)
}

const carregada = () => screen.findByRole('checkbox', { name: 'Aceitar anexos' })
const anexo = () => screen.getByRole('checkbox', { name: 'Aceitar anexos' }) as HTMLInputElement
const publicar = () => screen.getByRole('button', { name: 'Publicar' }) as HTMLButtonElement
/** Sem o que publicar: o Publicar fica a vista, desligado, com "Tudo publicado" ao lado. */
const nadaAPublicar = () => screen.queryByText('Tudo publicado') !== null && publicar().disabled
const caixa = (nome: string | RegExp) =>
  screen.getByRole('checkbox', { name: nome }) as HTMLInputElement
const print = () => caixa('Aceitar print da tela')
const imagemNoBotao = () => caixa(/^Imagem/)
const reabrir = () => caixa('Ao reabrir')
const formato = (nome: RegExp) => caixa(nome)
/** O grupo do acordeao: a ancora fica no `<summary>`. */
const grupo = (id: string) => document.getElementById(id)?.closest('details') as HTMLDetailsElement
const resumoDo = (id: string) => grupo(id).querySelector('summary')?.textContent ?? ''
/** O que o Publicar mandou da ultima vez. */
const enviado = () => dublê.salvar.mock.calls.at(-1)?.[1] as MediaSettingsViewModel

/** O `PUT` devolve o que recebeu, como a API faz quando aceita. */
function ecoarAoSalvar() {
  dublê.salvar.mockImplementation(async (_projeto: string, pedido: object) => ({
    ...padrao(),
    ...pedido,
  }))
}

describe('MediaScreen', () => {
  afterEach(cleanup)

  beforeEach(() => {
    for (const mock of Object.values(dublê)) mock.mockReset()
    dublê.ler.mockResolvedValue(padrao())
  })

  it('desenha o padrão como configuração corrente, e não como ausência dela', async () => {
    montar()

    await carregada()

    expect(anexo().checked).toBe(true)
    expect(print().checked).toBe(true)
    expect(imagemNoBotao().checked).toBe(true)
    expect(formato(/^PDF/).checked).toBe(false)
  })

  it('não há campo de quantidade nem de tamanho', async () => {
    montar()

    await carregada()

    expect(screen.queryByLabelText(/por envio$/)).toBeNull()
    expect(screen.queryByLabelText(/em MB/)).toBeNull()
    expect(screen.queryByText(/MB/)).toBeNull()
  })

  it('a ação do título é Publicar: a mudança vai ao ar no formulário', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    expect(nadaAPublicar()).toBe(true)

    fireEvent.click(reabrir())
    expect(screen.getByText('Mudanças não publicadas')).toBeDefined()
    expect(publicar().disabled).toBe(false)

    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(nadaAPublicar()).toBe(true))
  })

  it('a chave geral fica ao lado do título, e desligada diz o que acontece', async () => {
    montar()

    await carregada()
    expect(anexo().closest('header')).not.toBeNull()
    expect(screen.queryByText(/Desligado: o formulário não mostra anexo/)).toBeNull()

    fireEvent.click(anexo())

    expect(screen.getByText(/Desligado: o formulário não mostra anexo/)).toBeDefined()
  })

  it('o Publicar grava os limites de fábrica, e não o que estava salvo', async () => {
    dublê.ler.mockResolvedValue(
      padrao({
        Kinds: [
          { ...IMAGEM, MaxCount: 7, MaxBytes: 9 * UM_MB },
          { ...ARQUIVO, MaxCount: 5, MaxBytes: 25 * UM_MB },
        ],
      }),
    )
    ecoarAoSalvar()
    montar()

    await carregada()
    fireEvent.click(reabrir())
    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    expect(enviado().Kinds).toEqual([IMAGEM, ARQUIVO])
  })

  it('o print da tela e a imagem do botão de anexar são escolhas separadas', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()
    const dica = screen.getByText(/marca uma área da página/)
    expect(dica.textContent).toMatch(/editor/)
    expect(dica.textContent).not.toMatch(/vídeo/i)
    // O detalhe fica recolhido, num "Saiba mais".
    expect(screen.getByText('Saiba mais').closest('details')?.open).toBe(false)

    fireEvent.click(print())
    expect(resumoDo('grupo-imagem')).toContain('Desligado')
    expect(imagemNoBotao().checked).toBe(true)
    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    expect(enviado().AllowsScreenCapture).toBe(false)
    expect(enviado().Kinds[0]).toMatchObject({ Kind: 'Image', IsEnabled: true })
  })

  it('o projeto que aceitava imagem sem captura continua assim: sem print, com a imagem no botão', async () => {
    dublê.ler.mockResolvedValue(padrao({ AllowsScreenCapture: false }))
    ecoarAoSalvar()
    montar()

    await carregada()
    expect(print().checked).toBe(false)
    expect(imagemNoBotao().checked).toBe(true)

    fireEvent.click(reabrir())
    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    expect(enviado().AllowsScreenCapture).toBe(false)
    expect(enviado().Kinds[0]).toMatchObject({ Kind: 'Image', IsEnabled: true })
  })

  it('sem armazenamento, a tela só mostra, e não afirma qual é a escolha salva', async () => {
    dublê.ler.mockResolvedValue(
      semArmazenamento(
        padrao({ AllowsScreenCapture: false, Kinds: [{ ...IMAGEM, IsEnabled: false }, ARQUIVO] }),
      ),
    )
    montar()

    await screen.findByText(/Não há armazenamento configurado nesta instalação/)
    expect(screen.queryByText(/só por isso/)).toBeNull()
    expect(
      screen.getByText(/a escolha do projeto volta a valer quando houver armazenamento/),
    ).toBeDefined()

    expect(anexo().checked).toBe(false)
    expect(anexo().disabled).toBe(true)
    expect(nadaAPublicar()).toBe(true)

    // O que aparece e o salvo, e nao o padrao, fora de alcance.
    expect(print().checked).toBe(false)
    expect(print().closest('fieldset')?.disabled).toBe(true)
  })

  // A API nao responde ligado sem armazenamento; o teste trava a regra da tela, que nao
  // depende disso.
  it('sem armazenamento, nem uma resposta com o anexo ligado deixa publicar', async () => {
    dublê.ler.mockResolvedValue(padrao({ IsStorageAvailable: false, IsEnabled: true }))
    montar()

    await screen.findByText(/Não há armazenamento configurado nesta instalação/)

    fireEvent.click(reabrir())

    expect(publicar().disabled).toBe(true)
  })

  it('anexo ligado sem print nem tipo de arquivo avisa numa linha, e não deixa publicar', async () => {
    montar()

    await carregada()

    fireEvent.click(print())
    fireEvent.click(imagemNoBotao())

    const aviso = await screen.findByText(/Ligado sem print nem tipo de arquivo aceito/)
    expect(aviso.textContent).not.toMatch(/vídeo/i)
    expect(screen.getByText('Aceite o print da tela ou um tipo de arquivo.')).toBeDefined()
    expect(publicar().disabled).toBe(true)
  })

  // Na janela da troca a API antiga ainda lista video. Ligado, ele nao conta como tipo
  // aceito: a tela nao o mostra, e conta-lo esconderia o aviso.
  it('com a API ainda listando vídeo ligado e imagem desligada, avisa que nada é aceito', async () => {
    dublê.ler.mockResolvedValue(
      padrao({
        AllowsScreenCapture: false,
        Kinds: [
          { Kind: 'Image', IsEnabled: false, MaxCount: 3, MaxBytes: 5 * UM_MB },
          { Kind: 'Video', IsEnabled: true, MaxCount: 1, MaxBytes: 20 * UM_MB },
        ],
      }),
    )
    montar()

    await carregada()

    expect(screen.getByText(/Ligado sem print nem tipo de arquivo aceito/)).toBeDefined()

    fireEvent.click(reabrir())
    expect(publicar().disabled).toBe(true)
  })

  it('não tem grupo de vídeo, nem campo de duração, e diz numa linha que o vídeo saiu', async () => {
    montar()

    await carregada()

    expect(screen.queryByRole('checkbox', { name: /Vídeo/ })).toBeNull()
    expect(screen.queryByLabelText(/Duração máxima/)).toBeNull()
    expect(
      screen.getByText(/vídeo não é mais aceito \(os já recebidos continuam nos relatos\)/),
    ).toBeDefined()
  })

  // Na janela da troca a API antiga ainda lista video. A tela nao o mostra, e publicar
  // nao o manda: tipo que nao vai fica como esta do lado de la.
  it('o vídeo que a API ainda lista não aparece, e não vai ao publicar', async () => {
    const antigo = padrao()
    const comVideo: MediaSettingsViewModel = {
      ...antigo,
      Kinds: [
        ...antigo.Kinds,
        { Kind: 'Video', IsEnabled: true, MaxCount: 1, MaxBytes: 20 * UM_MB },
      ],
    }
    dublê.ler.mockResolvedValue(comVideo)
    dublê.salvar.mockResolvedValue(padrao())
    montar()

    await carregada()
    expect(screen.queryByRole('checkbox', { name: /Vídeo/ })).toBeNull()

    fireEvent.click(reabrir())
    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    expect(enviado().Kinds.map((tipo) => tipo.Kind)).toEqual(['Image', 'File'])
  })

  it('o botão só age quando há o que publicar', async () => {
    montar()

    await carregada()
    expect(nadaAPublicar()).toBe(true)

    fireEvent.click(reabrir())
    expect(publicar().disabled).toBe(false)

    // Voltar ao valor salvo e nao ter mudanca: o Publicar desliga.
    fireEvent.click(reabrir())
    expect(nadaAPublicar()).toBe(true)
  })

  it('descartar volta ao que está salvo, sem gravar', async () => {
    montar()

    await carregada()
    fireEvent.click(print())
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(print().checked).toBe(true)
    expect(nadaAPublicar()).toBe(true)
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('manda a configuração inteira, com os limites de fábrica de cada tipo', async () => {
    dublê.salvar.mockResolvedValue(padrao())
    montar()

    await carregada()
    fireEvent.click(reabrir())
    fireEvent.click(publicar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
      IsEnabled: true,
      AllowsScreenCapture: true,
      AllowsOnInfoRequest: true,
      AllowsOnReopen: false,
      Kinds: [IMAGEM, ARQUIVO],
    })
  })

  // Chave propria, e nao a da resposta: um projeto pode querer o print de quem responde
  // ao time e nao o de quem reabre, e o contrario.
  it('a chave da reabertura é independente da resposta, e vai no publicar', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()
    const responder = caixa('Ao responder o time')
    expect(reabrir().checked).toBe(true)

    fireEvent.click(reabrir())

    expect(reabrir().checked).toBe(false)
    expect(responder.checked).toBe(true)
    expect(screen.getByText('Mudanças não publicadas')).toBeDefined()

    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    expect(enviado().AllowsOnReopen).toBe(false)
    expect(enviado().AllowsOnInfoRequest).toBe(true)
  })

  it('com o anexo desligado, a chave da reabertura fica fora de alcance', async () => {
    montar()

    await carregada()
    fireEvent.click(anexo())

    expect(reabrir().closest('fieldset')?.disabled).toBe(true)
  })

  it('toda âncora continua na tela, dentro do grupo certo', async () => {
    montar()

    await carregada()

    // A chave geral mora no titulo, fora dos grupos.
    expect(document.getElementById('aceitar-anexo')?.closest('details')).toBeNull()
    expect(document.getElementById('aceitar-anexo')?.closest('header')).not.toBeNull()

    // Os enderecos antigos da captura e dos limites da imagem caem no Print da tela.
    const dentroDe: Record<string, string> = {
      'anexo-imagem': 'grupo-imagem',
      'mais-opcoes': 'grupo-imagem',
      'capturar-tela': 'grupo-imagem',
      'anexo-arquivo': 'grupo-arquivo',
      'anexo-na-resposta': 'quando-anexar',
      'anexo-na-reabertura': 'quando-anexar',
    }
    for (const [ancora, id] of Object.entries(dentroDe)) {
      expect(document.getElementById(ancora)?.closest('details'), ancora).toBe(grupo(id))
    }
    // Os tres grupos sao um acordeao so: abrir um fecha o outro.
    const nomes = ['grupo-imagem', 'grupo-arquivo', 'quando-anexar'].map((id) =>
      grupo(id).getAttribute('name'),
    )
    expect(new Set(nomes)).toEqual(new Set(['anexos']))
  })

  describe('os tipos do botão de anexar', () => {
    it('de fábrica, o botão aceita só a imagem, e os formatos de arquivo vêm desmarcados', async () => {
      montar()

      await carregada()

      expect(screen.getByText('Tipos de arquivo aceitos')).toBeDefined()
      expect(imagemNoBotao().checked).toBe(true)
      expect(imagemNoBotao().closest('label')?.textContent).toMatch(/\.png \.jpg \.jpeg \.webp/)
      for (const nome of [/^PDF/, /^Texto e log/, /^Planilha/, /^Documento/, /^JSON/])
        expect(formato(nome).checked).toBe(false)
      // As extensoes de cada tipo ficam escritas junto dele.
      expect(formato(/^Planilha/).closest('label')?.textContent).toMatch(/\.csv \.xlsx \.ods/)
    })

    it('não oferece o zip, e diz por quê numa linha', async () => {
      montar()

      await carregada()

      expect(screen.queryByRole('checkbox', { name: /zip/i })).toBeNull()
      expect(
        screen.getByText(
          'Zip não é aceito: pode trazer qualquer coisa dentro, e quem relata envia sem compactar.',
        ),
      ).toBeDefined()
    })

    it('marcar um formato liga o arquivo, e o publicar manda só os marcados, com os limites de fábrica', async () => {
      ecoarAoSalvar()
      montar()

      await carregada()

      fireEvent.click(formato(/^JSON/))
      fireEvent.click(publicar())

      await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

      expect(enviado().Kinds[1]).toEqual({ ...ARQUIVO, IsEnabled: true, Formats: ['json'] })
    })

    it('desmarcar o último formato desliga o arquivo', async () => {
      ecoarAoSalvar()
      montar()

      await carregada()
      fireEvent.click(formato(/^PDF/))
      fireEvent.click(formato(/^PDF/))
      fireEvent.click(reabrir())
      fireEvent.click(publicar())
      await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

      expect(enviado().Kinds[1]).toMatchObject({ Kind: 'File', IsEnabled: false })
    })

    it('sem nenhum tipo marcado, o formulário fica sem o botão, e com o print ligado publica', async () => {
      montar()

      await carregada()
      fireEvent.click(imagemNoBotao())

      expect(
        screen.getByText('Sem nenhum tipo marcado, o formulário não mostra o botão de anexar.'),
      ).toBeDefined()
      expect(resumoDo('grupo-arquivo')).toContain('Nenhum tipo, e o formulário fica sem o botão')
      expect(publicar().disabled).toBe(false)
    })

    // Sem print e sem tipo nada entra, e o Publicar trava; desligar o anexo e o caminho
    // certo para quem nao quer anexo, e destrava.
    it('sem print e sem tipo, o publicar trava, e desligar o anexo destrava', async () => {
      montar()

      await carregada()
      fireEvent.click(print())
      fireEvent.click(imagemNoBotao())
      expect(publicar().disabled).toBe(true)

      fireEvent.click(anexo())

      expect(publicar().disabled).toBe(false)
    })

    // Na janela da troca, a API de antes do arquivo exige o total ao salvar.
    it('a API de antes manda o total, e a tela o devolve ao publicar; a nova, nao', async () => {
      dublê.ler.mockResolvedValue(padrao({ MaxFilesPerReport: 4 }))
      ecoarAoSalvar()
      montar()

      await carregada()
      fireEvent.click(reabrir())
      fireEvent.click(publicar())
      await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

      expect(enviado()).toMatchObject({ MaxFilesPerReport: 4 })
    })
  })
})
