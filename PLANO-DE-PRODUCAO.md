# MonitorIA.cam — Plano completo de produção v1.0

**Documento-base para implementação e lançamento comercial**  
**Data de consolidação:** 31 de julho de 2026  
**Produto atual:** MonitorIA.cam v0.8.2  
**Meta:** MonitorIA.cam v1.0.0 comercial  
**Responsável:** BigCorps Tecnologia

---

## 1. Objetivo deste documento

Este documento define a ordem oficial de implementação necessária para transformar o MonitorIA.cam em um produto comercial completo, seguro, autônomo e pronto para divulgação.

A meta não é publicar um beta, uma demonstração com dados falsos ou um sistema com etapas manuais escondidas. O lançamento público somente acontecerá quando a jornada completa estiver funcional:

1. criação da conta;
2. instalação do Agent;
3. descoberta e configuração da câmera;
4. teste gratuito;
5. análise real dos acontecimentos;
6. consulta pelo dashboard e pela IA;
7. escolha dos planos;
8. geração e confirmação do Pix;
9. ativação e renovação das câmeras;
10. suspensão e reativação automáticas;
11. retenção e exclusão corretas;
12. operação, segurança, suporte e documentação.

Homologação interna, testes automatizados e ambiente separado de produção continuam obrigatórios. Eles não representam um beta público; representam os controles mínimos de um produto de produção.

---

## 2. Visão do produto

O MonitorIA.cam transforma câmeras de segurança comuns em uma memória visual pesquisável.

O vídeo contínuo permanece no DVR, NVR, câmera ou computador do cliente. O MonitorIA seleciona acontecimentos relevantes, envia imagens escolhidas para análise e organiza:

- horário;
- descrição;
- pessoas;
- veículos;
- objetos;
- zonas;
- nível de confiança;
- imagens principais;
- clipes curtos, quando contratados;
- evidências usadas nas respostas da IA.

O cliente pode pesquisar acontecimentos sem assistir horas de gravação e, quando necessário, usar o horário encontrado para consultar o vídeo completo no equipamento local.

### 2.1 O que o MonitorIA não será na v1

- não será um serviço de gravação contínua em nuvem;
- não substituirá o DVR ou NVR;
- não exigirá troca das câmeras compatíveis;
- não utilizará reconhecimento facial na v1;
- não utilizará reconhecimento avançado de placas na v1;
- não dependerá de instalação assistida obrigatória;
- não exigirá cartão de crédito;
- não realizará renovação automática sem ação do cliente.

---

## 3. Decisões comerciais congeladas para a v1

### 3.1 Cobrança

- nenhuma mensalidade fixa por conta;
- nenhuma mensalidade fixa por empresa;
- nenhuma mensalidade fixa por local;
- cobrança somente por câmera ativa;
- uma única fatura por organização;
- pagamento por Pix BigCorps;
- geração do Pix no dashboard;
- confirmação automática pelo Banco Inter;
- ciclo de 30 dias;
- três dias de tolerância após o vencimento;
- sem cartão e sem gateway de assinatura.

### 3.2 Planos por câmera

| Plano | Código interno | Preço mensal | Histórico pesquisável | Imagens de longo prazo | Clipe |
|---|---|---:|---:|---:|---|
| Essencial | `basic` | R$ 39,90 | 365 dias | 1 por acontecimento | Não |
| Atenta | `standard` | R$ 79,90 | 365 dias | 2 por acontecimento | Não |
| Detalhada | `intensive` | R$ 149,90 | 365 dias | 3 por acontecimento | 15 segundos por 30 dias |

Todos os planos incluem:

- metadados pesquisáveis por 365 dias;
- busca por texto e filtros;
- Assistente IA;
- gráficos e evidências;
- exportação;
- múltiplos usuários;
- múltiplos locais;
- Agent e atualizações;
- 90 interações mensais com o Assistente IA por organização.

### 3.3 Teste gratuito

```text
1 organização
1 câmera
qualquer um dos três modos
24 horas de análise real
7 dias para explorar os resultados
21 interações com o Assistente IA
sem cartão obrigatório
```

O teste começa somente quando:

- o Agent estiver pareado;
- a câmera estiver online;
- o primeiro frame tiver sido recebido;
- o perfil inicial tiver sido aprovado;
- o usuário clicar em “Iniciar teste”.

### 3.4 Desconto progressivo marginal

