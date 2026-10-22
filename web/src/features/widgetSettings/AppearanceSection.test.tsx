// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WidgetSettingsViewModel } from '@/contracts'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import {
  AppearanceFields,
  BUTTON_FIELDS,
  BUTTON_GROUPS,
  describeAppearance,
  describeHiddenPages,
  describePosition,
  MobileFields,
  PositionFields,
  resetPatch,
} from '@/features/widgetSettings/AppearanceSection'
import { BUTTON_COLORS, parseHexColor, TEXT_COLORS } from '@/features/widgetSettings/buttonPalette'

/**
 * O QUE ESTES TESTES TRAVAM: cada controle da aparencia muda o rascunho com o campo
 * certo, e so com ele — e diz o que fez junto.
 *
 * - **A cor num clique**: Padrão, as amostras e "Outra…", que abre o seletor e o campo
 *   do codigo; o mesmo para a cor do texto, com o contraste baixo dito e consertado.
 * - **"Mostrar" em tres pecas** (so o texto, icone e texto, so o icone), nos dois
 *   campos de sempre; pedir icone sem icone escolhe o balao **e diz**; com so o icone,
 *   o texto vira a dica e o formato desliga dizendo por que.
 * - **O canto num desenho**, com as setas pelo desenho; a distancia diz de qual borda
 *   conta, e fora do intervalo para no limite dizendo qual e.
 * - **No celular**: as consequencias escritas, e o balao escolhido dito.
 * - **Uma parada de Tab por grupo**: os radios de um grupo tem o mesmo `name`.
 * - **Os grupos nao se repetem**, e o titulo fechado diz o que esta escolhido.
 *
 * Cor crua nao se escreve em `.tsx`, nem em teste (`designSystem.test.ts`): as cores
 * vem da paleta, e a cor propria e montada por `parseHexColor`.
 */

function montar(extra: Partial<WidgetSettingsViewModel> = {}) {
  const change = vi.fn<(patch: Partial<WidgetSettingsViewModel>) => void>()
  const draft = { ...DEFAULT_WIDGET_SETTINGS, ...extra }
  render(
    <>
      <AppearanceFields draft={draft} change={change} />
      <PositionFields draft={draft} change={change} />
      <MobileFields draft={draft} change={change} />
    </>,
  )
  return change
}

/** A tela de verdade: o rascunho guardado, cada mudanca aplicada. */
function Controlado({ inicial }: { inicial: Partial<WidgetSettingsViewModel> }) {
  const [draft, setDraft] = useState({ ...DEFAULT_WIDGET_SETTINGS, ...inicial })
  const change = (patch: Partial<WidgetSettingsViewModel>) =>
    setDraft((atual) => ({ ...atual, ...patch }))
  return (
    <>
      <AppearanceFields draft={draft} change={change} />
      <PositionFields draft={draft} change={change} />
      <MobileFields draft={draft} change={change} />
    </>
  )
}

const grupo = (nome: string) => screen.getByRole('radiogroup', { name: nome })
const escolha = (nomeDoGrupo: string, nome: string | RegExp) =>
  within(grupo(nomeDoGrupo)).getByRole('radio', { name: nome }) as HTMLInputElement

