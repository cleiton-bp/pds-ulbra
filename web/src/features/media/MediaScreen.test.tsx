// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaSettingsViewModel, ProjectViewModel } from '@/contracts'
import { MediaScreen } from '@/features/media/MediaScreen'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Sem armazenamento, a API responde o anexo desligado, e a tela so mostra.** O
 * dublê responde como a API: desligado, e o resto como esta salvo. A tela nao deixa
 * ligar nem salvar, como a API, porque salvar gravaria o desligado por cima da
 * escolha do projeto. O aviso nao diz qual e a escolha salva, porque a API sem
 * armazenamento responde desligado para todo projeto, e o que desligou de proposito
 * continua desligado quando o armazenamento chegar.
 *
 * **Ligado sem imagem aceita nao aceita nada**, e a tela nao aceita imagem
 * sozinha: cada imagem aceita e espaco que o projeto passa a guardar, e escolher
 * isso por quem configura seria decidir uma conta no lugar dele. O aviso fala so
 * de imagem, e conta so o que a tela mostra: o video que a API ainda liste ligado,
 * na janela da troca, nao esconde o aviso.
 *
 * **O total diz que vence o menor.** Com um tipo so, o total e o da imagem valem
 * juntos, e subir so o total nao muda nada — a tela precisa dizer isso.
 *
 * **O banco guarda bytes, e quem configura pensa em MB.** A conversao mora na
 * borda, e o teste a trava nos dois sentidos — e ela que faz "5" virar 5242880 e
 * voltar como "5".
 *
 * **Tipo desligado mantem os limites visiveis.** Escondê-los faria parecer que
 * desligar apaga o que ja tinha sido pensado.
 *
 * **Nao ha secao de video, so uma frase dizendo que ele saiu.** A tela nao o
 * mostra nem quando a API ainda o lista, na janela da troca — nem o manda de volta
 * ao salvar. A frase fica para todo projeto, porque a maioria tinha video ligado de
 * fabrica e veria a secao sumir sem explicacao. O interruptor da captura fala so
 * do Capturar tela.
 *
 * **Campo numerico guarda o que foi digitado.** Apagado, ele fica vazio e avisa,
 * em vez de pular para o minimo e grudar o proximo digito nele. Casa decimal em
 * campo inteiro, ou numero fora da faixa, avisa na tela e nao chega na API. Campo
 * que sai de alcance, ao desligar o anexo, volta ao valor salvo e nao prende o
 * Salvar. Com outra mudanca pendente, campo invalido segura o Salvar do mesmo
 * jeito: senao iria para a API um numero que nao esta na tela.
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
}

const UM_MB = 1024 * 1024

/** O padrao de fabrica, que e o que a API responde para quem nunca salvou nada. */
function padrao(mudanca: Partial<MediaSettingsViewModel> = {}): MediaSettingsViewModel {
  return {
    IsStorageAvailable: true,
    IsEnabled: true,
    AllowsScreenCapture: true,
    AllowsOnInfoRequest: true,
    MaxFilesPerReport: 4,
    Kinds: [{ Kind: 'Image', IsEnabled: true, MaxCount: 3, MaxBytes: 5 * UM_MB }],
    ...mudanca,
  }
}