| Posição da câmera na organização | Desconto aplicado naquela câmera |
|---|---:|
| 1ª e 2ª | 0% |
| 3ª e 4ª | 5% |
| 5ª à 8ª | 10% |
| 9ª à 16ª | 15% |
| 17ª em diante | 20% |

O desconto não é retroativo sobre todas as câmeras. Cada posição recebe sua própria faixa.

#### Regra para planos mistos

1. considerar somente câmeras faturáveis no ciclo;
2. ordenar os itens do maior para o menor preço base;
3. em empate, ordenar por `created_at` e depois por `camera_id`;
4. aplicar a faixa correspondente à posição;
5. arredondar cada item em centavos;
6. registrar o cálculo em um snapshot imutável da fatura.

Exemplo:

```text
Detalhada                         R$ 149,90
Atenta                            R$  79,90
Essencial com 5%                  R$  37,91
Essencial com 5%                  R$  37,91
Subtotal                          R$ 309,60
Desconto progressivo              R$   3,99
Total                             R$ 305,61
```

No dashboard, o cliente verá:

- subtotal;
- desconto;
- total;
- economia mensal;
- próxima faixa de desconto.

Ele não precisará entender a ordenação técnica interna.

### 3.5 Assistente IA

- 90 interações mensais por organização;
- 21 interações no teste;
- a franquia mensal não acumula;
- uma falha não consome interação;
- abrir eventos, usar filtros e visualizar gráficos não consome interação;
- pacotes extras serão suportados pela arquitetura, mesmo que não apareçam no primeiro lançamento.

### 3.6 Instalação

- instalação autônoma;
- sem taxa de instalação;
- passo a passo por sistema operacional e fabricante;
- descoberta automática sempre que possível;
- suporte por WhatsApp para dúvidas;
- entrada manual de RTSP como alternativa, não como fluxo principal.

---

## 4. Arquitetura comercial aprovada

### 4.1 Onde os dados ficarão

Todas as assinaturas, faturas, testes, permissões e pagamentos do MonitorIA ficarão no projeto Supabase do MonitorIA.

A infraestrutura da minhAi não será usada como banco central de cobrança do MonitorIA.

Serão reutilizados os conceitos e a integração já validados na minhAi:

- geração do Pix;
- armazenamento do `txid`;
- código Pix copia e cola;
- expiração;
- consulta ao Banco Inter;
- reconhecimento dos status pagos;
- validação do valor;
- confirmação automática;
- cancelamento de Pix expirado;
- jobs periódicos.

### 4.2 Chave Pix

O pagamento será enviado para uma chave Pix da BigCorps configurada por Secret.

```env
BIGCORPS_PIX_KEY=
BIGCORPS_PIX_KEY_TYPE=email
BANCO_INTER_API_KEY=
```

O e-mail usado como chave deverá estar ativo no Banco Inter e pertencer à BigCorps.

### 4.3 Dependência bancária inicial

A v1 poderá reutilizar a ponte bancária atualmente utilizada pela minhAi para criar e consultar cobranças do Banco Inter.

Essa ponte deverá ser configurável:

```env
BANCO_INTER_BRIDGE_BASE_URL=
```

A arquitetura não deve acoplar as regras comerciais ao endereço da ponte. Futuramente será possível substituir a ponte por integração direta com o Banco Inter sem reestruturar assinaturas e faturas.

### 4.4 Regras de segurança

- o frontend nunca envia o valor final da cobrança;
- o servidor calcula preços, descontos e proporcionalidade;
- somente `owner` e `admin` podem gerar faturas;
- funções de criação exigem usuário autenticado;
- funções de cron exigem segredo próprio;
- nenhuma tabela financeira permite `INSERT` ou `UPDATE` público;
- confirmação do pagamento é idempotente;
- confirmação, ativação e franquia de IA ocorrem em uma transação de banco;
- o valor informado pelo banco deve corresponder ao valor da fatura;
- o `txid` deve ser único;
- uma fatura paga não pode ser confirmada novamente;
- logs não podem expor chave Pix, token bancário ou `service_role`.

---

## 5. Estados oficiais

### 5.1 Trial

```text
draft
ready
running
capture_completed
exploration
converted
expired
purged
```

### 5.2 Assinatura da câmera

```text
pending_payment
active
change_scheduled
grace_period
suspended
cancel_at_period_end
cancelled
```

### 5.3 Fatura

```text
draft
open
pending_payment
paid
expired
cancelled
void
```

### 5.4 Pagamento Pix

```text
pending
confirmed
expired
cancelled
failed
manual_review
```

