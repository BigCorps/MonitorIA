# Fechamento técnico — Robustez Gates 2/3 e 3/3

## Estado observado antes deste patch

- `main`: `443c72037074e8afaebfd4be622e659a77043fbe`
- Vercel: sucesso no SHA acima.
- `Validate Web App`: 459/460 testes aprovados.
- Única falha do Web App: contrato do teste `falha real do monitor contínuo é separada de RTSP e plano`.

## Causa

O diagnóstico correto diz:

> “...a última falha registrada pertence ao monitor contínuo, não ao plano ou ao perfil.”

O teste usava:

```ts
assert.doesNotMatch(diagnosis.summary, /plano|perfil.*pendente/i);
```

Esse regex rejeitava qualquer ocorrência da palavra `plano`, inclusive a frase correta que explicava que o plano **não** era a causa.

## Correção

O contrato agora rejeita apenas diagnósticos que apresentem indevidamente esses estados como pendentes:

```ts
assert.doesNotMatch(diagnosis.summary, /plano\s+pendente|perfil\s+pendente/i);
```

Nenhum arquivo de produção foi alterado.

## Escopo deste overlay

- 1 teste corrigido.
- 0 arquivos `agent/**`.
- 0 migrations.
- 0 alterações de backend/frontend de produção.
- 0 alterações em cobrança, trial, entitlement ou autenticação.

## Store / Agent

O workflow de Store que falhou no SHA anterior procurava `build/monitoria-store-launcher.exe`. Isso não pertence aos Gates de robustez web/backend e não deve ser “resolvido” mascarando o workflow ou alterando o Agent 1.0.3. Permanece separado para a trilha futura do Agent/Store.
