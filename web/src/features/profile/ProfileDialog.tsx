import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import {
  MAX_NOTIFICATION_VOLUME,
  MIN_NOTIFICATION_VOLUME,
  type NotificationKind,
  type NotificationSettingsViewModel,
  type NotificationSound,
  type SaveNotificationSettingsRequest,
} from '@/contracts'
import { describeError, notificationService } from '@/data'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Button } from '@/shared/components/Button'
import { initialsOf } from '@/shared/components/cardFace'
import { Modal } from '@/shared/components/Modal'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { cn } from '@/shared/lib/cn'
import {
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_SOUNDS,
  playNotificationSound,
} from '@/shared/lib/notificationSounds'
import { PROFILE_SOUNDS_SECTION, useProfileDialogStore } from '@/shared/lib/profileDialogStore'

/** Quanto o volume espera depois do ultimo movimento para gravar: uma gravacao por ajuste. */
const VOLUME_MS = 400

/** O volume que volta quando a pessoa tira o mudo sem nunca ter tido outro. */
const VOLUME_PADRAO = 60

/**
 * Centralizado no computador; no celular, a tela inteira, porque a caixa estreita no meio
 * deixava as escolhas de som espremidas. Quem rola e o corpo do `Modal`, com o titulo e o
 * X sempre a vista.
 */
const CAIXA =
  'flex max-h-[calc(100dvh-2rem)] flex-col max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:p-5'

/**
 * Os tipos que so chegam a quem administra o projeto. Ficam num grupo proprio, com o
 * titulo dizendo para quem sao, em vez de "(quem administra)" repetido em cada rotulo.
 * Quem nao administra escolhe o som assim mesmo, e ele vale no dia em que passar a
 * administrar.
 */
const SO_PARA_QUEM_ADMINISTRA: NotificationKind[] = ['OriginPending', 'ReportsPaused']

/** A coluna dos controles nas linhas: o som e o volume ficam com a mesma largura. */
const CONTROLES = 'flex w-full items-center gap-1.5 sm:w-60'

/**
 * O perfil da pessoa: quem ela e (o nome, o e-mail e a foto vem da conta Google, e a
 * conta propria nasceu no primeiro acesso) e o som de cada aviso.
 *
 * **E um dialogo, e nao uma pagina**: abre sobre a tela em que a pessoa esta, pelo menu
 * da conta ou pelo "Preferências de aviso" do sino, sem trocar o endereco. Fechar (X, Esc
 * ou clique fora) deixa a pessoa onde estava, com o foco no botao que abriu. Quem abre e
 * o `profileDialogStore`; este componente fica montado nas duas cascas.
 *
 * **O desenho e uma lista, e nao cartoes.** Quem a pessoa e fica no alto, solto, e uma
 * linha fina separa os sons: uma lista de linhas com o rotulo a esquerda e o controle a
 * direita, como numa tela de ajustes. A versao anterior empilhava cartao dentro de secao
 * dentro do dialogo, com um titulo "Você" sobre o proprio nome e a explicacao dos sons
 * antes de quem a pessoa era; cabia mal e parecia montada.
 *
 * **Uma rolagem so**: o corpo do `Modal` ja rola. Um segundo contêiner com rolagem aqui
 * dentro, com margem negativa para chegar a borda, passava da largura do primeiro e
 * abria uma barra de rolagem lateral.
 *
 * **Escolher toca e grava**: escolher um som e experimentar, e o "Salvar" no fim dobrava
 * os cliques (e sair sem salvar perdia a escolha). Vale em todos os projetos, e em
 * qualquer computador, porque fica guardado na pessoa.
 */