### 5.5 Direito efetivo da câmera

```text
trial
subscription
grace_period
blocked
```

---

## 6. Função central de direitos comerciais

Antes de implementar telas isoladas, deverá existir uma única função responsável por resolver os direitos de uma câmera.

Nome sugerido:

```sql
resolve_camera_entitlement(p_camera_id uuid)
```

Retorno mínimo:

```text
access_source
monitoring_allowed
plan_code
period_starts_at
period_ends_at
grace_ends_at
metadata_retention_days
long_term_keyframes
temporary_keyframe_days
clip_enabled
clip_duration_seconds
clip_retention_days
assistant_access_allowed
reason
```

Essa função será usada por:

- dashboard;
- API de configuração do Agent;
- endpoint de ingestão;
- geração de URLs de upload;
- geração de clipes;
- Assistente IA;
- expurgo;
- billing;
- auditoria.

O servidor continuará sendo a fonte de verdade. O Agent também respeitará o horário de encerramento localmente, mas uma versão alterada do Agent não conseguirá enviar eventos para uma câmera sem direito ativo.

---

# 7. Plano de execução

## Fase 0 — Congelamento da especificação e governança

### Objetivo

Transformar as decisões deste documento em contrato técnico do produto.

### Entregas

- adicionar este arquivo ao repositório;
- substituir o README;
- criar `CHANGELOG.md`;
- criar `docs/decisions/`;
- registrar ADRs das decisões críticas;
- definir padrão de migrations;
- definir convenção de nomes das Edge Functions;
- definir responsáveis pelas aprovações;
- definir checklist de pull request;
- proibir alterações comerciais sem atualização da documentação.

### ADRs iniciais

```text
ADR-001 — Cobrança por câmera
ADR-002 — Pix manual com confirmação automática
ADR-003 — Retenção de 365 dias
ADR-004 — Planos mistos por organização
ADR-005 — Desconto marginal progressivo
ADR-006 — Trial de 24 horas
ADR-007 — Clipes somente no Detalhado
ADR-008 — Dados financeiros no Supabase MonitorIA
```

### Critério de aceite

- decisões comerciais não ficam apenas em conversas;
- README aponta para este documento;
- qualquer desenvolvedor consegue identificar a regra oficial.

---

## Fase 1 — Fundação de produção e modelo comercial

### Objetivo

Criar a base de dados definitiva que sustentará planos, descontos, trial, faturas, Pix, franquia do Assistente e direitos por câmera.

### 1.1 Ambientes

Separar:

```text
Supabase de homologação
Supabase de produção
Vercel Preview
Vercel Production
Storage de homologação
Storage de produção
Secrets de homologação
Secrets de produção
```

Nenhum teste de pagamento deverá escrever no banco de produção.

### 1.2 Tabelas

#### Catálogo

```text
camera_plan_catalog
camera_plan_price_versions
volume_discount_tiers
addon_catalog
```

#### Assinaturas

```text
billing_accounts
camera_subscriptions
camera_subscription_changes
camera_entitlements
```

#### Faturas

```text
billing_invoices
billing_invoice_items
billing_price_snapshots
billing_payment_events
billing_pix_payments
```

#### Trial

```text
trial_runs
trial_device_fingerprints
```

#### Assistente

```text
assistant_allowances
assistant_usage_events
assistant_credit_purchases
assistant_credit_ledger
```

#### Uso e custo

```text
camera_usage_daily
camera_usage_monthly
organization_usage_monthly
```

### 1.3 Catálogo inicial

```text
basic
  R$ 39,90
  365 dias
  1 keyframe longo
  sem clipe

standard
  R$ 79,90
  365 dias
  2 keyframes longos
  sem clipe

intensive
  R$ 149,90
  365 dias
  3 keyframes longos
  clipe de 15 segundos
  retenção de 30 dias
```

### 1.4 Desconto

Popular:

```text
posição 1–2: 0%
posição 3–4: 5%
posição 5–8: 10%
posição 9–16: 15%
posição 17+: 20%
```

### 1.5 Funções SQL

```text
calculate_organization_invoice(...)
resolve_camera_entitlement(...)
apply_confirmed_pix_payment(...)
consume_assistant_interaction(...)
renew_assistant_allowance(...)
expire_camera_subscriptions(...)
```

### 1.6 RLS

Regras mínimas:

