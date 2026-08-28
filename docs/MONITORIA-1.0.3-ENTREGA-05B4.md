# MonitorIA 1.0.3 — Fase 05B.4

## Objetivo

Fechar a pendência de assinatura Authenticode do desinstalador Inno Setup (`unins000.exe`) sem alterar o Core 1.0.3, o transporte, o pareamento, o RTSP, as evidências ou o backend.

## Causa confirmada

O instalador 24/7 já possuía `SignTool=monitoria` e `SignedUninstaller=yes`, mas somente dentro de `#ifdef SignCommand`. O workflow da RC compilava sem `/DSignCommand` e assinava apenas o `MonitorIA-Setup.exe` depois da compilação. Nesse ponto o `unins000.exe` já estava embutido sem assinatura.

O instalador Store também não ativava `SignedUninstaller`.

## Correção

1. O workflow passa `/DSignCommand=1` e registra o SignTool `monitoria` no ISCC.
2. O SignTool chama `scripts/sign-inno-authenticode.ps1`, que usa o mesmo SSL.com/eSigner já inicializado no job Windows.
3. O wrapper exige Authenticode `Valid` e carimbo de tempo antes de devolver o arquivo ao Inno.
4. O Inno passa a assinar durante a compilação:
   - o Setup 24/7;
   - o uninstaller 24/7;
   - o Setup Store;
   - o uninstaller Store.
5. As duas ações extras que assinavam apenas os Setups depois da compilação são removidas, evitando assinatura duplicada e chamadas remotas desnecessárias.
6. O workflow registra cada chamada do SignTool e falha se um dos canais não tiver pelo menos Setup + uninstaller assinados.
7. O contrato da RC valida estruturalmente esse comportamento no push.

## Escopo preservado

Nenhuma alteração em:

- `agent/src/**`;
- Supabase;
- Vercel;
- pareamento;
- WinSW/serviço;
- timeline/evidências;
- URLs públicas;
- tag `agent-v1.0.3`;
- publicação da 1.0.3;
- Microsoft Store submission.

## Validação de campo após o novo RC

Instalar o Windows 24/7 por cima da instalação atual e executar:

```powershell
Get-AuthenticodeSignature "C:\Program Files\MonitorIA\unins000.exe" |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

Esperado: `Status : Valid` e `TimeStamperCertificate` preenchido.

Para o pacote Store, após a instalação de validação:

```powershell
Get-AuthenticodeSignature "$env:LOCALAPPDATA\Programs\MonitorIA\unins000.exe" |
  Format-List Status, StatusMessage, SignerCertificate, TimeStamperCertificate
```

A desinstalação funcional deve ser testada somente depois de registrar as evidências de assinatura e confirmar que o pacote usado é o RC correto.
