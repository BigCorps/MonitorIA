# FECHAR STORE 1.0.0 — somente GitHub web

Este é o arquivo de execução rápida para finalizar a etapa sem Codespace.

## 1. Aplicar este ZIP

Suba o conteúdo do ZIP na raiz do repositório preservando os caminhos.

Este pacote não altera o código executável do Agent. Ele atualiza somente a
documentação e os materiais de publicação/certificação.

## 2. Rodar o build Windows manual

GitHub → Actions → **Build MonitorIA Agent** → **Run workflow** → `main`.

Só continue se estiver verde.

No resumo, confirme:

- Microsoft Store installer gerado;
- assinatura `Valid`;
- carimbo de tempo `sim`;
- sem falha de publisher/certificado.

## 3. Criar a release/tag no GitHub web

GitHub → Releases → **Draft a new release**.

- Tag: `agent-v1.0.0`
- Target: `main`
- Title: `MonitorIA Agent 1.0.0`
- Description: copiar `store-assets/RELEASE-NOTES-1.0.0.md`

Publique a release.

A tag dispara os workflows oficiais.

## 4. Esperar Actions

Confirmar que o Windows ficou verde.
O Linux também deve executar para x64/arm64.

## 5. Conferir os assets

Na release `agent-v1.0.0`, confirmar:

- `MonitorIA-Setup.exe`
- `MonitorIA-Store-Setup.exe`

Não faça upload manual por cima desses arquivos.

## 6. Conferir a URL da Microsoft

```text
https://github.com/BigCorps/MonitorIA/releases/download/agent-v1.0.0/MonitorIA-Store-Setup.exe
```

Abra a URL em janela anônima e confirme que o download começa.

## 7. Validar assinatura

Baixe o arquivo no Windows e confira Propriedades → Assinaturas Digitais.

Ou use PowerShell:

```powershell
Get-AuthenticodeSignature .\MonitorIA-Store-Setup.exe | Format-List
```

O status esperado é:

```text
Valid
```

## 8. Partner Center

Usar:

```text
store-assets/PARTNER-CENTER-1.0.0.md
```

## 9. Antes de Submit

Faltam somente itens de submissão, não de Agent:

- screenshots finais;
- senha da conta `reviewer@monitoria.cam`;
- confirmação de que a conta de revisão não expira/bloqueia o avaliador.

Depois disso, enviar para certificação.

## 10. Amanhã

Enquanto a certificação estiver ocorrendo, validar ponta a ponta:

- cadastro;
- onboarding;
- primeiro local;
- instalação;
- pareamento;
- descoberta;
- dashboard;
- Pesquisa IA;
- eventos;
- trial;
- planos;
- perfil/configurações.

Supabase, Vercel e GitHub podem ser usados em modo de consulta para conferir o
que acontece em produção durante esses testes.