- membros leem apenas a própria organização;
- somente owner/admin leem faturas completas;
- somente owner/admin iniciam checkout;
- operadores não alteram plano;
- tabelas financeiras não aceitam escrita pelo cliente;
- catálogo pode ser lido publicamente;
- registros de uso são gravados somente pelo backend;
- trial só pode ser criado por fluxo autenticado;
- service role não aparece no navegador.

### 1.7 Auditoria

Toda ação comercial deverá registrar:

- ator;
- organização;
- câmera;
- ação;
- estado anterior;
- estado posterior;
- IP quando disponível;
- `user_agent`;
- data;
- origem.

### Critério de aceite da Fase 1

- migrations aplicam do zero em um banco vazio;
- catálogo contém os três planos;
- cálculo reproduz os exemplos deste documento;
- descontos mistos são determinísticos;
- RLS impede leitura cruzada;
- direitos da câmera podem ser resolvidos sem depender do frontend;
- não existe ainda necessidade de pagamento real para validar o modelo.

---

## Fase 2 — Cobrança Pix BigCorps

### Objetivo

Recriar no Supabase MonitorIA uma versão segura e específica das lógicas Pix já utilizadas pela minhAi.

### 2.1 Edge Functions

```text
monitoria-create-pix
monitoria-check-pix
monitoria-auto-confirm-pix
monitoria-cancel-expired-pix
monitoria-create-renewal-invoices
monitoria-expire-subscriptions
```

### 2.2 `monitoria-create-pix`

Responsabilidades:

1. validar sessão;
2. validar papel owner/admin;
3. receber `invoice_id`, não receber preço;
4. recalcular a fatura no servidor;
5. confirmar que está aberta;
6. cancelar Pix pendente anterior, quando aplicável;
7. criar registro financeiro;
8. gerar cobrança no Banco Inter;
9. salvar `txid`, copia e cola e expiração;
10. retornar dados seguros ao dashboard.

### 2.3 `monitoria-check-pix`

Responsabilidades:

1. validar acesso à organização;
2. consultar o registro local;
3. se já confirmado, retornar sucesso;
4. consultar o banco;
5. validar status;
6. validar valor;
7. chamar a RPC atômica;
8. retornar câmeras ativadas e novo vencimento.

### 2.4 Confirmação atômica

A RPC `apply_confirmed_pix_payment` deverá:

1. bloquear o pagamento para atualização;
2. verificar estado pendente;
3. validar `txid`;
4. validar valor;
5. marcar Pix como confirmado;
6. marcar fatura como paga;
7. ativar ou renovar itens;
8. aplicar upgrades;
9. renovar as 90 interações quando for fatura mensal;
10. registrar os eventos financeiros;
11. registrar auditoria;
12. retornar estado final.

Tudo em uma transação.

### 2.5 Jobs

- verificar Pix pendentes a cada minuto enquanto existirem;
- cancelar Pix vencidos a cada hora;
- criar prévias de renovação diariamente;
- marcar vencimentos diariamente;
- não armazenar `service_role` literalmente no SQL do cron;
- usar segredo seguro ou mecanismo suportado pelo ambiente.

### 2.6 Renovação

Lembretes:

```text
D-7
D-3
D0
D+2
D+3 suspensão
```

Pagamento antecipado:

```text
novo início = maior entre vencimento atual e data do pagamento
novo vencimento = novo início + 30 dias
```

Pagamento após suspensão:

```text
novo início = data do pagamento
novo vencimento = data do pagamento + 30 dias
```

### 2.7 Proporcionalidade

Adicionar câmera no meio do ciclo:

```text
valor proporcional =
preço final diário × segundos restantes do ciclo
```

O cálculo deve usar tempo UTC e arredondar somente no final de cada item.

Upgrade:

- cobrar diferença proporcional;
- ativar após o Pix.

Downgrade:

- agendar para a próxima renovação.

Cancelamento:

- manter até o fim do período já pago;
- remover da próxima fatura.

### Critério de aceite da Fase 2

- Pix real de valor controlado é gerado;
- confirmação depende do banco;
- valor diferente vai para revisão;
- chamadas simultâneas não ativam duas vezes;
- fatura paga ativa exatamente os itens comprados;
- vencimento e tolerância funcionam automaticamente;
- Agent volta sem reinstalação após pagamento.

---

## Fase 3 — Trial gratuito

### Objetivo

Permitir que qualquer cliente valide o produto com uma câmera real antes de pagar.

### 3.1 Fluxo

```text
draft
↓
ready
↓
running por 24 horas
↓
capture_completed
↓
exploration por 7 dias
↓
converted ou expired
↓
purged após carência
```

