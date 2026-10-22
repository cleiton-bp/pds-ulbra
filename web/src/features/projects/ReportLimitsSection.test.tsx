// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReportLimitsViewModel, ReportLimitValues } from '@/contracts'
import {
  limitChanges,
  ReportLimitsSection,
  useReportLimits,
} from '@/features/projects/ReportLimitsSection'
import { useToastStore } from '@/shared/components/toastStore'

/**
 * O QUE ESTES TESTES TRAVAM: os limites de relato, na aba Proteção de Domínios.
 *
 * - **Fechados, mostram os numeros que valem**; "Alterar limites" abre o editor, que
 *   grava como um item de lista (Salvar e Cancelar), e nao numa barra.
 * - **O resumo** diz "Tudo no padrão" ou quais limites sairam do de fabrica, e o "Voltar ao
 *   padrão" dele abre o editor ja com os de fabrica — quem grava e o Salvar. O reset tem um
 *   nome so, no resumo e no editor, e nunca aparece duas vezes.
 * - **Le os que valem, e diz os de fabrica e os tetos** ao lado de cada campo.
 * - **Grava os seis juntos**, com o que foi mexido, e so quando ha o que salvar.
 * - **Valor invalido nao chega na API, e nao e corrigido a cada tecla**: o campo guarda o
 *   que foi escrito, diz o erro ao lado (o vazio, ao sair do campo) e trava o salvar; o
 *   limite por dia menor que o por hora trava o salvar com a razao anunciada.
 * - **Cada campo tem nome proprio**: a unidade entra no nome ("por hora", "por dia"), e a
 *   explicacao na descricao.
 * - **Enquanto grava, os campos travam**: a resposta nao atropela o que se digitaria.
 * - **Cancelar e "Voltar ao padrão"** mexem so no rascunho; quem grava e o botao.
 */
