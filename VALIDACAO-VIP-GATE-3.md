# Validação — MonitorIA VIP Gate 3

## Base

- GitHub `main` verificado: `a2846e99894194e612371b58b616a24780e639a7`.
- Vercel production para esse SHA: `READY`.
- Next.js da base: 16.3.8.

## Supabase

Migration aplicada via MCP:

- `20261001171911_monitoria_vip_gate3_trial_state_sync`

Smoke test transacional aprovado e revertido:

1. Projeto VIP fictício em `ready_for_trial`;
2. trial fictício em `ready`;
3. update do trial para `running`;
4. trigger moveu o Projeto VIP para `trial_running`;
5. update do trial para `exploration`;
6. trigger moveu o Projeto VIP para `trial_completed`;
7. histórico de estados persistido durante a transação;
8. `ROLLBACK` deixou zero resíduos.

Advisors: nenhuma finding específica nova para a função/trigger do Gate 3.

## Segurança

- função do trigger fica em schema `private`;
- `SECURITY DEFINER` com `search_path=''`;
- execução revogada de `public`, `anon` e `authenticated`;
- vendedor recebe apenas métricas/status;
- helper ao vivo não consulta usuário/senha/RTSP/credenciais;
- vendedor não chama `/api/assistant/query`, evitando consumir perguntas do cliente;
- cliente usa a franquia existente do próprio trial.

## Aplicação

Validações locais do overlay:

- parser TypeScript/TSX em 26 arquivos do overlay: 0 erros sintáticos;
- testes específicos do Gate 3: 5/5 aprovados;
- testes Gate 3 verificam fonte única de relógio, integração com Pesquisa IA e ausência de credenciais no snapshot;
- o build completo do repositório continua sendo validado pela Vercel após upload, pois este ambiente não possui o checkout/node_modules integral do projeto.

## Comportamento esperado

### Cliente

- confirma início somente quando o trial está `ready`;
- `start_sales_monitoria_trial` faz nova verificação de readiness;
- vê o mesmo `capture_ends_at` armazenado no banco;
- acompanha câmera/Agent/eventos/perguntas;
- usa Pesquisa IA dentro do onboarding;
- após 60 minutos, novas capturas encerram e a Pesquisa IA continua consultando dados já coletados.

### Vendedor

- abre o mesmo link de resultado comercial que já existe;
- em projetos VIP recebe painel ao vivo adicional;
- vê o mesmo timer e métricas operacionais;
- não vê credenciais e não pergunta em nome do cliente.