### 3.2 Regras

- uma câmera ativa;
- qualquer modo;
- 24 horas completas;
- início após confirmação do usuário;
- 21 interações;
- demais câmeras podem ser cadastradas, mas ficam bloqueadas;
- trial não entra no desconto da fatura;
- sem cartão;
- uma tentativa por organização e instalação.

### 3.3 Bloqueio

O Agent recebe:

```text
access_source
capture_starts_at
capture_ends_at
monitoring_allowed
plan_code
clip_enabled
```

A API rejeita eventos após o fim.

### 3.4 Conversão

Ao pagar:

- dados do trial passam a seguir retenção contratada;
- câmera volta imediatamente;
- 90 interações são liberadas;
- configuração permanece;
- clipes do trial Detalhado permanecem conforme a política definida.

### 3.5 Expurgo

Sem conversão:

- exploração termina após sete dias;
- existe carência técnica de mais sete dias;
- depois, eventos, imagens e clipes são removidos;
- somente auditoria mínima e marca antifraude permanecem.

### Critério de aceite da Fase 3

- relógio não começa no cadastro;
- relógio não depende do navegador aberto;
- Agent e servidor param a captura;
- trial não pode ser repetido facilmente;
- conversão não perde configuração;
- expurgo é comprovado.

---

## Fase 4 — Retenção de 365 dias

### Objetivo

Cumprir integralmente a promessa da landing.

### 4.1 Política

| Plano | Metadados | Imagens longas | Temporários | Clipes |
|---|---:|---:|---:|---:|
| Essencial | 365 dias | 1 | até 1 dia | — |
| Atenta | 365 dias | 2 | até 3 dias | — |
| Detalhada | 365 dias | 3 | até 7 dias | 30 dias |

### 4.2 Escolha das imagens

```text
Essencial: peak
Atenta: start + peak
Detalhada: start + peak + end
```

### 4.3 Otimização

- máximo 1280 × 720;
- JPEG ou WebP;
- 70–110 KB como alvo;
- remover EXIF;
- hash para integridade;
- bucket privado;
- URLs assinadas curtas.

### 4.4 Expurgo

Job diário:

1. buscar vencidos;
2. excluir objeto;
3. marcar exclusão;
4. remover órfãos;
5. repetir falhas;
6. alertar atraso.

Reconciliação semanal:

- objeto sem registro;
- registro sem objeto;
- tamanho divergente;
- arquivo sem expiração;
- objeto em caminho incorreto.

### Critério de aceite da Fase 4

- nenhum evento pago recebe 90 dias por engano;
- cada plano conserva exatamente a quantidade contratada;
- expurgo não remove evidência ainda válida;
- Storage privado e RLS aprovados;
- uso mensal é mensurável por câmera.

---

## Fase 5 — Controle de IA e margem

### Objetivo

Garantir qualidade sem tornar os planos deficitários.

### 5.1 Metas de COGS

| Plano | COGS total máximo por câmera/mês |
|---|---:|
| Essencial | R$ 15 |
| Atenta | R$ 28 |
| Detalhada | R$ 65 |

Inclui:

- visão;
- texto;
- Storage;
- egress;
- banco;
- compute;
- reserva de infraestrutura.

### 5.2 Estratégia de modelos

#### Essencial

- uma imagem;
- GPT-5 nano;
- sem escalonamento;
- resposta compacta.

#### Atenta

- até três imagens na análise;
- nano como padrão;
- mini em no máximo 15% dos acontecimentos;
- escalonamento baseado em relevância e complexidade, não apenas confiança.

#### Detalhada

- até quatro imagens na análise;
- nano como triagem;
- mini em até 25%–30%;
- resposta estruturada e compacta;
- clipe somente para evento relevante.

### 5.3 Proteções

- limite mensal de escalonamentos;
- telemetria por câmera;
- custo por evento;
- custo acumulado;
- alerta em 30%, 40% e 50% da receita líquida;
- agrupamento adaptativo;
- zonas ignoradas;
- horários;
- redução de repetição;
- ajustes de cooldown;
- nunca cobrar automaticamente por evento na v1.

### Critério de aceite da Fase 5

- testes com câmeras de baixo, médio e alto movimento;
- COGS dentro da meta;
- qualidade comparada com baseline;
- Detalhada não usa mini em todos os eventos;
- dados de custo visíveis internamente.

---

## Fase 6 — Assistente IA e franquia

### Objetivo

