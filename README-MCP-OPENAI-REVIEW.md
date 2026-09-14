# MonitorIA — MCP / correção para reenvio à OpenAI

Este pacote corrige inconsistências concretas encontradas no MCP atual que podem
fazer os mesmos casos de teste escolherem tools diferentes ou devolverem
contratos diferentes.

## Corrigido

- `get_monitoria_capabilities` passa a usar a lista canônica de tools.
- As 3 tools que estavam registradas, mas ausentes da resposta de capabilities,
  deixam de divergir: `get_routine_summary`, `get_process_summary` e
  `get_operation_patterns`.
- `get_monitoria_capabilities` passa a funcionar mesmo com várias organizações
  autorizadas e sem `organization_id`, retornando a lista de organizações e
  `scope_selection_required: true`.
- `MCP_TOOLSET_VERSION` deixa de poder voltar para uma versão antiga por variável
  de ambiente.
- exemplos de produção passam a usar `https://monitoria.cam/mcp` sem `www`.
- removido o bypass temporário `MCP_STATIC_TEST_TOKEN`.
- `ask_monitoria` passa a ser explicitamente a entrada padrão para perguntas
  operacionais em linguagem natural, reduzindo variação de seleção de tools.

Não há migration Supabase neste pacote.

## Aplicar

Extraia na raiz do repositório e rode:

```bash
python3 APLICAR-MCP-OPENAI-REVIEW.py
python3 VERIFICAR-MCP-OPENAI-REVIEW.py
npm run check
npm test
npm run build
```

## Vercel Production

Confirme:

```text
MCP_PUBLIC_BASE_URL=https://monitoria.cam
MCP_RESOURCE_URI=https://monitoria.cam/mcp
```

Remova, se existirem:

```text
MCP_TOOLSET_VERSION
MCP_STATIC_TEST_TOKEN
MCP_STATIC_TEST_USER_ID
MCP_STATIC_TEST_ORG_ID
```

A versão `MonitorIA v1.0.0` do envio da OpenAI é a versão do app submetido.
Ela não precisa ser igual à versão interna do servidor/toolset MCP.

## Depois do deploy

1. Refaça a verificação das ferramentas usando `https://monitoria.cam/mcp`.
2. Faça OAuth normal.
3. Rode cada caso de teste em conversa nova.
4. Use a mesma organização de homologação.
5. Se a conta tiver mais de uma organização, comece por
   `get_monitoria_capabilities` e use o ID retornado.
6. Só então reenvie.

O e-mail da OpenAI não informa qual caso falhou e a lista exata dos casos
submetidos não apareceu no repositório nem nos arquivos anteriores localizados.
Para fechar a validação 1:1, precisamos copiar/capturar do painel da OpenAI os
prompts e resultados esperados do envio anterior.
