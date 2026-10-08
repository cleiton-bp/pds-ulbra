import type { NotificationKind, NotificationSound } from '@/contracts'

/** Os sons, na ordem em que aparecem para escolher. */
export const NOTIFICATION_SOUNDS: { value: NotificationSound; label: string }[] = [
  { value: 'Ping', label: 'Plim' },
  { value: 'Bell', label: 'Sino' },
  { value: 'Chime', label: 'Campainha' },
  { value: 'Drop', label: 'Gota' },
  { value: 'Bubble', label: 'Bolha' },
  { value: 'Soft', label: 'Suave' },
  { value: 'None', label: 'Sem som' },
]

/** Como cada tipo de aviso aparece na tela do perfil. */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  Mention: 'Quando alguém me menciona',
  Assignment: 'Quando me escolhem como responsável',
}

/** Uma nota de um som: a frequencia (e para onde ela desliza), quando entra e quanto dura. */
interface Nota {
  hz: number
  ate?: number
  em: number
  dura: number
  onda: OscillatorType
  forca?: number
}

/**
 * Os sons, como notas: **gerados no navegador**, sem arquivo de audio — nada a baixar,
 * nada a licenciar, e o mesmo som em qualquer computador.
 */
const NOTAS: Record<Exclude<NotificationSound, 'None'>, Nota[]> = {
  Ping: [{ hz: 1318.5, em: 0, dura: 0.35, onda: 'sine' }],
  Bell: [
    { hz: 880, em: 0, dura: 1.2, onda: 'sine' },
    { hz: 1760, em: 0, dura: 0.8, onda: 'sine', forca: 0.35 },
    { hz: 2637, em: 0, dura: 0.5, onda: 'sine', forca: 0.15 },
  ],
  Chime: [
    { hz: 659.25, em: 0, dura: 0.45, onda: 'triangle' },
    { hz: 830.6, em: 0.12, dura: 0.45, onda: 'triangle' },
    { hz: 987.8, em: 0.24, dura: 0.6, onda: 'triangle' },
  ],
  Drop: [{ hz: 1400, ate: 420, em: 0, dura: 0.22, onda: 'sine' }],
  Bubble: [
    { hz: 320, ate: 900, em: 0, dura: 0.12, onda: 'sine' },
    { hz: 420, ate: 1100, em: 0.1, dura: 0.12, onda: 'sine', forca: 0.7 },
  ],
  Soft: [
    { hz: 523.25, em: 0, dura: 0.7, onda: 'sine', forca: 0.7 },
    { hz: 659.25, em: 0.18, dura: 0.8, onda: 'sine', forca: 0.6 },
  ],
}

/** O volume mais alto, na escala do navegador: o 100 da tela nao estoura o alto-falante. */
const TETO = 0.35

let contexto: AudioContext | null = null

/**
 * Toca um som, no volume de 0 a 100. **O navegador so deixa tocar depois de a pessoa
 * ter mexido na pagina** (um clique, uma tecla): antes disso o som nao sai, e nao ha o
 * que fazer — nem erro a mostrar.
 */
export function playNotificationSound(som: NotificationSound, volume: number): void {
  if (som === 'None' || volume <= 0) return
  try {
    contexto ??= new AudioContext()
    if (contexto.state === 'suspended') void contexto.resume()
    const agora = contexto.currentTime + 0.01
    const alto = (Math.min(volume, 100) / 100) * TETO
    for (const nota of NOTAS[som]) {
      const oscilador = contexto.createOscillator()
      const ganho = contexto.createGain()
      const inicio = agora + nota.em
      const fim = inicio + nota.dura
      oscilador.type = nota.onda
      oscilador.frequency.setValueAtTime(nota.hz, inicio)
      if (nota.ate) oscilador.frequency.exponentialRampToValueAtTime(nota.ate, fim)
      // Entra rapido e some devagar: sem o estalo do comeco e do fim.
      ganho.gain.setValueAtTime(0.0001, inicio)
      ganho.gain.exponentialRampToValueAtTime(alto * (nota.forca ?? 1), inicio + 0.015)
      ganho.gain.exponentialRampToValueAtTime(0.0001, fim)
      oscilador.connect(ganho).connect(contexto.destination)
      oscilador.start(inicio)
      oscilador.stop(fim + 0.05)
    }
  } catch {
    // Navegador sem audio: o aviso chega so no sino.
  }
}

// ─── A chegada de um aviso ────────────────────────────────────────────────────

const ouvintes = new Set<() => void>()

/** Chegou um aviso pelo tempo real: o sino rele na hora. */
export function announceNotificationArrival(): void {
  for (const ouvinte of ouvintes) ouvinte()
}

/** Ouve a chegada de avisos. Devolve quem para de ouvir. */
export function onNotificationArrival(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => {
    ouvintes.delete(ouvinte)
  }
}