Controlar 90 interações mensais sem afetar filtros e pesquisas comuns.

### 6.1 Consome interação

- pergunta enviada;
- resposta concluída com sucesso;
- resposta que usa dados da organização.

### 6.2 Não consome

- abrir evento;
- pesquisar texto;
- filtrar;
- visualizar gráfico;
- exportar;
- resposta com falha;
- cancelamento antes da conclusão.

### 6.3 Ordem de consumo

1. franquia mensal;
2. saldo extra comprado;
3. bloqueio com oferta de pacote.

### 6.4 Renovação

- 90 na confirmação da fatura principal;
- não acumulam;
- saldo extra possui validade própria;
- trial possui saldo separado.

### Critério de aceite da Fase 6

- concorrência não permite saldo negativo;
- uma pergunta não é cobrada duas vezes;
- falhas são estornadas ou não registradas;
- saldo aparece no dashboard;
- suspensão comercial bloqueia o Assistente.

---

## Fase 7 — Agent Windows de produção

### Objetivo

Transformar o Agent atual em uma instalação autônoma e confiável.

### 7.1 Suporte inicial

- Windows 10 x64;
- Windows 11 x64;
- Windows Server compatível após homologação.

Não anunciar macOS e Linux como suportados antes dos instaladores reais.

### 7.2 Instalador

- serviço do Windows;
- inicialização automática;
- FFmpeg incluído ou instalado;
- assinatura digital;
- tela de pareamento;
- desinstalação;
- atualização automática;
- rollback.

### 7.3 Interface local

```text
Status
Versão
Agent ID
Câmeras
Fila
CPU
Memória
Disco
Última sincronização
Diagnóstico
```

### 7.4 Descoberta

1. ONVIF;
2. DVR/NVR;
3. RTSP conhecido;
4. snapshot;
5. entrada manual.

### 7.5 Resiliência

- fila persistente;
- retomada após falta de internet;
- watchdog;
- rotação de logs;
- limite de disco;
- atualização segura;
- token revogável;
- configuração a cada minuto;
- execução independente do navegador.

### Critério de aceite da Fase 7

- instalar em Windows limpo;
- reiniciar computador;
- perder internet;
- reiniciar câmera;
- recuperar fila;
- atualizar versão;
- desinstalar;
- nenhum segredo RTSP é enviado à nuvem.

---

## Fase 8 — Clipes do plano Detalhado

### Objetivo

Disponibilizar um trecho de vídeo curto que diferencie claramente o plano de R$ 149,90.

### 8.1 Especificação

```text
15 segundos
720p
H.264
sem áudio na v1
30 dias
bucket privado
```

### 8.2 Buffer circular

- segmentos locais de 2–3 segundos;
- manter últimos 60–90 segundos;
- limite rígido de disco;
- apagar depois do processamento.

### 8.3 Fluxo

1. movimento acontece;
2. Agent mantém buffer;
3. evento é criado;
4. análise classifica relevância;
5. servidor solicita clipe;
6. Agent monta trecho;
7. upload direto para Storage;
8. confirmação do ativo;
9. reprodução por URL assinada;
10. expurgo após 30 dias.

### 8.4 Falhas

Falha no clipe não invalida:

- evento;
- texto;
- horário;
- imagens;
- evidências.

### Critério de aceite da Fase 8

- início do acontecimento aparece;
- H.264 e H.265 de origem são tratados;
- uso de CPU é monitorado;
- clipe não passa pela Vercel;
- exclusão após 30 dias é comprovada;
- acesso entre organizações é impossível.

---

## Fase 9 — Onboarding e dashboard comercial

### Objetivo

Permitir que o cliente conclua sozinho toda a jornada.

### 9.1 Onboarding

1. conta;
2. organização;
3. local;
4. download do Agent;
5. pareamento;
6. descoberta;
7. credenciais;
8. perfil;
9. trial;
10. contratação.

### 9.2 Páginas

```text
/dashboard/trial
/dashboard/plans
/dashboard/billing
/dashboard/invoices
/dashboard/usage
/dashboard/cameras/[id]/subscription
/dashboard/agent
```

### 9.3 Dashboard

Mostrar:

- câmeras online;
- plano de cada câmera;
- trial;
- vencimento;
- tolerância;
- fatura;
- desconto;
- saldo do Assistente;
- clipes;
- Agent desatualizado;
- armazenamento;
- alertas.

### 9.4 Checkout

Seletores:

```text
Essenciais
Atentas
Detalhadas
```

