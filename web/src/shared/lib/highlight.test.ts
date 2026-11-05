import { describe, expect, it } from 'vitest'
import { type CodeLanguage, highlight, type TokenKind } from '@/shared/lib/highlight'

/**
 * O QUE ESTES TESTES TRAVAM: o realce nunca muda o codigo (os pedacos juntos sao o
 * codigo inteiro, letra por letra), e cada tipo cai na cor certa nos casos que os
 * exemplos do painel usam.
 */
const tipoDe = (code: string, language: CodeLanguage, texto: string): TokenKind | undefined =>
  highlight(code, language).find((pedaco) => pedaco.text === texto)?.kind

const EXEMPLOS: Record<CodeLanguage, string> = {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: e codigo de exemplo, com o marcador do template de proposito
  js: "import { x } from 'y'\nconst a = `${b}.${c}` // nota\nfoo(1.5)",
  php: "<?php\n$id = (string) $u->id; # nota\nhash_hmac('sha256', $id . '.', 'k');",
  python: 'import os\n# nota\nx = f"{a}.{b}"\nhmac.new(1)',
  csharp: 'using System;\nvar x = $"{a}.{b}"; // nota\nFoo(2);',
  java: 'import java.util.HexFormat;\nlong e = 15 * 60; // nota\nmac.init(k);',
  go: 'import (\n\t"os"\n)\nfunc F() { x := `raw` } // nota',
  html: '<!-- nota -->\n<script\n  data-key="pk_1"\n  defer></script>',
  json: '{\n  "sub": "1",\n  "exp": 15\n}',
  shell: 'openssl ec -in a.pem -pubout | openssl pkcs8 # nota',
}

describe('highlight', () => {
  for (const [language, code] of Object.entries(EXEMPLOS)) {
    it(`${language}: os pedacos juntos sao o codigo inteiro`, () => {
      const pedacos = highlight(code, language as CodeLanguage)
      expect(pedacos.map((pedaco) => pedaco.text).join('')).toBe(code)
    })
  }

  it('separa reservada, texto, numero, comentario e funcao no JavaScript', () => {
    const code = EXEMPLOS.js
    expect(tipoDe(code, 'js', 'import')).toBe('keyword')
    expect(tipoDe(code, 'js', "'y'")).toBe('string')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: o pedaco esperado e o template do exemplo
    expect(tipoDe(code, 'js', '`${b}.${c}`')).toBe('string')
    expect(tipoDe(code, 'js', '// nota')).toBe('comment')
    expect(tipoDe(code, 'js', 'foo')).toBe('name')
    expect(tipoDe(code, 'js', '1.5')).toBe('number')
  })

  it('a aspa dentro de comentario continua comentario', () => {
    expect(tipoDe("// it's 'x'", 'js', "// it's 'x'")).toBe('comment')
  })

  it('a variavel do PHP tem cor propria', () => {
    expect(tipoDe(EXEMPLOS.php, 'php', '$id')).toBe('variable')
    expect(tipoDe(EXEMPLOS.php, 'php', 'hash_hmac')).toBe('name')
  })

  it('no JSON, a chave e nome e o valor e texto', () => {
    expect(tipoDe(EXEMPLOS.json, 'json', '"sub"')).toBe('name')
    expect(tipoDe(EXEMPLOS.json, 'json', '"1"')).toBe('string')
  })

  it('no HTML, a etiqueta, o atributo e o valor', () => {
    expect(tipoDe(EXEMPLOS.html, 'html', '<script')).toBe('tag')
    expect(tipoDe(EXEMPLOS.html, 'html', 'data-key')).toBe('name')
    expect(tipoDe(EXEMPLOS.html, 'html', '"pk_1"')).toBe('string')
    expect(tipoDe(EXEMPLOS.html, 'html', '<!-- nota -->')).toBe('comment')
  })

  it('nos modelos de pagina, as marcas do codigo sao reservadas e o comentario e comentario', () => {
    const ejs = '<%# nota %>\n<% if (c) { %>\n  data-identity="<%= c %>"\n<% } %>'
    expect(tipoDe(ejs, 'html', '<%# nota %>')).toBe('comment')
    expect(tipoDe(ejs, 'html', '<%')).toBe('keyword')
    expect(tipoDe(ejs, 'html', '%>')).toBe('keyword')
    expect(tipoDe(ejs, 'html', '"<%= c %>"')).toBe('string')
    const jinja = '{# nota #}\n{% if c %}x="{{ c }}"{% endif %}'
    expect(tipoDe(jinja, 'html', '{# nota #}')).toBe('comment')
    expect(tipoDe(jinja, 'html', '{%')).toBe('keyword')
    expect(tipoDe('<?php if ($u): ?>', 'html', '<?php')).toBe('keyword')
    expect(tipoDe('<?php if ($u): ?>', 'html', '?>')).toBe('keyword')
    expect(tipoDe('@* nota *@', 'html', '@* nota *@')).toBe('comment')
    expect(tipoDe('{{/* nota */}}\n{{if .C}}', 'html', '{{/* nota */}}')).toBe('comment')
    for (const code of [ejs, jinja, '<?php if ($u): ?>', '{{/* nota */}}\n{{if .C}}{{end}}'])
      expect(
        highlight(code, 'html')
          .map((pedaco) => pedaco.text)
          .join(''),
      ).toBe(code)
  })

  it('no terminal, o comando e a opcao', () => {
    expect(tipoDe(EXEMPLOS.shell, 'shell', 'openssl')).toBe('name')
    expect(tipoDe(EXEMPLOS.shell, 'shell', '-pubout')).toBe('keyword')
    expect(tipoDe(EXEMPLOS.shell, 'shell', '# nota')).toBe('comment')
  })
})
