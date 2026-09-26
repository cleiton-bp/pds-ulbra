import { useNavigation } from './navigation'

/**
 * O caminho de volta ao inicio na barra de cima. A lista de arquivos tambem tem o
 * seu, mas ela pode estar fechada (Alt+1) — este continua sempre a vista.
 */
export default function HomeButton() {
  const { go } = useNavigation()
  return (
    <button
      className="icon-btn"
      title="voltar ao início · Alt+0"
      aria-label="voltar ao início"
      onClick={() => void go({ env: null, file: null })}
    >
      ⌂
    </button>
  )
}
