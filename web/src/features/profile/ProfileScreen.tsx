import { useCallback, useEffect, useId, useState } from 'react'
import {
  MAX_NOTIFICATION_VOLUME,
  MIN_NOTIFICATION_VOLUME,
  type NotificationKind,
  type NotificationSettingsViewModel,
  type NotificationSound,
} from '@/contracts'
import { describeError, notificationService } from '@/data'
import { useSessionStore } from '@/features/auth/sessionStore'
import { Button } from '@/shared/components/Button'
import { Select } from '@/shared/components/Select'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import {
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_SOUNDS,
  playNotificationSound,
} from '@/shared/lib/notificationSounds'

/**
 * O perfil da pessoa: quem ela e — o nome, o e-mail e a foto vem da conta Google, e a
 * conta propria nasceu no primeiro acesso — e como ela e avisada.
 *
 * **Os avisos ficam no painel**: o sino, e um som para cada tipo de aviso, com o volume.
 * Cada tipo tem o seu som — a mencao com um, a escolha como responsavel com outro —, e
 * "Ouvir" toca o som escolhido no volume da tela, antes de salvar. Vale em todos os
 * projetos, e em qualquer computador: fica guardado na pessoa.
 */
export function ProfileScreen() {
  const user = useSessionStore((state) => state.user)
  const { data, failed, reload } = useAsyncResource(
    useCallback(() => notificationService.getSettings(), []),
  )

  return (
    // A mesma moldura do hub: a casca da conta nao tem margem propria.
    <div className="mx-auto max-w-170 px-5 py-7 lg:px-8 lg:pt-12">
      <h1 className="mb-6 font-semibold text-screen tracking-tight">Perfil</h1>

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

      <section aria-labelledby="perfil-avisos">
        <h2 id="perfil-avisos" className="mb-1 font-semibold text-body text-fg">
          Avisos
        </h2>
        <p className="mb-4 text-detail text-fg-muted leading-relaxed">
          Os avisos chegam no sino do painel — na tela de Trabalho, na hora. Escolha o som de cada
          um, e o volume. Vale em todos os projetos.
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
    </div>
  )
}

function SoundSettings({ inicial }: { inicial: NotificationSettingsViewModel }) {
  // A base e o que esta gravado: o que veio do servidor, e depois o que se salvou. E
  // contra ela que "Salvar" sabe se ha o que salvar.
  const [base, setBase] = useState(inicial)
  const [volume, setVolume] = useState(inicial.Volume)
  const [sons, setSons] = useState(inicial.Sounds)
  const [salvando, setSalvando] = useState(false)
  const idVolume = useId()

  // A tela segue o que chegou do servidor quando ele muda (outra aba salvou).
  useEffect(() => {
    setBase(inicial)
    setVolume(inicial.Volume)
    setSons(inicial.Sounds)
  }, [inicial])

  const mudou =
    volume !== base.Volume ||
    sons.some(
      (linha) => base.Sounds.find((antes) => antes.Kind === linha.Kind)?.Sound !== linha.Sound,
    )

  const escolher = (tipo: NotificationKind, som: NotificationSound) =>
    setSons((atuais) =>
      atuais.map((linha) => (linha.Kind === tipo ? { ...linha, Sound: som } : linha)),
    )

  async function salvar() {
    setSalvando(true)
    try {
      const salvas = await notificationService.saveSettings({ Volume: volume, Sounds: sons })
      setBase(salvas)
      setVolume(salvas.Volume)
      setSons(salvas.Sounds)
      toast.done('Preferências salvas.')
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setSalvando(false)
    }
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
              className="min-w-60 flex-1"
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
            onChange={(evento) => setVolume(Number(evento.target.value))}
            aria-valuetext={volume === 0 ? 'Mudo' : `${volume}%`}
            className="w-full max-w-80 accent-accent"
          />
          <span className="w-12 text-detail text-fg tabular-nums">
            {volume === 0 ? 'Mudo' : `${volume}%`}
          </span>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="primary" disabled={!mudou || salvando} onClick={() => void salvar()}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>
    </div>
  )
}
