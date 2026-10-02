import { describe, expect, it } from 'vitest'
import { describeError, PanelError } from '@/data/errors'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **O 403 repete a mensagem da API, e nao ganha frase propria.** Uma frase fixa
 * para o 403 ("so quem administra…") chegou a existir e estava errada: esta
 * funcao serve tambem ao quadro e a pagina de acompanhamento, e a API usa 403
 * para regra de negocio — projeto arquivado, endereco nao autorizado, reabertura
 * recusada, pedido de informacao que nao cabe. Com a frase fixa, quem relatava
 * lia que precisava administrar o projeto, e a propria dona lia o mesmo ao pedir
 * informacao a quem nao aceita pergunta.
 */
describe('describeError', () => {
  it('o 403 diz o que a API disse', () => {
    expect(
      describeError(new PanelError('Este projeto esta arquivado e nao aceita relatos novos.', 403)),
    ).toBe('Este projeto esta arquivado e nao aceita relatos novos.')
  })

  it('os outros códigos também', () => {
    expect(describeError(new PanelError('Ja existe um projeto com este nome na conta.', 409))).toBe(
      'Ja existe um projeto com este nome na conta.',
    )
  })

  it('erro que não veio da camada de dados vira a frase genérica', () => {
    expect(describeError(new Error('qualquer coisa'))).toBe(
      'Nao foi possivel completar a operacao. Tente de novo.',
    )
  })
})
