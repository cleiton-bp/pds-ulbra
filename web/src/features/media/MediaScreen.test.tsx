// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
 * **Ligado sem imagem nem arquivo aceito nao aceita nada**, e a tela nao aceita imagem
 * sozinha: cada imagem aceita e espaco que o projeto passa a guardar. O aviso e uma
 * linha embaixo do titulo, e conta so o que a tela mostra: o video que a API ainda liste
 * ligado, na janela da troca, nao esconde o aviso.
 *
 * **Sem total por envio.** Imagem e arquivo tem cada um a sua quantidade e o seu
 * tamanho, numa frase so ("Até 3 imagens de 5 MB cada"), e a linha de baixo diz que e
 * por envio — o que o total dizia antes.
 *
 * **O arquivo vem desligado de fabrica, com os formatos seguros marcados**, e ligado sem
 * formato nenhum nao aceita nada: a tela avisa e nao deixa publicar, como a API. O
 * tamanho dele vai ate 25 MB, e os formatos vao no publicar.
 *
 * **O banco guarda bytes, e quem configura pensa em MB.** A conversao mora na borda, e o
 * teste a trava nos dois sentidos.
 *
 * **Tipo desligado mantem os limites visiveis.** Esconde-los faria parecer que desligar
 * apaga o que ja tinha sido pensado.
 *
 * **Nao ha grupo de video, so uma linha dizendo que ele saiu.** A tela nao o mostra nem
 * quando a API ainda o lista — nem o manda de volta ao publicar. A captura fala so do
 * Capturar tela, mora dentro da imagem e fica desligada sem ela.
 *
 * **Campo numerico guarda o que foi digitado.** Apagado, ele fica vazio e avisa, em vez
 * de pular para o minimo. Casa decimal em campo inteiro, ou numero fora da faixa, avisa
 * e nao chega na API: o Publicar leva ate o campo, e nao grava. Campo que sai de
 * alcance, ao desligar o anexo, volta ao valor salvo e nao prende o Publicar. Em grupo
 * fechado, o resumo do grupo diz "corrigir", e abrir o grupo leva o foco ate ele.
 *
 * **O Publicar mora no titulo** — a mudanca vai ao ar no formulario —, e so liga com
 * mudanca: sem ela, fica desligado com "Tudo publicado" ao lado. A tela nao conta as
 * mudancas: a frase e "Mudanças não publicadas" (ou o motivo de nao gravar).
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
const campo = (nome: string) => screen.getByLabelText(nome) as HTMLInputElement
const quantidadeImagem = () => campo('Quantas imagens por envio')
const quantidadeArquivo = () => campo('Quantos arquivos por envio')
const tamanhoImagem = () => campo('Tamanho da imagem, em MB')
const tamanhoArquivo = () => campo('Tamanho do arquivo, em MB')
const caixa = (nome: string | RegExp) =>
  screen.getByRole('checkbox', { name: nome }) as HTMLInputElement