export function ProfileDialog() {
  const open = useProfileDialogStore((state) => state.open)
  const closeProfile = useProfileDialogStore((state) => state.closeProfile)
  const corpo = useRef<HTMLDivElement>(null)

  /**
   * A secao pedida ao abrir (os sons, vindo do sino), rolada para o topo do corpo e com o
   * foco no titulo dela: quem chegou pelo teclado continua dali, e o leitor de tela
   * anuncia onde esta. Sem secao, ou sem achar, o foco vai para o X, como nos outros.
   */
  function secaoPedida(): HTMLElement | null {
    const id = useProfileDialogStore.getState().section
    if (!id) return null
    const alvo = document.getElementById(id)
    if (!alvo || !corpo.current?.contains(alvo)) return null
    alvo.scrollIntoView?.({ block: 'start' })
    const titulo = /^H[1-6]$/.test(alvo.tagName) ? alvo : alvo.querySelector<HTMLElement>('h2, h3')
    if (!titulo) return alvo
    // O `tabindex` fica: o menu que abriu devolve o foco ao botao dele um instante depois,
    // e o dialogo o traz de volta para o ultimo focado, que precisa continuar focavel.
    if (!titulo.hasAttribute('tabindex')) titulo.tabIndex = -1
    return titulo
  }

  return (
    <Modal
      open={open}
      onOpenChange={(aberto) => {
        if (!aberto) closeProfile()
      }}
      title="Perfil"
      // A frase dos sons descreve o dialogo: o leitor de tela diz, ao abrir, que tudo
      // grava sozinho.
      describedBy="perfil-sons-texto"
      closeButton
      width="w-[min(36rem,calc(100vw-2rem))]"
      className={CAIXA}
      initialFocus={secaoPedida}
      // O menu que abriu ja fechou: o foco volta ao botao dele, se ainda esta na tela.
      fallbackFocus={() => {
        const botao = useProfileDialogStore.getState().returnFocusTo
        return botao?.isConnected ? botao : null
      }}
    >
      <div ref={corpo} className="pb-1">
        <ProfileContent />
      </div>
    </Modal>
  )
}

type Gravacao = 'nada' | 'salvando' | 'salvo' | 'falhou'

function ProfileContent() {
  const user = useSessionStore((state) => state.user)
  const { data, failed, reload } = useAsyncResource(
    useCallback(() => notificationService.getSettings(), []),
  )
  // Mora aqui, e nao nos sons, para o estado aparecer ao lado do titulo da secao.
  const [gravacao, setGravacao] = useState<Gravacao>('nada')

  return (
    <>
      <section aria-label="Você">
        <div className="flex items-center gap-4">
          {user?.AvatarUrl ? (
            <img
              src={user.AvatarUrl}
              alt=""
              width={56}
              height={56}
              className="size-14 flex-none rounded-full ring-1 ring-border"
              referrerPolicy="no-referrer"
            />
          ) : (
            // Sem foto, as iniciais no mesmo lugar: o alto nao muda de forma de uma conta
            // para outra.
            <span
              aria-hidden
              className="flex size-14 flex-none items-center justify-center rounded-full bg-surface-sunken font-medium text-fg-muted text-lead uppercase"
            >
              {initialsOf(user?.Name || user?.Email || '?')}
            </span>
          )}
          <dl className="min-w-0">
            <dt className="sr-only">Nome</dt>
            <dd className="truncate font-semibold text-fg text-lead">{user?.Name ?? 'Sem nome'}</dd>
            <dt className="sr-only">E-mail</dt>
            <dd className="truncate text-detail text-fg-muted">{user?.Email ?? 'sem e-mail'}</dd>
            <dt className="mt-1.5 inline text-caption text-fg-muted">Sua conta: </dt>
            <dd className="inline text-caption text-fg">{user?.Account.Name ?? 'Sem nome'}</dd>
          </dl>
        </div>
        {/* Na coluna do nome (a foto tem 56 px e o vao 16), e nao solta embaixo da foto. */}
        <p className="mt-2 pl-18 text-caption text-fg-muted">
          O nome, o e-mail e a foto vêm da sua conta Google.
        </p>
      </section>

      <section
        id={PROFILE_SOUNDS_SECTION}
        aria-labelledby="perfil-avisos"
        className="mt-5 border-border border-t pt-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 id="perfil-avisos" className="font-semibold text-body text-fg">
            Sons dos avisos
          </h3>
          <EstadoDaGravacao gravacao={gravacao} />
        </div>
        <p id="perfil-sons-texto" className="mt-1 text-detail text-fg-muted leading-relaxed">
          Tocam quando um aviso chega no sino, valem em todos os projetos e ficam salvos assim que
          você escolhe.
        </p>
        {data ? (
          <SoundSettings inicial={data} gravacao={gravacao} onGravacao={setGravacao} />
        ) : failed ? (
          <div className="mt-4 rounded-xl border border-border p-5">
            <p className="mb-3.5 text-body text-fg-muted">Não deu para carregar os sons agora.</p>
            <Button onClick={reload}>Tentar de novo</Button>
          </div>
        ) : (
          <Skeleton className="mt-4 h-56 w-full" />
        )}
      </section>
    </>
  )
}

