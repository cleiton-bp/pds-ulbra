// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  PublicClosureViewModel,
  PublicReportViewModel,
  PublicStageViewModel,
} from '@/contracts'
import { TrackingPage } from '@/tracking/TrackingPage'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **Recusado e falhou nao podem virar a mesma tela.** 404 e resposta definitiva —
 * este link nao abre nada, e oferecer "tentar de novo" manda a pessoa repetir o
 * que nunca vai mudar. Rede fora e o oposto: o relato dela esta registrado, e
 * tentar de novo e o que resolve. Tratar os dois igual passa em qualquer teste de
 * caminho feliz, e so aparece para quem estiver com problema.
 *
 * **Link pela metade nao vai a rede.** A resposta seria a mesma recusa, e a
 * asserticao aqui e sobre o servico **nao** ter sido chamado.
 *
 * **Projeto sem jornada continua nao prometendo andamento.** A jornada vazia e um
 * caso real — o cliente que nunca configurou —, e ali a frase volta a ser "nao ha
 * andamento" em vez de uma promessa de movimento que nao vai acontecer.
 *
 * **O que ja passou vem das datas, e nao da posicao.** Este e o erro facil de
 * cometer e impossivel de ver: pintar como percorrido tudo que esta antes do passo
 * atual parece certo e mente sempre que o relato pula uma etapa — o que acontece
 * quando o estado interno dele aponta direto para o meio da jornada.
 */

const dublê = vi.hoisted(() => ({
  abrir: vi.fn(),
  confirmar: vi.fn(),
  reabrir: vi.fn(),
  responder: vi.fn(),
  abrirPorCodigo: vi.fn(),
  anexos: vi.fn(),
  midia: vi.fn(),
}))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()

  return {
    ...real,
    reportService: {
      openReportTracking: dublê.abrir,
      confirmReport: dublê.confirmar,
      reopenReport: dublê.reabrir,
      replyToReport: dublê.responder,
      openByReporterCode: dublê.abrirPorCodigo,
    },
    // Sem isto a pagina buscaria os anexos de verdade, pela rede, em todo teste.
    publicMediaService: {
      listTrackingAttachments: dublê.anexos,
      loadTrackingMediaSettings: dublê.midia,
    },
  }
})

const relato: PublicReportViewModel = {
  TrackingCode: '7K2M-9QXP-4TRV',
  Type: 'Bug',
  Text: 'O botão de finalizar compra não responde.\nTentei duas vezes.',
  CreatedAt: '2026-09-12T13:24:00.000Z',
  // Sem jornada: e o projeto que nao configurou nenhuma, e continua sendo o caso
  // em que a pagina nao pode prometer movimento.
  Journey: [],
  // Aberto. O relato encerrado e o caso proprio, e tem teste proprio.
  Closure: null,
  // Sem conversa e sem pergunta aberta: a bola esta com a equipe.
  Conversation: [],
  InfoRequest: null,
  CanReply: false,
}

function passo(
  label: string,
  reachedAt: string | null,
  isCurrent = false,
  nextStep: string | null = null,
): PublicStageViewModel {
  return {
    Label: label,
    Description: `O que acontece em ${label}.`,
    NextStep: nextStep,
    ReachedAt: reachedAt,
    IsCurrent: isCurrent,
  }
}

/**
 * Um encerramento, com as acoes que a API calcula.
 *
 * **`Actions` nao e a configuracao do projeto**, e por isso o padrao daqui e
 * "pode tudo": e o que a API responde para um relato encerrado, num projeto que
 * permite reabrir, com a nota ligada. Cada teste sobrescreve o que for o assunto
 * dele.
 */
function fechamento(extra: Partial<PublicClosureViewModel> = {}): PublicClosureViewModel {
  return {
    Outcome: 'Done',
    Reason: 'Corrigido na versão desta semana.',
    ClosedAt: '2026-09-20T10:00:00.000Z',
    ConfirmedAt: null,
    Satisfaction: null,
    SatisfactionDeclined: false,
    Actions: {
      CanConfirm: true,
      CanReopen: true,
      AsksSatisfaction: true,
      SatisfactionStyle: 'Stars',
      SatisfactionRequired: false,
      ReopenRequiresComment: true,
    },
    ...extra,
  }
}

function abrirEm(endereco: string): void {
  window.history.replaceState({}, '', endereco)
}

afterEach(cleanup)

