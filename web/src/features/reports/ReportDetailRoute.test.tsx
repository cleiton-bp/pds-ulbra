// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import {
  Link,
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportSummaryViewModel } from '@/contracts'
import { ReportDetailRoute, type ReportListContext } from '@/features/reports/ReportDetailRoute'
import type { ReportDialog } from '@/features/reports/ReportDialog'

/**
 * O QUE ESTES TESTES TRAVAM: a rota do card aberto, entre a tela de Trabalho e o card.
 *
 * - **Anterior e proximo seguem a tela de onde se veio**: a ordem que ela passa (a lista
 *   com os filtros, ou o quadro coluna por coluna) e, sem ela, a dos cards carregados.
 *   Nas pontas, nao ha para onde ir.
 * - **Andar troca o endereco no lugar**: o voltar do navegador leva a lista, e nao a
 *   cada card visto no caminho.
 * - **Fechar volta no historico quando se veio da lista** — inclusive os cards abertos
 *   dentro do card (o pai, a subtarefa, o vinculado), todos de uma vez, com o voltar e o
 *   avancar do navegador no meio. Assim o voltar do navegador depois de fechar sai da
 *   tela de Trabalho, em vez de nao mudar nada. O link aberto direto troca o endereco
 *   pelo da lista.
 * - **O contexto da tela chega ao card**: o resumo da lista, quem configura e a regra do
 *   prazo perto.
 *
 * O card em si fica de fora (no lugar dele, uma caixa que mostra o que recebeu): o que
 * esta aqui e a rota.
 */
vi.mock('@/features/reports/ReportDialog', () => ({
  ReportDialog: (props: ComponentProps<typeof ReportDialog>) => (
    <section aria-label={`Card ${props.reportPublicId}`}>
      <p>Anterior: {props.anterior ?? 'nenhum'}</p>
      <p>Próximo: {props.proximo ?? 'nenhum'}</p>
      <p>Resumo: {props.resumo?.PublicId ?? 'nenhum'}</p>
      <p>Configura: {props.podeConfigurar ? 'sim' : 'não'}</p>
      <p>Perto: {props.soonDays ?? 'de fábrica'}</p>
      <button type="button" onClick={() => props.anterior && props.aoIrPara?.(props.anterior)}>
        Card anterior
      </button>
      <button type="button" onClick={() => props.proximo && props.aoIrPara?.(props.proximo)}>
        Próximo card
      </button>
      {/* O link de dentro do card: o pai, a subtarefa, o vinculado. */}
      <Link to="../r-9">#9 Subtarefa</Link>
      <button type="button" onClick={props.aoFechar}>
        Fechar
      </button>
    </section>
  ),
}))

function resumo(PublicId: string): ReportSummaryViewModel {
  return { PublicId } as ReportSummaryViewModel
}

/** O endereco de agora, e o voltar e o avancar do navegador. */
function Navegador() {
  const navigate = useNavigate()
  return (
    <>
      <output aria-label="Endereço">{useLocation().pathname}</output>
      <button type="button" onClick={() => navigate(-1)}>
        Voltar do navegador
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Avançar do navegador
      </button>
    </>
  )
}

/** A tela de Trabalho: a lista atras, e o card aberto na rota filha. */
function Trabalho({ contexto }: { contexto: Partial<ReportListContext> }) {
  return (
    <>
      <Link to="r-1">#1 na lista</Link>
      <Outlet
        context={{
          projectPublicId: 'p-1',
          reports: [resumo('r-1'), resumo('r-2'), resumo('r-3')],
          colunas: null,
          aoMudar: vi.fn(),
          ...contexto,
        }}
      />
    </>
  )
}

function montar(
  entradas: string[],
  contexto: Partial<ReportListContext> = {},
  indice = entradas.length - 1,
) {
  render(
    <MemoryRouter initialEntries={entradas} initialIndex={indice}>
      <Routes>
        <Route path="/inicio" element={<p>Início</p>} />
        <Route path="/p/:publicId/reports" element={<Trabalho contexto={contexto} />}>
          <Route path=":reportPublicId" element={<ReportDetailRoute />} />
        </Route>
      </Routes>
      <Navegador />
    </MemoryRouter>,
  )
}

const endereco = () => screen.getByRole('status', { name: 'Endereço' }).textContent
const clicar = (nome: string) => fireEvent.click(screen.getByRole('button', { name: nome }))

afterEach(cleanup)