/**
 * "Salvando…" e "Salvo", ao lado do titulo, numa regiao anunciada. Ali nao ocupa uma linha
 * so para ele no fim da lista, que ficava vazia quase o tempo todo. A falha tem texto
 * mais longo e o botao de tentar de novo: aparece embaixo dos sons.
 */
function EstadoDaGravacao({ gravacao }: { gravacao: Gravacao }) {
  return (
    <div role="status" className="min-h-5 text-caption text-fg-muted">
      {gravacao === 'salvando' && (
        <span key="salvando" className="animate-fade-in">
          Salvando…
        </span>
      )}
      {gravacao === 'salvo' && (
        <span key="salvo" className="flex animate-fade-in items-center gap-1">
          <svg
            viewBox="0 0 12 12"
            className="size-3 flex-none text-chip-green-glyph"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M2.5 6.3 4.8 8.6 9.5 3.9" />
          </svg>
          Salvo
        </span>
      )}
    </div>
  )
}

function SoundSettings({
  inicial,
  gravacao,
  onGravacao,
}: {
  inicial: NotificationSettingsViewModel
  gravacao: Gravacao
  onGravacao: (gravacao: Gravacao) => void
}) {
  const [volume, setVolume] = useState(inicial.Volume)
  const [sons, setSons] = useState(inicial.Sounds)
  const [erro, setErro] = useState<string | null>(null)
  /** O ultimo som tocado, para as ondas do botao dele acenderem: a `vez` reinicia o desenho. */
  const [toque, setToque] = useState<{ tipo: NotificationKind; vez: number } | null>(null)
  const idVolume = useId()
  const idCampo = useId()
  /** O volume de antes do mudo: tirar o mudo volta a ele, e nao a um numero qualquer. */
  const antesDoMudo = useRef(inicial.Volume > 0 ? inicial.Volume : VOLUME_PADRAO)

  // O perfil segue o que chegou do servidor quando ele muda (outra aba salvou).
  useEffect(() => {
    setVolume(inicial.Volume)
    setSons(inicial.Sounds)
  }, [inicial])

  /** A gravacao mais nova: a resposta de uma mais velha, chegando depois, nao diz nada. */
  const vez = useRef(0)
  /** O volume esperando a pessoa soltar o controle, gravado ao fechar o perfil se faltar. */
  const pendente = useRef<{
    timer: ReturnType<typeof setTimeout>
    pedido: SaveNotificationSettingsRequest
  } | null>(null)

  const gravar = useCallback(
    async (pedido: SaveNotificationSettingsRequest) => {
      if (pendente.current) {
        clearTimeout(pendente.current.timer)
        pendente.current = null
      }
      const minha = ++vez.current
      onGravacao('salvando')
      setErro(null)
      try {
        await notificationService.saveSettings(pedido)
        if (minha === vez.current) onGravacao('salvo')
      } catch (falha) {
        if (minha === vez.current) {
          onGravacao('falhou')
          setErro(describeError(falha, 'salvar a sua escolha'))
        }
      }
    },
    [onGravacao],
  )

  // Fechou o perfil com o volume esperando: grava assim mesmo, e a escolha nao se perde.
  useEffect(
    () => () => {
      if (pendente.current) {
        clearTimeout(pendente.current.timer)
        void notificationService.saveSettings(pendente.current.pedido).catch(() => {})
        pendente.current = null
      }
    },
    [],
  )

  function tocar(tipo: NotificationKind, som: NotificationSound) {
    playNotificationSound(som, volume)
    if (som !== 'None' && volume > 0) setToque({ tipo, vez: Date.now() })
  }

  function escolher(tipo: NotificationKind, som: NotificationSound) {
    const novos = sons.map((linha) => (linha.Kind === tipo ? { ...linha, Sound: som } : linha))
    setSons(novos)
    tocar(tipo, som)
    void gravar({ Volume: volume, Sounds: novos })
  }

  function mudarVolume(valor: number) {
    setVolume(valor)
    if (valor > 0) antesDoMudo.current = valor
    if (pendente.current) clearTimeout(pendente.current.timer)
    const pedido = { Volume: valor, Sounds: sons }
    pendente.current = { pedido, timer: setTimeout(() => void gravar(pedido), VOLUME_MS) }
  }

  // O alto-falante ao lado do volume liga e desliga o som de uma vez, e grava na hora.
  function alternarMudo() {
    const valor = volume === 0 ? antesDoMudo.current : 0
    setVolume(valor)
    void gravar({ Volume: valor, Sounds: sons })
    if (valor > 0) ouvirVolume(valor)
  }

  // Soltar o controle toca o som da mencao no volume novo, senao o primeiro que toca.
  function ouvirVolume(valor = volume) {
    const som =
      sons.find((linha) => linha.Kind === 'Mention' && linha.Sound !== 'None')?.Sound ??
      sons.find((linha) => linha.Sound !== 'None')?.Sound
    if (som) playNotificationSound(som, valor)
  }

  const pessoais = sons.filter((linha) => !SO_PARA_QUEM_ADMINISTRA.includes(linha.Kind))
  const deQuemAdministra = sons.filter((linha) => SO_PARA_QUEM_ADMINISTRA.includes(linha.Kind))
  const cheio =
    ((volume - MIN_NOTIFICATION_VOLUME) / (MAX_NOTIFICATION_VOLUME - MIN_NOTIFICATION_VOLUME)) * 100

  function linhaDeSom(linha: { Kind: NotificationKind; Sound: NotificationSound }) {
    const rotulo = NOTIFICATION_KIND_LABELS[linha.Kind]
    const campo = `${idCampo}-${linha.Kind}`
    const tocando = toque?.tipo === linha.Kind
    return (
      <Linha
        key={linha.Kind}
        rotulo={
          <label htmlFor={campo} className="text-body text-fg leading-snug">
            {rotulo}
          </label>
        }
      >
        <Select
          id={campo}
          value={linha.Sound}
          onChange={(valor) => escolher(linha.Kind, valor as NotificationSound)}
          options={NOTIFICATION_SOUNDS}
          className="min-w-0 flex-1"
        />
        <Button
          variant="ghost"
          disabled={linha.Sound === 'None' || volume === 0}
          onClick={() => tocar(linha.Kind, linha.Sound)}
          aria-label={`Ouvir o som: ${rotulo.toLowerCase()}`}
          title="Ouvir"
          className="w-9 px-0 text-fg-muted enabled:hover:text-fg pointer-coarse:w-11"
        >
          <IconeSom key={tocando ? toque.vez : 'parado'} tocando={tocando} />
        </Button>
      </Linha>
    )
  }

  return (
    <>
      <div className="mt-3 divide-y divide-border">
        <Linha
          rotulo={
            <label htmlFor={idVolume} className="text-body text-fg">
              Volume
            </label>
          }
        >
          <Button
            variant="ghost"
            onClick={alternarMudo}
            aria-label="Silenciar os avisos"
            aria-pressed={volume === 0}
            title={volume === 0 ? 'Ligar o som' : 'Silenciar'}
            className="w-9 px-0 text-fg-muted enabled:hover:text-fg pointer-coarse:w-11"
          >
            <IconeSom mudo={volume === 0} tocando={false} />
          </Button>
          <input
            id={idVolume}
            type="range"
            min={MIN_NOTIFICATION_VOLUME}
            max={MAX_NOTIFICATION_VOLUME}
            step={5}
            value={volume}
            onChange={(evento) => mudarVolume(Number(evento.target.value))}
            onPointerUp={() => ouvirVolume()}
            onKeyUp={(evento) => {
              if (evento.key.startsWith('Arrow') || evento.key === 'Home' || evento.key === 'End')
                ouvirVolume()
            }}
            aria-valuetext={volume === 0 ? 'Mudo' : `${volume}%`}
            style={{ '--cheio': `${cheio}%` } as CSSProperties}
            // No toque a faixa que pega o dedo cresce para 40; o trilho segue no meio.
            className="range-soft min-w-0 flex-1 pointer-coarse:h-10"
          />
          <span className="w-10 flex-none text-right text-detail text-fg tabular-nums">
            {volume === 0 ? 'Mudo' : `${volume}%`}
          </span>
        </Linha>
        {pessoais.map(linhaDeSom)}
      </div>

      {deQuemAdministra.length > 0 && (
        <fieldset className="m-0 mt-4 min-w-0 border-0 p-0">
          <legend className="p-0 font-medium text-caption text-fg-muted">
            Se você administra o projeto
          </legend>
          <div className="mt-1 divide-y divide-border">{deQuemAdministra.map(linhaDeSom)}</div>
        </fieldset>
      )}

      {gravacao === 'falhou' && (
        <div
          role="alert"
          className="mt-3 flex animate-fade-in flex-wrap items-center gap-x-3 gap-y-1 text-detail text-error-fg"
        >
          <span>{erro ?? 'Não deu para salvar a sua escolha agora.'}</span>
          <button
            type="button"
            onClick={() => void gravar({ Volume: volume, Sounds: sons })}
            className="font-medium underline underline-offset-2"
          >
            Tentar de novo
          </button>
        </div>
      )}
    </>
  )
}

