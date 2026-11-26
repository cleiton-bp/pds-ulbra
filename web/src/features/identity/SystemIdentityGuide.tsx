import { type ReactNode, useState } from 'react'
import type { IdentityFormat } from '@/contracts'
import { Button } from '@/shared/components/Button'
import { CodeAddedMark, CodeEditor } from '@/shared/components/CodeEditor'
import { CopyButton } from '@/shared/components/CopyButton'
import { IdentitySecretDialog } from '@/shared/components/IdentitySecret'
import { LanguageIcon, type ServerLanguage } from '@/shared/components/LanguageIcon'
import { NumberField } from '@/shared/components/NumberField'
import { Check, RadioGroup } from '@/shared/components/SettingsControls'
import { cn } from '@/shared/lib/cn'
import { IDENTITY_DEFAULTS, IDENTITY_TOKEN_MINUTES } from '@/shared/lib/factoryDefaults'
import type { CodeLanguage } from '@/shared/lib/highlight'
import { LOADER_URL } from '@/shared/lib/loader'

/**
 * O passo a passo da Identidade do seu sistema (Privacidade, Como a pessoa é reconhecida):
 * o que o cliente faz no servidor dele para o formulario reconhecer quem esta na conta.
 *
 * **Feito para quem vai fazer sozinho.** Antes, eram cinco ou seis passos com listas
 * numeradas dentro, seis abas de linguagem repetidas em cada trecho de codigo, termos como
 * "HMAC-SHA256 de id.expira" e "aud" logo de cara, e as regras do cracha no meio da
 * instalacao. Agora:
 *
 * - **Uma frase diz o que vai acontecer**, antes de qualquer passo, e o "cracha" e
 *   explicado ali, uma vez.
 * - **Duas escolhas antes de comecar**: o formato (a assinatura simples, recomendada) e a
 *   linguagem do servidor. A linguagem vale para todos os trechos de baixo, que mostram so
 *   ela, e fica lembrada neste navegador.
 * - **Quatro passos, os mesmos nos dois formatos**, cada um com uma acao so e o lugar onde
 *   ela acontece ("No painel", "No seu servidor", "No seu sistema"): pegar a chave, criar a
 *   funcao, colocar o cracha no script e salvar e testar. O que a linguagem pede a mais (a
 *   biblioteca, o pacote, onde fica a chave) vem dentro do passo, numa frase.
 * - **O teste diz o que se ve quando da certo** ("Ver os meus relatos"), e o que conferir
 *   quando nao da, recolhido.
 * - **As regras do cracha vem depois dos passos**: sao escolhas com padrao, e nao parte da
 *   instalacao.
 *
 * O que a API confere esta em `InheritedIdentity` (na API), e o que a pagina manda, no
 * carregador (`identity`, em `loader/main.ts`): `data-user-id`, `data-user-expires`,
 * `data-user-signature` e `data-user-name` na assinatura simples, e `data-identity` no JWT.
 */
