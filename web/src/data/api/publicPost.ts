import type { ApiResponse } from '@/contracts'
import { environment } from '@/data/environment'
import { PanelError } from '@/data/errors'

/**
 * **Nao passa pelo `httpClient`, e isso e a decisao deste arquivo.**
 *
 * O cliente do painel le `getToken()` em toda requisicao e monta o
 * `Authorization` sem perguntar (`data/api/httpClient.ts`). A ferramenta embutida
 * mora na mesma origem do painel — e portanto no mesmo `localStorage` — entao
 * usa-lo aqui mandaria o token de sessao de quem administra a conta junto de um
 * relato anonimo, para dentro de uma pagina que qualquer site embute.
 *
 * O `credentials: 'omit'` diz a mesma coisa ao navegador: esta requisicao nao
 * carrega credencial nenhuma, nem cookie que um dia apareca.
 */
/**
 * As duas rotas publicas de relato tem a mesma forma — `POST`, corpo em JSON, sem
 * credencial — e o que muda e a mensagem da falha de rede: "nao deu para enviar" e
 * "nao deu para abrir" pedem coisas diferentes de quem le.
 *
 * O **status chega inteiro** em `PanelError`, e nao virado em texto: a pagina de
 * acompanhamento precisa distinguir o 404, que e resposta definitiva, de uma falha
 * passageira que vale tentar de novo.
 */
export async function postPublic<T>(
  path: string,
  body: unknown,
  networkMessage: string,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${environment.apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify(body),
    })
  } catch {
    // Status 0: nem chegou a haver resposta, igual ao `httpClient`.
    throw new PanelError(networkMessage, 0)
  }

  const envelope = await response
    .json()
    .then((data) => data as ApiResponse<T>)
    .catch(() => null)

  if (!response.ok || envelope?.Success === false || !envelope?.Data) {
    throw new PanelError(envelope?.Message ?? `Erro ${response.status}.`, response.status)
  }

  return envelope.Data
}
