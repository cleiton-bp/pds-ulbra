/**
 * O arquivo do codigo pessoal, para quem prefere guardar a copiar.
 *
 * **Um texto que se explica sozinho**: a pessoa abre o arquivo meses depois, talvez em outro
 * aparelho, e precisa entender sem o formulario na frente o que e o codigo e onde usar.
 *
 * **Sem o link do relato e sem token nenhum.** O arquivo pode parar em qualquer pasta ou
 * conversa, e o codigo ja basta para a lista; o link, que abre um relato direto, fica so na
 * tela de confirmacao.
 */
export function personalCodeFile(
  code: string,
  site: string | null,
  agora: Date,
): { nome: string; conteudo: string } {
  const quando = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(agora)

  const linhas = [
    `Seu código pessoal: ${code}`,
    '',
    'Neste navegador você não precisa dele: os seus relatos já aparecem em "Ver os meus relatos".',
    '',
    'Em outro celular, computador ou navegador, abra o formulário de relato do site, entre em "Ver os meus relatos" e digite este código.',
    '',
    ...(site ? [`Site: ${site}`] : []),
    `Salvo em: ${quando}`,
    '',
  ]

  return { nome: nomeDoArquivo(site), conteudo: linhas.join('\n') }
}

/**
 * O nome diz de qual site e o codigo: quem relata em dois sites guarda dois arquivos, e
 * `codigo-pessoal.txt` duas vezes na mesma pasta viraria `codigo-pessoal (1).txt`.
 */
function nomeDoArquivo(site: string | null): string {
  const pedaco = (site ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return pedaco ? `codigo-pessoal-${pedaco}.txt` : 'codigo-pessoal.txt'
}

/** Baixa o texto como arquivo, sem ele sair do navegador. */
export function downloadTextFile({ nome, conteudo }: { nome: string; conteudo: string }): void {
  const endereco = URL.createObjectURL(new Blob([conteudo], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = endereco
  link.download = nome
  link.click()
  // Depois do clique o navegador ja tem o arquivo; liberar na hora cortaria o download.
  setTimeout(() => URL.revokeObjectURL(endereco), 1000)
}
