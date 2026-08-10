# MonitorIA.cam

**Sua câmera vê, o MonitorIA lembra!**

O MonitorIA.cam transforma câmeras de segurança comuns em uma memória visual pesquisável. O vídeo contínuo permanece no equipamento do cliente; somente quadros selecionados de acontecimentos são enviados para análise.

> **Versão atual do repositório:** 0.8.2  
> **Próximo marco:** v1.0.0 comercial  
> **Status:** núcleo funcional em preparação estruturada para produção.
---
## O que o MonitorIA faz

O sistema acompanha câmeras já existentes, identifica acontecimentos e organiza informações como:

- horário;
- descrição;
- pessoas;
- veículos;
- objetos;
- zonas;
- imagens principais;
- evidências;
- clipes curtos no plano Detalhado;
- respostas conversacionais baseadas nos eventos reais.

O usuário pode pesquisar situações sem assistir horas de gravação e usar o horário encontrado para consultar o vídeo completo no DVR ou NVR.

## O que ele não faz

Na v1, o MonitorIA:

- não grava vídeo contínuo em nuvem;
- não substitui o DVR/NVR;
- não exige troca das câmeras compatíveis;
- não usa reconhecimento facial;
- não usa reconhecimento avançado de placas;
- não exige cartão de crédito;
- não depende de instalação assistida obrigatória.

---

# Planos comerciais aprovados para a v1

Não existe mensalidade fixa por conta, empresa ou local. A cobrança é feita por câmera ativa.

| Plano | Mensalidade | Histórico pesquisável | Imagens preservadas | Clipe |
|---|---:|---:|---:|---|
| Essencial | R$ 39,90/câmera | 365 dias | 1 por acontecimento | — |
| Atenta | R$ 79,90/câmera | 365 dias | 2 por acontecimento | — |
| Detalhada | R$ 149,90/câmera | 365 dias | 3 por acontecimento | 15 segundos por 30 dias |

A organização recebe:

- múltiplos usuários;
- múltiplos locais;
- 90 interações mensais com o Assistente IA;
- desconto progressivo automático;
- uma única fatura mensal;
- pagamento por Pix BigCorps.

## Desconto progressivo

| Câmera | Desconto |
|---|---:|
| 1ª e 2ª | 0% |
| 3ª e 4ª | 5% |
| 5ª à 8ª | 10% |
| 9ª à 16ª | 15% |
| 17ª em diante | 20% |

O desconto é marginal: cada câmera recebe a faixa da sua posição. Planos diferentes podem ser combinados na mesma organização.

---

# Teste gratuito

```text
1 câmera
24 horas de análise real
qualquer um dos três modos
7 dias para explorar
21 interações com o Assistente IA
sem cartão
```

O relógio começa somente depois que o Agent e a câmera estiverem funcionando e o usuário confirmar o início.

---

# Fluxo do produto

```text
Conta
↓
Organização e local
↓
Agent Windows
↓
Descoberta da câmera
↓
Perfil e zonas
↓
Teste gratuito
↓
Escolha dos planos
↓
Fatura única
↓
Pix
↓
Confirmação automática
↓
Câmeras ativas por 30 dias
```

O pagamento não é recorrente automaticamente. O dashboard gera um novo Pix para cada renovação e o sistema ativa, suspende e reativa as câmeras conforme o pagamento.

---

# Recursos atuais do núcleo

- Agent Windows;
- segmentação por capítulos;
- modos Econômico, Equilibrado e Detalhado;
- perfil inteligente editável;
- eventos estruturados;
- revisão de eventos;
- exportação em Markdown e JSON;
- pesquisa conversacional;
- evidências clicáveis;
- gráficos;
- histórico privado de conversas;
- página do instalador;
- saúde do Agent;
- auditoria;
- medição de custos;
- estrutura de retenção.

## Gates ainda necessários para a v1

- catálogo comercial definitivo;
- assinaturas por câmera;
- faturas;
- cobrança Pix;
- teste gratuito automático;
- retenção real de 365 dias;
- franquia de 90 interações;
- desconto progressivo;
- Agent instalado como serviço;
- descoberta autônoma;
- atualização automática;
- buffer e clipes;
- onboarding comercial;
- segurança e homologação final.

Consulte [`PLANO-DE-PRODUCAO.md`](./PLANO-DE-PRODUCAO.md) para o plano completo.

---

# Arquitetura

## Web

- Next.js 16;
- React 19;
- TypeScript;
- Supabase SSR;
- Vercel.

## Backend

- Supabase Postgres;
- Row Level Security;
- Supabase Storage;
- Edge Functions;
- jobs agendados;
- auditoria e telemetria.

