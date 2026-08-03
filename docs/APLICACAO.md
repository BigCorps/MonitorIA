# Aplicação da INT-7

1. Confirme INT-3.5, INT-3.8 e INT-6.
2. Execute `supabase/migrations/20260802230000_camera_health_drift_v1.sql`.
3. Faça dry-run do instalador.
4. Aplique o instalador.
5. Rode `npm run check`, testes e `npm run build`.
6. Implante web e Agent juntos.
7. Habilite uma câmera de homologação:

```sql
update public.cameras
set health_intelligence_enabled = true,
    health_observation_interval_seconds = 300
where id = 'CAMERA_UUID';
```

8. Aguarde observações estáveis e aprove a referência proposta no dashboard.
9. Agende `/api/cron/camera-health` a cada 5 minutos com `Authorization: Bearer $CRON_SECRET`.

Rollback: `supabase/migrations/rollback_camera_health_drift_v1.sql` e `scripts/restore-fase-7.mjs`.
