# Validação — MonitorIA VIP Gate 6

## Base

- GitHub `main`: `8b5aa8bdc3ecc14d84c2eed02b30e67fbe32a0f2`.
- Gate 5 + Build Fix 1 já estavam passando na Vercel antes deste Gate.
- Node do projeto: 22.x.
- Next.js: 16.3.8.
- `vip.monitoria.cam` já está configurado pelo usuário.

## Supabase aplicado

- `20261002141513_monitoria_vip_gate6_public_lead_queue`
- `20261002141720_monitoria_vip_gate6_atomic_lead_conversion`

### Segurança verificada

`vip_lead_requests`:
- RLS: ativo.
- `anon`: sem SELECT e sem INSERT.
- `authenticated`: sem SELECT e sem INSERT.
- `service_role`: SELECT/INSERT permitidos pelo backend.

`convert_vip_lead_request_v1`:
- `anon`: EXECUTE = false.
- `authenticated`: EXECUTE = false.
- `service_role`: EXECUTE = true.

O advisor informa que `vip_lead_requests` tem RLS sem policies. Isto é
intencional: a tabela também não concede acesso a `anon`/`authenticated`; somente
o backend service-role trabalha com a fila.

Os índices novos aparecem como ainda não usados, o que é esperado antes de a
landing receber leads reais.

## Smoke test transacional

Foi executado um teste dentro de `BEGIN ... ROLLBACK`:

1. criou um interesse fictício com 52 câmeras;
2. converteu para `VIP50`;
3. criou o Projeto VIP;
4. criou exatamente um convite de 60 minutos;
5. confirmou `vip_lead_requests.status = converted`;
6. confirmou Projeto em `invited`;
7. fez rollback.

Após o rollback:
- leads de smoke persistidos: 0;
- projetos de smoke persistidos: 0.

## Validação local do overlay

- 8/8 testes específicos do Gate 6 aprovados.
- 10 arquivos TS/TSX analisados pelo parser TypeScript em Node 22.
- 0 erros sintáticos.
- sem modelo mini introduzido no runtime;
- sem chaves `sk-*`, `sb_secret_*`, JWTs ou private keys;
- nenhum arquivo do Agent/Windows foi alterado.

## Limite desta validação

O build completo depende do restante do repositório e será validado pelo
GitHub Actions/Vercel depois do upload. O Gate 6 é um overlay sobre o `main`,
não um repositório completo.