## Inteligência artificial

- OpenAI;
- GPT-5 nano;
- GPT-5 mini;
- seleção de modelo conforme plano e relevância;
- medição de tokens e custo.

## Agent

- Windows;
- FFmpeg;
- RTSP/ONVIF;
- captura local;
- fila persistente planejada;
- buffer circular planejado;
- credenciais da câmera mantidas localmente.

## Pagamentos

A v1 utilizará:

- Pix BigCorps;
- Banco Inter;
- geração pelo dashboard;
- confirmação automática;
- uma fatura por organização;
- itens individuais por câmera.

As regras financeiras ficam no Supabase MonitorIA. A integração bancária reutiliza a experiência já validada em outros produtos da BigCorps, mas com tabelas, RLS e funções próprias.

---

# Privacidade

O vídeo contínuo permanece no local.

Na nuvem ficam apenas os dados necessários para a experiência contratada:

- metadados;
- imagens selecionadas;
- clipes curtos do plano Detalhado;
- configurações;
- conversas;
- auditoria;
- faturamento.

Os buckets de evidências devem ser privados e acessados por URLs assinadas.

A v1 não utiliza reconhecimento facial.

---

# Desenvolvimento local

## Requisitos

- Node.js 22 ou superior;
- npm;
- projeto Supabase;
- chave da OpenAI;
- FFmpeg para o Agent e testes relacionados a câmeras.

## Instalação

```bash
npm install --include=dev
cp .env.example .env.local
npm run dev
```

Aplicação:

```text
http://localhost:3000
```

## Validação

```bash
npm run check
npm test
npm run build
```

## Scripts

| Script | Função |
|---|---|
| `npm run dev` | ambiente local Next.js |
| `npm run build` | build de produção |
| `npm run start` | executa o build |
| `npm run check` | TypeScript sem emissão |
| `npm test` | testes Node/TypeScript |
| `npm run analyze` | análise local de imagens |

---

# Variáveis de ambiente atuais

Consulte [`.env.example`](./.env.example).

Principais grupos:

```env
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

MONITORIA_AGENT_SECRET=
CRON_SECRET=

OPENAI_API_KEY=
VISION_PROVIDER=
VISION_PROFILE_MODEL=
VISION_MODEL_ECONOMIC=
VISION_MODEL_BALANCED=
VISION_MODEL_DETAILED=
VISION_MODEL_ESCALATION=

COST_USD_TO_BRL=
```

## Variáveis previstas para a cobrança v1

Serão adicionadas durante a implementação da Etapa 1/2:

```env
BIGCORPS_PIX_KEY=
BIGCORPS_PIX_KEY_TYPE=email
BANCO_INTER_API_KEY=
BANCO_INTER_BRIDGE_BASE_URL=
BILLING_CRON_SECRET=
```

Nenhum Secret deve ser enviado ao navegador, gravado em logs ou escrito literalmente em comandos do banco.

---

# Regras de produção

Toda alteração destinada à produção deve passar por:

```bash
npm run check
npm test
npm run build
```

Além disso, mudanças de banco devem:

- existir como migration;
- aplicar em banco vazio;
- ter RLS;
- possuir teste;
- evitar IDs gerados hardcoded;
- registrar decisões comerciais relevantes.

Mudanças em cobrança, trial, retenção ou direitos da câmera devem atualizar também:

- `PLANO-DE-PRODUCAO.md`;
- ADR correspondente;
- testes;
- changelog.

---

# SEO e GEO

A aplicação inclui:

- canonical para `https://monitoria.cam`;
- Open Graph;
- Twitter Image;
- `robots.txt`;
- `sitemap.xml`;
- páginas privadas com `noindex`;
- JSON-LD;
- FAQ estruturado;
- páginas institucionais.

Consulte `SEO-GEO-APLICACAO.md` antes de alterações que afetem rotas públicas, metadados ou domínio.

---

# Estrutura de lançamento

O MonitorIA não será divulgado amplamente enquanto os gates abaixo não estiverem aprovados:

- trial automático;
- Pix real;
- ativação e suspensão;
- Agent recuperável;
- retenção de 365 dias;
- clipes;
- franquia de IA;
- RLS;
- restauração de backup;
- jurídico;
- suporte;
- observabilidade.

O detalhamento e os critérios de aceite estão em [`PLANO-DE-PRODUCAO.md`](./PLANO-DE-PRODUCAO.md).

---

# Identidade

**MonitorIA.cam**  
**Sua câmera vê. A IA lembra.**

Desenvolvido pela **BigCorps Tecnologia**.
