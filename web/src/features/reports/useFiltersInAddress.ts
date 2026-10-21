import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  sameWorkView,
  type WorkView,
  workViewFromQuery,
  workViewToQuery,
} from '@/features/reports/useWorkFilters'

/**
 * Os filtros da tela de Trabalho **no endereco** (`?responsavel=me&vencidos=1`): o
 * endereco vira link, e quem o abre ve o que quem mandou via.
 *
 * - **O endereco que muda por fora vale** — o link colado, o voltar do navegador: a
 *   tela passa a mostrar o que ele diz (`aplicar`).
 * - **O que muda na tela vai para o endereco**, trocando a entrada do historico, e nao
 *   empilhando: cada clique num filtro nao vira um "voltar" a mais.
 * - **Com o card aberto, nao escreve** (`espelhar`): o endereco do card e o dele, e o
 *   "Copiar link" do card manda o card, e nao a lista atras dele. Fechar o card volta
 *   ao endereco da lista com os filtros.
 *
 * O que esta tela escreveu e lembrado (`escrito`): a volta do proprio endereco nao e
 * "mudanca por fora", senao a tela desfaria a mudanca que acabou de fazer.
 */
export function useFiltersInAddress(
  vista: WorkView,
  aplicar: (vista: WorkView) => void,
  espelhar: boolean,
) {
  const location = useLocation()
  const navigate = useNavigate()
  const escrito = useRef<string | null>(null)
  const aplicarAtual = useRef(aplicar)
  aplicarAtual.current = aplicar

  useEffect(() => {
    if (location.search !== escrito.current) {
      escrito.current = location.search
      const doEndereco = workViewFromQuery(location.search)
      if (doEndereco) {
        // O endereco ja diz o que vai valer: nao ha o que escrever nele agora.
        if (!sameWorkView(doEndereco, vista)) aplicarAtual.current(doEndereco)
        return
      }
    }
    if (!espelhar) return
    const desejado = workViewToQuery(vista, location.search)
    if (desejado === location.search) return
    escrito.current = desejado
    navigate({ search: desejado, hash: location.hash }, { replace: true, preventScrollReset: true })
  }, [location.search, location.hash, vista, espelhar, navigate])
}