/**
 * O que a API responde sem armazenamento na instalacao: o anexo desligado, e o
 * resto exatamente como o projeto salvou.
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

const anexo = () => screen.getByRole('checkbox', { name: /Aceitar anexo no relato/ })
const salvar = () => screen.getByRole('button', { name: /Salvar/ })
const totalPorEnvio = () => screen.getByLabelText(/Arquivos por envio/) as HTMLInputElement
const tamanhoImagem = () => screen.getAllByLabelText(/Tamanho de cada um/)[0] as HTMLInputElement

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

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    expect((anexo() as HTMLInputElement).checked).toBe(true)
    expect(totalPorEnvio().value).toBe('4')
  })

  it('mostra o tamanho em MB, e não os bytes que o banco guarda', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    const tamanhos = screen.getAllByLabelText(/Tamanho de cada um/) as HTMLInputElement[]
    expect(tamanhos.map((campo) => campo.value)).toEqual(['5'])
  })

  it('converte MB para bytes ao salvar', async () => {
    dublê.salvar.mockResolvedValue(padrao())
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    const imagem = screen.getAllByLabelText(/Tamanho de cada um/)[0] as HTMLInputElement
    fireEvent.change(imagem, { target: { value: '8' } })
    fireEvent.click(salvar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds[0]?.MaxBytes).toBe(8 * UM_MB)
  })

  it('sem armazenamento, a tela só mostra, e não afirma qual é a escolha salva', async () => {
    dublê.ler.mockResolvedValue(semArmazenamento(padrao({ MaxFilesPerReport: 2 })))
    montar()

    await screen.findByText(/Não há armazenamento configurado nesta instalação/)
    expect(screen.getByText(/qualquer que seja a escolha do projeto/)).toBeDefined()
    expect(screen.queryByText(/só por isso/)).toBeNull()
    expect(screen.getByText(/passam a valer quando houver armazenamento/)).toBeDefined()

    expect((anexo() as HTMLInputElement).checked).toBe(false)
    expect((anexo() as HTMLInputElement).disabled).toBe(true)
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)

    // Os limites que aparecem sao os salvos, e nao o padrao.
    expect(totalPorEnvio().value).toBe('2')
    expect(totalPorEnvio().closest('fieldset')?.disabled).toBe(true)
  })

  // A API nao responde ligado sem armazenamento; o teste trava a regra da tela, que
  // nao depende disso.
  it('sem armazenamento, nem uma resposta com o anexo ligado deixa salvar', async () => {
    dublê.ler.mockResolvedValue(padrao({ IsStorageAvailable: false, IsEnabled: true }))
    montar()

    await screen.findByText(/Não há armazenamento configurado nesta instalação/)

    fireEvent.change(totalPorEnvio(), { target: { value: '2' } })

    expect((salvar() as HTMLButtonElement).disabled).toBe(true)
  })

  it('anexo ligado sem imagem aceita avisa, e não deixa salvar', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    fireEvent.click(screen.getByRole('checkbox', { name: /Imagem/ }))

    const aviso = await screen.findByText(/O anexo está ligado e imagem não é aceita/)
    // O aviso e sobre imagem: projeto que nunca aceitou so video nao tem por que
    // ler sobre video aqui.
    expect(aviso.closest('p')?.textContent).not.toMatch(/vídeo/i)
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)
  })

  // Na janela da troca a API antiga ainda lista video. Ligado, ele nao conta como
  // tipo aceito: a tela nao o mostra, e conta-lo esconderia o aviso de um projeto
  // que nao recebe arquivo nenhum.
  it('com a API ainda listando vídeo ligado e imagem desligada, avisa que imagem não é aceita', async () => {
    dublê.ler.mockResolvedValue(
      padrao({
        Kinds: [
          { Kind: 'Image', IsEnabled: false, MaxCount: 3, MaxBytes: 5 * UM_MB },
          { Kind: 'Video', IsEnabled: true, MaxCount: 1, MaxBytes: 20 * UM_MB },
        ],
      }),
    )
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    expect(screen.getByText(/O anexo está ligado e imagem não é aceita/)).toBeDefined()

    fireEvent.change(totalPorEnvio(), { target: { value: '2' } })
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)
  })

  it('o total diz que vale o menor entre ele e o limite da imagem', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    expect(screen.queryByText(/somando os tipos/)).toBeNull()
    expect(screen.getByText(/Vale o menor entre este número e o limite da imagem/)).toBeDefined()
  })

  it('desligar um tipo não esconde os limites dele', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    fireEvent.click(screen.getByRole('checkbox', { name: /Imagem/ }))

    expect(screen.getByLabelText(/Quantos por envio/)).toBeDefined()
    expect(tamanhoImagem().value).toBe('5')
  })

  it('não tem seção de vídeo, nem campo de duração, e diz que o vídeo saiu', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    expect(screen.queryByRole('checkbox', { name: /Vídeo/ })).toBeNull()
    expect(screen.queryByLabelText(/Duração máxima/)).toBeNull()
    expect(
      screen.getByText(
        'Vídeo não é mais aceito como anexo. Os vídeos já recebidos continuam nos relatos.',
      ),
    ).toBeDefined()
  })

  // Na janela da troca a API antiga ainda lista video. A tela nao o mostra, e
  // salvar nao o manda: tipo que nao vai fica como esta do lado de la.
  it('o vídeo que a API ainda lista não aparece, e não vai ao salvar', async () => {
    const antigo = padrao()
    const comVideo: MediaSettingsViewModel = {
      ...antigo,
      Kinds: [
        ...antigo.Kinds,
        { Kind: 'Video', IsEnabled: true, MaxCount: 1, MaxBytes: 20 * UM_MB },
      ],
    }
    dublê.ler.mockResolvedValue(comVideo)
    dublê.salvar.mockResolvedValue(padrao({ MaxFilesPerReport: 2 }))
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    expect(screen.queryByRole('checkbox', { name: /Vídeo/ })).toBeNull()
    expect(screen.getAllByLabelText(/Quantos por envio/)).toHaveLength(1)

    fireEvent.change(totalPorEnvio(), { target: { value: '2' } })
    fireEvent.click(salvar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds.map((tipo) => tipo.Kind)).toEqual(['Image'])
  })

  it('o botão só age quando há o que salvar', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(totalPorEnvio(), { target: { value: '2' } })
    expect((salvar() as HTMLButtonElement).disabled).toBe(false)
  })

  it('manda a configuração inteira, com os limites de cada tipo', async () => {
    dublê.salvar.mockResolvedValue(padrao({ MaxFilesPerReport: 2 }))
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    fireEvent.change(totalPorEnvio(), { target: { value: '2' } })
    fireEvent.click(salvar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    expect(dublê.salvar).toHaveBeenCalledWith('p-1', {
      IsEnabled: true,
      AllowsScreenCapture: true,
      AllowsOnInfoRequest: true,
      MaxFilesPerReport: 2,
      Kinds: padrao().Kinds,
    })
  })

  it('diz que o limite de tamanho é cobrado pelo armazenamento, e não pelo navegador', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    expect(screen.getByText(/O limite de tamanho não é sugestão/)).toBeDefined()
  })

  it('o interruptor da captura fala só do Capturar tela, que vira imagem', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    const captura = screen.getByRole('checkbox', { name: /Deixar capturar a tela/ })
    const texto = captura.closest('label')?.textContent ?? ''
    expect(texto).toMatch(/Capturar tela/)
    expect(texto).toMatch(/vira imagem/)
    expect(texto).not.toMatch(/grava/i)
    expect(texto).not.toMatch(/vídeo/i)
  })

  it('fala em envio, e não em relato, nos limites de quantidade', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    expect(screen.getByText(/O relato é um envio, e cada resposta ao time é outro/)).toBeDefined()
    expect(screen.getAllByLabelText(/Quantos por envio/)).toHaveLength(1)
    expect(screen.queryByLabelText(/por relato/)).toBeNull()
  })

  it('campo apagado fica vazio e avisa, e o próximo dígito não gruda no mínimo', async () => {
    ecoarAoSalvar()
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    fireEvent.change(totalPorEnvio(), { target: { value: '' } })

    expect(totalPorEnvio().value).toBe('')
    expect(totalPorEnvio().getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText('Use um número inteiro de 1 a 10.')).toBeDefined()
    expect(screen.getByText('Há um campo a corrigir.')).toBeDefined()
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(totalPorEnvio(), { target: { value: '3' } })

    expect(totalPorEnvio().value).toBe('3')
    expect(screen.queryByText('Há um campo a corrigir.')).toBeNull()

    fireEvent.click(salvar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.MaxFilesPerReport).toBe(3)
  })

  it('campo inteiro com casa decimal avisa, e não chega na API', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    const quantidade = screen.getAllByLabelText(/Quantos por envio/)[0] as HTMLInputElement
    fireEvent.change(quantidade, { target: { value: '2.5' } })

    expect(quantidade.value).toBe('2.5')
    expect(screen.getByText('Use um número inteiro de 1 a 10.')).toBeDefined()
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(salvar())
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  it('número acima do teto avisa antes de salvar', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    fireEvent.change(totalPorEnvio(), { target: { value: '11' } })

    expect(screen.getByText('Use um número inteiro de 1 a 10.')).toBeDefined()
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)
  })

  it('o tamanho com uma casa decimal vai em bytes e volta igual depois de salvar', async () => {
    ecoarAoSalvar()
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    fireEvent.change(tamanhoImagem(), { target: { value: '5.5' } })
    fireEvent.click(salvar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds[0]?.MaxBytes).toBe(5.5 * UM_MB)

    // Salvo, nao ha mais mudanca: o botao volta a esperar, e o campo continua
    // dizendo o numero que foi gravado.
    await waitFor(() => expect((salvar() as HTMLButtonElement).disabled).toBe(true))
    expect(tamanhoImagem().value).toBe('5.5')
  })

  it('o tamanho com duas casas decimais avisa, em vez de arredondar na tela', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    fireEvent.change(tamanhoImagem(), { target: { value: '5.25' } })

    expect(tamanhoImagem().value).toBe('5.25')
    expect(screen.getByText('Use um número de 1 a 10, com até uma casa decimal.')).toBeDefined()
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)
  })

  // O tamanho salvo com duas casas nao e arredondado nem ao abrir nem depois de
  // salvar: mostrar 5.3 com 5,25 gravado seria a tela dizendo um limite e o
  // servidor cobrando outro.
  it('um tamanho salvo que não cabe em uma casa aparece como está, antes e depois de salvar', async () => {
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

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })
    expect(tamanhoImagem().value).toBe('5.25')

    fireEvent.change(totalPorEnvio(), { target: { value: '2' } })
    fireEvent.click(salvar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.Kinds[0]?.MaxBytes).toBe(5.25 * UM_MB)

    await waitFor(() => expect((salvar() as HTMLButtonElement).disabled).toBe(true))
    expect(tamanhoImagem().value).toBe('5.25')
  })

  it('campo inválido não prende o Salvar depois de desligar o anexo', async () => {
    ecoarAoSalvar()
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    fireEvent.change(totalPorEnvio(), { target: { value: '' } })
    fireEvent.change(tamanhoImagem(), { target: { value: '' } })
    expect(screen.getByText('Há 2 campos a corrigir.')).toBeDefined()

    fireEvent.click(anexo())

    // Fora de alcance, cada campo volta ao valor salvo, e e ele que vai.
    expect(totalPorEnvio().value).toBe('4')
    expect(totalPorEnvio().getAttribute('aria-invalid')).toBeNull()
    expect(tamanhoImagem().value).toBe('5')
    expect(screen.queryByText(/campos? a corrigir/)).toBeNull()
    expect((salvar() as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(salvar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.IsEnabled).toBe(false)
    expect(enviado.MaxFilesPerReport).toBe(4)
    expect(enviado.Kinds[0]?.MaxBytes).toBe(5 * UM_MB)
  })

  // Quem apaga o "3" e digita "12" passa pelo "1", que e valido e chega ao
  // rascunho. Voltar a ele gravaria um limite que ninguem escolheu.
  it('desligar o anexo com um campo inválido volta ao valor salvo, e não a uma tecla no caminho', async () => {
    ecoarAoSalvar()
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    const quantidade = () => screen.getAllByLabelText(/Quantos por envio/)[0] as HTMLInputElement
    fireEvent.change(quantidade(), { target: { value: '1' } })
    fireEvent.change(quantidade(), { target: { value: '12' } })
    expect(screen.getByText('Há um campo a corrigir.')).toBeDefined()

    fireEvent.click(anexo())

    expect(quantidade().value).toBe('3')
    expect(screen.queryByText(/campos? a corrigir/)).toBeNull()

    fireEvent.click(salvar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))

    const enviado = dublê.salvar.mock.calls[0]?.[1] as MediaSettingsViewModel
    expect(enviado.IsEnabled).toBe(false)
    expect(enviado.Kinds[0]?.MaxCount).toBe(3)
  })

  it('campo inválido segura o Salvar mesmo com outra mudança pendente', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    const quantidade = screen.getAllByLabelText(/Quantos por envio/)[0] as HTMLInputElement
    fireEvent.change(quantidade, { target: { value: '2' } })
    expect((salvar() as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(totalPorEnvio(), { target: { value: '' } })
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(totalPorEnvio(), { target: { value: '11' } })
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(salvar())
    expect(dublê.salvar).not.toHaveBeenCalled()
  })

  // Com passo fixo, o navegador marcaria 5.3 como fora do passo enquanto a tela o
  // aceita, e o campo ficaria com a borda de erro do proprio navegador.
  it('o MB aceita qualquer décimo sem o navegador marcar o campo', async () => {
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    fireEvent.change(tamanhoImagem(), { target: { value: '5.3' } })

    expect(tamanhoImagem().validity.stepMismatch).toBe(false)
    expect(tamanhoImagem().getAttribute('aria-invalid')).toBeNull()
  })

  it('o campo acompanha o número que o servidor devolve', async () => {
    dublê.salvar.mockResolvedValue(padrao({ MaxFilesPerReport: 3 }))
    montar()

    await screen.findByRole('checkbox', { name: /Aceitar anexo/ })

    fireEvent.change(totalPorEnvio(), { target: { value: '2' } })
    fireEvent.click(salvar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(totalPorEnvio().value).toBe('3'))
    expect((salvar() as HTMLButtonElement).disabled).toBe(true)
  })
})