export function ChaveDoSistema({
  projectId,
  formato,
  onFormato,
  hmacDisponivel,
  chave,
  onChave,
  validade,
  onValidade,
  obrigatorio,
  onObrigatorio,
  chaveDoProjeto,
}: {
  projectId: string
  formato: IdentityFormat
  onFormato: (formato: IdentityFormat) => void
  /** A instalacao tem a chave mestra do HMAC. */
  hmacDisponivel: boolean
  chave: string
  onChave: (chave: string) => void
  validade: number
  onValidade: (minutos: number) => void
  obrigatorio: boolean
  onObrigatorio: (obrigatorio: boolean) => void
  /** A chave publica do projeto, para os exemplos. Vazia enquanto nao carregou. */
  chaveDoProjeto: string
}) {
  const [linguagem, setLinguagem] = useLinguagemDoServidor()
  const [vendoAChave, setVendoAChave] = useState(false)
  const validadeInvalida = !validadeValida(validade)
  const aud = chaveDoProjeto || 'pk_…'
  const minutos = validadeInvalida ? IDENTITY_DEFAULTS.IdentityTokenMaxMinutes : validade
  const hmac = formato === 'Hmac'
  const item =
    LINGUAGENS.find((opcao) => opcao.valor === linguagem) ??
    (LINGUAGENS[0] as (typeof LINGUAGENS)[number])
  const guia = guiaDaLinguagem(linguagem, hmac, item.arquivo)
  const icone = <LanguageIcon language={item.valor} className="size-3.5" />

  // Um arquivo so, o da linguagem escolhida: a escolha mora la em cima, e nao em abas
  // repetidas em cada trecho.
  const funcao = (
    <CodeEditor
      className={CODIGO_NO_CELULAR}
      files={[
        {
          id: item.valor,
          name: item.arquivo,
          label: item.nome,
          language: item.realce,
          icon: icone,
          code: hmac ? exemploHmac(item.valor, minutos) : exemploJwt(item.valor, aud, minutos),
        },
      ]}
    />
  )
  const pagina = (
    <CodeEditor
      className={CODIGO_NO_CELULAR}
      files={[
        {
          id: item.valor,
          name: item.pagina,
          label: item.nome,
          language: 'html' as const,
          icon: icone,
          ...(hmac ? paginaHmac(item.valor, aud) : paginaJwt(item.valor, aud)),
        },
      ]}
    />
  )

  const noScript = (
    <Passo numero={3} titulo="Coloque o crachá no script da página" onde="No seu servidor">
      <p>
        No script que você colou na Instalação, o servidor acrescenta{' '}
        {hmac ? 'estes atributos' : 'este atributo'}, só para quem está na conta:
      </p>
      <Valores>
        {hmac ? (
          <>
            <Valor nome={c('data-user-id')}>o id</Valor>
            <Valor nome={c('data-user-expires')}>a validade</Valor>
            <Valor nome={c('data-user-signature')}>a assinatura</Valor>
            <Valor nome={c('data-user-name')}>o nome, se quiser</Valor>
          </>
        ) : (
          <Valor nome={c('data-identity')}>o JWT do passo 2</Valor>
        )}
      </Valores>
      <p>
        Quem não está na conta fica sem {hmac ? 'esses atributos' : 'esse atributo'}, e a{' '}
        {hmac ? 'chave secreta' : 'chave privada'} nunca aparece na página.
      </p>
      <Exemplo titulo={`Ver um exemplo em ${item.nome}`}>
        <p>{guia.chamar}</p>
        <p>
          As linhas novas estão marcadas{' '}
          <span className="whitespace-nowrap">
            com <CodeAddedMark />.
          </span>
        </p>
        {pagina}
      </Exemplo>
      <PaginaNoNavegador hmac={hmac} />
    </Passo>
  )

  // O codigo pronto na linguagem do servidor, so para quem quer: a instrucao do passo ja
  // diz o que fazer em palavras, em qualquer linguagem.
  const exemploDaFuncao = (
    <Exemplo titulo="Ver um exemplo em código">
      <RadioGroup<Linguagem>
        look="pill"
        label="Linguagem do seu servidor"
        value={linguagem}
        onChange={setLinguagem}
        options={LINGUAGENS.map((opcao) => ({ value: opcao.valor, label: opcao.nome }))}
      />
      {guia.instalar}
      <p>
        O arquivo {c(item.arquivo)}, para criar {guia.ondeCriar}, já com a chave deste projeto e a
        validade das regras:
      </p>
      {funcao}
      {guia.notas.map((nota, indice) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: as notas de cada linguagem sao fixas
        <p key={indice}>{nota}</p>
      ))}
    </Exemplo>
  )

  return (
    // No celular, uma secao separada por um fio, e nao mais uma caixa dentro do cartao: as
    // caixas aninhadas (o grupo, esta, os passos) tiravam largura a cada respiro, e o codigo
    // ficava com uns 260px.
    <div className="mt-3 rounded-lg border border-border bg-surface p-4 max-sm:mt-4 max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:bg-transparent max-sm:px-0 max-sm:pt-4 max-sm:pb-0">
      <p className="text-detail text-fg leading-relaxed">
        A cada página, o seu servidor gera um crachá de quem está na conta, um texto curto e
        assinado que vale poucos minutos, e o coloca no script que você colou na Instalação. O
        formulário manda o crachá junto com o relato, e nós só conferimos a assinatura.
      </p>

      <div className="mt-5">
        <div className="flex flex-col gap-2.5">
          <div className="font-medium text-detail text-fg">Formato do crachá</div>
          <RadioGroup<IdentityFormat>
            label="Formato do crachá"
            value={formato}
            onChange={onFormato}
            options={[
              {
                value: 'Hmac',
                label: 'Assinatura simples',
                note: hmacDisponivel
                  ? 'Recomendada: nada a instalar, só uma chave secreta'
                  : 'Indisponível nesta instalação',
                drawing: <DesenhoDoFormato formato="Hmac" />,
                disabled: !hmacDisponivel && formato !== 'Hmac',
                className: 'min-w-36 flex-1 basis-0 text-center',
              },
              {
                value: 'Jwt',
                label: 'JWT',
                note: 'Pede uma biblioteca de JWT no servidor',
                drawing: <DesenhoDoFormato formato="Jwt" />,
                className: 'min-w-36 flex-1 basis-0 text-center',
              },
            ]}
          />
          {!hmacDisponivel && (
            <p
              className={cn(
                'text-caption leading-relaxed',
                hmac ? 'text-warn-fg' : 'text-fg-muted',
              )}
            >
              {hmac
                ? 'Esta instalação não tem a chave mestra da assinatura simples, então escolha o JWT para salvar.'
                : 'A assinatura simples precisa da chave mestra na instalação (IDENTITY_HMAC_KEY), então aqui só o JWT está disponível.'}
            </p>
          )}
        </div>
      </div>

      <ol aria-label="Passos" className="mt-6 flex flex-col">
        {hmac ? (
          <>
            <Passo numero={1} titulo="Copie a chave secreta" onde="No painel">
              <p>
                Guarde no servidor do seu sistema, numa variável de ambiente chamada{' '}
                {c('RELATOFACIL_SECRET')}, e nunca no código da página.
              </p>
              {/* Num dialogo, e nao indo para Chaves: quem esta no meio da configuracao, com
                  mudancas por salvar, pega a chave sem sair daqui. */}
              <div>
                <Button size="sm" onClick={() => setVendoAChave(true)}>
                  Ver a chave
                </Button>
              </div>
              <IdentitySecretDialog
                projectPublicId={projectId}
                open={vendoAChave}
                onOpenChange={setVendoAChave}
              />
            </Passo>

            <Passo numero={2} titulo="Faça o servidor gerar o crachá" onde="No seu servidor">
              <p>A cada página, para quem está na conta, o servidor monta estes valores:</p>
              <Valores>
                <Valor nome="Id">
                  o identificador da pessoa no seu sistema, sempre o mesmo para ela, como o id do
                  banco
                </Valor>
                <Valor nome="Validade">
                  quando o crachá vence, em segundos (o timestamp Unix), daqui a no máximo {minutos}{' '}
                  minutos
                </Valor>
                <Valor nome="Assinatura">
                  o HMAC-SHA256 do texto {c('id.validade')} (o id, um ponto e a validade), com a
                  chave do passo 1, em hexadecimal
                </Valor>
                <Valor nome="Nome">
                  o nome da pessoa, se quiser, só para o formulário já vir preenchido
                </Valor>
              </Valores>
              <p>O HMAC-SHA256 já vem em todas as linguagens, então não há nada para instalar.</p>
              {exemploDaFuncao}
            </Passo>

            {noScript}
          </>
        ) : (
          <>
            <Passo
              id="chave-publica"
              numero={1}
              titulo="Crie o par de chaves"
              onde="No painel"
              feito={chave.trim().length > 0}
            >
              <GerarParDeChaves chave={chave} onChave={onChave} />
            </Passo>

            <Passo numero={2} titulo="Faça o servidor gerar o crachá" onde="No seu servidor">
              <p>
                A cada página, para quem está na conta, o servidor gera um JWT assinado com a chave
                privada, no algoritmo ES256, com estes campos:
              </p>
              <Valores>
                <Valor nome={c('sub')}>
                  o identificador da pessoa no seu sistema, sempre o mesmo para ela, como o id do
                  banco
                </Valor>
                <Valor nome={c('aud')}>a chave pública deste projeto, {c(aud)}</Valor>
                <Valor nome={c('exp')}>
                  quando o crachá vence, daqui a no máximo {minutos} minutos
                </Valor>
                <Valor nome={c('name')}>
                  o nome da pessoa, se quiser, só para o formulário já vir preenchido
                </Valor>
              </Valores>
              <p>
                Use a biblioteca de JWT do seu sistema, e guarde a chave privada no servidor, fora
                de qualquer pasta que o site publica.
              </p>
              <p className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-warn-fg">
                Gere um crachá só para isto, e nunca use o token de login do usuário, porque o
                crachá serve só para relatar e vale poucos minutos.
              </p>
              {exemploDaFuncao}
            </Passo>

            {noScript}
          </>
        )}

        <Passo numero={4} titulo="Salve e teste" onde="No seu sistema" ultimo>
          <SalvarETestar hmac={hmac} />
        </Passo>
      </ol>

      <section
        aria-labelledby="regras-do-cracha"
        className="mt-6 flex flex-col gap-3 border-border border-t pt-5"
      >
        <div>
          <h4 id="regras-do-cracha" className="font-medium text-detail text-fg">
            Regras do crachá
          </h4>
          <p className="mt-0.5 text-caption text-fg-muted leading-relaxed">
            Já vêm com o padrão, e os passos acima seguem a validade escolhida.
          </p>
        </div>
        {/* Com a letra das explicacoes dos passos: as duas pecas escrevem na do pai. */}
        <div className="flex flex-col gap-3 text-caption text-fg-muted leading-relaxed">
          <div id="validade-do-cracha" className="scroll-mt-6">
            <CampoDaValidade valor={validade} invalida={validadeInvalida} onValor={onValidade} />
          </div>
          <div id="sem-cracha" className="scroll-mt-6">
            <ExigirCracha obrigatorio={obrigatorio} onObrigatorio={onObrigatorio} />
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * O codigo dos passos, no celular, de borda a borda do cartao: sai do recuo da coluna dos
 * numeros (32) e do respiro do grupo (16). Com os recuos, ele tinha uns 264px e rolava de
 * lado a cada linha; assim fica com quase a largura da tela.
 */
const CODIGO_NO_CELULAR =
  'max-sm:-ml-12 max-sm:-mr-4 max-sm:rounded-none max-sm:border-x-0 max-sm:shadow-none'

/**
 * O par de chaves do JWT, e a chave publica que fica aqui. **Nasce no navegador**: a
 * publica vai direto para o campo, e a privada so aparece aqui, para baixar, sem passar
 * pelo nosso servidor. Quem ja tem um par (ou prefere gerar no servidor) cola a publica no
 * campo recolhido.
 */
function GerarParDeChaves({ chave, onChave }: { chave: string; onChave: (chave: string) => void }) {
  const temChave = chave.trim().length > 0
  const [privada, setPrivada] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [falha, setFalha] = useState(false)
  const suportado = typeof window !== 'undefined' && window.crypto?.subtle !== undefined

  async function gerar() {
    setConfirmar(false)
    setGerando(true)
    setFalha(false)
    try {
      const par = await window.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      )
      const [pkcs8, spki] = await Promise.all([
        window.crypto.subtle.exportKey('pkcs8', par.privateKey),
        window.crypto.subtle.exportKey('spki', par.publicKey),
      ])
      setPrivada(emPem('PRIVATE KEY', pkcs8))
      onChave(emPem('PUBLIC KEY', spki))
    } catch {
      setFalha(true)
    } finally {
      setGerando(false)
    }
  }

  return (
    <>
      {privada ? (
        <div className="flex animate-fade-in flex-col gap-2.5 rounded-lg border border-warn-border bg-warn-surface px-3.5 py-3">
          <p className="font-medium text-warn-fg">
            Baixe a chave privada agora, porque ela não fica salva aqui e não aparece de novo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => baixarPem(privada)}>
              Baixar relatofacil-privada.pem
            </Button>
            <CopyButton value={privada} label="Copiar a chave" size="sm" variant="warn" />
          </div>
          <p className="text-warn-fg">
            A pública já ficou guardada aqui, então leve a privada para o servidor do seu sistema e
            salve esta tela.
          </p>
        </div>
      ) : (
        <p>
          {temChave
            ? 'A chave pública já está guardada aqui, e só vale gerar outro par se a privada se perdeu.'
            : 'Gere as duas chaves aqui mesmo, no seu navegador: a pública fica guardada aqui, e a privada você baixa e leva para o servidor.'}
        </p>
      )}

      {suportado && !confirmar && (
        <div>
          <Button
            size="sm"
            variant={privada || temChave ? 'secondary' : 'primary'}
            disabled={gerando}
            onClick={() => (temChave ? setConfirmar(true) : void gerar())}
          >
            {gerando
              ? 'Gerando…'
              : privada || temChave
                ? 'Gerar outro par'
                : 'Gerar o par de chaves'}
          </Button>
        </div>
      )}

      {confirmar && (
        <div className="flex animate-fade-in flex-wrap items-center gap-2 rounded-lg border border-warn-border bg-warn-surface px-3.5 py-2.5">
          <span className="min-w-0 flex-1 text-warn-fg">
            Gerar outro par troca a chave pública, e o seu servidor vai precisar da privada nova.
          </span>
          <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void gerar()}>
            Gerar outro par
          </Button>
        </div>
      )}

      {falha && (
        <p className="text-error-fg">
          Não deu para gerar aqui, então gere no seu servidor, com os comandos abaixo.
        </p>
      )}

      {/* Aberto quando ainda nao ha chave e o navegador nao gera: ai colar e o caminho. */}
      <details className="group/publica" open={!temChave && (!suportado || falha)}>
        <summary className="cursor-pointer text-fg transition-colors hover:text-fg-muted pointer-coarse:-my-3 pointer-coarse:py-3">
          Ver ou colar a chave pública
        </summary>
        <div className="mt-2.5 flex flex-col gap-2">
          <CampoDaChavePublica chave={chave} onChave={onChave} />
        </div>
      </details>

      <details className="group/terminal" open={!suportado || falha}>
        <summary className="cursor-pointer text-fg transition-colors hover:text-fg-muted pointer-coarse:-my-3 pointer-coarse:py-3">
          Prefere gerar no seu servidor?
        </summary>
        <div className="mt-2.5 flex flex-col gap-2.5">
          <p>
            Gere no servidor um par de chaves ECDSA P-256, a do ES256, e cole a pública em “Ver ou
            colar a chave pública”, logo acima. Com o OpenSSL, por exemplo:
          </p>
          <CodeEditor
            className={CODIGO_NO_CELULAR}
            files={[
              { id: 'chaves', name: 'terminal', language: 'shell', code: COMANDOS_DAS_CHAVES },
            ]}
          />
        </div>
      </details>
    </>
  )
}