describe('anterior e proximo', () => {
  it('seguem a ordem que a tela passa — o quadro, coluna por coluna — e param nas pontas', () => {
    montar(['/p/p-1/reports/r-1'], { ordem: ['r-3', 'r-1', 'r-2'] })
    expect(screen.getByText('Anterior: r-3')).toBeTruthy()
    expect(screen.getByText('Próximo: r-2')).toBeTruthy()

    clicar('Card anterior')
    expect(endereco()).toBe('/p/p-1/reports/r-3')
    expect(screen.getByText('Anterior: nenhum')).toBeTruthy()
    expect(screen.getByText('Próximo: r-1')).toBeTruthy()
  })

  it('sem a ordem da tela, vale a dos cards carregados; o card que nao esta nela nao tem vizinhos', () => {
    montar(['/p/p-1/reports/r-2'])
    expect(screen.getByText('Anterior: r-1')).toBeTruthy()
    expect(screen.getByText('Próximo: r-3')).toBeTruthy()
    cleanup()

    // Aberto por link direto, fora do que a lista carregou.
    montar(['/p/p-1/reports/r-7'])
    expect(screen.getByText('Anterior: nenhum')).toBeTruthy()
    expect(screen.getByText('Próximo: nenhum')).toBeTruthy()
    expect(screen.getByText('Resumo: nenhum')).toBeTruthy()
  })

  it('o contexto da tela chega ao card: o resumo, quem configura e a regra do prazo', () => {
    montar(['/p/p-1/reports/r-2'], { podeConfigurar: true, soonDays: 5 })
    expect(screen.getByText('Resumo: r-2')).toBeTruthy()
    expect(screen.getByText('Configura: sim')).toBeTruthy()
    expect(screen.getByText('Perto: 5')).toBeTruthy()
  })
})

describe('fechar o card', () => {
  it('vindo da lista, andar troca o endereco no lugar, e fechar volta: o voltar seguinte sai da tela de Trabalho', async () => {
    montar(['/inicio', '/p/p-1/reports'])
    fireEvent.click(screen.getByRole('link', { name: '#1 na lista' }))
    expect(endereco()).toBe('/p/p-1/reports/r-1')

    clicar('Próximo card')
    clicar('Próximo card')
    expect(endereco()).toBe('/p/p-1/reports/r-3')

    clicar('Fechar')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports'))
    expect(screen.queryByRole('region', { name: /^Card / })).toBeNull()

    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/inicio'))
  })

  it('depois de andar de card em card, o voltar do navegador leva a lista, e nao ao card anterior', async () => {
    montar(['/inicio', '/p/p-1/reports'])
    fireEvent.click(screen.getByRole('link', { name: '#1 na lista' }))
    clicar('Próximo card')
    clicar('Próximo card')
    expect(endereco()).toBe('/p/p-1/reports/r-3')

    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports'))
  })

  it('o card aberto dentro do card entra no historico, e fechar volta todos de uma vez', async () => {
    montar(['/inicio', '/p/p-1/reports'])
    fireEvent.click(screen.getByRole('link', { name: '#1 na lista' }))
    fireEvent.click(screen.getByRole('link', { name: '#9 Subtarefa' }))
    expect(endereco()).toBe('/p/p-1/reports/r-9')

    clicar('Fechar')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports'))
    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/inicio'))
  })

  it('o voltar do navegador dentro do card desconta o passo — tambem depois de andar com o proximo', async () => {
    montar(['/inicio', '/p/p-1/reports'])
    fireEvent.click(screen.getByRole('link', { name: '#1 na lista' }))
    clicar('Próximo card')
    fireEvent.click(screen.getByRole('link', { name: '#9 Subtarefa' }))
    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports/r-2'))

    clicar('Fechar')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports'))
    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/inicio'))
  })

  it('voltar e avancar no navegador dentro do card: fechar ainda volta a lista', async () => {
    montar(['/inicio', '/p/p-1/reports'])
    fireEvent.click(screen.getByRole('link', { name: '#1 na lista' }))
    // O proximo card troca o endereco no lugar; a subtarefa entra no historico.
    clicar('Próximo card')
    fireEvent.click(screen.getByRole('link', { name: '#9 Subtarefa' }))
    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports/r-2'))
    clicar('Avançar do navegador')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports/r-9'))

    clicar('Fechar')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports'))
    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/inicio'))
  })

  it('abrir outro card depois de voltar descarta o caminho da frente, como o navegador', async () => {
    montar(['/inicio', '/p/p-1/reports'])
    fireEvent.click(screen.getByRole('link', { name: '#1 na lista' }))
    fireEvent.click(screen.getByRole('link', { name: '#9 Subtarefa' }))
    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports/r-1'))
    // Abrir de novo e outra entrada: a da frente, de antes, deixou de existir.
    fireEvent.click(screen.getByRole('link', { name: '#9 Subtarefa' }))
    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports/r-1'))
    clicar('Avançar do navegador')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports/r-9'))

    clicar('Fechar')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports'))
  })

  it('o link aberto direto fecha trocando o endereco pelo da lista', async () => {
    montar(['/inicio', '/p/p-1/reports/r-2'])
    clicar('Fechar')
    await waitFor(() => expect(endereco()).toBe('/p/p-1/reports'))
    // O card saiu do historico: o voltar leva a onde se estava antes do link.
    clicar('Voltar do navegador')
    await waitFor(() => expect(endereco()).toBe('/inicio'))
  })
})