const imagemAceita = () => caixa('Aceitar imagem')
const arquivoAceito = () => caixa('Aceitar arquivo')
const captura = () => caixa('Deixar capturar a tela')
const formato = (nome: RegExp) => caixa(nome)
/** O grupo do acordeao: a ancora fica no `<summary>`. */
const grupo = (id: string) => document.getElementById(id)?.closest('details') as HTMLDetailsElement
const resumoDo = (id: string) => grupo(id).querySelector('summary')?.textContent ?? ''

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
    expect(quantidadeImagem().value).toBe('3')
    expect(quantidadeArquivo().value).toBe('2')
  })

  it('a ação do título é Publicar: a mudança vai ao ar no formulário', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    expect(nadaAPublicar()).toBe(true)

    fireEvent.click(captura())
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

  it('mostra o tamanho em MB, e não os bytes que o banco guarda', async () => {
    montar()

    await carregada()

    expect([tamanhoImagem().value, tamanhoArquivo().value]).toEqual(['5', '10'])
  })

  it('converte MB para bytes ao publicar', async () => {
    dublê.salvar.mockResolvedValue(padrao())
    montar()

    await carregada()

    fireEvent.change(tamanhoImagem(), { target: { value: '8' } })
    fireEvent.click(publicar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds[0]?.MaxBytes).toBe(8 * UM_MB)
  })

  it('sem armazenamento, a tela só mostra, e não afirma qual é a escolha salva', async () => {
    dublê.ler.mockResolvedValue(
      semArmazenamento(padrao({ Kinds: [{ ...IMAGEM, MaxCount: 2 }, ARQUIVO] })),
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

    // Os limites que aparecem sao os salvos, e nao o padrao.
    expect(quantidadeImagem().value).toBe('2')
    expect(quantidadeImagem().closest('fieldset')?.disabled).toBe(true)
  })

  // A API nao responde ligado sem armazenamento; o teste trava a regra da tela, que nao
  // depende disso.
  it('sem armazenamento, nem uma resposta com o anexo ligado deixa publicar', async () => {
    dublê.ler.mockResolvedValue(padrao({ IsStorageAvailable: false, IsEnabled: true }))
    montar()

    await screen.findByText(/Não há armazenamento configurado nesta instalação/)

    fireEvent.change(quantidadeImagem(), { target: { value: '2' } })

    expect(publicar().disabled).toBe(true)
  })

  it('anexo ligado sem imagem nem arquivo aceito avisa numa linha, e não deixa publicar', async () => {
    montar()

    await carregada()

    fireEvent.click(imagemAceita())

    const aviso = await screen.findByText(/Ligado sem imagem nem arquivo aceito/)
    // O aviso e sobre imagem e arquivo: projeto que nunca aceitou so video nao tem por
    // que ler sobre video aqui.
    expect(aviso.textContent).not.toMatch(/vídeo/i)
    expect(screen.getByText('Aceite imagem ou arquivo.')).toBeDefined()
    expect(publicar().disabled).toBe(true)
  })

  // Na janela da troca a API antiga ainda lista video. Ligado, ele nao conta como tipo
  // aceito: a tela nao o mostra, e conta-lo esconderia o aviso.
  it('com a API ainda listando vídeo ligado e imagem desligada, avisa que nada é aceito', async () => {
    dublê.ler.mockResolvedValue(
      padrao({
        Kinds: [
          { Kind: 'Image', IsEnabled: false, MaxCount: 3, MaxBytes: 5 * UM_MB },
          { Kind: 'Video', IsEnabled: true, MaxCount: 1, MaxBytes: 20 * UM_MB },
        ],
      }),
    )
    montar()

    await carregada()

    expect(screen.getByText(/Ligado sem imagem nem arquivo aceito/)).toBeDefined()

    fireEvent.change(quantidadeImagem(), { target: { value: '2' } })
    expect(publicar().disabled).toBe(true)
  })

  it('não há total por envio: cada tipo tem o seu, numa frase, e a tela diz que é por envio', async () => {
    montar()

    await carregada()

    expect(screen.queryByLabelText(/Arquivos por envio/)).toBeNull()
    expect(screen.queryByText(/Vale o menor/)).toBeNull()
    expect(document.getElementById('limites-imagem')?.textContent).toMatch(
      /Até.*imagens de.*MB cada.*\(máximo 10\)/,
    )
    expect(document.getElementById('limites-arquivo')?.textContent).toMatch(
      /Até.*arquivos de.*MB cada.*\(máximo 10 de 25 MB\)/,
    )
    expect(screen.getAllByText('Por envio; o armazenamento recusa o que passar.')).toHaveLength(2)
  })

  it('desligar um tipo não esconde os limites dele', async () => {
    montar()

    await carregada()
    fireEvent.click(imagemAceita())

    expect(quantidadeImagem().value).toBe('3')
    expect(tamanhoImagem().value).toBe('5')
  })

  it('não tem grupo de vídeo, nem campo de duração, e diz numa linha que o vídeo saiu', async () => {
    montar()

    await carregada()

    expect(screen.queryByRole('checkbox', { name: /Vídeo/ })).toBeNull()
    expect(screen.queryByLabelText(/Duração máxima/)).toBeNull()
    expect(
      screen.getByText(/Vídeo não é mais aceito; os já recebidos continuam nos relatos/),
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
    expect(screen.getAllByLabelText(/por envio$/)).toHaveLength(2)

    fireEvent.change(quantidadeImagem(), { target: { value: '2' } })
    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds.map((tipo) => tipo.Kind)).toEqual(['Image', 'File'])
  })

  it('o botão só age quando há o que publicar', async () => {
    montar()

    await carregada()
    expect(nadaAPublicar()).toBe(true)

    fireEvent.change(quantidadeImagem(), { target: { value: '2' } })
    expect(publicar().disabled).toBe(false)

    // Voltar ao valor salvo e nao ter mudanca: o Publicar desliga.
    fireEvent.change(quantidadeImagem(), { target: { value: '3' } })
    expect(nadaAPublicar()).toBe(true)
  })

  it('descartar volta ao que está salvo, sem gravar', async () => {
    montar()

    await carregada()
    fireEvent.change(quantidadeImagem(), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(quantidadeImagem().value).toBe('3')
    expect(nadaAPublicar()).toBe(true)
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('manda a configuração inteira, com os limites de cada tipo', async () => {
    dublê.salvar.mockResolvedValue(padrao())
    montar()

    await carregada()
    fireEvent.change(quantidadeImagem(), { target: { value: '2' } })
    fireEvent.click(publicar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
      IsEnabled: true,
      AllowsScreenCapture: true,
      AllowsOnInfoRequest: true,
      AllowsOnReopen: true,
      Kinds: [{ ...IMAGEM, MaxCount: 2 }, ARQUIVO],
    })
  })

  it('a captura fala só do Capturar tela, que vira imagem, e mora dentro da imagem', async () => {
    montar()

    await carregada()

    expect(captura().closest('details')).toBe(grupo('grupo-imagem'))
    const dica = screen.getByText(/marca uma área da página/)
    expect(dica.textContent).toMatch(/vira imagem/)
    expect(dica.textContent).not.toMatch(/grava/i)
    expect(dica.textContent).not.toMatch(/vídeo/i)
    // O detalhe fica recolhido, num "Saiba mais".
    expect(screen.getByText('Saiba mais').closest('details')?.open).toBe(false)
  })

  it('sem imagem aceita, a captura fica desligada, e a escolha não se perde', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()
    expect(captura().disabled).toBe(false)

    fireEvent.click(imagemAceita())

    expect(captura().disabled).toBe(true)
    expect(captura().checked).toBe(true)
    expect(screen.getByText('Só com imagem aceita: a captura vira imagem.')).toBeDefined()
    expect(resumoDo('grupo-imagem')).toContain('Desligado')

    // Religar a imagem devolve a captura como estava.
    fireEvent.click(imagemAceita())
    expect(captura().disabled).toBe(false)
    expect(captura().checked).toBe(true)
  })

  it('fala em envio, e não em relato, nos limites de quantidade', async () => {
    montar()

    await carregada()

    expect(screen.getByText(/Cada um é um envio, com os próprios limites/)).toBeDefined()
    expect(screen.getAllByLabelText(/por envio$/)).toHaveLength(2)
    expect(screen.queryByLabelText(/por relato/)).toBeNull()
  })

  it('campo apagado fica vazio e avisa, e o próximo dígito não gruda no mínimo', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()

    fireEvent.change(quantidadeImagem(), { target: { value: '' } })

    expect(quantidadeImagem().value).toBe('')
    expect(quantidadeImagem().getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Use um número inteiro de 1 a 10.')).toBeDefined()
    expect(screen.getByText('Há um campo a corrigir.')).toBeDefined()

    fireEvent.click(publicar())
    expect(dublê.salvar).not.toHaveBeenCalled()

    fireEvent.change(quantidadeImagem(), { target: { value: '4' } })

    expect(quantidadeImagem().value).toBe('4')
    expect(screen.queryByText('Há um campo a corrigir.')).toBeNull()

    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds[0]?.MaxCount).toBe(4)
  })

  it('campo inteiro com casa decimal avisa, e não chega na API', async () => {
    montar()

    await carregada()

    fireEvent.change(quantidadeImagem(), { target: { value: '2.5' } })

    expect(quantidadeImagem().value).toBe('2.5')
    expect(screen.getByText('Use um número inteiro de 1 a 10.')).toBeDefined()

    fireEvent.click(publicar())
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('número acima do teto avisa antes de publicar', async () => {
    montar()

    await carregada()

    fireEvent.change(quantidadeImagem(), { target: { value: '11' } })

    expect(screen.getByText('Use um número inteiro de 1 a 10.')).toBeDefined()
    fireEvent.click(publicar())
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('o tamanho com uma casa decimal vai em bytes e volta igual depois de publicar', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()

    fireEvent.change(tamanhoImagem(), { target: { value: '5.5' } })
    fireEvent.click(publicar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds[0]?.MaxBytes).toBe(5.5 * UM_MB)

    // Publicado, nao ha mais mudanca: o Publicar desliga, e o campo continua dizendo o
    // numero que foi gravado — e o resumo diz o mesmo, com virgula.
    await waitFor(() => expect(nadaAPublicar()).toBe(true))
    expect(tamanhoImagem().value).toBe('5.5')
    expect(resumoDo('grupo-imagem')).toContain('até 3 de 5,5 MB')
  })

  it('o tamanho com duas casas decimais avisa, em vez de arredondar na tela', async () => {
    montar()

    await carregada()

    fireEvent.change(tamanhoImagem(), { target: { value: '5.25' } })

    expect(tamanhoImagem().value).toBe('5.25')
    expect(screen.getByText('Use um número de 1 a 10, com até uma casa decimal.')).toBeDefined()
    fireEvent.click(publicar())
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  // O tamanho salvo com duas casas nao e arredondado nem ao abrir nem depois de publicar:
  // mostrar 5.3 com 5,25 gravado seria a tela dizendo um limite e o servidor cobrando outro.
  it('um tamanho salvo que não cabe em uma casa aparece como está, antes e depois de publicar', async () => {
    const salvo = padrao()
    const comDuasCasas: MediaSettingsViewModel = {
      ...salvo,
      Kinds: salvo.Kinds.map((tipo) =>
        tipo.Kind === 'Image' ? { ...tipo, MaxBytes: 5.25 * UM_MB } : tipo,
      ),
    }
    dublê.ler.mockResolvedValue(comDuasCasas)
    dublê.salvar.mockImplementation(async (_projeto: string, pedido: object) => ({
      ...comDuasCasas,
      ...pedido,
    }))
    montar()

    await carregada()
    expect(tamanhoImagem().value).toBe('5.25')

    fireEvent.change(quantidadeImagem(), { target: { value: '2' } })
    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds[0]?.MaxBytes).toBe(5.25 * UM_MB)

    await waitFor(() => expect(nadaAPublicar()).toBe(true))
    expect(tamanhoImagem().value).toBe('5.25')
  })

  it('campo inválido não prende o Publicar depois de desligar o anexo', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()

    fireEvent.change(quantidadeArquivo(), { target: { value: '' } })
    fireEvent.change(tamanhoImagem(), { target: { value: '' } })
    expect(screen.getByText('Há 2 campos a corrigir.')).toBeDefined()

    fireEvent.click(anexo())

    // Fora de alcance, cada campo volta ao valor salvo, e e ele que vai.
    expect(quantidadeArquivo().value).toBe('2')
    expect(quantidadeArquivo().getAttribute('aria-invalid')).toBeNull()
    expect(tamanhoImagem().value).toBe('5')
    expect(screen.queryByText(/campos? a corrigir/)).toBeNull()
    expect(publicar().disabled).toBe(false)

    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.IsEnabled).toBe(false)
    expect(enviado.Kinds[1]?.MaxCount).toBe(2)
    expect(enviado.Kinds[0]?.MaxBytes).toBe(5 * UM_MB)
  })

  // Quem apaga o "3" e digita "12" passa pelo "1", que e valido e chega ao rascunho.
  // Voltar a ele gravaria um limite que ninguem escolheu.
  it('desligar o anexo com um campo inválido volta ao valor salvo, e não a uma tecla no caminho', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()

    fireEvent.change(quantidadeImagem(), { target: { value: '1' } })
    fireEvent.change(quantidadeImagem(), { target: { value: '12' } })
    expect(screen.getByText('Há um campo a corrigir.')).toBeDefined()

    fireEvent.click(anexo())

    expect(quantidadeImagem().value).toBe('3')
    expect(screen.queryByText(/campos? a corrigir/)).toBeNull()

    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.IsEnabled).toBe(false)
    expect(enviado.Kinds[0]?.MaxCount).toBe(3)
  })

  it('campo inválido segura o Publicar mesmo com outra mudança pendente, e leva até ele', async () => {
    montar()

    await carregada()

    fireEvent.change(quantidadeImagem(), { target: { value: '2' } })
    fireEvent.change(quantidadeArquivo(), { target: { value: '' } })
    fireEvent.click(publicar())

    expect(dublê.salvar).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(quantidadeArquivo())

    fireEvent.change(quantidadeArquivo(), { target: { value: '11' } })
    fireEvent.click(publicar())
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('campo inválido em grupo fechado: o resumo diz "corrigir", e Publicar ou abrir leva até ele', async () => {
    montar()

    await carregada()
    // O Arquivo comeca fechado: a Imagem abre sozinha.
    expect(grupo('grupo-arquivo').open).toBe(false)

    fireEvent.change(quantidadeArquivo(), { target: { value: '' } })

    expect(resumoDo('grupo-arquivo')).toMatch(/^Arquivocorrigir · /)
    expect(resumoDo('grupo-imagem')).not.toContain('corrigir')

    // Publicar abre o grupo e poe o foco no campo, sem gravar.
    fireEvent.click(publicar())
    expect(grupo('grupo-arquivo').open).toBe(true)
    expect(document.activeElement).toBe(quantidadeArquivo())
    expect(dublê.salvar).not.toHaveBeenCalled()

    // Fechado de novo, abrir o grupo tambem leva ate o campo.
    act(() => {
      ;(document.activeElement as HTMLElement).blur()
      grupo('grupo-arquivo').open = false
    })
    await waitFor(() => expect(document.activeElement).not.toBe(quantidadeArquivo()))
    act(() => {
      grupo('grupo-arquivo').open = true
    })
    await waitFor(() => expect(document.activeElement).toBe(quantidadeArquivo()))

    fireEvent.change(quantidadeArquivo(), { target: { value: '4' } })
    expect(resumoDo('grupo-arquivo')).not.toContain('corrigir')
  })

  // Com passo fixo, o navegador marcaria 5.3 como fora do passo enquanto a tela o aceita,
  // e o campo ficaria com a borda de erro do proprio navegador.
  it('o MB aceita qualquer décimo sem o navegador marcar o campo', async () => {
    montar()

    await carregada()

    fireEvent.change(tamanhoImagem(), { target: { value: '5.3' } })

    expect(tamanhoImagem().validity.stepMismatch).toBe(false)
    expect(tamanhoImagem().getAttribute('aria-invalid')).toBeNull()
  })

  // Chave propria, e nao a da resposta: um projeto pode querer o print de quem responde
  // ao time e nao o de quem reabre, e o contrario.
  it('a chave da reabertura é independente da resposta, e vai no publicar', async () => {
    ecoarAoSalvar()
    montar()

    await carregada()
    const reabrir = caixa('Ao reabrir')
    const responder = caixa('Ao responder o time')
    expect(reabrir.checked).toBe(true)

    fireEvent.click(reabrir)

    expect(reabrir.checked).toBe(false)
    expect(responder.checked).toBe(true)
    expect(screen.getByText('Mudanças não publicadas')).toBeDefined()

    fireEvent.click(publicar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.AllowsOnReopen).toBe(false)
    expect(enviado.AllowsOnInfoRequest).toBe(true)
  })

  it('com o anexo desligado, a chave da reabertura fica fora de alcance', async () => {
    montar()

    await carregada()
    fireEvent.click(anexo())

    expect(caixa('Ao reabrir').closest('fieldset')?.disabled).toBe(true)
  })

  it('o campo acompanha o número que o servidor devolve', async () => {
    dublê.salvar.mockResolvedValue(padrao())
    montar()

    await carregada()

    fireEvent.change(quantidadeImagem(), { target: { value: '2' } })
    fireEvent.click(publicar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(quantidadeImagem().value).toBe('3'))
    expect(nadaAPublicar()).toBe(true)
  })

  it('toda âncora continua na tela, dentro do grupo certo', async () => {
    montar()

    await carregada()

    // A chave geral mora no titulo, fora dos grupos.
    expect(document.getElementById('aceitar-anexo')?.closest('details')).toBeNull()
    expect(document.getElementById('aceitar-anexo')?.closest('header')).not.toBeNull()

    const dentroDe: Record<string, string> = {
      'anexo-imagem': 'grupo-imagem',
      'mais-opcoes': 'grupo-imagem',
      'limites-imagem': 'grupo-imagem',
      'quantidade-Image': 'grupo-imagem',
      'tamanho-Image': 'grupo-imagem',
      'capturar-tela': 'grupo-imagem',
      'anexo-arquivo': 'grupo-arquivo',
      'limites-arquivo': 'grupo-arquivo',
      'quantidade-File': 'grupo-arquivo',
      'tamanho-File': 'grupo-arquivo',
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

  describe('o arquivo', () => {
    it('vem desligado de fábrica, com os formatos seguros marcados', async () => {
      montar()

      await carregada()

      expect(arquivoAceito().checked).toBe(false)
      expect(formato(/^PDF/).checked).toBe(true)
      expect(formato(/^Texto e log/).checked).toBe(true)
      expect(formato(/^Planilha/).checked).toBe(true)
      expect(formato(/^Documento/).checked).toBe(false)
      expect(formato(/^JSON/).checked).toBe(false)
      // As extensoes de cada formato ficam escritas junto dele.
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

    it('ligar, marcar um formato e publicar manda os formatos e o tamanho em bytes', async () => {
      ecoarAoSalvar()
      montar()

      await carregada()

      fireEvent.click(arquivoAceito())
      fireEvent.click(formato(/^JSON/))
      fireEvent.change(tamanhoArquivo(), { target: { value: '20' } })
      fireEvent.click(publicar())

      await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

      const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
      expect(enviado.Kinds[1]).toEqual({
        ...ARQUIVO,
        IsEnabled: true,
        MaxBytes: 20 * UM_MB,
        Formats: ['pdf', 'text', 'spreadsheet', 'json'],
      })
    })

    it('aceito sem formato nenhum avisa no grupo, e não deixa publicar', async () => {
      montar()

      await carregada()

      fireEvent.click(arquivoAceito())
      for (const nome of [/^PDF/, /^Texto e log/, /^Planilha/]) fireEvent.click(formato(nome))

      expect(
        screen.getByText('Marque ao menos um formato, ou deixe de aceitar arquivo.'),
      ).toBeDefined()
      expect(resumoDo('grupo-arquivo')).toContain('Aceito sem formato: nada entra')
      expect(screen.getByText('Marque um formato de arquivo.')).toBeDefined()
      expect(publicar().disabled).toBe(true)

      fireEvent.click(formato(/^PDF/))
      expect(screen.queryByText(/Marque ao menos um formato/)).toBeNull()
      expect(publicar().disabled).toBe(false)
    })

    it('desligado sem formato nenhum não avisa: a escolha fica para quando religar', async () => {
      montar()

      await carregada()

      for (const nome of [/^PDF/, /^Texto e log/, /^Planilha/]) fireEvent.click(formato(nome))

      expect(screen.queryByText(/Marque ao menos um formato/)).toBeNull()
      expect(publicar().disabled).toBe(false)
    })

    // Com o anexo desligado, a lista de formatos fica fora de alcance: travar o Publicar
    // por ela prenderia quem so quer desligar. A API aceita, e religado, a regra volta.
    it('desligar o anexo com o arquivo sem formato publica', async () => {
      ecoarAoSalvar()
      montar()

      await carregada()
      fireEvent.click(arquivoAceito())
      for (const nome of [/^PDF/, /^Texto e log/, /^Planilha/]) fireEvent.click(formato(nome))
      expect(publicar().disabled).toBe(true)

      fireEvent.click(anexo())

      expect(screen.queryByText(/Marque ao menos um formato/)).toBeNull()
      expect(publicar().disabled).toBe(false)
    })

    // Na janela da troca, a API de antes do arquivo exige o total ao salvar.
    it('a API de antes manda o total, e a tela o devolve ao publicar; a nova, nao', async () => {
      dublê.ler.mockResolvedValue(padrao({ MaxFilesPerReport: 4 }))
      ecoarAoSalvar()
      montar()

      await carregada()
      fireEvent.change(quantidadeImagem(), { target: { value: '2' } })
      fireEvent.click(publicar())
      await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

      expect(dublê.salvar.mock.calls[0]?.[1]).toMatchObject({ MaxFilesPerReport: 4 })
    })

    it('o tamanho vai até 25 MB, e a imagem até 10', async () => {
      montar()

      await carregada()

      fireEvent.change(tamanhoArquivo(), { target: { value: '25' } })
      expect(tamanhoArquivo().getAttribute('aria-invalid')).toBeNull()

      fireEvent.change(tamanhoArquivo(), { target: { value: '26' } })
      expect(screen.getByText('Use um número de 1 a 25, com até uma casa decimal.')).toBeDefined()
      expect(tamanhoArquivo().getAttribute('aria-invalid')).toBe('true')
    })
  })
})