/** A chave publica do sistema do cliente: a que confere a assinatura do JWT. */
function CampoDaChavePublica({
  chave,
  onChave,
}: {
  chave: string
  onChave: (chave: string) => void
}) {
  const semChave = chave.trim().length === 0
  return (
    <>
      <label htmlFor="chave-do-sistema" className="sr-only">
        Chave pública do seu sistema
      </label>
      <textarea
        id="chave-do-sistema"
        value={chave}
        onChange={(event) => onChave(event.target.value)}
        rows={4}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={semChave || undefined}
        placeholder={'-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----'}
        className={cn(
          'w-full rounded-lg border bg-surface-raised px-3 py-2 font-mono text-caption text-fg leading-relaxed transition-colors duration-150 placeholder:text-fg-placeholder',
          semChave ? 'border-warn-border' : 'border-border',
        )}
      />
      <p className={semChave ? 'text-warn-fg' : undefined}>
        {semChave
          ? 'Sem a chave pública este formato não salva: gere o par acima, ou cole aqui a sua.'
          : 'A pública só confere a assinatura, e por isso pode ficar aqui, à vista.'}
      </p>
    </>
  )
}

/**
 * O ultimo passo: salvar, e o que se ve quando da certo. O que conferir quando nao da fica
 * recolhido, para quem precisa: o atributo na pagina, a chave e o relogio do servidor (o
 * cracha vencido nao vale), e o script colado duas vezes, em que so o primeiro vale (ver
 * `start` no carregador).
 */
function SalvarETestar({ hmac }: { hmac: boolean }) {
  return (
    <>
      <p>
        Clique em Salvar no alto desta tela. Depois, entre no seu sistema com um usuário e abra o
        formulário: se aparecer “Ver os meus relatos”, está funcionando.
      </p>
      <details>
        <summary className="cursor-pointer text-fg transition-colors hover:text-fg-muted pointer-coarse:-my-3 pointer-coarse:py-3">
          Não apareceu?
        </summary>
        <ul className="mt-2.5 flex list-disc flex-col gap-1.5 pl-5">
          <li>
            Abra o código-fonte da página (botão direito, Exibir código-fonte) e procure{' '}
            {hmac ? (
              <>{c('data-user-signature')}, que deve trazer 64 letras e números.</>
            ) : (
              <>
                {c('data-identity')}, que deve trazer um texto comprido começando com {c('eyJ')}.
              </>
            )}
          </li>
          <li>
            {hmac
              ? 'Confira se o servidor usa a mesma chave do passo 1, e se o relógio dele está certo, porque crachá vencido não vale.'
              : 'Confira se o servidor usa a chave privada do mesmo par da pública guardada aqui, e se o relógio dele está certo, porque crachá vencido não vale.'}
          </li>
          <li>Não cole o script uma segunda vez na página, porque só o primeiro vale.</li>
        </ul>
      </details>
    </>
  )
}

