# O balde da mídia

O `implantar.sh` aplica estes arquivos a cada deploy, com o administrador do MinIO, e o resto do
sistema nunca usa o administrador.

| Arquivo | O que é |
|---|---|
| `politica-api.json` | O que a API pode: ler, gravar e apagar arquivos do balde `relatofacil-midia`. Nem listar o balde, nem administrar o MinIO |
| `politica-copias.json` | O que a cópia de segurança pode: listar, ler e devolver arquivos do mesmo balde. Nunca apagar |
| `expiracao.json` | Os envios que não foram confirmados (`uploads/`) somem em 1 dia |
