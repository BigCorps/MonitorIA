# MonitorIA v0.7.2

Revisão consolidada da v0.7 antes da ativação do monitoramento contínuo.

## Região

- mantém o projeto Supabase atual em `us-west-2`;
- configura Vercel Functions em `pdx1`, região equivalente a `us-west-2`;
- não trata a migração para São Paulo como obrigação jurídica;
- deixa `sa-east-1` como decisão comercial e arquitetural futura.

## Privacidade e transferência internacional

- documenta que o vídeo contínuo permanece local;
- esclarece que quadros selecionados saem do estabelecimento;
- proíbe a afirmação absoluta “seu vídeo nunca sai da loja”;
- exige verificação específica das cláusulas-padrão brasileiras;
- não presume que SCCs europeias equivalem às cláusulas da ANPD.

## Segurança e retenção herdadas da v0.7.1

- policy segura do Storage antes do cast para UUID;
- remoção do índice parcial duplicado;
- `search_path = ''` nas funções de autorização;
- retenção de quadros-chave e metadados em 90 dias;
- expurgo diário via Vercel Cron e `CRON_SECRET`;
- `local_track_id` restrito ao evento;
- leitura de placas desativada na v1.

## Ações de painel

- cadastrar `CRON_SECRET` na Vercel;
- ativar Leaked Password Protection no Supabase quando disponível no plano;
- revisar os DPAs e mecanismos de transferência antes do primeiro cliente
  externo em produção.
