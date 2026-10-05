# MonitorIA — continuidade canônica

**Canonização baseada em:** `5ec04250523c38a162918580161fe5ba2701794f`  
**Data da consolidação:** 5 de outubro de 2026

Este arquivo descreve o estado que um próximo agente deve assumir sem reconstruir a história por Gates antigos.

## Estado do produto

O MonitorIA Standard e o MonitorIA VIP estão em produção no mesmo repositório e compartilham o núcleo técnico. O Agent 1.0.3 permanece congelado.

### Concluído

- Standard comercial em produção.
- VIP com pacotes 10/50/150 e todas as câmeras técnicas em `intensive`.
- Robustez Gates 1–3 concluídos: estado operacional, discovery/deduplicação e diagnóstico/recovery assistido.
- Landing comercial Standard/VIP reorganizada para dor → prova → diferenciação → produto.
- VIP com venda assistida por vendedor.
- Link individual do vendedor, landing assistida e acompanhamento do onboarding/piloto.
- Clarity limitado à landing pública; telas privadas usam acompanhamento estruturado.
- Trial VIP autoritativo de 60 minutos e até 6 câmeras.
- Evidência em vídeo preservada no modo Intensive e reproduzível/baixável no detalhe do acontecimento.
- Pesquisa IA determinística com fallback generativo.
- Piloto de `gpt-6-luna` isolado no VIP; Standard permanece `gpt-5-nano`.

## Próxima etapa

**Testes completos do VIP com cliente/piloto real**, incluindo:

1. landing assistida e Clarity;
2. convite/conta/onboarding;
3. Multi-Site e discovery;
4. readiness das câmeras;
5. início explícito do piloto;
6. relógio de 60 minutos;
7. acontecimentos e vídeos preservados;
8. Pesquisa IA;
9. resultado/proposta/Pix/ativação;
10. permissões e isolamento;
11. cenários de recovery;
12. não regressão do Standard.

Se Luna passar em qualidade, estabilidade e custo no VIP, a promoção ao Standard será uma decisão separada.

## Agent

- Core atual: 1.0.3.
- Não alterar `agent/**` durante testes VIP.
- Backlog futuro: `docs/MONITORIA-AGENT-1.0.4-BACKLOG.md`.
- A 1.0.4 deve consolidar watchdog/restart/telemetria local, não receber mudanças fragmentadas.

## IA

Fonte técnica: `src/ai/model-policy.ts`.

| Track | Modelo atual |
|---|---|
| Standard | `gpt-5-nano` |
| VIP | `gpt-6-luna` (piloto) |

O plano `intensive` isoladamente não seleciona Luna. O vínculo da organização a um Projeto VIP é o discriminador.

## Produção

- Supabase: `xwejfayeackbrilipgrj`.
- Vercel: `prj_5YEoHm2nwgMhcQZooDGSYm4okdvk`.
- Domínio: `monitoria.cam`.
- VIP: `vip.monitoria.cam`.
- Branch principal: `main`.

## Regras de trabalho

Leia primeiro `AGENTS.md`. Para contrato comercial/funcional, leia `docs/PRODUCT-CONTRACT.md`. Para a release local atual, leia `docs/releases/MONITORIA-1.0.3-CONTRACT.md`.

O histórico de Gates removido desta canonização continua recuperável pelo Git e não deve ser recriado na raiz.
