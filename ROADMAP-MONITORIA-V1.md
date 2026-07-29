# Roadmap oficial — MonitorIA até a v1

Este documento registra as decisões aprovadas para evitar perda de contexto entre as fases.

## Situação atual

A v0.7.2 comprovou o fluxo ponta a ponta:

- Agent Windows conectado à câmera RTSP;
- detecção local de movimento;
- formação e envio de eventos;
- análise com visão estruturada;
- gravação de eventos, pessoas, veículos, custos e keyframes;
- retenção e expurgo;
- dashboard com dados reais.

O bloqueio atual é a segmentação: praticamente todos os eventos terminam por `maximum_duration`, porque os limites atuais mantêm a câmera quase permanentemente em estado de evento.

## Princípios aprovados

1. O vídeo contínuo permanece no estabelecimento.
2. Somente quadros selecionados de eventos são enviados para análise.
3. Pesquisa normal, filtros, comparações determinísticas e exportações não consomem cota do Assistente IA.
4. Análise visual automática e análise solicitada pelo usuário são consumos separados.
5. Não haverá reconhecimento facial na v1.
6. `local_track_id` é limitado ao evento e não pode correlacionar pessoas entre eventos, câmeras ou dias.
7. Leitura de placas permanece desativada na v1.
8. O cliente poderá exportar resultados em Markdown e JSON e analisar em qualquer IA de sua preferência.
9. Vercel e Supabase já pagos não entram no cálculo marginal por câmera durante a validação.
10. Preços finais só serão definidos após medição real dos três modos.

## Planos e modos

### Plano comercial da organização

Define câmeras, usuários, retenção, recursos e cota do Assistente IA.

| Plano | Assistente IA por mês | Retenção de metadados sugerida |
|---|---:|---:|
| Básico | 5 análises | 90 dias |
| Padrão | 20 análises | 180 dias |
| Intensivo | 60 análises | 365 dias |

### Modo visual da câmera

Internamente continuam os códigos `basic`, `standard` e `intensive`, mas a interface deve apresentar:

| Código | Nome de exibição | Direção técnica |
|---|---|---|
| basic | Econômico | 1 quadro, saída compacta, GPT-5 nano |
| standard | Equilibrado | 3 quadros, saída completa, nano com possível escalonamento |
| intensive | Detalhado | até 4 quadros, saída detalhada, mini ou escalonamento |

A conta administrativa pode testar todos os modos. Em produção, o plano comercial limita quais modos ficam disponíveis.

## v0.7.3 — qualidade, custo e medição

### Segmentação

- máscara para relógio, marca d’água e áreas ignoradas;
- calibração automática do ruído por câmera;
- limites próprios por câmera, não valores fixos universais;
- vários quadros consecutivos para iniciar evento;
- vários quadros abaixo do limite para encerrar;
- cooldown entre eventos;
- impedir reabertura imediata após `maximum_duration`;
- agenda de monitoramento configurável;
- métricas de piso, percentis e picos de movimento;
- retenção controlada de `agent_health`.

### Telemetria OpenAI

- registrar tokens normais, tokens em cache e reasoning tokens;
- usar `prompt_cache_key` estável por câmera e versão do perfil;
- calcular custo real considerando cache;
- registrar custo por câmera, evento, plano e modelo;
- atualizar README e documentação.

### A/B de modelos

Rodar os mesmos 30–50 eventos representativos em GPT-5 nano e GPT-5 mini, incluindo:

- cenas diurnas e noturnas;
- uma pessoa e várias pessoas;
- veículos;
- objetos no balcão;
- movimento rápido;
- eventos irrelevantes.

Avaliar contagem, tipo, zonas, resumo, JSON, revisão necessária, latência, tokens e custo.

### Critérios de aprovação

- menos de 10% dos eventos fechando por `maximum_duration`;
- mais de 70% fechando por `motion_stopped`;
- zero eventos causados apenas pelo relógio;
- mais de 80% dos eventos considerados úteis;
- menos de 2% de falhas de análise.

Metas marginais iniciais por câmera/mês:

| Modo | Meta |
|---|---:|
| Econômico | até R$ 10 |
| Equilibrado | até R$ 25 |
| Detalhado | até R$ 50 |

Essas metas só viram referência comercial depois dos testes reais.

## v0.8 — Eventos e Pesquisa

- página individual do evento;
- visualização de início, pico e fim;
- revisão humana: útil, irrelevante ou classificação incorreta;
- correção de tipo;
- filtros por período, câmera, local, tipo, tags, confiança e revisão;
- busca textual;
- comparação determinística entre períodos;
- exportação Markdown;
- exportação JSON;
- exclusão de evento e quadros;
- resumos diários e rollups básicos.

A Pesquisa não consome cota do Assistente IA.

## v0.9 — Assistente IA

- perguntas sobre resultados filtrados;
- resumo de período;
- comparação explicada;
- padrões por horário;
- análise de movimentação de pessoas e veículos;
- identificação de acontecimentos incomuns;
- relatório gerencial;
- pergunta personalizada;
- histórico das análises;
- painel de cota e renovação;
- 5, 20 e 60 análises mensais conforme o plano;
- respostas exportáveis.

Uma resposta concluída consome uma análise. Pesquisa, filtros, exportações e falhas não consomem.

Limites iniciais por análise:

| Plano | Período máximo | Eventos processados |
|---|---:|---:|
| Básico | 30 dias | até 500 |
| Padrão | 180 dias | até 2.000 |
| Intensivo | 365 dias | até 5.000 |

Quando houver volume maior, o servidor envia agregações e amostras, não todos os eventos brutos.

## v0.10 — Agent comercial

- serviço do Windows;
- inicialização automática;
- instalador e desinstalador;
- fila persistente em disco;
- recuperação após queda de internet;
- reinício automático;
- diagnóstico local;
- alertas de Agent e câmera offline;
- atualização controlada do executável.

## v0.11 — beta comercial

- limites reais dos planos;
- contrato de piloto;
- política de privacidade e retenção;
- aceite do responsável pelo estabelecimento;
- exclusão e exportação de dados;
- painel de consumo;
- cobrança inicial;
- instalação em 3 a 5 clientes acompanhados.

## Após o beta

- múltiplas câmeras e testes de carga;
- busca semântica e embeddings somente quando agregarem valor real;
- alertas e notificações;
- relatórios recorrentes;
- cobrança automática;
- assinatura digital do executável;
- atualização automática;
- monitoramento operacional;
- backup e restauração testados;
- documentação comercial e suporte.

## Ordem obrigatória

`segmentação → telemetria → A/B nano vs mini → modos reais → Pesquisa → Assistente IA → Agent comercial → beta`