beforeEach(() => {
  for (const mock of Object.values(dublê)) mock.mockReset()
  dublê.anexos.mockResolvedValue([])
  // Padrao: o projeto nao aceita anexo na resposta. Os testes que precisam ligam.
  dublê.midia.mockResolvedValue({
    IsEnabled: false,
    AllowsScreenCapture: false,
    AllowsOnInfoRequest: false,
    MaxFilesPerReport: 0,
    Kinds: [],
  })
})

describe('a pagina publica de acompanhamento', () => {
  it('mostra o protocolo, o tipo e o texto de quem relatou', async () => {
    dublê.abrir.mockResolvedValue(relato)
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByText('7K2M-9QXP-4TRV')).toBeTruthy()
    expect(screen.getByText('Defeito')).toBeTruthy()
    expect(screen.getByText(/O botão de finalizar compra não responde/)).toBeTruthy()
    expect(dublê.abrir).toHaveBeenCalledWith({
      TrackingCode: '7K2M-9QXP-4TRV',
      Token: 'tok-secreto',
    })
  })

  it('sem jornada configurada, nao promete andamento', async () => {
    dublê.abrir.mockResolvedValue(relato)
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    const { container } = render(<TrackingPage />)
    await screen.findByText('7K2M-9QXP-4TRV')

    const texto = container.textContent ?? ''

    expect(texto).toMatch(/Ainda não há andamento/)
    // Nada de prometer movimento para um projeto que nao configurou jornada.
    expect(texto).not.toMatch(/se atualiza sozinha|será avisado|avisaremos/i)
  })

  it('desenha a jornada e marca onde o relato está', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [
        passo('Recebido', '2026-09-12T13:24:00.000Z'),
        passo('Em análise', '2026-09-13T09:00:00.000Z', true, 'A equipe decide o que fazer.'),
        passo('Concluído', null),
      ],
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByText('Em análise')).toBeTruthy()
    expect(screen.getByLabelText('Passo atual')).toBeTruthy()
    expect(screen.getAllByLabelText('Já passou por aqui')).toHaveLength(1)
    expect(screen.getAllByLabelText('Ainda não chegou aqui')).toHaveLength(1)
  })

  it('com jornada, também não promete que a página anda sozinha', async () => {
    // O caso vazio ja era coberto. **Este é o que estava faltando**, e era nele que
    // a promessa morava: com jornada, a página dizia "esta página se atualiza
    // sozinha conforme a equipe trabalha", e não se atualiza — há um `fetch` só, na
    // montagem. Quem deixasse a aba aberta esperaria para sempre.
    //
    // Buscar de novo sozinho não é a saída: cada leitura grava um evento de
    // visualização, e a página passaria a registrar leituras que ninguém fez.
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [passo('Recebido', '2026-09-12T13:24:00.000Z', true), passo('Concluído', null)],
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    const { container } = render(<TrackingPage />)
    await screen.findByText('Recebido')

    expect(container.textContent ?? '').not.toMatch(/se atualiza sozinha|será avisado|avisaremos/i)
  })

  it('passo pulado não conta como percorrido, mesmo vindo antes do atual', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [
        passo('Recebido', '2026-09-12T13:24:00.000Z'),
        // Pulado: o estado interno apontava direto para o passo seguinte.
        passo('Em análise', null),
        passo('Em desenvolvimento', '2026-09-13T09:00:00.000Z', true),
        passo('Concluído', null),
      ],
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)
    await screen.findByText('Em desenvolvimento')

    // Um percorrido só — o "Recebido". Contar pela posição diria dois.
    expect(screen.getAllByLabelText('Já passou por aqui')).toHaveLength(1)
    expect(screen.getAllByLabelText('Ainda não chegou aqui')).toHaveLength(2)
  })

  it('o que vem depois aparece só no passo atual', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [
        passo('Recebido', '2026-09-12T13:24:00.000Z', false, 'Alguém vai analisar em breve.'),
        passo('Em análise', '2026-09-13T09:00:00.000Z', true, 'A equipe decide o que fazer.'),
      ],
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByText('A equipe decide o que fazer.')).toBeTruthy()
    // No passo que já passou, o "depois" já aconteceu: repeti-lo é ruído.
    expect(screen.queryByText('Alguém vai analisar em breve.')).toBeNull()
  })

  it('o relato encerrado mostra o desfecho e, maior que ele, o motivo', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [
        passo('Recebido', '2026-09-12T13:24:00.000Z'),
        passo('Concluído', '2026-09-20T10:00:00.000Z', true),
      ],
      Closure: fechamento({
        Outcome: 'WontDo',
        Reason: 'O comportamento é o esperado: o botão só libera depois do frete.',
      }),
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    // **O motivo e o que responde a pergunta de quem abriu a pagina.** O desfecho
    // sozinho e a recusa sem explicacao que este produto existe para nao repetir,
    // entao ele e etiqueta e o texto e corpo.
    expect(await screen.findByText(/O comportamento é o esperado/)).toBeTruthy()
    expect(screen.getByText('Não será feito')).toBeTruthy()
    expect(screen.getByText('Como terminou')).toBeTruthy()
  })

  it('o relato aberto não mostra encerramento nenhum', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [passo('Recebido', '2026-09-12T13:24:00.000Z', true), passo('Concluído', null)],
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    const { container } = render(<TrackingPage />)
    await screen.findByText('Recebido')

    // Estar na etapa terminal **nao** e estar encerrado, e e essa diferenca que a
    // etapa existe para mostrar: o bloco so aparece quando ha fechamento.
    expect(container.textContent ?? '').not.toMatch(/Como terminou/)
  })

  it('com o link pela metade, recusa sem ir a rede', async () => {
    // Sem o fragmento: o endereco copiado sem o fim, que e o caso comum.
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV')

    render(<TrackingPage />)

    expect(await screen.findByText(/Este link não abre nenhum relato/)).toBeTruthy()
    expect(dublê.abrir).not.toHaveBeenCalled()
  })

  it('404 nao oferece tentar de novo: repetir nao muda a resposta', async () => {
    const { PanelError } = await import('@/data/publicIndex')
    dublê.abrir.mockRejectedValue(new PanelError('Este link nao abre nenhum relato.', 404))
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-errado')

    render(<TrackingPage />)

    expect(await screen.findByText(/Este link não abre nenhum relato/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })

  it('falha de rede oferece tentar de novo, e diz que o relato segue registrado', async () => {
    const { PanelError } = await import('@/data/publicIndex')
    dublê.abrir.mockRejectedValue(new PanelError('Falha de rede ao abrir o relato.', 0))
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(screen.getByText(/continua registrado/)).toBeTruthy()
  })

  it('tentar de novo chama a rota outra vez', async () => {
    const { PanelError } = await import('@/data/publicIndex')
    dublê.abrir.mockRejectedValueOnce(new PanelError('Falha de rede.', 0))
    dublê.abrir.mockResolvedValueOnce(relato)
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)
    const botao = await screen.findByRole('button', { name: 'Tentar de novo' })
    botao.click()

    await waitFor(() => expect(screen.getByText('7K2M-9QXP-4TRV')).toBeTruthy())
    expect(dublê.abrir).toHaveBeenCalledTimes(2)
  })
})