/**
 * Um passo numerado: o numero num circulo, a linha ate o passo de baixo, o titulo com o
 * lugar onde ele acontece ("No painel", "No seu servidor") e o conteudo ao lado. **So o
 * passo da chave publica sabe se esta feito** (`feito`), porque e o unico que mora aqui; os
 * outros acontecem no sistema do cliente, e um "feito" neles seria palpite.
 */
function Passo({
  id,
  numero,
  titulo,
  onde,
  feito,
  ultimo = false,
  children,
}: {
  id?: string
  numero: number
  titulo: string
  /** Onde o passo acontece: no painel, no servidor do cliente ou no sistema dele. */
  onde: string
  /** Verdadeiro mostra o certo no lugar do numero. Ausente, o passo nao tem como saber. */
  feito?: boolean
  ultimo?: boolean
  children: ReactNode
}) {
  return (
    <li id={id} className="flex scroll-mt-6 gap-3 max-sm:gap-2">
      <div className="flex flex-none flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-6 items-center justify-center rounded-full border font-medium text-caption transition-colors duration-200',
            feito ? 'border-transparent bg-accent text-accent-fg' : 'border-border text-fg',
          )}
        >
          {feito ? (
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
              <path
                d="m3.5 8.5 3 3 6-7"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            numero
          )}
        </span>
        {!ultimo && <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={cn('flex min-w-0 flex-1 flex-col gap-2.5', !ultimo && 'pb-7')}>
        <h4 className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 font-medium text-detail text-fg">
          <span>
            <span className="sr-only">
              Passo {numero}
              {feito ? ', feito' : ''}:{' '}
            </span>
            {titulo}
          </span>
          <span className="rounded-full border border-border px-2 py-px font-normal text-caption text-fg-muted">
            {onde}
          </span>
        </h4>
        <div className="flex flex-col gap-2.5 text-caption text-fg-muted leading-relaxed">
          {children}
        </div>
      </div>
    </li>
  )
}

/**
 * Os valores que o servidor monta (ou os atributos que ele escreve), um por linha: o nome
 * e, ao lado, o que vai nele. **E a instrucao inteira, em palavras**: vale para qualquer
 * linguagem, e o codigo pronto fica recolhido no exemplo.
 */
function Valores({ children }: { children: ReactNode }) {
  return (
    <dl className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised px-3.5 py-3">
      {children}
    </dl>
  )
}

function Valor({ nome, children }: { nome: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
      <dt className="font-medium text-fg">{nome}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * O exemplo pronto, recolhido: quem programa abre e leva o codigo; quem so precisa saber o
 * que fazer le o passo e passa adiante.
 */
function Exemplo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details>
      <summary className="cursor-pointer text-fg transition-colors hover:text-fg-muted pointer-coarse:-my-3 pointer-coarse:py-3">
        {titulo}
      </summary>
      <div className="mt-2.5 flex flex-col gap-2.5">{children}</div>
    </details>
  )
}

/**
 * A instalacao da biblioteca do JWT, com o comando pronto para copiar. **Diz por que** antes
 * de pedir: o JWT e montado e assinado por uma biblioteca (a mais usada em cada linguagem), o
 * codigo do passo a importa, e sem ela ele nem roda. A assinatura simples nao precisa disso:
 * ela usa o HMAC que a propria linguagem ja traz.
 */
function Instalar({
  biblioteca,
  onde,
  comando,
}: {
  biblioteca: ReactNode
  onde: ReactNode
  comando: string
}) {
  return (
    <div>
      O código abaixo usa {biblioteca} para montar e assinar o crachá, e basta instalar uma vez,{' '}
      {onde}:
      <Comando valor={comando} />
    </div>
  )
}

/**
 * O que cada linguagem pede alem do codigo, uma frase cada: a biblioteca (so no JWT), onde
 * o arquivo fica, o que trocar nele e como a pagina recebe o cracha. **Muda junto com a
 * linguagem escolhida**: quem configura muitas vezes nao programa nela, e o arquivo
 * sozinho nao diz onde ele entra.
 */
function guiaDaLinguagem(
  linguagem: Linguagem,
  hmac: boolean,
  arquivo: string,
): { instalar: ReactNode; ondeCriar: string; notas: ReactNode[]; chamar: ReactNode } {
  const chaveNoAmbiente = (
    <>O código lê a chave de {c('RELATOFACIL_SECRET')}, a variável de ambiente do passo 1.</>
  )
  const privadaNaPasta = (
    <>
      Deixe o {c('relatofacil-privada.pem')} na pasta principal do sistema, de onde ele roda, e
      nunca numa pasta que o site publica.
    </>
  )
  switch (linguagem) {
    case 'node':
      return {
        instalar: hmac ? null : (
          <Instalar
            biblioteca={<>a biblioteca {c('jose')}</>}
            onde={<>na pasta do seu servidor onde fica o {c('package.json')}</>}
            comando="npm install jose"
          />
        ),
        ondeCriar: 'no seu servidor',
        notas: [hmac ? chaveNoAmbiente : privadaNaPasta],
        chamar: (
          <>
            Na rota que monta a página, chame{' '}
            {c(hmac ? 'crachaDeRelato(usuario)' : 'await crachaDeRelato(usuario)')} para quem está
            na conta e mande o resultado para a página como {c('cracha')}.
          </>
        ),
      }
    case 'php':
      return {
        instalar: hmac ? null : (
          <Instalar
            biblioteca={<>a biblioteca {c('firebase/php-jwt')}</>}
            onde={<>na pasta do seu servidor onde fica o {c('composer.json')}</>}
            comando="composer require firebase/php-jwt"
          />
        ),
        ondeCriar: 'no seu servidor',
        notas: [
          hmac ? (
            chaveNoAmbiente
          ) : (
            <>
              Deixe o {c('relatofacil-privada.pem')} uma pasta acima do {c(arquivo)}, fora da pasta
              pública do site, porque ali ninguém consegue baixá-lo.
            </>
          ),
        ],
        chamar: hmac ? (
          <>No começo da página, inclua o arquivo com {c("require 'cracha.php';")}.</>
        ) : (
          <>
            No começo da página, inclua o Composer e o arquivo com{' '}
            {c("require 'vendor/autoload.php';")} e {c("require 'cracha.php';")}, se o sistema ainda
            não carrega o Composer.
          </>
        ),
      }
    case 'python':
      return {
        instalar: hmac ? null : (
          <Instalar
            biblioteca={
              <>
                a biblioteca {c('PyJWT')}, com o pacote de criptografia que este tipo de assinatura
                pede
              </>
            }
            onde="no ambiente do seu servidor"
            comando={'pip install "pyjwt[crypto]"'}
          />
        ),
        ondeCriar: 'no seu servidor',
        notas: [hmac ? chaveNoAmbiente : privadaNaPasta],
        chamar: (
          <>
            Na view que monta a página, importe com {c('from cracha import cracha_de_relato')} e
            mande {c('cracha_de_relato(usuario)')} para a página como {c('cracha')}.
          </>
        ),
      }
    case 'csharp':
      return {
        instalar: hmac ? null : (
          <Instalar
            biblioteca={<>a biblioteca {c('System.IdentityModel.Tokens.Jwt')}, da Microsoft</>}
            onde={<>na pasta do projeto, onde fica o {c('.csproj')}</>}
            comando="dotnet add package System.IdentityModel.Tokens.Jwt"
          />
        ),
        ondeCriar: 'no seu servidor',
        notas: [hmac ? chaveNoAmbiente : privadaNaPasta],
        chamar: (
          <>
            Na página ou no controller, guarde{' '}
            {c(hmac ? 'Relato.CrachaDeRelato(id)' : 'Relato.CrachaDeRelato(id, nome)')} em{' '}
            {c('Cracha')} para quem está na conta.
          </>
        ),
      }
    case 'java':
      return {
        instalar: hmac ? null : (
          <div>
            O código abaixo usa a biblioteca {c('jjwt')} para montar e assinar o crachá, então
            acrescente ao seu {c('pom.xml')} as três dependências dela:
            <span className="mt-1.5 flex">
              <CopyButton
                value={DEPENDENCIAS_DO_JJWT}
                size="sm"
                variant="secondary"
                label="Copiar as dependências"
              />
            </span>
          </div>
        ),
        ondeCriar: 'na pasta do seu pacote',
        notas: [
          <>Troque a primeira linha, {c('package com.seusistema;')}, pelo pacote do seu sistema.</>,
          hmac ? chaveNoAmbiente : privadaNaPasta,
        ],
        chamar: (
          <>
            No controller, mande{' '}
            {c(hmac ? 'Relato.crachaDeRelato(id)' : 'Relato.crachaDeRelato(id, nome)')} para a
            página com {c('model.addAttribute("cracha", ...)')}.
          </>
        ),
      }
    case 'go':
      return {
        instalar: hmac ? null : (
          <Instalar
            biblioteca={<>a biblioteca {c('golang-jwt')}</>}
            onde={<>na pasta do módulo, onde fica o {c('go.mod')}</>}
            comando="go get github.com/golang-jwt/jwt/v5"
          />
        ),
        ondeCriar: 'no seu servidor',
        notas: [
          <>Se o seu pacote não for o {c('main')}, troque a primeira linha pelo nome dele.</>,
          hmac ? chaveNoAmbiente : privadaNaPasta,
        ],
        chamar: (
          <>
            No handler, mande {c(hmac ? 'CrachaDeRelato(id)' : 'CrachaDeRelato(id, nome)')} para a
            página como {c('Cracha')}
            {hmac ? '.' : ', e trate o erro que ela pode devolver.'}
          </>
        ),
      }
  }
}

