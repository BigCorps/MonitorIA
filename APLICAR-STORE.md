# Aplicar — correções para a Microsoft Store

Extraia o ZIP **na raiz do repositório**, sobrescrevendo. Os caminhos já estão
corretos. Nenhum diff manual é necessário.

```bash
cd /caminho/para/MonitorIA
unzip -o monitoria-store-fixes.zip
git status
```

## Arquivos do pacote

| Caminho | O que mudou |
|---|---|
| `.github/workflows/build-agent.yml` | valida o instalador da Store; novo `env.PUBLISHER_NAME` |
| `agent/package.json` | `--windows-publisher` corrigido |
| `src/lib/installer-data.ts` | novo `storeInstallerUrlFor()` |
| `docs/MICROSOFT-STORE.md` | reescrito, domínio `.cam`, URL versionada |
| `installer/monitoria.ico` | 32×32 → multi-resolução até 256×256 |
| `scripts/validar-instalador-store.ps1` | **novo** — validação em VM |
| `scripts/bump-agent-version.mjs` | **novo** — bump de versão em 11 arquivos |
| `store-assets/LEIA-ME.md` | **novo** — textos prontos da listagem |
| `store-assets/logo-300x300.png` | **novo** — logo do Partner Center |
| `store-assets/logo-2160x2160.png` | **novo** — reserva |
| `APLICAR-STORE.md` | este arquivo, pode apagar depois |

## Detalhe de cada correção

### 1. O CI não validava o binário da Store

`Resumo do build` inspecionava apenas `dist\MonitorIA-Setup.exe`. O
`MonitorIA-Store-Setup.exe` — o único que a Microsoft baixa e executa — saía sem
nenhuma verificação.

Agora os dois passam por: `Status = Valid`, carimbo de tempo presente, `Subject`
do certificado contendo `PUBLISHER_NAME`, e certificado com mais de 30 dias de
validade. O SHA256 de cada um vai para o summary do workflow, que é onde você
confere o arquivo depois de publicar a URL.

### 2. `--windows-publisher="BIGCORPS"`

O recurso `CompanyName` do `monitoria-agent.exe` dizia `BIGCORPS`, enquanto o
Authenticode e o `AppPublisher` do Inno dizem `BIGCORPS TECNOLOGIA LTA`.
Corrigido para os três baterem.

### 3. URL da Store

`installerUrlFor()` normaliza tudo para `releases/latest/download` de propósito
— para o painel, isso está certo: um deploy antigo continua servindo o Agent
mais recente. **Essa função não foi alterada.**

O problema era usar esse mesmo endereço na Store, onde conteúdo mutável na URL
submetida é motivo de remoção do app. Foi adicionado `storeInstallerUrlFor()`,
que monta a URL com a tag e rejeita `latest`, `0.15` ou `agent-v0.15.3`.

### 4. Ícone

Era 32×32 apenas. Agora tem 16, 24, 32, 48, 64, 128 e 256 px, gerado do
`public/logo.png`. Afeta o `SetupIconFile` do Inno e o `--windows-icon` do
build do Agent.

### 5. Bump de versão (`scripts/bump-agent-version.mjs`)

A versão do Agent aparece em **11 arquivos e 23 lugares**. Trocar na mão é
onde se perde tempo e se descobre o erro tarde.

```bash
node scripts/bump-agent-version.mjs --check      # confere consistência
node scripts/bump-agent-version.mjs 1.0.0 --dry-run
node scripts/bump-agent-version.mjs 1.0.0
```

O script recusa versão inválida, igual à atual ou menor (sem `--force`), e
aborta sem escrever nada se qualquer arquivo tiver um número de ocorrências
diferente do previsto — sinal de que a estrutura mudou e o bump cego deixaria
de ser seguro. Ao final, varre o repositório atrás de sobras e imprime os
próximos passos com a URL da nova release já montada.

**Armadilha que ele resolve:** `test/agent-0102-production.test.ts` valida os
workflows com regex escapado (`/AGENT_VERSION: "0\.15\.3"/`). Uma busca
literal por `0.15.3` não encontra essa forma, o bump passa incompleto e o
`npm test` quebra depois com uma mensagem que não deixa claro que o problema é
de versão. O script trata as duas formas.

## Sobre o `package.json` da raiz

**Deixado como está, em `1.0.0`, de propósito.** É a versão do app web, que é
independente da versão do Agent (`0.15.3`). Não é inconsistência, e alterar
quebraria a leitura do histórico de deploys. Nenhum teste depende dele.

## Depois de extrair

```bash
npm install
npm run check
npm test
git diff
```

Confira especialmente que `test/agent-0102-production.test.ts` continua
passando — ele valida `AGENT_VERSION === "0.15.3"` e o conteúdo dos dois
workflows.

```bash
node scripts/bump-agent-version.mjs --check
```

Deve terminar com "Versão consistente em todos os alvos".

```bash
git add -A
git commit -m "store: valida instalador da Store no CI, corrige publisher e URL versionada"
git push origin main
```

Aguarde o Actions terminar e abra o summary do run. Você deve ver a tabela com
os dois instaladores, ambos `Valid`, carimbo `sim`.

## Sequência até a submissão

1. ✅ aplicar este pacote, `npm test`, push
2. ✅ conferir o summary do Actions
3. ⬜ **teste em DVR real** — único item que ainda bloqueia o 1.0.0
4. ⬜ `git tag agent-v0.15.3 && git push origin agent-v0.15.3`
   > Para promover a 1.0.0 depois: `node scripts/bump-agent-version.mjs 1.0.0`
5. ⬜ baixar o `MonitorIA-Store-Setup.exe` da release
6. ⬜ `scripts\validar-instalador-store.ps1` em VM limpa
7. ⬜ screenshots e conta de demonstração (`store-assets/LEIA-ME.md`)
8. ⬜ Partner Center → Novo produto → EXE or MSI app → reservar `MonitorIA`
9. ⬜ preencher e submeter
10. ⬜ certificação, até 3 dias úteis

> **A tag é o passo 4 e não pode ser pulada.** Hoje a última tag do repositório
> é `agent-v0.10.7`. Sem `agent-v0.15.3`, o `Publicar release` não roda e o
> instalador existe apenas como artifact do Actions — que expira em 30 dias e
> exige login, e por isso não serve como URL da Store.