const dublê = vi.hoisted(() => ({
  ler: vi.fn<() => Promise<ReportLimitsViewModel>>(),
  salvar: vi.fn<(publicId: string, limites: ReportLimitValues) => Promise<ReportLimitsViewModel>>(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectReportLimitsService: {
      getReportLimits: dublê.ler,
      saveReportLimits: dublê.salvar,
    },
  }
})

const fabrica: ReportLimitValues = {
  PerReporter: 5,
  PerIpPerHour: 20,
  PerOriginPerHour: 200,
  PerProjectPerHour: 300,
  PerProjectPerDay: 2000,
  MinIntervalSeconds: 30,
}

const tetos: ReportLimitValues = {
  PerReporter: 50,
  PerIpPerHour: 200,
  PerOriginPerHour: 2000,
  PerProjectPerHour: 3000,
  PerProjectPerDay: 20000,
  MinIntervalSeconds: 300,
}

/** O que o projeto tem salvo: dois valores fora do de fabrica. */
const salvos: ReportLimitValues = { ...fabrica, PerReporter: 8, MinIntervalSeconds: 10 }

function resposta(valores: ReportLimitValues): ReportLimitsViewModel {
  return { Values: valores, Defaults: fabrica, Ceilings: tetos, PauseMinutes: 15 }
}

/** A tela de Domínios em miniatura: o hook mora fora da secao, como na aba Proteção. */
function Limites() {
  const limites = useReportLimits('p-1')
  return (
    <>
      <p data-testid="mudancas">{limitChanges(limites.atual).join(', ')}</p>
      <ReportLimitsSection limits={limites} />
    </>
  )
}

function montar() {
  const router = createMemoryRouter([{ path: '/', element: <Limites /> }], {
    initialEntries: ['/'],
  })
  render(<RouterProvider router={router} />)
}

async function abrirEditor() {
  fireEvent.click(await screen.findByRole('button', { name: 'Alterar limites' }))
  return screen.findAllByRole('spinbutton')
}

const numero = (nome: string) => screen.getByRole('spinbutton', { name: nome }) as HTMLInputElement
const porPessoa = () => numero('Por pessoa a cada 10 min')
const porHora = () => numero('Do projeto inteiro por hora')
const porDia = () => numero('Do projeto inteiro por dia')
const intervalo = () => numero('Intervalo mínimo segundos')
const digitar = (campo: HTMLInputElement, valor: string) =>
  fireEvent.change(campo, { target: { value: valor } })
const salvar = () => screen.getByRole('button', { name: 'Salvar limites' }) as HTMLButtonElement
const avisos = () => useToastStore.getState().toasts

describe('ReportLimitsSection', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.ler.mockReset()
    dublê.salvar.mockReset()
    dublê.ler.mockResolvedValue(resposta(salvos))
    useToastStore.setState({ toasts: [] })
  })

  it('carrega os limites do projeto e mostra os que valem, com o de fábrica e o teto', async () => {
    montar()

    // Fechado, os numeros que valem — sem campo nenhum.
    expect(await screen.findByRole('button', { name: 'Alterar limites' })).toBeTruthy()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(document.getElementById('limite-por-pessoa')?.textContent).toContain('8')

    expect((await abrirEditor()).length).toBe(6)
    expect(dublê.ler).toHaveBeenCalledWith('p-1')

    expect(porPessoa().value).toBe('8')
    expect(numero('Por conexão (IP) por hora').value).toBe('20')
    expect(numero('Por domínio por hora').value).toBe('200')
    expect(porHora().value).toBe('300')
    expect(porDia().value).toBe('2000')
    expect(intervalo().value).toBe('10')

    expect(screen.getByText(/De fábrica: 5; até 50\./)).toBeTruthy()
    expect(screen.getByText(/De fábrica: 30; até 300\./)).toBeTruthy()
    expect(porPessoa().max).toBe('50')
    expect(porPessoa().min).toBe('1')
    // Zero desliga o intervalo: e o unico campo que aceita zero.
    expect(intervalo().min).toBe('0')
    expect(screen.getByText(/pausa os envios por 15 minutos/)).toBeTruthy()
    // A explicacao e a descricao do campo.
    const descricao = (porDia().getAttribute('aria-describedby') ?? '').split(' ')
    expect(
      descricao.some((id) =>
        document
          .getElementById(id)
          ?.textContent?.includes('Não pode ser menor que o limite por hora'),
      ),
    ).toBe(true)
  })

  it('sem mudança, o salvar fica parado', async () => {
    montar()
    await abrirEditor()

    expect(salvar().disabled).toBe(true)
  })

  it('salvar manda os seis valores, com o que foi mexido, e volta a ficar parado', async () => {
    const gravado = { ...salvos, PerReporter: 12, MinIntervalSeconds: 0 }
    dublê.salvar.mockResolvedValue(resposta(gravado))
    montar()
    await abrirEditor()

    digitar(porPessoa(), '12')
    digitar(intervalo(), '0')
    expect(salvar().disabled).toBe(false)
    fireEvent.click(salvar())

    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledWith('p-1', gravado))
    // Gravou: o editor fecha, e o que se ve e o que esta salvo.
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(0))
    expect(document.getElementById('limite-por-pessoa')?.textContent).toContain('12')
    expect(document.getElementById('intervalo-minimo')?.textContent).toContain('0')
    expect(avisos().map((aviso) => aviso.message)).toContain(
      'Limites salvos. Valem a partir do próximo relato.',
    )
  })

  describe('valores inválidos', () => {
    it('acima do teto fica como foi escrito, com o erro ao lado, e o salvar trava', async () => {
      montar()
      await abrirEditor()

      digitar(porPessoa(), '999')
      expect(porPessoa().value).toBe('999')
      expect(porPessoa().getAttribute('aria-invalid')).toBe('true')
      const erro = screen.getByText('Use um número inteiro de 1 a 50.')
      expect(porPessoa().getAttribute('aria-describedby')).toContain(erro.id)
      expect(salvar().disabled).toBe(true)

      digitar(porPessoa(), '50')
      expect(screen.queryByText('Use um número inteiro de 1 a 50.')).toBeNull()
      expect(salvar().disabled).toBe(false)
    })

    it('apagar para digitar outro nao vira o minimo: o vazio so e erro ao sair do campo', async () => {
      montar()
      await abrirEditor()

      digitar(porPessoa(), '')
      expect(porPessoa().value).toBe('')
      expect(screen.queryByText('Escreva um número.')).toBeNull()
      expect(salvar().disabled).toBe(true)

      fireEvent.blur(porPessoa())
      expect(screen.getByText('Escreva um número.')).toBeTruthy()

      // Zero e o minimo do intervalo, e um abaixo do minimo dos limites.
      digitar(intervalo(), '0')
      expect(intervalo().getAttribute('aria-invalid')).toBeNull()
      digitar(numero('Por domínio por hora'), '0')
      expect(screen.getByText('Use um número inteiro de 1 a 2000.')).toBeTruthy()
    })

    it('o limite por dia menor que o por hora trava o salvar e anuncia por que', async () => {
      montar()
      await abrirEditor()

      digitar(porDia(), '100')

      const aviso = screen.getByRole('alert')
      expect(aviso.textContent).toBe('O limite por dia precisa ser pelo menos o limite por hora.')
      expect(porDia().getAttribute('aria-invalid')).toBe('true')
      expect(porDia().getAttribute('aria-describedby')).toContain(aviso.id)
      expect(salvar().disabled).toBe(true)
      fireEvent.click(salvar())
      expect(dublê.salvar).not.toHaveBeenCalled()

      // Igual ao por hora ja vale.
      digitar(porDia(), '300')
      expect(screen.queryByText(/precisa ser pelo menos o limite por hora/)).toBeNull()
      expect(salvar().disabled).toBe(false)
    })
  })

  it('enquanto grava, os campos ficam travados', async () => {
    let gravar: (limites: ReportLimitsViewModel) => void = () => {}
    dublê.salvar.mockReturnValue(
      new Promise((resolve) => {
        gravar = resolve
      }),
    )
    montar()
    await abrirEditor()

    digitar(porPessoa(), '12')
    fireEvent.click(salvar())

    await waitFor(() => expect(porPessoa().disabled).toBe(true))
    expect(intervalo().disabled).toBe(true)

    gravar(resposta({ ...salvos, PerReporter: 12 }))
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(0))
    expect(document.getElementById('limite-por-pessoa')?.textContent).toContain('12')
  })

  it('cancelar fecha o editor sem gravar, e abrir de novo mostra o que está salvo', async () => {
    montar()
    await abrirEditor()

    digitar(porPessoa(), '30')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    expect(dublê.salvar).not.toHaveBeenCalled()

    await abrirEditor()
    expect(porPessoa().value).toBe('8')
  })

  it('o resumo diz o que saiu do de fábrica, e "Voltar ao padrão" abre o editor com eles', async () => {
    dublê.salvar.mockResolvedValue(resposta(fabrica))
    montar()
    await screen.findByRole('button', { name: 'Alterar limites' })

    expect(screen.getByTestId('mudancas').textContent).toBe(
      'Por pessoa a cada 10 min, Intervalo mínimo segundos',
    )
    expect(
      screen.getByText('2 mudanças: Por pessoa a cada 10 min, Intervalo mínimo segundos'),
    ).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao padrão' }))
    expect(porPessoa().value).toBe('5')
    expect(intervalo().value).toBe('30')
    expect(dublê.salvar).not.toHaveBeenCalled()
    // Ja no padrao, o rascunho nao oferece voltar a ele: nenhum "Voltar ao padrão" na tela.
    expect(screen.queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()

    fireEvent.click(salvar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledWith('p-1', fabrica))
    await waitFor(() => expect(screen.getByTestId('mudancas').textContent).toBe(''))
    expect(screen.getByText('Tudo no padrão')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()
  })

  it('no editor, "Voltar ao padrão" preenche o rascunho, aparece uma vez só, e é o salvar que grava', async () => {
    dublê.salvar.mockResolvedValue(resposta(fabrica))
    montar()
    await abrirEditor()

    // O do resumo sai com o editor aberto: um botao so, com o mesmo nome.
    expect(screen.getAllByRole('button', { name: 'Voltar ao padrão' })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Voltar aos de fábrica' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao padrão' }))
    expect(porPessoa().value).toBe('5')
    expect(intervalo().value).toBe('30')
    expect(dublê.salvar).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()

    fireEvent.click(salvar())
    await waitFor(() => expect(dublê.salvar).toHaveBeenCalledWith('p-1', fabrica))
  })

  it('a recusa ao salvar vira aviso, e o que foi digitado fica', async () => {
    dublê.salvar.mockRejectedValue(new Error('falhou'))
    montar()
    await abrirEditor()

    digitar(porPessoa(), '9')
    fireEvent.click(salvar())

    await waitFor(() =>
      expect(
        avisos().some(
          (aviso) =>
            aviso.tone === 'danger' &&
            aviso.message === 'Não deu para salvar os limites agora. Tente de novo.',
        ),
      ).toBe(true),
    )
    expect(porPessoa().value).toBe('9')
    expect(salvar().disabled).toBe(false)
  })

  it('falhar ao carregar diz que nada mudou, e tentar de novo carrega', async () => {
    dublê.ler.mockRejectedValueOnce(new Error('fora do ar'))
    montar()

    expect(await screen.findByText(/Não deu para carregar os limites agora/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Alterar limites' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect((await abrirEditor()).length).toBe(6)
    expect(dublê.ler).toHaveBeenCalledTimes(2)
  })
})
