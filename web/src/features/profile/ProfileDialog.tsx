import { useCallback, useEffect, useId, useRef, useState } from 'react'
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
import { Modal } from '@/shared/components/Modal'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import {
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_SOUNDS,
  playNotificationSound,
} from '@/shared/lib/notificationSounds'
import { PROFILE_SOUNDS_SECTION, useProfileDialogStore } from '@/shared/lib/profileDialogStore'

/** Quanto o volume espera depois do ultimo movimento para gravar: uma gravacao por ajuste. */
const VOLUME_MS = 400

/**
 * Centralizado no computador; no celular, a tela inteira — a caixa estreita no meio
 * deixava as escolhas de som espremidas, e o corpo rola sozinho, com o titulo e o X
 * sempre a vista.
 */
const CAIXA =
  'flex max-h-[calc(100dvh-2rem)] flex-col max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:p-5'

/**
 * O perfil da pessoa: quem ela e — o nome, o e-mail e a foto vem da conta Google, e a
 * conta propria nasceu no primeiro acesso — e como ela e avisada.
 *
 * **E um dialogo, e nao uma pagina**: abre sobre a tela em que a pessoa esta, pelo menu
 * da conta ou pelo "Preferências de aviso" do sino, sem trocar o endereco — fechar (X,
 * Esc ou clique fora) deixa a pessoa onde estava, com o foco no botao que abriu. Quem
 * abre e o `profileDialogStore`; este componente fica montado nas duas cascas.
 *
 * **Os avisos ficam no painel**: o sino, e um som para cada tipo de aviso, com o volume.
 * Cada tipo tem o seu som — a mencao com um, a escolha como responsavel com outro. **Escolher
 * toca e grava**: escolher um som e experimentar, e o "Ouvir" depois de cada escolha e o
 * "Salvar" no fim dobravam os cliques — e sair sem salvar perdia a escolha. Vale em todos
 * os projetos, e em qualquer computador: fica guardado na pessoa.
 */