/**
 * A pagina montada no navegador (React, Vue, Angular) nao tem modelo no servidor: ela pede
 * o cracha a propria API e escreve no script pelo JavaScript. Funciona porque o carregador
 * le o script **a cada abertura** do formulario, e nao so ao carregar.
 */
function PaginaNoNavegador({ hmac }: { hmac: boolean }) {
  return (
    <details>
      {/* No toque o resumo ganha 12 em cima e embaixo sem mover nada: numa linha so, o
          alvo tinha 20. */}
      <summary className="cursor-pointer text-fg transition-colors hover:text-fg-muted pointer-coarse:-my-3 pointer-coarse:py-3">
        A sua página é montada no navegador, com React, Vue ou Angular?
      </summary>
      <div className="mt-2.5 flex flex-col gap-2.5">
        <p>
          Faça a sua API devolver o crachá do passo 2 e, depois do login, escreva{' '}
          {hmac ? 'os atributos' : 'o atributo'} do passo 3 no script pelo JavaScript, porque o
          formulário lê o script a cada vez que abre. Um exemplo:
        </p>
        <CodeEditor
          className={CODIGO_NO_CELULAR}
          files={[
            {
              id: 'navegador',
              name: 'relato.js',
              language: 'js',
              code: hmac ? NAVEGADOR_HMAC : NAVEGADOR_JWT,
            },
          ]}
        />
      </div>
    </details>
  )
}

/** A validade do cracha dentro do que a API aceita. */
export function validadeValida(minutos: number): boolean {
  return (
    Number.isInteger(minutos) &&
    minutos >= IDENTITY_TOKEN_MINUTES.min &&
    minutos <= IDENTITY_TOKEN_MINUTES.max
  )
}

/** O desenho de cada formato: a chave da assinatura simples, e as chaves do JSON no JWT. */
function DesenhoDoFormato({ formato }: { formato: IdentityFormat }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {formato === 'Hmac' ? (
        <>
          <circle cx="8" cy="15" r="4" />
          <path d="m11 12 8-8M16 7l2 2M14.5 8.5l1.5 1.5" />
        </>
      ) : (
        <path d="M8 4c-2 0-2.5 1-2.5 3v2c0 1.5-.8 2.5-2 3 1.2.5 2 1.5 2 3v2c0 2 .5 3 2.5 3M16 4c2 0 2.5 1 2.5 3v2c0 1.5.8 2.5 2 3-1.2.5-2 1.5-2 3v2c0 2-.5 3-2.5 3" />
      )}
    </svg>
  )
}

/** A chave em PEM: o base64 dos bytes, em linhas de 64, entre as linhas de comeco e fim. */
function emPem(rotulo: 'PRIVATE KEY' | 'PUBLIC KEY', bytes: ArrayBuffer): string {
  let binario = ''
  for (const byte of new Uint8Array(bytes)) binario += String.fromCharCode(byte)
  const linhas = btoa(binario).match(/.{1,64}/g) ?? []
  return `-----BEGIN ${rotulo}-----\n${linhas.join('\n')}\n-----END ${rotulo}-----\n`
}

/** Baixa a chave privada como arquivo, sem ela sair do navegador. */
function baixarPem(conteudo: string) {
  const endereco = URL.createObjectURL(new Blob([conteudo], { type: 'application/x-pem-file' }))
  const link = document.createElement('a')
  link.href = endereco
  link.download = 'relatofacil-privada.pem'
  link.click()
  setTimeout(() => URL.revokeObjectURL(endereco), 1000)
}

