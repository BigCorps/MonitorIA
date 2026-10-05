# MonitorIA — contrato atual do produto

**Fonte humana canônica para regras comerciais e funcionais.**  
Última consolidação: 5 de outubro de 2026.

O runtime continua sendo protegido por código, testes, catálogo do Supabase e migrations. Uma mudança comercial só está completa quando esses contratos e este documento permanecem alinhados.

## 1. Identidade

- Produto padrão: MonitorIA.cam.
- VIP: MonitorIA VIP.
- Slogan: importar de `src/lib/app-config.ts`.
- O vídeo contínuo permanece no equipamento/local do cliente.
- O MonitorIA organiza acontecimentos e evidências selecionadas; não é gravação contínua em nuvem.

## 2. Limites permanentes

- sem reconhecimento facial para identidade civil;
- sem promessa de leitura automática de placas;
- continuidade de pessoas/veículos é correspondência provável e não biométrica;
- resultados de IA podem conter erro e devem ser confrontados com a gravação original quando a decisão for relevante;
- o MonitorIA não substitui DVR/NVR, alarmes, controle de acesso ou vigilância humana.

# 3. Standard

## 3.1 Cobrança

Cobrança por câmera ativa, em ciclos de 30 dias, com Pix. Não há mensalidade fixa por conta, empresa ou local.

## 3.2 Planos

Catálogo verificado em produção em 5/10/2026:

| Plano | Código | Mensal | Histórico | Imagens | Vídeo preservado |
|---|---|---:|---:|---:|---|
| Essencial | `basic` | R$ 39,90 | 365 dias | 1 | não |
| Atenta | `standard` | R$ 79,90 | 365 dias | 2 | não |
| Detalhada | `intensive` | R$ 149,90 | 365 dias | 3 | sim, até 310 s, retenção 30 dias |

A gravação contínua permanece local. O vídeo preservado é evidência do acontecimento, não uma cópia contínua da câmera.

## 3.3 Trial Standard

- modo `self_service`;
- 1 câmera;
- 24 horas de análise real;
- qualquer plano técnico pode ser avaliado;
- 7 dias para explorar resultados;
- 21 perguntas ao Assistente no trial;
- sem cartão;
- relógio só começa depois da prontidão e da confirmação do usuário.

## 3.4 Desconto progressivo

Desconto marginal por posição da câmera:

| Posição | Desconto |
|---|---:|
| 1–2 | 0% |
| 3–4 | 5% |
| 5–8 | 10% |
| 9–16 | 15% |
| 17+ | 20% |

## 3.5 Pesquisa IA

- 90 interações mensais por organização no contrato Standard vigente;
- buscas/filtros/abertura de eventos não devem consumir pergunta;
- falha não deve consumir pergunta;
- planejamento e resposta são determinísticos quando possível;
- fallback generativo Standard: `gpt-5-nano` durante o piloto Luna do VIP.

## 3.6 Instalação

O cliente instala o programa do MonitorIA e conclui a descoberta/configuração pelo painel. Linguagem técnica de conexão deve permanecer fora da interface comum sempre que houver equivalente simples.

# 4. VIP

## 4.1 Modelo comercial

VIP não é divulgado como aquisição aberta. O vendedor cria/apresenta a oportunidade e pode acompanhar a jornada do lead.

Todas as câmeras VIP usam o plano técnico `intensive`.

Catálogo verificado em produção em 5/10/2026:

| Pacote | Inclui | Mensal | Anual | Excedente mensal |
|---|---:|---:|---:|---:|
| VIP 10 | 10 câmeras | R$ 1.299 | R$ 12.990 | R$ 129/câmera |
| VIP 50 | 50 câmeras | R$ 4.999 | R$ 49.990 | R$ 99/câmera |
| VIP 150 | 150 câmeras | R$ 11.990 | R$ 119.900 | R$ 79/câmera |

## 4.2 Jornada assistida

- vendedor gera link individual;
- landing pode ser acompanhada via Clarity;
- token real do convite não fica exposto na URL da landing/Clarity;
- quando o lead está pronto, segue para o convite e onboarding já existentes;
- vendedor acompanha estados estruturados da implantação e do piloto;
- Clarity não entra no dashboard/onboarding privado.

## 4.3 Trial VIP

- modo `sales_assisted`;
- 60 minutos;
- até 6 câmeras;
- todas `intensive`;
- início explícito apenas depois da prontidão;
- relógio autoritativo server-side;
- vendedor acompanha sem consumir a Pesquisa IA do cliente.

## 4.4 Evidência em vídeo

O modo Intensive preserva o vídeo do acontecimento quando disponível no pipeline, com teto atual de 310 segundos e retenção contratual de 30 dias. O detalhe do acontecimento pode reproduzir e baixar o `preserved_clip`.

## 4.5 IA VIP

Durante o piloto atual:

- visão/perfil/fallback generativo VIP: `gpt-6-luna`;
- reasoning do Vision Luna: `low`;
- Standard permanece `gpt-5-nano`;
- o vínculo com Projeto VIP decide o track; `intensive` sozinho não decide;
- promoção de Luna ao Standard depende dos testes VIP.

# 5. Estado operacional e robustez

Estados de produto e diagnóstico devem distinguir, entre outros:

- conectando/configurando;
- pronto;
- monitorando;
- atenção necessária;
- offline.

Nunca inferir monitoramento apenas porque a câmera/Agent aparece online. Ausência de eventos também não prova falha.

# 6. Agent

Core atual: 1.0.3.

Nenhum Gate web/backend/comercial deve alterar `agent/**` enquanto o backlog 1.0.4 não for aprovado como lote. O escopo futuro está em `docs/MONITORIA-AGENT-1.0.4-BACKLOG.md`.