export function ProfileDialog() {
  const open = useProfileDialogStore((state) => state.open)
  const closeProfile = useProfileDialogStore((state) => state.closeProfile)
  const corpo = useRef<HTMLDivElement>(null)

  /**
   * A secao pedida ao abrir — os sons, vindo do sino —, rolada para o topo do corpo e com
   * o foco no titulo dela: quem chegou pelo teclado continua dali, e o leitor de tela
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
    // e o dialogo o traz de volta para o ultimo focado — que precisa continuar focavel.
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
      description="Os sons e o volume ficam salvos assim que você escolhe — não há botão de salvar."
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
      <div
        ref={corpo}
        className="-mx-6 max-sm:-mx-5 min-h-0 flex-1 overflow-y-auto px-6 max-sm:px-5"
      >
        <ProfileContent />
      </div>
    </Modal>
  )
}

function ProfileContent() {
  const user = useSessionStore((state) => state.user)
  const { data, failed, reload } = useAsyncResource(
    useCallback(() => notificationService.getSettings(), []),
  )

  return (
    <>
      <section aria-labelledby="perfil-voce" className="mb-8">
        <h2 id="perfil-voce" className="mb-3 font-semibold text-body text-fg">
          Você
        </h2>
        <div className="flex items-center gap-4 rounded-xl border border-border bg-surface-raised p-4">
          {user?.AvatarUrl ? (
            <img
              src={user.AvatarUrl}
              alt=""
              className="size-12 flex-none rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <dl className="min-w-0 text-detail">
            <dt className="sr-only">Nome</dt>
            <dd className="truncate font-medium text-body text-fg">{user?.Name ?? '—'}</dd>
            <dt className="sr-only">E-mail</dt>
            <dd className="truncate text-fg-muted">{user?.Email ?? '—'}</dd>
            <dt className="mt-2 inline text-fg-muted">Sua conta: </dt>
            <dd className="inline text-fg">{user?.Account.Name ?? '—'}</dd>
          </dl>
        </div>
        <p className="mt-2 text-caption text-fg-muted">
          O nome, o e-mail e a foto vêm da sua conta Google.
        </p>
      </section>

      <section id={PROFILE_SOUNDS_SECTION} aria-labelledby="perfil-avisos" className="pb-1">
        <h2 id="perfil-avisos" className="mb-1 font-semibold text-body text-fg">
          Avisos
        </h2>
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">
          Os avisos aparecem no sino, no topo de todas as telas, e tocam o som escolhido: na tela de
          Trabalho, na hora; nas outras telas, em até um minuto. Escolha o som de cada tipo e o
          volume — ao escolher, você ouve. Vale em todos os projetos.
        </p>
        {data ? (
          <SoundSettings inicial={data} />
        ) : failed ? (
          <div className="rounded-xl border border-border bg-surface-raised p-5">
            <p className="mb-3.5 text-body text-fg-muted">
              Não deu para carregar as preferências agora.
            </p>
            <Button onClick={reload}>Tentar de novo</Button>
          </div>
        ) : (
          <Skeleton className="h-56 w-full" />
        )}
      </section>
    </>
  )
}

type Gravacao = 'nada' | 'salvando' | 'salvo' | 'falhou'

function SoundSettings({ inicial }: { inicial: NotificationSettingsViewModel }) {
  const [volume, setVolume] = useState(inicial.Volume)
  const [sons, setSons] = useState(inicial.Sounds)
  const [gravacao, setGravacao] = useState<Gravacao>('nada')
  const [erro, setErro] = useState<string | null>(null)
  const idVolume = useId()

  // O perfil segue o que chegou do servidor quando ele muda (outra aba salvou).
  useEffect(() => {
    setVolume(inicial.Volume)
    setSons(inicial.Sounds)
  }, [inicial])

  /** A gravacao mais nova: a resposta de uma mais velha, chegando depois, nao diz nada. */
  const vez = useRef(0)
  /** O volume esperando a pessoa soltar o controle — gravado ao fechar o perfil, se faltar. */
  const pendente = useRef<{
    timer: ReturnType<typeof setTimeout>
    pedido: SaveNotificationSettingsRequest
  } | null>(null)

  const gravar = useCallback(async (pedido: SaveNotificationSettingsRequest) => {
    if (pendente.current) {
      clearTimeout(pendente.current.timer)
      pendente.current = null
    }
    const minha = ++vez.current
    setGravacao('salvando')
    setErro(null)
    try {
      await notificationService.saveSettings(pedido)
      if (minha === vez.current) setGravacao('salvo')
    } catch (falha) {
      if (minha === vez.current) {
        setGravacao('falhou')
        setErro(describeError(falha))
      }
    }
  }, [])

  // Fechou o perfil com o volume esperando: grava assim mesmo — a escolha nao se perde.
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

  function escolher(tipo: NotificationKind, som: NotificationSound) {
    const novos = sons.map((linha) => (linha.Kind === tipo ? { ...linha, Sound: som } : linha))
    setSons(novos)
    playNotificationSound(som, volume)
    void gravar({ Volume: volume, Sounds: novos })
  }

  function mudarVolume(valor: number) {
    setVolume(valor)
    if (pendente.current) clearTimeout(pendente.current.timer)
    const pedido = { Volume: valor, Sounds: sons }
    pendente.current = { pedido, timer: setTimeout(() => void gravar(pedido), VOLUME_MS) }
  }

  // Soltar o controle toca o som da mencao no volume novo — senao o primeiro que toca.
  function ouvirVolume() {
    const som =
      sons.find((linha) => linha.Kind === 'Mention' && linha.Sound !== 'None')?.Sound ??
      sons.find((linha) => linha.Sound !== 'None')?.Sound
    if (som) playNotificationSound(som, volume)
  }

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <ul className="flex flex-col gap-4">
        {sons.map((linha) => (
          <li key={linha.Kind} className="flex flex-wrap items-end gap-2">
            <Select
              label={NOTIFICATION_KIND_LABELS[linha.Kind]}
              value={linha.Sound}
              onChange={(valor) => escolher(linha.Kind, valor as NotificationSound)}
              options={NOTIFICATION_SOUNDS}
              className="min-w-0 flex-1 sm:min-w-60"
            />
            <Button
              disabled={linha.Sound === 'None' || volume === 0}
              onClick={() => playNotificationSound(linha.Sound, volume)}
              aria-label={`Ouvir o som: ${NOTIFICATION_KIND_LABELS[linha.Kind].toLowerCase()}`}
            >
              Ouvir
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-5">
        <label htmlFor={idVolume} className="mb-1.5 block text-detail text-fg-muted">
          Volume
        </label>
        <div className="flex items-center gap-3">
          <input
            id={idVolume}
            type="range"
            min={MIN_NOTIFICATION_VOLUME}
            max={MAX_NOTIFICATION_VOLUME}
            step={5}
            value={volume}
            onChange={(evento) => mudarVolume(Number(evento.target.value))}
            onPointerUp={ouvirVolume}
            onKeyUp={(evento) => {
              if (evento.key.startsWith('Arrow') || evento.key === 'Home' || evento.key === 'End')
                ouvirVolume()
            }}
            aria-valuetext={volume === 0 ? 'Mudo' : `${volume}%`}
            className="w-full max-w-80 accent-accent"
          />
          <span className="w-12 text-detail text-fg tabular-nums">
            {volume === 0 ? 'Mudo' : `${volume}%`}
          </span>
        </div>
      </div>

      {/* Discreto, e anunciado: a escolha ja foi gravada, sem botao. */}
      <div role="status" className="mt-4 min-h-5 text-caption">
        {gravacao === 'salvando' && <span className="text-fg-muted">Salvando…</span>}
        {gravacao === 'salvo' && <span className="text-fg-muted">Salvo.</span>}
        {gravacao === 'falhou' && (
          <span className="text-error-fg">
            Não deu para salvar.{erro ? ` ${erro}` : ''}{' '}
            <button
              type="button"
              onClick={() => void gravar({ Volume: volume, Sounds: sons })}
              className="font-medium underline underline-offset-2"
            >
              Tentar de novo
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