describe('AppearanceSection', () => {
  afterEach(cleanup)

  describe('a cor', () => {
    it('Padrão vem marcado, e cada amostra escolhe a cor num clique', () => {
      const change = montar()
      const [azul] = BUTTON_COLORS

      expect(escolha('Cor do botão', 'Padrão').checked).toBe(true)
      // Sem escolher "Outra…", nao ha seletor nem codigo.
      expect(screen.queryByLabelText('Outra cor do botão')).toBeNull()

      fireEvent.click(escolha('Cor do botão', azul?.name ?? ''))
      expect(change).toHaveBeenCalledWith({ AccentColor: azul?.value })
    })

    it('a amostra marcada diz o nome; Padrão diz que acompanha o tema', () => {
      const [, verde] = BUTTON_COLORS
      montar({ AccentColor: verde?.value ?? null })
      expect(escolha('Cor do botão', verde?.name ?? '').checked).toBe(true)
      expect(screen.getByText(verde?.name ?? '')).toBeTruthy()
      cleanup()

      montar()
      expect(screen.getByText(/acompanha o tema claro ou escuro/)).toBeTruthy()
    })

    it('"Outra…" sem cor comeca numa amostra, e nunca fica desligada', () => {
      const change = montar()
      const outra = escolha('Cor do botão', 'Outra…')
      expect(outra.disabled).toBe(false)

      fireEvent.click(outra)
      // Sem folha de estilo (jsdom), o acento do produto nao se le: a primeira amostra.
      expect(change).toHaveBeenCalledWith({ AccentColor: BUTTON_COLORS[0]?.value })
    })

    it('a cor propria abre "Outra…", com o seletor e o codigo dela', () => {
      const propria = parseHexColor('123abc') as string
      montar({ AccentColor: propria })

      expect(escolha('Cor do botão', 'Outra…').checked).toBe(true)
      expect((screen.getByLabelText('Outra cor do botão') as HTMLInputElement).value).toBe(propria)
      expect((screen.getByLabelText('Código da cor do botão') as HTMLInputElement).value).toBe(
        '123abc',
      )
    })

    it('o codigo muda a cor com seis digitos, e o errado so e dito ao sair do campo', () => {
      const change = montar({ AccentColor: parseHexColor('123abc') })
      const codigo = screen.getByLabelText('Código da cor do botão') as HTMLInputElement

      fireEvent.change(codigo, { target: { value: 'abc' } })
      // Tres digitos ainda podem virar seis: nada muda, e nada e acusado.
      expect(change).not.toHaveBeenCalled()
      expect(screen.queryByText(/Use 6 dígitos/)).toBeNull()

      fireEvent.change(codigo, { target: { value: 'ff8800' } })
      expect(change).toHaveBeenLastCalledWith({ AccentColor: parseHexColor('ff8800') })

      fireEvent.change(codigo, { target: { value: 'xyz' } })
      fireEvent.blur(codigo)
      expect(screen.getByText('Use 6 dígitos, de 0 a 9 e de A a F.')).toBeTruthy()
      expect(codigo.getAttribute('aria-invalid')).toBe('true')
    })

    it('a cor do texto fica logo abaixo, com amostras e a dica do botão Enviar', () => {
      const change = montar()
      const [branco] = TEXT_COLORS

      expect(escolha('Cor do texto', 'Automática').checked).toBe(true)
      expect(screen.getByText(/Vale também no botão Enviar/)).toBeTruthy()

      fireEvent.click(escolha('Cor do texto', branco?.name ?? ''))
      expect(change).toHaveBeenCalledWith({ LauncherTextColor: branco?.value })
    })

    it('o contraste baixo e dito numa linha, e "Usar automático" conserta', () => {
      const [branco] = TEXT_COLORS
      const change = montar({
        AccentColor: parseHexColor('ffffcc'),
        LauncherTextColor: branco?.value ?? null,
      })

      expect(screen.getByText(/Difícil de ler sobre esta cor/)).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Usar automático' }))
      expect(change).toHaveBeenCalledWith({ LauncherTextColor: null })
    })
  })

  describe('mostrar', () => {
    it('so o icone sem icone escolhe o balao e diz isso na linha', () => {
      render(<Controlado inicial={{ LauncherIcon: 'None', LauncherIconOnly: false }} />)
      expect(escolha('Mostrar', 'Só o texto').checked).toBe(true)

      fireEvent.click(escolha('Mostrar', 'Só o ícone'))

      expect(escolha('Mostrar', 'Só o ícone').checked).toBe(true)
      expect(escolha('Ícone', 'Balão de conversa').checked).toBe(true)
      expect(screen.getByRole('status').textContent).toBe(
        'Usamos o Balão de conversa; troque abaixo.',
      )
      // O texto do botao vira a dica, e o formato nao vale para o redondo.
      expect(screen.getByRole('textbox', { name: 'Dica ao passar o mouse' })).toBeTruthy()
      expect(escolha('Formato', 'Pílula').disabled).toBe(true)
      expect(screen.getByText('Só o ícone é sempre redondo.')).toBeTruthy()
    })

    it('as tres pecas sao os dois campos de sempre', () => {
      const change = montar({ LauncherIcon: 'None' })
      fireEvent.click(escolha('Mostrar', 'Ícone e texto'))
      expect(change).toHaveBeenLastCalledWith({ LauncherIconOnly: false, LauncherIcon: 'Chat' })
      fireEvent.click(escolha('Mostrar', 'Só o ícone'))
      expect(change).toHaveBeenLastCalledWith({ LauncherIconOnly: true, LauncherIcon: 'Chat' })
      cleanup()

      const comIcone = montar({ LauncherIcon: 'Bug', LauncherIconOnly: false })
      expect(escolha('Mostrar', 'Ícone e texto').checked).toBe(true)
      fireEvent.click(escolha('Mostrar', 'Só o ícone'))
      expect(comIcone).toHaveBeenCalledWith({ LauncherIconOnly: true })
      cleanup()

      const soIcone = montar({ LauncherIcon: 'Bug', LauncherIconOnly: true })
      fireEvent.click(escolha('Mostrar', 'Ícone e texto'))
      expect(soIcone).toHaveBeenCalledWith({ LauncherIconOnly: false })
    })

    it('escolher um icone troca so o icone; sem icone, nenhum vem marcado', () => {
      const change = montar()
      const icones = within(grupo('Ícone')).getAllByRole('radio') as HTMLInputElement[]
      expect(icones.some((icone) => icone.checked)).toBe(false)
      expect(screen.getByText('Escolher um ícone põe ele ao lado do texto.')).toBeTruthy()

      fireEvent.click(escolha('Ícone', 'Inseto'))
      expect(change).toHaveBeenCalledWith({ LauncherIcon: 'Bug' })
    })

    it('so o texto tira o icone e o "so o icone", no computador e no celular — e diz', () => {
      render(
        <Controlado
          inicial={{ LauncherIcon: 'Star', LauncherIconOnly: true, MobileMode: 'IconOnly' }}
        />,
      )

      fireEvent.click(escolha('Mostrar', 'Só o texto'))

      expect(escolha('No celular', /^Igual ao computador/).checked).toBe(true)
      expect(screen.getByText('Sem ícone, o celular volta a mostrar o texto.')).toBeTruthy()
    })

    it('so o texto nao mexe no celular escondido', () => {
      const change = montar({ LauncherIcon: 'Star', MobileMode: 'Hidden' })

      fireEvent.click(escolha('Mostrar', 'Só o texto'))
      expect(change).toHaveBeenCalledWith({
        LauncherIcon: 'None',
        LauncherIconOnly: false,
        MobileMode: 'Hidden',
      })
    })

    it('tamanho, formato e sombra sao pecas que mudam um campo cada', () => {
      const change = montar()
      fireEvent.click(escolha('Tamanho', 'Grande'))
      expect(change).toHaveBeenLastCalledWith({ LauncherSize: 'Large' })
      fireEvent.click(escolha('Formato', 'Quadrado'))
      expect(change).toHaveBeenLastCalledWith({ LauncherShape: 'Square' })
      fireEvent.click(escolha('Sombra', 'Com'))
      expect(change).toHaveBeenLastCalledWith({ LauncherShadow: true })
    })
  })

  describe('o canto', () => {
    it('marca o canto atual no desenho e troca pelo escolhido', () => {
      const change = montar()

      expect(escolha('Canto', 'Embaixo, à direita').checked).toBe(true)
      expect(escolha('Canto', 'Em cima, à esquerda').checked).toBe(false)

      fireEvent.click(escolha('Canto', 'Em cima, à esquerda'))
      expect(change).toHaveBeenCalledWith({ Position: 'TopLeft' })
    })

    it('as setas andam pelo desenho: para cima sobe, para a esquerda vai a esquerda', () => {
      const change = montar()

      fireEvent.keyDown(escolha('Canto', 'Embaixo, à direita'), { key: 'ArrowUp' })
      expect(change).toHaveBeenLastCalledWith({ Position: 'TopRight' })

      fireEvent.keyDown(escolha('Canto', 'Embaixo, à direita'), { key: 'ArrowLeft' })
      expect(change).toHaveBeenLastCalledWith({ Position: 'BottomLeft' })

      // Ja embaixo, a seta para baixo nao sai do lugar.
      change.mockClear()
      fireEvent.keyDown(escolha('Canto', 'Embaixo, à direita'), { key: 'ArrowDown' })
      expect(change).not.toHaveBeenCalled()
    })

    it('so em cima avisa do menu, numa linha que fica sempre no lugar', () => {
      montar({ Position: 'BottomLeft' })
      expect(screen.queryByText(/Em cima, confira na prévia/)).toBeNull()
      cleanup()

      montar({ Position: 'TopRight' })
      expect(screen.getByText(/Em cima, confira na prévia/)).toBeTruthy()
    })
  })

  describe('a distancia do canto', () => {
    const numero = (nome: RegExp) => screen.getByRole('spinbutton', { name: nome })

    it('os nomes seguem o canto: de qual borda a distancia conta', () => {
      montar({ Position: 'BottomRight' })
      expect(screen.getByRole('slider', { name: 'Da borda direita' })).toBeTruthy()
      expect(screen.getByRole('slider', { name: 'Da borda de baixo' })).toBeTruthy()
      cleanup()

      montar({ Position: 'TopLeft' })
      expect(screen.getByRole('slider', { name: 'Da borda esquerda' })).toBeTruthy()
      expect(screen.getByRole('slider', { name: 'Da borda de cima' })).toBeTruthy()
      expect(screen.getByText('Distância do canto, de 0 a 200 px')).toBeTruthy()
    })

    it('o deslizante e o numero mudam o mesmo eixo', () => {
      const change = montar({ OffsetX: 24, OffsetY: 32 })

      expect((numero(/Da borda direita/) as HTMLInputElement).value).toBe('24')
      expect((numero(/Da borda de baixo/) as HTMLInputElement).value).toBe('32')

      fireEvent.change(screen.getByRole('slider', { name: 'Da borda direita' }), {
        target: { value: '48' },
      })
      expect(change).toHaveBeenLastCalledWith({ OffsetX: 48 })

      fireEvent.change(numero(/Da borda de baixo/), { target: { value: '60' } })
      expect(change).toHaveBeenLastCalledWith({ OffsetY: 60 })
    })

    it('fora do intervalo para no limite e diz qual e; vazio vale zero', () => {
      const change = montar()

      fireEvent.change(numero(/Da borda direita/), { target: { value: '999' } })
      expect(change).toHaveBeenLastCalledWith({ OffsetX: 200 })
      expect(screen.getByText('O máximo é 200 px.')).toBeTruthy()

      fireEvent.change(numero(/Da borda direita/), { target: { value: '-5' } })
      expect(change).toHaveBeenLastCalledWith({ OffsetX: 0 })
      expect(screen.getByText('O mínimo é 0 px.')).toBeTruthy()

      fireEvent.change(numero(/Da borda de baixo/), { target: { value: '12.6' } })
      expect(change).toHaveBeenLastCalledWith({ OffsetY: 13 })

      fireEvent.change(numero(/Da borda de baixo/), { target: { value: '' } })
      expect(change).toHaveBeenLastCalledWith({ OffsetY: 0 })
    })
  })

  describe('no celular', () => {
    it('escondido muda so o modo, e diz que ninguem relata pelo celular', () => {
      const change = montar()
      expect(escolha('No celular', 'Igual ao computador').checked).toBe(true)
      fireEvent.click(escolha('No celular', 'Escondido'))
      expect(change).toHaveBeenCalledWith({ MobileMode: 'Hidden' })
      cleanup()

      montar({ MobileMode: 'Hidden' })
      expect(screen.getByText('No celular, ninguém consegue relatar.')).toBeTruthy()
    })

    it('"so o icone" no celular, sem icone, escolhe o balao e diz', () => {
      render(<Controlado inicial={{ LauncherIcon: 'None' }} />)

      fireEvent.click(escolha('No celular', 'Só o ícone'))

      expect(escolha('No celular', 'Só o ícone').checked).toBe(true)
      expect(escolha('Ícone', 'Balão de conversa').checked).toBe(true)
      expect(screen.getByText('Usamos o Balão de conversa; troque em Aparência.')).toBeTruthy()
    })

    it('"so o icone" no celular, com icone, nao troca o icone', () => {
      const change = montar({ LauncherIcon: 'Megaphone', MobileMode: 'Hidden' })

      fireEvent.click(escolha('No celular', 'Só o ícone'))
      expect(change).toHaveBeenCalledWith({ MobileMode: 'IconOnly' })
    })

    it('"igual ao computador" diz quando o computador ja e so o icone', () => {
      montar({ LauncherIcon: 'Bug', LauncherIconOnly: true })
      expect(escolha('No celular', /Igual ao computador/).parentElement?.textContent).toContain(
        '(já é só o ícone)',
      )
    })
  })

  describe('o teclado', () => {
    it('cada grupo e uma parada de Tab: os radios dele dividem um nome, e so ele', () => {
      montar()
      const nomes = ['Mostrar', 'Ícone', 'Cor do botão', 'Canto', 'No celular'].map((nome) => {
        const radios = within(grupo(nome)).getAllByRole('radio') as HTMLInputElement[]
        const doGrupo = new Set(radios.map((radio) => radio.name))
        expect(doGrupo.size, nome).toBe(1)
        return [...doGrupo][0]
      })
      expect(new Set(nomes).size).toBe(nomes.length)
    })
  })

  describe('os grupos', () => {
    it('cada campo do botão mora num grupo só, e o liga e desliga em nenhum', () => {
      const campos = Object.values(BUTTON_GROUPS).flatMap((grupo) =>
        grupo.map(([campo]) => campo as string),
      )
      expect(new Set(campos).size).toBe(campos.length)
      expect(campos).not.toContain('IsEnabled')
      expect(BUTTON_FIELDS).toEqual(['IsEnabled', ...campos])
      // Os textos e o tema do formulario, e o que vem depois do envio, nao sao do botao.
      expect(BUTTON_FIELDS).not.toContain('Title')
      expect(BUTTON_FIELDS).not.toContain('Theme')
      expect(BUTTON_FIELDS).not.toContain('SuccessMessage')
    })

    it('o texto do botão está na aparência, e muda só ele', () => {
      const change = montar()
      fireEvent.change(screen.getByRole('textbox', { name: 'Texto do botão' }), {
        target: { value: 'Ajuda' },
      })
      expect(change).toHaveBeenCalledWith({ LauncherLabel: 'Ajuda' })
    })

    it('o endereço antigo do "Mais da aparência" continua dentro da aparência', () => {
      montar()
      const antigo = document.getElementById('mais-opcoes')
      expect(antigo?.querySelector('#tamanho')).not.toBeNull()
      expect(antigo?.querySelector('#sombra')).not.toBeNull()
    })

    it('voltar ao padrão troca só os campos do grupo', () => {
      const draft = { ...DEFAULT_WIDGET_SETTINGS, Position: 'TopLeft' as const, OffsetX: 40 }
      expect(resetPatch({ ...draft, Theme: 'Dark' }, BUTTON_GROUPS.position)).toEqual({
        Position: 'BottomRight',
        OffsetX: 20,
        OffsetY: 20,
      })
    })

    it('voltar a aparência com o celular em "só o ícone" volta o celular junto', () => {
      const draft = {
        ...DEFAULT_WIDGET_SETTINGS,
        LauncherIcon: 'Bug' as const,
        MobileMode: 'IconOnly' as const,
      }
      const patch = resetPatch(draft, BUTTON_GROUPS.appearance)
      expect(patch.LauncherIcon).toBe('None')
      expect(patch.MobileMode).toBe('Same')

      // Com o celular escondido, nada a corrigir: o celular nao entra.
      expect(
        resetPatch({ ...draft, MobileMode: 'Hidden' }, BUTTON_GROUPS.appearance),
      ).not.toHaveProperty('MobileMode')
    })

    it('o título fechado diz o que está escolhido, em palavras', () => {
      expect(describeAppearance(DEFAULT_WIDGET_SETTINGS)).toBe(
        `cor padrão · “${DEFAULT_WIDGET_SETTINGS.LauncherLabel}” · sem ícone · médio · pílula`,
      )
      expect(
        describeAppearance({
          ...DEFAULT_WIDGET_SETTINGS,
          AccentColor: BUTTON_COLORS[0]?.value ?? null,
          LauncherIconOnly: true,
          LauncherIcon: 'Bug',
        }),
      ).toBe('azul · só o ícone · inseto · médio · redondo')
      expect(
        describeAppearance({ ...DEFAULT_WIDGET_SETTINGS, AccentColor: parseHexColor('123abc') }),
      ).toContain('cor própria')

      expect(describePosition(DEFAULT_WIDGET_SETTINGS)).toBe('Embaixo, à direita · 20 px da borda')
      expect(
        describePosition({ ...DEFAULT_WIDGET_SETTINGS, Position: 'TopLeft', OffsetY: 48 }),
      ).toBe('Em cima, à esquerda · 20 px na horizontal, 48 px na vertical')

      expect(describeHiddenPages(DEFAULT_WIDGET_SETTINGS)).toBe('Aparece em todas as páginas')
      expect(
        describeHiddenPages({
          ...DEFAULT_WIDGET_SETTINGS,
          HiddenPaths: ['/checkout', ' ', '/login/*', '/conta'],
        }),
      ).toBe('Escondido em 3 páginas: /checkout, /login/* e mais 1')
    })
  })
})