/**
 * Uma linha da lista: o rotulo a esquerda e os controles a direita, numa coluna de
 * largura fixa para o som e o volume alinharem. No celular, o rotulo em cima e os
 * controles embaixo, na largura toda.
 */
function Linha({ rotulo, children }: { rotulo: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-2 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      {rotulo}
      <div className={CONTROLES}>{children}</div>
    </div>
  )
}

/**
 * O alto-falante: de ouvir, nas linhas, e de silenciar, no volume. Quando o som toca, as
 * duas ondas saem dele uma depois da outra, e o clique responde com o desenho, e nao so
 * com o som (que pode estar baixo). No mudo, as ondas viram um X.
 */
function IconeSom({ tocando, mudo = false }: { tocando: boolean; mudo?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.5 6.2h2L7.8 3.5v9L4.5 9.8h-2z" fill="currentColor" fillOpacity="0.12" />
      {mudo ? (
        <path d="m10.5 6.3 3.4 3.4m0-3.4-3.4 3.4" />
      ) : (
        <>
          <path d="M10.2 6.1a2.8 2.8 0 0 1 0 3.8" className={cn(tocando && 'animate-som-onda')} />
          <path
            d="M12 4.3a5.4 5.4 0 0 1 0 7.4"
            className={cn(tocando && 'animate-som-onda [animation-delay:90ms]')}
          />
        </>
      )}
    </svg>
  )
}
