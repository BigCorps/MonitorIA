# Aplicação da INT-6

## Dependências

Confirme INT-2, INT-3, INT-3.8 e INT-5.

## Ordem

1. Execute `006-staff-operational-profiles-v1.sql` no banco de homologação.
2. Extraia o ZIP preservando caminhos.
3. Execute o instalador em `--dry-run`.
4. Aplique o instalador.
5. Execute `npm run check` e `npm run build`.
6. Configure o cron.
7. Habilite uma câmera de homologação.
8. Revise candidatos e correspondências antes de produção.

```bash
node MonitorIA-inteligencia-fase-6/scripts/apply-fase-6.mjs --repo . --dry-run
node MonitorIA-inteligencia-fase-6/scripts/apply-fase-6.mjs --repo .
npm run check
npm run build
```

## Habilitação inicial

```sql
update public.cameras
set staff_profile_intelligence_enabled = true
where id = 'CAMERA_UUID';
```

O pacote não aplica SQL nem modifica GitHub ou Vercel automaticamente.
