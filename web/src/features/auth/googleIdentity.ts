/**
 * Sign-In do Google no navegador.
 *
 * Este arquivo so **obtem** o `id_token` — um JWT assinado pelo Google. Ele nao
 * decide se a pessoa pode entrar: conferir a assinatura e trabalho de servidor
 * (`GoogleIdentityValidator`, na nossa API). Token nao conferido e so um texto.
 *
 * O token obtido aqui vai para `POST /auth/google`, e e la que ele vale ou nao.
 *
 * O client id precisa ter a origem do painel em "Origens JavaScript autorizadas"
 * do Google Cloud (`http://localhost:5173` em desenvolvimento). Sem isso o Google
 * recusa antes de desenhar, e o erro sai no console do navegador.
 */

interface GoogleCredentialResponse {
  credential?: string
}

interface GoogleAccountsId {
  initialize(config: {
    client_id: string
    callback: (response: GoogleCredentialResponse) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'small' | 'medium' | 'large'
      text?: 'signin_with' | 'signup_with' | 'continue_with'
      shape?: 'rectangular' | 'pill'
      locale?: string
      width?: number
    },
  ): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } }
  }
}

const SCRIPT_ID = 'google-identity-services'
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

let loader: Promise<GoogleAccountsId> | null = null

/**
 * A promessa fica guardada porque dois pedidos simultaneos — o que o modo estrito
 * do React provoca ao montar duas vezes — poriam duas `<script>` na pagina.
 */
function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (loader) return loader

  loader = new Promise((resolve, reject) => {
    if (window.google?.accounts.id) {
      resolve(window.google.accounts.id)
      return
    }

    const existing = document.getElementById(SCRIPT_ID)
    const script =
      existing instanceof HTMLScriptElement ? existing : document.createElement('script')

    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.defer = true

    script.addEventListener('load', () => {
      const api = window.google?.accounts.id
      if (api) resolve(api)
      else reject(new Error('Biblioteca do Google carregou sem a API esperada.'))
    })

    script.addEventListener('error', () => {
      // Presa num erro, a promessa nunca mais funcionaria — nem depois da rede voltar.
      loader = null
      reject(new Error('Não foi possível carregar o Sign-In do Google.'))
    })

    if (!existing) document.head.appendChild(script)
  })

  return loader
}

/**
 * `initialize` e global e vale para a pagina inteira, entao roda **uma vez por
 * client id**. Chamar de novo a cada montagem — o que o modo estrito do React
 * provoca ao montar duas vezes — faz o GSI avisar no console que so a ultima
 * instancia vale.
 *
 * Quem muda a cada chamada e o destinatario do token, guardado a parte: a
 * `callback` que ficou registrada no Google e a da primeira vez, e sem isto ela
 * seguiria avisando um componente que ja foi desmontado.
 */
let initializedFor: string | null = null
let notifyCredential: ((idToken: string) => void) | null = null

/**
 * Desenha o botao oficial do Google dentro do elemento e avisa quando o token
 * chega. Pode ser chamada para mais de um elemento — a tela de entrada desenha um
 * no cabecalho e outro na chamada principal, e os dois avisam o mesmo destinatario.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  clientId: string,
  onCredential: (idToken: string) => void,
  options: { size?: 'medium' | 'large'; fit?: boolean } = {},
): Promise<void> {
  const api = await loadGoogleIdentity()
  notifyCredential = onCredential

  if (initializedFor !== clientId) {
    api.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) notifyCredential?.(response.credential)
      },
      // Entrar sozinho ao abrir confunde quem tem mais de uma conta Google.
      auto_select: false,
      cancel_on_tap_outside: true,
    })

    initializedFor = clientId
  }

  // Esvaziar antes de desenhar deixa a funcao idempotente: montar duas vezes
  // termina com um botao, e nao com dois empilhados.
  container.replaceChildren()

  api.renderButton(container, {
    type: 'standard',
    theme: 'outline',
    size: options.size ?? 'large',
    text: 'continue_with',
    shape: 'rectangular',
    locale: 'pt-BR',
    // O Google so aceita largura em numero, e o maximo dele e 400. Com `fit`, medir
    // o container faz o botao ocupar a coluna em vez de encolher no canto dela, e em
    // tela estreita ele nao passa da margem. Sem `fit` ele sai do tamanho do texto,
    // que e o que serve num cabecalho.
    ...(options.fit ? { width: Math.min(400, Math.round(container.clientWidth) || 320) } : {}),
  })
}

/** Impede o Google de reentrar sozinho depois que a pessoa saiu de proposito. */
export function disableGoogleAutoSelect(): void {
  window.google?.accounts.id.disableAutoSelect()
}
