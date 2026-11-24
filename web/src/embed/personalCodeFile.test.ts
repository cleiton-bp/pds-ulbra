import { describe, expect, it } from 'vitest'
import { personalCodeFile } from '@/embed/personalCodeFile'

describe('o arquivo do código pessoal', () => {
  const agora = new Date('2026-11-24T19:28:00')

  it('leva o código, diz onde usar e de qual site ele é', () => {
    const { nome, conteudo } = personalCodeFile('H7QK-3M2X-P9WD', 'loja.exemplo.com.br', agora)

    expect(nome).toBe('codigo-pessoal-loja-exemplo-com-br.txt')
    expect(conteudo).toContain('Seu código pessoal: H7QK-3M2X-P9WD')
    expect(conteudo).toContain('"Ver os meus relatos"')
    expect(conteudo).toContain('Em outro celular, computador ou navegador')
    expect(conteudo).toContain('Site: loja.exemplo.com.br')
  })

  it('sem o site, o nome fica o de sempre e a linha do site some', () => {
    const { nome, conteudo } = personalCodeFile('H7QK-3M2X-P9WD', null, agora)

    expect(nome).toBe('codigo-pessoal.txt')
    expect(conteudo).not.toContain('Site:')
  })

  it('a porta e os símbolos do endereço viram hífen, e o nome não termina em hífen', () => {
    expect(personalCodeFile('X', '127.0.0.1:4120', agora).nome).toBe(
      'codigo-pessoal-127-0-0-1-4120.txt',
    )
  })

  it('não leva link nem token: o arquivo pode parar em qualquer lugar', () => {
    const { conteudo } = personalCodeFile('H7QK-3M2X-P9WD', 'loja.exemplo.com.br', agora)

    expect(conteudo).not.toMatch(/https?:\/\//)
    expect(conteudo).not.toContain('#t=')
  })
})
