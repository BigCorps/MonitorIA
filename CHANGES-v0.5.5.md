# MonitorIA v0.5.5

Corrige a falha no Windows PowerShell 5.1:

```text
Não é possível localizar o tipo
[System.Security.Cryptography.ProtectedData]
```

## Alterações

- carrega explicitamente a biblioteca `System.Security`;
- mantém fallback para `System.Security.Cryptography.ProtectedData`;
- define `ErrorActionPreference = Stop`;
- troca segredos entre Node e PowerShell somente em Base64 ASCII;
- preserva senhas RTSP com acentos e caracteres Unicode;
- melhora a mensagem de erro e remove o formato CLIXML;
- adiciona o comando `monitoria-agent.exe self-test`;
- testa o DPAPI antes de consumir qualquer código de pareamento;
- o GitHub Actions executa o autoteste DPAPI antes de publicar o artifact.