/**
 * A VEZ DE QUEM RELATOU.
 *
 * **E o bloco que fecha a metafora**, e o que mais tem como apodrecer em silencio:
 * a nota tem **tres** estados — respondeu, recusou, nao respondeu — e todo atalho
 * natural junta dois deles. Recusa como nota zero, recusa como ausencia, ausencia
 * como recusa: qualquer um passa em teste de caminho feliz e produz um relatorio
 * que parece preciso e nao e.
 *
 * **O que a tela pode vem da API**, em `Actions`, ja cruzado com o estado do
 * relato. Nenhum teste aqui deduz "pode reabrir" da configuracao — eles dizem o
 * que a API responde, que e exatamente o contrato.
 */
describe('a resposta de quem relatou', () => {
  function encerrado(extra: Partial<PublicClosureViewModel> = {}) {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Journey: [
        passo('Recebido', '2026-09-12T13:24:00.000Z'),
        passo('Concluído', '2026-09-20T10:00:00.000Z', true),
      ],
      Closure: fechamento(extra),
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')
  }

  it('pergunta antes de oferecer as duas saídas', async () => {
    encerrado()
    render(<TrackingPage />)

    // A pergunta diz o que está sendo decidido; dois botões soltos fariam a pessoa
    // escolher entre dois rótulos.
    expect(await screen.findByText('E para você, isso resolveu?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sim, resolveu' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Não, ainda não' })).toBeTruthy()
  })

  it('sem nota a pedir, confirmar é um clique só', async () => {
    encerrado({ Actions: { ...fechamento().Actions, AsksSatisfaction: false } })
    dublê.confirmar.mockResolvedValue({ ...relato, Closure: null })
    render(<TrackingPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sim, resolveu' }))

    await waitFor(() =>
      expect(dublê.confirmar).toHaveBeenCalledWith({
        TrackingCode: '7K2M-9QXP-4TRV',
        Token: 'tok-secreto',
        Satisfaction: null,
        SatisfactionDeclined: false,
      }),
    )
  })

  it('com nota a pedir, a escala aparece e o número escolhido viaja', async () => {
    encerrado()
    dublê.confirmar.mockResolvedValue({ ...relato, Closure: null })
    render(<TrackingPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sim, resolveu' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Nota 4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() =>
      expect(dublê.confirmar).toHaveBeenCalledWith(
        expect.objectContaining({ Satisfaction: 4, SatisfactionDeclined: false }),
      ),
    )
  })

  it('recusar apaga a nota escolhida, e não vira nota zero', async () => {
    encerrado()
    dublê.confirmar.mockResolvedValue({ ...relato, Closure: null })
    render(<TrackingPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sim, resolveu' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Nota 2' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Prefiro não responder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    // **O ponto do teste.** Mandar os dois juntos a API recusa — e a recusa
    // chegaria depois de a pessoa já ter respondido. E `Satisfaction: 0` seria pior
    // ainda: viraria a pior avaliação do relatório.
    await waitFor(() =>
      expect(dublê.confirmar).toHaveBeenCalledWith(
        expect.objectContaining({ Satisfaction: null, SatisfactionDeclined: true }),
      ),
    )
  })

  it('e escolher a nota depois de recusar desmarca a recusa', async () => {
    // **O caminho inverso, que é o que se esquece de testar.** A pessoa marca
    // "prefiro não responder", muda de ideia e clica numa estrela: sem limpar a
    // recusa, a tela manda os dois e a API recusa — depois de ela já ter
    // respondido duas vezes.
    encerrado()
    dublê.confirmar.mockResolvedValue({ ...relato, Closure: null })
    render(<TrackingPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sim, resolveu' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Prefiro não responder' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Nota 5' }))

    // A caixa desmarca **na tela**, e não só no corpo da requisição: a pessoa
    // precisa ver que a escolha dela substituiu a recusa.
    expect(
      (screen.getByRole('checkbox', { name: 'Prefiro não responder' }) as HTMLInputElement).checked,
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() =>
      expect(dublê.confirmar).toHaveBeenCalledWith(
        expect.objectContaining({ Satisfaction: 5, SatisfactionDeclined: false }),
      ),
    )
  })

  it('nota obrigatória trava o envio, e “prefiro não responder” destrava', async () => {
    encerrado({ Actions: { ...fechamento().Actions, SatisfactionRequired: true } })
    render(<TrackingPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sim, resolveu' }))
    expect(screen.getByRole('button', { name: 'Enviar' }).hasAttribute('disabled')).toBe(true)

    // A saída existe mesmo sendo obrigatória: sem ela, obrigar vira clique sem
    // pensar e a média passa a medir o clique.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Prefiro não responder' }))
    expect(screen.getByRole('button', { name: 'Enviar' }).hasAttribute('disabled')).toBe(false)
  })

  it('reabrir sem contar o que houve não age, quando o projeto pede', async () => {
    encerrado()
    render(<TrackingPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Não, ainda não' }))

    const reabrir = screen.getByRole('button', { name: 'Reabrir o relato' })
    expect(reabrir.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: '  ' },
    })
    // Só espaço continua sendo nada escrito.
    expect(screen.getByRole('button', { name: 'Reabrir o relato' }).hasAttribute('disabled')).toBe(
      true,
    )
  })

  it('com o texto, reabrir manda o motivo e a tela passa a mostrar o que voltou', async () => {
    encerrado()
    dublê.reabrir.mockResolvedValue({
      ...relato,
      Journey: [passo('Recebido', '2026-09-12T13:24:00.000Z', true), passo('Concluído', null)],
      // Reaberto: o fechamento antigo continua guardado, mas não é mais o fim de nada.
      Closure: null,
    })
    render(<TrackingPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Não, ainda não' }))
    fireEvent.change(screen.getByRole('textbox', { name: /O que ainda está acontecendo/ }), {
      target: { value: 'Voltou a travar depois da atualização.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir o relato' }))

    await waitFor(() =>
      expect(dublê.reabrir).toHaveBeenCalledWith({
        TrackingCode: '7K2M-9QXP-4TRV',
        Token: 'tok-secreto',
        Comment: 'Voltou a travar depois da atualização.',
      }),
    )

    // **A tela mostra o que ficou gravado**, e não o que ela mandou: a resposta da
    // API vira o relato, e o bloco do encerramento some porque não há mais fim.
    await waitFor(() => expect(screen.queryByText('Como terminou')).toBeNull())
  })

  it('projeto que não deixa reabrir não oferece a saída', async () => {
    encerrado({ Actions: { ...fechamento().Actions, CanReopen: false } })
    render(<TrackingPage />)

    expect(await screen.findByRole('button', { name: 'Sim, resolveu' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Não, ainda não' })).toBeNull()
  })

  it('quem já respondeu vê o que respondeu, e não os botões de novo', async () => {
    encerrado({
      ConfirmedAt: '2026-09-21T09:00:00.000Z',
      Satisfaction: 5,
      Actions: { ...fechamento().Actions, CanConfirm: false, CanReopen: false },
    })
    render(<TrackingPage />)

    expect(await screen.findByText(/Você confirmou que isso resolveu/)).toBeTruthy()
    expect(screen.getByText(/Sua nota: 5 de 5/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sim, resolveu' })).toBeNull()
  })

  it('quem recusou a nota aparece diferente de quem não respondeu', async () => {
    encerrado({
      ConfirmedAt: '2026-09-21T09:00:00.000Z',
      SatisfactionDeclined: true,
      Actions: { ...fechamento().Actions, CanConfirm: false, CanReopen: false },
    })
    render(<TrackingPage />)

    // Os três estados precisam ser distinguíveis na tela, senão ninguém repara que
    // eles também precisam ser distinguíveis na contagem.
    expect(await screen.findByText(/Você preferiu não dar uma nota/)).toBeTruthy()
  })

  it('falha ao responder não derruba o relato da tela', async () => {
    const { PanelError } = await import('@/data/publicIndex')
    encerrado({ Actions: { ...fechamento().Actions, AsksSatisfaction: false } })
    dublê.confirmar.mockRejectedValue(new PanelError('Falha de rede ao enviar a sua resposta.', 0))
    render(<TrackingPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Sim, resolveu' }))

    expect(await screen.findByText(/Falha de rede ao enviar a sua resposta/)).toBeTruthy()
    // O que falhou foi a resposta dela, e não a página: o relato continua ali.
    expect(screen.getByText('7K2M-9QXP-4TRV')).toBeTruthy()
  })
})

/**
 * A CONVERSA, E DE QUEM E A VEZ.
 *
 * **"Volta para o relator" sao dois casos, e nao um.** Precisar de contexto e
 * recusar de fato sao decisoes opostas — e chegando iguais do outro lado, a pessoa
 * entende que acabou e para de responder. O relato morre por ruido, que e o
 * problema que este produto existe para resolver. Por isso o pedido tem bloco
 * proprio, com cara de pergunta.
 *
 * **O aviso do prazo mora aqui porque nao ha para onde manda-lo.** Sem canal de
 * comunicacao, esta pagina e o unico lugar onde a pessoa descobre qualquer coisa.
 * E ele precisa dizer que encerrado assim continua reabrivel — senao vira ameaca.
 */
describe('a conversa sobre o relato', () => {
  function fala(publicId: string, doRelator: boolean, body: string) {
    return {
      PublicId: publicId,
      FromReporter: doRelator,
      Body: body,
      CreatedAt: '2026-09-18T12:00:00.000Z',
    }
  }

  it('sem conversa e sem pergunta, não há bloco nenhum', async () => {
    dublê.abrir.mockResolvedValue({ ...relato })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    const { container } = render(<TrackingPage />)
    await screen.findByText('7K2M-9QXP-4TRV')

    // Uma seção vazia dizendo "ninguém falou nada" ocupa a tela para não dizer nada.
    expect(container.textContent ?? '').not.toMatch(/Conversa sobre o seu relato/)
  })

  it('a pergunta aberta diz de quem é a vez, e até quando', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Conversation: [fala('m-1', false, 'Em qual navegador isso aconteceu?')],
      InfoRequest: {
        AskedAt: '2026-09-18T12:00:00.000Z',
        CloseAt: '2026-10-02T12:00:00.000Z',
        IsWarning: false,
      },
      CanReply: true,
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByText('A equipe precisa de uma informação sua')).toBeTruthy()
    expect(screen.getByText(/Em qual navegador isso aconteceu/)).toBeTruthy()
    // **Não é ameaça.** Sem esta frase, quem não conseguiu responder a tempo acha
    // que perdeu o assunto — e o produto existe justamente para quem foi esquecido.
    expect(screen.getByText(/poderá reabrir por esta página depois/)).toBeTruthy()
  })

  it('e o bloco muda de tom quando o primeiro prazo passa', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Conversation: [fala('m-1', false, 'Consegue mandar um print?')],
      InfoRequest: {
        AskedAt: '2026-09-01T12:00:00.000Z',
        CloseAt: '2026-09-22T12:00:00.000Z',
        IsWarning: true,
      },
      CanReply: true,
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    // O aviso é esta frase, e não um envio: sem canal de comunicação, a página é o
    // único lugar onde a pessoa descobre qualquer coisa.
    expect(
      await screen.findByText(/Sem a sua resposta, este relato será encerrado em/),
    ).toBeTruthy()
  })

  it('responder manda o texto e a tela passa a mostrar o que ficou gravado', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Conversation: [fala('m-1', false, 'Em qual navegador?')],
      InfoRequest: {
        AskedAt: '2026-09-18T12:00:00.000Z',
        CloseAt: '2026-10-02T12:00:00.000Z',
        IsWarning: false,
      },
      CanReply: true,
    })
    dublê.responder.mockResolvedValue({
      ...relato,
      Conversation: [
        fala('m-1', false, 'Em qual navegador?'),
        fala('m-2', true, 'No Chrome do celular.'),
      ],
      // A vez voltou para a equipe.
      InfoRequest: null,
      CanReply: false,
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    fireEvent.change(await screen.findByRole('textbox', { name: 'A sua resposta' }), {
      target: { value: 'No Chrome do celular.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }))

    await waitFor(() =>
      expect(dublê.responder).toHaveBeenCalledWith({
        TrackingCode: '7K2M-9QXP-4TRV',
        Token: 'tok-secreto',
        Body: 'No Chrome do celular.',
      }),
    )

    // A resposta da API vira a tela: a pergunta some, a fala dela aparece, e a
    // caixa de escrever fecha — porque a vez não é mais dela.
    expect(await screen.findByText('No Chrome do celular.')).toBeTruthy()
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'A sua resposta' })).toBeNull(),
    )
  })

  it('sem pergunta aberta, a conversa aparece mas não dá para escrever', async () => {
    dublê.abrir.mockResolvedValue({
      ...relato,
      Conversation: [fala('m-1', false, 'Obrigado pelo aviso.')],
      InfoRequest: null,
      CanReply: false,
    })
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    expect(await screen.findByText('Conversa sobre o seu relato')).toBeTruthy()
    // Canal livre viraria uma caixa de entrada sem dono e sem moderação.
    expect(screen.queryByRole('textbox', { name: 'A sua resposta' })).toBeNull()
  })
})

describe('os arquivos na pagina de acompanhamento', () => {
  /**
   * **So pelo link.** A rota dos arquivos pede o token, que e o que o link
   * carrega. Pelo codigo pessoal o relato abre e os arquivos nao — e a terceira
   * porta, que ficou para depois. O teste trava as duas metades: pedir com o token,
   * e nao pedir sem ele.
   */
  it('pelo link, busca os arquivos com o protocolo e o token', async () => {
    dublê.abrir.mockResolvedValue(relato)
    dublê.anexos.mockResolvedValue([
      {
        PublicId: 'a-1',
        Kind: 'Image',
        Url: 'http://armazenamento/a-1',
        ThumbnailUrl: 'http://armazenamento/a-1-thumb',
        ExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        DurationSeconds: null,
        ReplyPublicId: null,
        CreatedAt: '2026-09-12T13:24:00.000Z',
      },
    ])
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    await screen.findByText('O que você anexou')
    expect(dublê.anexos).toHaveBeenCalledWith('7K2M-9QXP-4TRV', 'tok-secreto')
  })

  it('sem arquivo, nao aparece secao nenhuma', async () => {
    dublê.abrir.mockResolvedValue(relato)
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV#t=tok-secreto')

    render(<TrackingPage />)

    await screen.findByText(/O botão de finalizar compra/)
    await waitFor(() => expect(dublê.anexos).toHaveBeenCalled())
    expect(screen.queryByText('O que você anexou')).toBeNull()
  })

  it('pelo codigo pessoal, nao pede os arquivos — a rota exige o token', async () => {
    dublê.abrirPorCodigo.mockResolvedValue(relato)
    abrirEm('/tracking.html?c=7K2M-9QXP-4TRV&k=pk_DEMO#p=H7QK-3M2X-P9WD')

    render(<TrackingPage />)

    await screen.findByText(/O botão de finalizar compra/)
    expect(dublê.anexos).not.toHaveBeenCalled()
  })
})