/** A validade maxima do cracha, que os exemplos ja usam. */
function CampoDaValidade({
  valor,
  invalida,
  onValor,
}: {
  valor: number
  invalida: boolean
  onValor: (minutos: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-surface-raised px-3.5 py-3">
      <div className="min-w-0">
        <label
          htmlFor="validade-do-cracha-minutos"
          className="block font-medium text-detail text-fg"
        >
          Validade máxima do crachá
        </label>
        <p className={cn('mt-0.5', invalida && 'text-error-fg')}>
          {invalida
            ? `Use entre ${IDENTITY_TOKEN_MINUTES.min} e ${IDENTITY_TOKEN_MINUTES.max} minutos.`
            : 'Um crachá que vale por mais tempo que isso não é aceito, e o relato segue a regra de quem está sem crachá, logo abaixo.'}
        </p>
      </div>
      <NumberField
        id="validade-do-cracha-minutos"
        min={IDENTITY_TOKEN_MINUTES.min}
        max={IDENTITY_TOKEN_MINUTES.max}
        value={valor}
        invalid={invalida}
        unit="min"
        ariaLabel="Validade máxima do crachá, em minutos"
        // Campo vazio vira zero, que a conta recusa: apagar tudo para digitar outro
        // numero e o gesto comum, e `NaN` quebraria a comparacao do rascunho.
        onChange={(texto) => onValor(Number.parseInt(texto, 10) || 0)}
      />
    </div>
  )
}

/** O "exigir o cracha", o mesmo nos dois formatos. */
function ExigirCracha({
  obrigatorio,
  onObrigatorio,
}: {
  obrigatorio: boolean
  onObrigatorio: (obrigatorio: boolean) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised px-3.5 py-3">
      <Check
        checked={obrigatorio}
        onChange={onObrigatorio}
        label="Só aceitar relato de quem está na conta"
      />
      <p className="mt-1 pl-6">
        {obrigatorio
          ? 'Quem não está na conta não vê o formulário, e lê “Para relatar aqui, entre na sua conta neste site e abra o formulário de novo.”'
          : 'Quem não está na conta também relata, sem a lista dos relatos dela, voltando só pelo link, como no Protocolo. É o padrão.'}
      </p>
    </div>
  )
}

/**
 * A linguagem do servidor, lembrada neste navegador: quem configura volta a tela e
 * encontra a dele aberta. Sem armazenamento, comeca no Node e vale para esta visita.
 */
const LINGUAGEM_GUARDADA = 'pds.web.linguagem-do-servidor.v1'

function useLinguagemDoServidor(): [Linguagem, (linguagem: Linguagem) => void] {
  const [linguagem, setLinguagem] = useState<Linguagem>(() => {
    try {
      const guardada = localStorage.getItem(LINGUAGEM_GUARDADA)
      return LINGUAGENS.some((item) => item.valor === guardada) ? (guardada as Linguagem) : 'node'
    } catch {
      return 'node'
    }
  })

  function escolher(proxima: Linguagem) {
    setLinguagem(proxima)
    try {
      localStorage.setItem(LINGUAGEM_GUARDADA, proxima)
    } catch {
      // Sem armazenamento, a escolha vale ate sair da tela.
    }
  }

  return [linguagem, escolher]
}

/** As linguagens dos exemplos de servidor, na ordem das abas, com o arquivo de cada uma. */
type Linguagem = ServerLanguage

const LINGUAGENS: readonly {
  valor: Linguagem
  nome: string
  arquivo: string
  /** O modelo da pagina, onde o script da Instalacao ganha o cracha. */
  pagina: string
  realce: CodeLanguage
}[] = [
  { valor: 'node', nome: 'Node', arquivo: 'cracha.js', pagina: 'pagina.ejs', realce: 'js' },
  { valor: 'php', nome: 'PHP', arquivo: 'cracha.php', pagina: 'pagina.php', realce: 'php' },
  {
    valor: 'python',
    nome: 'Python',
    arquivo: 'cracha.py',
    pagina: 'pagina.html',
    realce: 'python',
  },
  { valor: 'csharp', nome: 'C#', arquivo: 'Relato.cs', pagina: 'Pagina.cshtml', realce: 'csharp' },
  { valor: 'java', nome: 'Java', arquivo: 'Relato.java', pagina: 'pagina.html', realce: 'java' },
  { valor: 'go', nome: 'Go', arquivo: 'cracha.go', pagina: 'pagina.html', realce: 'go' },
]

const COMANDOS_DAS_CHAVES =
  'openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out relatofacil-privada.pem\nopenssl ec -in relatofacil-privada.pem -pubout -out relatofacil-publica.pem'

/**
 * O modelo da pagina com o script da Instalacao e as linhas que a identidade acrescenta:
 * a primeira linha diz de onde vem o valor, e as novas chamam a funcao do passo anterior,
 * escrevem o resultado no script e somem para quem nao esta na conta. **O valor nunca e
 * colado por quem configura**: e o servidor que escreve, a cada pagina.
 */
function comScript(
  topo: readonly string[],
  novas: readonly string[],
  aud: string,
): { code: string; added: number[] } {
  const linhas = [
    ...topo,
    '<script',
    `  src="${LOADER_URL}"`,
    `  data-key="${aud}"`,
    ...novas.map((linha) => `  ${linha}`),
    '  defer></script>',
  ]
  // As novas vem depois do topo, do `<script`, do `src` e do `data-key`.
  const antes = topo.length + 3
  return { code: linhas.join('\n'), added: novas.map((_, indice) => antes + indice + 1) }
}

/** A assinatura simples na pagina, no modelo mais comum de cada linguagem. */
function paginaHmac(linguagem: Linguagem, aud: string) {
  switch (linguagem) {
    case 'node':
      return comScript(
        [
          '<%# cracha = crachaDeRelato(usuario), vindo da rota do Express,',
          '    ou null para quem não está na conta %>',
        ],
        [
          '<% if (cracha) { %>',
          '  data-user-id="<%= cracha.id %>"',
          '  data-user-name="<%= cracha.nome %>"',
          '  data-user-expires="<%= cracha.expira %>"',
          '  data-user-signature="<%= cracha.assinatura %>"',
          '<% } %>',
        ],
        aud,
      )
    case 'php':
      return comScript(
        ['<?php /* $usuario é quem está na conta,', '         ou null para quem não está */ ?>'],
        [
          '<?php if ($usuario): $cracha = crachaDeRelato($usuario); ?>',
          `  data-user-id="<?= htmlspecialchars($cracha['id']) ?>"`,
          `  data-user-name="<?= htmlspecialchars($cracha['nome'] ?? '') ?>"`,
          `  data-user-expires="<?= $cracha['expira'] ?>"`,
          `  data-user-signature="<?= $cracha['assinatura'] ?>"`,
          '<?php endif; ?>',
        ],
        aud,
      )
    case 'python':
      return comScript(
        [
          '{# cracha = cracha_de_relato(usuario), vindo da view #}',
          '{# ou None para quem não está na conta #}',
        ],
        [
          '{% if cracha %}',
          '  data-user-id="{{ cracha.id }}"',
          '  {% if cracha.nome %}data-user-name="{{ cracha.nome }}"{% endif %}',
          '  data-user-expires="{{ cracha.expira }}"',
          '  data-user-signature="{{ cracha.assinatura }}"',
          '{% endif %}',
        ],
        aud,
      )
    case 'csharp':
      return comScript(
        [
          '@* Model.Cracha = Relato.CrachaDeRelato(...), ou null para quem não está',
          '   na conta, e aí os valores ficam vazios *@',
        ],
        [
          'data-user-id="@Model.Cracha?.Id"',
          'data-user-expires="@Model.Cracha?.Expira"',
          'data-user-signature="@Model.Cracha?.Assinatura"',
        ],
        aud,
      )
    case 'java':
      return comScript(
        [
          '<!--/* cracha = Relato.crachaDeRelato(...), no model do controller,',
          '     ou null para quem não está na conta */-->',
        ],
        [
          `th:data-user-id="\${cracha?.id()}"`,
          `th:data-user-expires="\${cracha?.expira()}"`,
          `th:data-user-signature="\${cracha?.assinatura()}"`,
        ],
        aud,
      )
    case 'go':
      return comScript(
        [
          '{{/* .Cracha = CrachaDeRelato(...), vindo do handler,',
          '     ou nil para quem não está na conta */}}',
        ],
        [
          '{{with .Cracha}}',
          '  data-user-id="{{.ID}}"',
          '  data-user-expires="{{.Expira}}"',
          '  data-user-signature="{{.Assinatura}}"',
          '{{end}}',
        ],
        aud,
      )
  }
}

/** O crachá JWT na pagina, no modelo mais comum de cada linguagem. */
function paginaJwt(linguagem: Linguagem, aud: string) {
  switch (linguagem) {
    case 'node':
      return comScript(
        [
          '<%# cracha = await crachaDeRelato(usuario), vindo da rota do Express,',
          '    ou null para quem não está na conta %>',
        ],
        ['<% if (cracha) { %>', '  data-identity="<%= cracha %>"', '<% } %>'],
        aud,
      )
    case 'php':
      return comScript(
        ['<?php /* $usuario é quem está na conta,', '         ou null para quem não está */ ?>'],
        [
          '<?php if ($usuario): ?>',
          '  data-identity="<?= crachaDeRelato($usuario) ?>"',
          '<?php endif; ?>',
        ],
        aud,
      )
    case 'python':
      return comScript(
        [
          '{# cracha = cracha_de_relato(usuario), vindo da view #}',
          '{# ou None para quem não está na conta #}',
        ],
        ['{% if cracha %}', '  data-identity="{{ cracha }}"', '{% endif %}'],
        aud,
      )
    case 'csharp':
      return comScript(
        [
          '@* Model.Cracha = Relato.CrachaDeRelato(...), ou null para quem não está',
          '   na conta, e aí o valor fica vazio *@',
        ],
        ['data-identity="@Model.Cracha"'],
        aud,
      )
    case 'java':
      return comScript(
        [
          '<!--/* cracha = Relato.crachaDeRelato(...), no model do controller,',
          '     ou null para quem não está na conta */-->',
        ],
        [`th:data-identity="\${cracha}"`],
        aud,
      )
    case 'go':
      return comScript(
        [
          '{{/* .Cracha = CrachaDeRelato(...), vindo do handler,',
          '     ou vazio para quem não está na conta */}}',
        ],
        ['{{if .Cracha}}', '  data-identity="{{.Cracha}}"', '{{end}}'],
        aud,
      )
  }
}

/**
 * A assinatura simples em cada linguagem: HMAC-SHA256 de `id.expira`, em hexadecimal, com
 * a chave secreta lida do ambiente. E a mesma conta que a API confere.
 */
function exemploHmac(linguagem: Linguagem, minutos: number): string {
  switch (linguagem) {
    case 'node':
      return `import { createHmac } from 'node:crypto'\n\nexport function crachaDeRelato(usuario) {\n  const id = String(usuario.id)\n  const expira = Math.floor(Date.now() / 1000) + ${minutos} * 60\n  const assinatura = createHmac('sha256', process.env.RELATOFACIL_SECRET)\n    .update(\`\${id}.\${expira}\`)\n    .digest('hex')\n  return { id, nome: usuario.nome, expira, assinatura }\n}`
    case 'php':
      return `<?php\nfunction crachaDeRelato($usuario): array\n{\n    $id = (string) $usuario->id;\n    $expira = time() + ${minutos} * 60;\n    $assinatura = hash_hmac('sha256', $id . '.' . $expira, getenv('RELATOFACIL_SECRET'));\n\n    return ['id' => $id, 'nome' => $usuario->nome, 'expira' => $expira, 'assinatura' => $assinatura];\n}`
    case 'python':
      return `import hashlib\nimport hmac\nimport os\nimport time\n\n\ndef cracha_de_relato(usuario):\n    id = str(usuario.id)\n    expira = int(time.time()) + ${minutos} * 60\n    assinatura = hmac.new(\n        os.environ["RELATOFACIL_SECRET"].encode(),\n        f"{id}.{expira}".encode(),\n        hashlib.sha256,\n    ).hexdigest()\n    return {"id": id, "nome": usuario.nome, "expira": expira, "assinatura": assinatura}`
    case 'csharp':
      return `using System.Security.Cryptography;\nusing System.Text;\n\npublic static class Relato\n{\n    public static (string Id, long Expira, string Assinatura) CrachaDeRelato(string usuarioId)\n    {\n        var expira = DateTimeOffset.UtcNow.AddMinutes(${minutos}).ToUnixTimeSeconds();\n        var segredo = Encoding.UTF8.GetBytes(Environment.GetEnvironmentVariable("RELATOFACIL_SECRET")!);\n        var assinatura = Convert.ToHexString(\n            HMACSHA256.HashData(segredo, Encoding.UTF8.GetBytes($"{usuarioId}.{expira}"))).ToLowerInvariant();\n        return (usuarioId, expira, assinatura);\n    }\n}`
    case 'java':
      return `package com.seusistema; // troque pelo pacote do seu sistema\n\nimport java.nio.charset.StandardCharsets;\nimport java.security.GeneralSecurityException;\nimport java.util.HexFormat;\nimport javax.crypto.Mac;\nimport javax.crypto.spec.SecretKeySpec;\n\npublic class Relato {\n    public record Cracha(String id, long expira, String assinatura) {}\n\n    public static Cracha crachaDeRelato(String usuarioId) {\n        long expira = System.currentTimeMillis() / 1000 + ${minutos} * 60;\n        try {\n            Mac mac = Mac.getInstance("HmacSHA256");\n            mac.init(new SecretKeySpec(\n                System.getenv("RELATOFACIL_SECRET").getBytes(StandardCharsets.UTF_8), "HmacSHA256"));\n            String assinatura = HexFormat.of().formatHex(\n                mac.doFinal((usuarioId + "." + expira).getBytes(StandardCharsets.UTF_8)));\n            return new Cracha(usuarioId, expira, assinatura);\n        } catch (GeneralSecurityException erro) {\n            throw new IllegalStateException(erro);\n        }\n    }\n}`
    case 'go':
      return `package main // troque pelo pacote do seu sistema, se for outro\n\nimport (\n\t"crypto/hmac"\n\t"crypto/sha256"\n\t"encoding/hex"\n\t"fmt"\n\t"os"\n\t"time"\n)\n\ntype Cracha struct {\n\tID         string\n\tExpira     int64\n\tAssinatura string\n}\n\nfunc CrachaDeRelato(usuarioID string) *Cracha {\n\texpira := time.Now().Add(${minutos} * time.Minute).Unix()\n\tmac := hmac.New(sha256.New, []byte(os.Getenv("RELATOFACIL_SECRET")))\n\tmac.Write([]byte(fmt.Sprintf("%s.%d", usuarioID, expira)))\n\treturn &Cracha{ID: usuarioID, Expira: expira, Assinatura: hex.EncodeToString(mac.Sum(nil))}\n}`
  }
}

/** O JWT ES256 em cada linguagem, com a biblioteca mais comum dela. */
function exemploJwt(linguagem: Linguagem, aud: string, minutos: number): string {
  switch (linguagem) {
    case 'node':
      return `// npm install jose\nimport { readFileSync } from 'node:fs'\nimport { importPKCS8, SignJWT } from 'jose'\n\nconst privada = await importPKCS8(readFileSync('relatofacil-privada.pem', 'utf8'), 'ES256')\n\nexport function crachaDeRelato(usuario) {\n  return new SignJWT({ name: usuario.nome })\n    .setProtectedHeader({ alg: 'ES256' })\n    .setSubject(String(usuario.id))\n    .setAudience('${aud}')\n    .setIssuedAt()\n    .setExpirationTime('${minutos}m')\n    .sign(privada)\n}`
    case 'php':
      return `<?php\n// composer require firebase/php-jwt\nuse Firebase\\JWT\\JWT;\n\nfunction crachaDeRelato($usuario): string\n{\n    // a chave fica uma pasta acima desta, fora da pasta pública do site\n    $privada = file_get_contents(__DIR__ . '/../relatofacil-privada.pem');\n\n    return JWT::encode([\n        'sub' => (string) $usuario->id,\n        'name' => $usuario->nome,\n        'aud' => '${aud}',\n        'iat' => time(),\n        'exp' => time() + ${minutos} * 60,\n    ], $privada, 'ES256');\n}`
    case 'python':
      return `# pip install "pyjwt[crypto]"\nimport time\n\nimport jwt\n\nwith open("relatofacil-privada.pem") as arquivo:\n    PRIVADA = arquivo.read()\n\n\ndef cracha_de_relato(usuario):\n    agora = int(time.time())\n    return jwt.encode(\n        {\n            "sub": str(usuario.id),\n            "name": usuario.nome,\n            "aud": "${aud}",\n            "iat": agora,\n            "exp": agora + ${minutos} * 60,\n        },\n        PRIVADA,\n        algorithm="ES256",\n    )`
    case 'csharp':
      return `// dotnet add package System.IdentityModel.Tokens.Jwt\nusing System.IdentityModel.Tokens.Jwt;\nusing System.Security.Claims;\nusing System.Security.Cryptography;\nusing Microsoft.IdentityModel.Tokens;\n\npublic static class Relato\n{\n    // A chave privada importada UMA vez, ao subir, e nunca descartada: a biblioteca\n    // guarda um provedor de assinatura por chave, e dispor o ECDsa quebraria a segunda chamada.\n    static readonly ECDsa Chave = ImportarChave(System.IO.File.ReadAllText("relatofacil-privada.pem"));\n\n    static ECDsa ImportarChave(string pem)\n    {\n        var ecdsa = ECDsa.Create();\n        ecdsa.ImportFromPem(pem);\n        return ecdsa;\n    }\n\n    public static string CrachaDeRelato(string usuarioId, string? nome)\n    {\n        var claims = new List<Claim> { new("sub", usuarioId) };\n        if (nome is not null) claims.Add(new("name", nome));\n\n        var token = new JwtSecurityToken(\n            audience: "${aud}",\n            claims: claims,\n            expires: DateTime.UtcNow.AddMinutes(${minutos}),\n            signingCredentials: new SigningCredentials(\n                new ECDsaSecurityKey(Chave), SecurityAlgorithms.EcdsaSha256));\n\n        return new JwtSecurityTokenHandler().WriteToken(token);\n    }\n}`
    case 'java':
      return `package com.seusistema; // troque pelo pacote do seu sistema\n\n// pom.xml: jjwt-api, jjwt-impl e jjwt-jackson (io.jsonwebtoken), versão 0.12.6\nimport io.jsonwebtoken.Jwts;\nimport java.nio.file.Files;\nimport java.nio.file.Path;\nimport java.security.KeyFactory;\nimport java.security.PrivateKey;\nimport java.security.spec.PKCS8EncodedKeySpec;\nimport java.time.Instant;\nimport java.util.Base64;\nimport java.util.Date;\n\npublic class Relato {\n    // A chave privada lida uma vez só, na primeira vez que a classe é usada.\n    private static final PrivateKey PRIVADA = lerPrivada();\n\n    private static PrivateKey lerPrivada() {\n        try {\n            String pem = Files.readString(Path.of("relatofacil-privada.pem"))\n                .replaceAll("-----(BEGIN|END) PRIVATE KEY-----", "")\n                .replaceAll("\\\\s", "");\n            return KeyFactory.getInstance("EC")\n                .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(pem)));\n        } catch (Exception erro) {\n            throw new IllegalStateException("Não deu para ler relatofacil-privada.pem", erro);\n        }\n    }\n\n    public static String crachaDeRelato(String usuarioId, String nome) {\n        Instant agora = Instant.now();\n        return Jwts.builder()\n            .subject(usuarioId)\n            .claim("name", nome)\n            .audience().add("${aud}").and()\n            .issuedAt(Date.from(agora))\n            .expiration(Date.from(agora.plusSeconds(${minutos} * 60)))\n            .signWith(PRIVADA, Jwts.SIG.ES256)\n            .compact();\n    }\n}`
    case 'go':
      return `package main // troque pelo pacote do seu sistema, se for outro\n\n// go get github.com/golang-jwt/jwt/v5\nimport (\n\t"os"\n\t"time"\n\n\t"github.com/golang-jwt/jwt/v5"\n)\n\nfunc CrachaDeRelato(usuarioID, nome string) (string, error) {\n\tpem, err := os.ReadFile("relatofacil-privada.pem")\n\tif err != nil {\n\t\treturn "", err\n\t}\n\tprivada, err := jwt.ParseECPrivateKeyFromPEM(pem)\n\tif err != nil {\n\t\treturn "", err\n\t}\n\tagora := time.Now()\n\treturn jwt.NewWithClaims(jwt.SigningMethodES256, jwt.MapClaims{\n\t\t"sub":  usuarioID,\n\t\t"name": nome,\n\t\t"aud":  "${aud}",\n\t\t"iat":  agora.Unix(),\n\t\t"exp":  agora.Add(${minutos} * time.Minute).Unix(),\n\t}).SignedString(privada)\n}`
  }
}

const c = (texto: string) => <code className="font-mono text-fg wrap-anywhere">{texto}</code>

/** Um comando de terminal com o copiar ao lado. */
function Comando({ valor }: { valor: string }) {
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-2">
      <code className="rounded-md border border-border bg-surface-raised px-2 py-1 font-mono text-fg wrap-anywhere">
        {valor}
      </code>
      <CopyButton
        value={valor}
        size="sm"
        variant="secondary"
        label="Copiar o comando"
        // `max-sm:pointer-coarse:h-auto`: no toque o `Button` fixa 44 depois do `max-sm:`.
        className="max-sm:h-auto max-sm:min-h-11 max-sm:max-w-full max-sm:py-2 max-sm:pointer-coarse:h-auto"
      />
    </span>
  )
}

