# Modelagem de dados

As modelagens do PDS, uma por etapa. Cada `.yaml` guarda entidades, campos, relações e as notas de explicação.

Editadas pelo canvas do [editor](../) (`npm run dev`) ou direto no editor de texto — os dois escrevem no mesmo arquivo, e o editor avisa quando o arquivo muda por fora.

| Arquivo | Cobre |
|---|---|
| `example.yaml` | ponto de partida: `Account` e `User`, uma relação presa aos campos e duas notas com seta |
| `stage-1.yaml` | etapa 1 — conta, usuário, projeto e chaves |
| `stage-2.yaml` | etapa 2 — o mesmo da etapa 1, sem alteração, mais domínios autorizados, relato, contexto e evento |

O `example.yaml` existe para conhecer o editor.

Nomes seguem o [glossário](../../../local/decisoes-de-projeto.md): entidade e campo em inglês, `label` e `note` em português.

O formato está documentado no [README do editor](../README.md#o-formato-do-arquivo).