Resultado:

```text
Subtotal
Desconto progressivo
Total
Próxima faixa
```

### Critério de aceite da Fase 9

- usuário sem conhecimento técnico conclui a configuração;
- preço exibido é idêntico ao servidor;
- alteração de plano possui efeito correto;
- todos os estados possuem mensagem clara;
- tema do dashboard permanece light.

---

## Fase 10 — Segurança, LGPD e jurídico

### Objetivo

Lançar com isolamento, transparência e regras contratuais claras.

### 10.1 Segurança

- testes de RLS;
- rotação de secrets;
- nenhum token em cron;
- rate limit;
- auditoria;
- URLs assinadas;
- proteção de endpoints;
- backups;
- restauração;
- exclusão segura;
- logs sanitizados.

### 10.2 LGPD

O cliente é controlador das imagens do seu ambiente. A BigCorps opera os dados conforme contrato e finalidade.

Precisamos fornecer:

- Termos de Uso;
- Política de Privacidade;
- Política de Retenção;
- DPA/aditivo;
- aviso de ambiente monitorado;
- canal de privacidade;
- processo de incidente;
- exportação;
- exclusão;
- lista de subprocessadores.

### 10.3 Reconhecimento futuro

Reconhecimento facial e leitura avançada de placas não entram silenciosamente nos planos atuais. Exigirão:

- add-on;
- finalidade;
- base legal;
- configuração própria;
- retenção própria;
- controles de acesso;
- revisão jurídica.

### Critério de aceite da Fase 10

- jurídico revisa os textos;
- RLS automatizado aprovado;
- restauração testada;
- exclusão documentada;
- aviso de privacidade disponível;
- nenhum recurso biométrico ativo.

---

## Fase 11 — Operação e suporte

### Objetivo

Operar o produto sem depender de inspeção manual constante.

### 11.1 Alertas

- Agent offline;
- câmera offline;
- fila acumulada;
- análise falhando;
- clipe falhando;
- custo alto;
- Storage;
- expurgo atrasado;
- Pix pendente;
- pagamento divergente;
- trial fora do prazo;
- versão antiga;
- Assistente indisponível.

### 11.2 Suporte

- central de ajuda;
- guias por fabricante;
- diagnóstico exportável;
- WhatsApp;
- FAQ;
- página de status;
- mensagens de erro acionáveis.

### 11.3 Backups

- backup do banco;
- política de retenção do backup;
- teste de restauração;
- inventário de secrets;
- plano de desastre.

### Critério de aceite da Fase 11

- incidentes críticos geram aviso;
- suporte consegue diagnosticar sem receber senha RTSP;
- restauração real é executada;
- página de status publicada.

---

## Fase 12 — Homologação e lançamento

### Objetivo

Provar a jornada completa antes de iniciar divulgação ampla.

### 12.1 Jornada obrigatória

1. criar conta;
2. confirmar e-mail;
3. criar organização;
4. instalar Agent;
5. descobrir câmera;
6. configurar;
7. iniciar trial;
8. completar 24 horas;
9. explorar por IA;
10. montar fatura;
11. gerar Pix;
12. pagar;
13. confirmar automaticamente;
14. ativar câmeras;
15. adicionar câmera;
16. fazer upgrade;
17. fazer downgrade;
18. cancelar;
19. vencer;
20. tolerância;
21. suspender;
22. renovar;
23. reproduzir clipe;
24. expurgar;
25. excluir dados;
26. restaurar backup.

### 12.2 Compatibilidade

Homologar:

- Intelbras/Dahua;
- Hikvision;
- ONVIF genérico;
- DVR com vários canais;
- H.264;
- H.265;
- substream.

### 12.3 Gate de lançamento

| Área | Obrigatório |
|---|---|
| Build | aprovado |
| Testes | aprovados |
| Migrations | reproduzíveis |
| RLS | aprovado |
| Trial | automático |
| Pix | real e idempotente |
| Agent | serviço, atualização e recuperação |
| Retenção | 365 dias |
| Clipes | 30 dias |
| Assistente | 90/21 |
| COGS | dentro das metas |
| Backup | restauração testada |
| Jurídico | revisado |
| Suporte | publicado |
| Landing | preços corretos |
| Observabilidade | ativa |

Somente depois desse gate:

- liberar campanha;
- publicar vídeos;
- iniciar prospecção;
- abrir cadastro geral.

---

# 8. Cronograma de referência

