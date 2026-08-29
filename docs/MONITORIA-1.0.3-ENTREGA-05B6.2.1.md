# MonitorIA 1.0.3 — Fase 05B6.2.1

Correção pontual da migration de proteção de texto gerado.

A trava interna do 05B6.2 detectou corretamente que `interae7e3o` exigia duas passagens: a conversão de `e7` para `ç` cria o contexto alfabético necessário para converter o `e3` seguinte em `ã`.

O normalizador agora repete as mesmas substituições conservadoras até o texto convergir. Cada substituição encurta o texto, portanto o loop termina naturalmente. Permanecem as três asserções executadas pela própria migration antes da criação do trigger:

- `balce3o` → `balcão`;
- `interae7e3o` → `interação`;
- `código E3 isolado` permanece inalterado.

A tentativa anterior no Supabase foi abortada pela própria migration e a transação foi revertida; função e trigger não ficaram instalados.

Nenhuma mudança de release, tag, download público, versão recomendada ou Microsoft Store.