const DEPENDENCIAS_DO_JJWT = ['jjwt-api', 'jjwt-impl', 'jjwt-jackson']
  .map(
    (artefato, indice) =>
      `<dependency>\n  <groupId>io.jsonwebtoken</groupId>\n  <artifactId>${artefato}</artifactId>\n  <version>0.12.6</version>${indice > 0 ? '\n  <scope>runtime</scope>' : ''}\n</dependency>`,
  )
  .join('\n')

const NAVEGADOR_JWT = `// depois do login, e de novo antes de o crachá vencer
const script = document.querySelector('script[data-key]')
const resposta = await fetch('/api/cracha-de-relato') // a sua rota, que chama a função do passo 3
script.dataset.identity = await resposta.text()

// ao sair da conta
delete script.dataset.identity`

const NAVEGADOR_HMAC = `// depois do login, e de novo antes de vencer
const script = document.querySelector('script[data-key]')
const resposta = await fetch('/api/cracha-de-relato') // a sua rota, que chama a função do passo 2
const cracha = await resposta.json() // { id, nome, expira, assinatura }
script.dataset.userId = cracha.id
script.dataset.userName = cracha.nome ?? ''
script.dataset.userExpires = String(cracha.expira)
script.dataset.userSignature = cracha.assinatura

// ao sair da conta
for (const campo of ['userId', 'userName', 'userExpires', 'userSignature']) {
  delete script.dataset[campo]
}`