| Semana | Entrega |
|---|---|
| 1 | Fase 0 e início da Fase 1 |
| 2 | Modelo comercial, RLS e direitos |
| 3 | Pix e faturas |
| 4 | Trial e Assistente |
| 5 | Retenção e controle de IA |
| 6–7 | Agent de produção |
| 8 | Clipes |
| 9 | Onboarding e dashboard |
| 10 | Segurança, jurídico e operação |
| 11–12 | Homologação e lançamento |

O cronograma deve ser atualizado conforme os critérios de aceite, não apenas conforme a passagem do tempo.

---

# 9. Ordem obrigatória

```text
0. Documentação e decisões
1. Fundação comercial
2. Pix
3. Trial
4. Retenção
5. Custos de IA
6. Franquia do Assistente
7. Agent
8. Clipes
9. Dashboard
10. Segurança e jurídico
11. Operação
12. Homologação
13. Lançamento
```

Não iniciar checkout visual antes da função de cálculo.  
Não iniciar clipes antes dos direitos e da retenção.  
Não lançar o Agent antes de fila, atualização e diagnóstico.  
Não divulgar 365 dias antes de corrigir a retenção real.  
Não iniciar campanhas antes do gate final.

---

# 10. Primeira execução prática

A Etapa 1 começará por um único pacote de implementação:

## Migration

```text
create_production_commercial_foundation
```

Deverá criar:

- catálogo de planos;
- versões de preço;
- faixas de desconto;
- contas de cobrança;
- assinaturas por câmera;
- alterações agendadas;
- faturas;
- itens;
- snapshots;
- Pix;
- eventos financeiros;
- trial;
- franquia do Assistente;
- uso mensal;
- RLS;
- funções de cálculo;
- função de entitlement.

## Código

- tipos TypeScript;
- módulo central de preços;
- testes unitários;
- testes de desconto misto;
- testes de proporcionalidade;
- testes de RLS;
- leitura dos direitos pela API do Agent;
- tela interna de inspeção comercial.

## Critério de saída

Antes de começar a integração bancária, deverá ser possível executar localmente:

```text
Criar organização
Adicionar câmeras
Escolher planos
Calcular desconto
Gerar uma fatura local
Resolver os direitos
Simular confirmação
Ativar câmeras
Consumir 90 interações
Expirar o período
```

Sem mock no produto público. A simulação será apenas teste automatizado e homologação interna.

---

# 11. Checklist mestre

## Produto

- [ ] preços congelados;
- [ ] planos por câmera;
- [ ] desconto marginal;
- [ ] trial;
- [ ] 365 dias;
- [ ] clipes;
- [ ] 90 interações.

## Comercial

- [ ] catálogo;
- [ ] assinatura;
- [ ] fatura;
- [ ] proporcionalidade;
- [ ] upgrade;
- [ ] downgrade;
- [ ] cancelamento;
- [ ] tolerância.

## Pix

- [ ] criar;
- [ ] consultar;
- [ ] validar;
- [ ] confirmar;
- [ ] expirar;
- [ ] idempotência;
- [ ] auditoria.

## Agent

- [ ] instalador;
- [ ] serviço;
- [ ] descoberta;
- [ ] fila;
- [ ] atualização;
- [ ] diagnóstico;
- [ ] buffer;
- [ ] múltiplas câmeras.

## Dados

- [ ] keyframes;
- [ ] clipes;
- [ ] 365 dias;
- [ ] expurgo;
- [ ] reconciliação;
- [ ] agregações;
- [ ] custos.

## Segurança

- [ ] RLS;
- [ ] secrets;
- [ ] rate limit;
- [ ] backup;
- [ ] restauração;
- [ ] LGPD;
- [ ] jurídico.

## Lançamento

- [ ] landing;
- [ ] simulador;
- [ ] tutorial;
- [ ] FAQ;
- [ ] status;
- [ ] suporte;
- [ ] homologação;
- [ ] divulgação.

---

## 12. Definição de pronto da v1.0

O MonitorIA.cam estará pronto para lançamento quando um usuário sem auxílio técnico conseguir:

> criar a conta, conectar uma câmera, testar por 24 horas, pesquisar o que aconteceu, escolher planos diferentes para suas câmeras, pagar uma única fatura por Pix, ter o pagamento confirmado automaticamente, manter o histórico pesquisável por 365 dias e assistir aos clipes do plano Detalhado — com o Agent funcionando de forma contínua, segura e recuperável.

Esse é o contrato de lançamento da v1.0.
