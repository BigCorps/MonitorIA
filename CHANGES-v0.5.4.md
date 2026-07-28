# MonitorIA v0.5.4

Corrige a falha:

```text
Failed to extract executable for 'bun-windows-x64-baseline-v1.3.14'
```

## Causa

O workflow instalava o Bun padrão para Windows e usava
`--target=bun-windows-x64-baseline`. Durante a compilação, o Bun tentava
baixar e extrair uma segunda cópia do runtime baseline.

## Correção

- instala diretamente `bun-windows-x64-baseline.zip`;
- fixa o Bun em 1.3.14;
- desativa o cache do instalador;
- compila para a plataforma atual sem `--target`;
- impede carregamento de `.env` e `bunfig.toml` no executável;
- executa `monitoria-agent.exe reset` no próprio workflow;
- só publica o artifact quando o executável realmente inicia.
