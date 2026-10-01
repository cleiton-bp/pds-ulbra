import type { CaptureModule } from '@/capture/area'
import { capturePage } from '@/capture/pageCapture'

/**
 * O ARQUIVO DA CAPTURA — baixado pelo carregador so quando a pessoa clica em
 * capturar. Ver `CaptureModule`.
 *
 * O build o entrega como script comum, e o que sai daqui vira o valor do nome
 * global de `CAPTURE_GLOBAL`. O tipo e o que confere que o carregador recebe o que
 * espera.
 */
const captureModule: CaptureModule = { capturePage }

export default captureModule
