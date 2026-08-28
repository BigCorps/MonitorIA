# MonitorIA 1.0.3 — Entrega 05B.4.1

## Objetivo

Corrigir a assinatura Authenticode do uninstaller gerado pelo Inno Setup sem
alterar o Core 1.0.3, os instaladores `.iss` ou a arquitetura da Release Candidate.

## Falha observada na 05B.4

O Inno Setup 6.7.1 chama o SignTool do uninstaller ainda no arquivo temporário:

`uninst.e32.tmp`

A SSL.com/eSigner rejeita esse caminho por extensão e responde:

`Unsupported file format for signing - tmp`

O conteúdo do arquivo é um executável PE válido; o problema é a extensão usada
para a chamada ao serviço de assinatura.

## Correção

`scripts/sign-inno-authenticode.ps1` agora:

1. valida que o arquivo recebido começa com a assinatura PE `MZ`;
2. cria uma cópia temporária byte-a-byte chamada `monitoria-inno-sign.exe`;
3. envia somente essa cópia `.exe` para a SSL.com/eSigner;
4. valida Authenticode e timestamp na cópia assinada;
5. repõe os mesmos bytes assinados no caminho original fornecido pelo Inno,
   inclusive quando ele termina em `.tmp`;
6. compara SHA-256 para garantir reposição byte-a-byte;
7. mantém no log o nome original (`uninst.e32.tmp` ou Setup final) para as
   guardas do workflow continuarem distinguindo Setup e uninstaller.

## Escopo

Arquivos alterados:

- `scripts/sign-inno-authenticode.ps1`
- `test/agent-0103-release-candidate-contract.test.ts`

Documento novo:

- `docs/MONITORIA-1.0.3-ENTREGA-05B4.1.md`

Não altera:

- `agent/src/**`
- RTSP/timeline
- filas/evidências
- pareamento
- Supabase
- Vercel
- `monitoria.iss`
- `monitoria-service-v103.iss`
- `monitoria-store-v103.iss`
- workflow de build

## Validação esperada

No build Windows, o trecho do Inno deve continuar mostrando o Sign Tool para
`uninst.e32.tmp`, mas o erro `Unsupported file format for signing - tmp` não
deve mais aparecer.

Ao instalar o novo RC 24/7:

```powershell
Get-AuthenticodeSignature "C:\Program Files\MonitorIA\unins000.exe" |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

Resultado esperado:

`Status : Valid`

A tag `agent-v1.0.3`, publicação, URL pública e envio à Microsoft continuam
bloqueados até a validação final.
