# Roadmap de Inteligência — MonitorIA.cam

> Documento vivo para orientar a evolução da inteligência visual, memória operacional, Assistente MonitorIA, Agent e experiência em tempo real.

**Atualizado em:** 01/08/2026  
**Produto:** MonitorIA.cam  
**Status:** Fases 1 e 2 entregues para aplicação em produção.

---

## 1. Visão do produto

O MonitorIA deve evoluir de um analisador de eventos isolados para uma **memória visual e inteligência operacional do estabelecimento**.

O objetivo final é permitir respostas como:

> A loja abriu às 08h04. O primeiro atendimento começou às 08h17. Durante o dia ocorreram 23 atendimentos prováveis com 19 clientes prováveis. Um armário foi aberto duas vezes. O caixa permaneceu aberto por 4 minutos após o fechamento. A loja fechou às 19h11 e não houve movimentação relevante depois disso.

A inteligência deve sempre:

- separar observação visual de interpretação;
- conservar evidências e limitações;
- tratar horários cadastrados como contexto, nunca como prova visual;
- evitar reconhecimento facial e identificação civil;
- não inferir crime, intenção, gênero, etnia ou atributos sensíveis;
- usar linguagem de probabilidade quando a informação não for determinística;
- preservar compatibilidade com eventos e relatórios existentes;
- privilegiar resultados úteis, auditáveis e explicáveis.

---

## 2. Situação atual

### Fase 1 — Motor de Estados Visuais

**Status:** entregue para aplicação.

Inclui:

- entidades visuais configuráveis;
- estados de estabelecimento, portas, caixas, armários, objetos, equipamentos e áreas;
- observações visuais estruturadas;
- estado atual e histórico de transições;
- abertura, fechamento e sessões operacionais;
- distinção entre horário declarado e fechamento visualmente confirmado;
- contexto de atividade após fechamento;
- suporte inicial no Assistente;
- versionamento, hash de prompt, feature flag e rollback.

### Fase 2 — Memória Curta e Continuidade

**Status:** entregue para aplicação.

Inclui:

- continuidade entre eventos próximos;
- agrupamento em `interaction_group_id`;
- assinatura visual temporária e não biométrica;
- clientes prováveis e funcionários prováveis;
- perfis operacionais dos funcionários;
- estimativa de pessoas distintas no período;
- capítulos do mesmo atendimento;
- intenção `continuity_summary` no Assistente;
- indicadores de continuidade na seção de eventos.

---

## 3. Melhoria transversal imediata — Eventos em tempo real

### Objetivo

Atualizar a seção de eventos automaticamente quando um novo evento for concluído, sem exigir atualização manual da página.

### Comportamento recomendado

- Assinar `INSERT` e `UPDATE` da tabela `events`.
- Filtrar pela organização autenticada.
- Considerar câmera, local, período, tipo e revisão selecionados na tela.
- Quando o evento corresponder aos filtros:
  - atualizar automaticamente a primeira página; ou
  - mostrar um indicador “Novo evento disponível” quando o usuário estiver navegando em páginas antigas.
- Aplicar debounce curto para combinar:
  - inserção inicial do evento;
  - atualização posterior da continuidade da Fase 2;
  - possíveis atualizações de estado visual.
- Buscar novamente os dados pela função existente de pesquisa, em vez de montar o card diretamente com o payload do Realtime.
- Preservar posição de rolagem e filtros.
- Exibir estado de conexão:
  - conectado;
  - reconectando;
  - atualização manual disponível.

### Motivo para refazer a consulta

O card depende de dados que não estão somente na linha de `events`, como:

- nome da câmera e do local;
- quantidade de pessoas e veículos;
- miniatura;
- dados de continuidade;
- correções humanas;
- relações com grupos e estados.

O Realtime deve funcionar como **sinal de atualização**, e a fonte final do card continua sendo a consulta estruturada do servidor.

### Estratégia inicial

Para o volume atual, usar **Supabase Postgres Changes** é a implementação mais simples.

Quando houver muitos usuários simultâneos acompanhando a mesma organização, migrar o sinal para **Supabase Broadcast**, que escala melhor.

### SQL necessário

Adicionar `events` à publicação `supabase_realtime`, mantendo RLS e acesso somente aos membros autorizados da organização.

### Arquitetura de interface sugerida

Criar um componente cliente semelhante a:

```text
EventsRealtimeRefresh
├── recebe organizationId e filtros atuais
├── abre canal do Supabase
├── escuta INSERT e UPDATE em events
├── aplica debounce
├── executa router.refresh()
└── encerra o canal ao desmontar
```

### Prioridade

**Alta e imediata.**  
É uma melhoria de experiência pequena, de baixo risco e que faz o MonitorIA parecer realmente vivo.

---

# Próximas fases

## Fase 3 — Sessões e capítulos operacionais

### Objetivo

Transformar vários eventos relacionados em uma história operacional completa.

### Exemplo

Eventos individuais:

```text
Cliente entrou
Cliente aproximou-se do balcão
Atendimento começou
Cliente entregou um objeto
Funcionário utilizou o computador
Cliente saiu
```

Sessão consolidada:

```text
Sessão: Atendimento no balcão
Início: 11h59
Fim: 12h07
Duração: 8 minutos
Cliente provável: 1
Funcionário provável: A
Capítulos: 6
Resultado visual: cliente deixou o local
```

### Estruturas previstas

```text
interaction_sessions
interaction_session_events
interaction_participants
interaction_outcomes
```

### Tipos iniciais

```text
customer_service
delivery_or_pickup
visitor_stay
staff_activity
equipment_operation
restricted_area_access
opening_procedure
closing_procedure
```

### Resultado esperado

- menos repetição visual;
- duração realista de atendimentos;
- início, desenvolvimento e conclusão;
- métricas por sessão, não apenas por evento;
- Assistente capaz de resumir histórias completas.

### Prioridade

**Próxima fase principal.**

---

## Fase 4 — Inteligência de rotinas e normalidade

### Objetivo

Aprender o padrão operacional habitual de cada câmera e identificar desvios relevantes.

### Exemplos de padrão

```text
A loja normalmente abre entre 07h55 e 08h10
A cortina normalmente fecha entre 18h55 e 19h15
O primeiro atendimento ocorre até 20 minutos após a abertura
Após o fechamento, a área normalmente fica vazia
```

### Exemplos de desvio

```text
Abertura 42 minutos atrasada
Ausência de fechamento visual confirmado
Movimento depois do fechamento
Caixa aberto fora do período habitual
Equipamento ligado durante a madrugada
Área normalmente ocupada ficou sem atividade
```

### Linguagem

Usar:

> Atividade fora do padrão operacional observado.

Nunca concluir automaticamente:

> Atividade criminosa ou suspeita.

### Estruturas previstas

```text
camera_behavior_baselines
operational_expectations
operational_deviations
routine_observations
```

### Cada padrão deve guardar

- período analisado;
- quantidade de dias;
- confiança;
- última atualização;
- exceções conhecidas;
- confirmação do usuário;
- validade por dia da semana e faixa de horário.

---

## Fase 5 — Entendimento de processos e ações

### Objetivo

Reconhecer fluxos configurados para cada tipo de negócio.

### Atendimento comercial

```text
cliente chegou
aguardou
foi atendido
entregou ou recebeu objeto
funcionário utilizou terminal
cliente saiu
```

### Retirada ou entrega de encomenda

```text
cliente chegou
funcionário buscou pacote
pacote apareceu no balcão
cliente retirou ou entregou o pacote
cliente saiu carregando ou sem o objeto
```

### Caixa ou gaveta

```text
gaveta abriu
houve manipulação
gaveta fechou
tempo total aberta
ocorreu durante ou fora do expediente
```

### Equipamento

```text
equipamento ativado
permaneceu em uso
ficou ocioso
parou
foi desligado
```

### Limitação importante

Uso de terminal não significa automaticamente pagamento ou venda.  
Confirmação transacional exige integração com caixa, ERP ou meio de pagamento.

---

## Fase 6 — Perfis operacionais de funcionários

### Objetivo

Melhorar a diferenciação entre funcionários habituais e clientes, sem reconhecimento facial.

### Informações permitidas

```text
apelido operacional
zonas habituais
horários habituais
uniforme ou padrão de roupa do turno
óculos
barba
cabelo
acessórios frequentes
equipamentos utilizados
frames de referência aprovados
```

### Regras

- roupa deve poder ser atualizada por turno ou por dia;
- aparência nunca será prova isolada;
- posição e atividade operacional terão peso alto;
- cabelo, barba, óculos e porte terão peso baixo ou complementar;
- correspondência sempre será provável;
- cliente nunca será identificado permanentemente entre dias.

### Informações excluídas

- reconhecimento facial;
- embeddings faciais;
- cor ou tom de pele;
- origem étnica;
- gênero inferido;
- idade estimada;
- identificação civil automática.

---

## Fase 7 — Autodiagnóstico e saúde da câmera

### Objetivo

Detectar quando a câmera ou o ambiente deixam de corresponder ao perfil aprovado.

### Situações

```text
câmera deslocada
enquadramento alterado
imagem coberta
lente suja
desfoque persistente
imagem muito escura
infra-vermelho inadequado
reflexo novo
objeto bloqueando a visão
mudança estrutural do ambiente
perfil desatualizado
```

### Exemplo de aviso

> O enquadramento mudou aproximadamente em relação ao perfil aprovado. As zonas e marcadores visuais podem estar desalinhados.

### Resultado esperado

- menos erros silenciosos;
- aviso antes de perder eventos;
- revisão orientada do perfil;
- detecção de marcador operacional invisível ou obstruído.

---

## Fase 8 — Captura inteligente no Agent

### Objetivo

Selecionar melhor os quadros e manter eventos abertos enquanto a mesma interação continua.

### Melhorias

```text
movimento por entidade configurada
priorização de áreas importantes
comparação antes e depois
seleção do quadro mais nítido
descarte de quadros redundantes
continuação de evento enquanto a interação persistir
encerramento após esvaziamento ou mudança real
```

### Exemplos de prioridade

```text
movimento no estacionamento: normal
movimento na cortina: operacional
movimento no caixa após fechamento: alta
oscilação de monitor: ignorar
mesmo atendimento ativo: continuar sessão
```

### Resultado esperado

- menos capítulos desnecessários;
- mais evidência para transições;
- menor custo por evento útil;
- maior qualidade no plano Básico.

---

## Fase 9 — Análise seletiva em dois níveis

### Objetivo

Usar processamento aprofundado apenas quando necessário.

### Nível rápido

```text
pessoa presente
veículo estacionado
atividade normal no balcão
estado visual inalterado
```

### Nível aprofundado

```text
mudança de estado
objeto removido
abertura ou fechamento
atividade após encerramento
troca ambígua de cliente
contradição entre quadros
baixa visibilidade
```

### Score de complexidade

Considerar:

```text
mudança estrutural
quantidade de pessoas
quantidade de entidades configuradas
movimento em área sensível
horário operacional
estado anterior
contradição entre quadros
visibilidade
continuidade incerta
```

### Resultado esperado

Mais inteligência sem usar o modelo mais caro em todos os eventos.

---

## Fase 10 — Assistente com memória operacional

### Objetivo

Responder usando sessões, estados, rotinas e dados estruturados, não somente busca textual.

### Novas intenções

```text
interaction_summary
routine_deviation
staff_activity
queue_analysis
object_history
equipment_history
camera_health
daily_operations
```

### Perguntas desejadas

```text
Quantos atendimentos diferentes ocorreram hoje?
Quais atendimentos duraram mais de 10 minutos?
A loja abriu e fechou no horário esta semana?
Houve movimentação depois do fechamento?
Qual funcionário provável esteve mais tempo no balcão?
Algum objeto configurado ficou ausente?
A câmera mudou de posição?
O que foi diferente hoje em relação aos últimos sete dias?
```

### Princípio

- banco calcula números, tempos e agrupamentos;
- IA explica;
- toda resposta relevante aponta evidências;
- nenhuma estimativa é apresentada como certeza.

---

## Fase 11 — Inteligência entre câmeras

### Objetivo

Relacionar acontecimentos do mesmo local por proximidade temporal, fluxo e direção.

### Exemplo

```text
pessoa apareceu na câmera externa
atividade começou na recepção
atendimento ocorreu no balcão
pessoa saiu pela entrada
```

### Linguagem correta

> Sequência provavelmente relacionada por proximidade temporal e direção de deslocamento.

Não afirmar identidade entre câmeras sem evidência e autorização apropriadas.

### Aplicações

- entrada → recepção → caixa → saída;
- veículo chegou → atendimento → veículo saiu;
- pacote chegou na doca → apareceu no estoque;
- movimento externo depois do fechamento → atividade interna.

---

## Fase 12 — Alertas inteligentes e priorização

### Objetivo

Transformar alertas de movimento em alertas operacionais explicáveis.

### Exemplos

```text
Loja não abriu até o limite configurado
Portão reaberto depois do fechamento
Caixa aberto após o encerramento
Objeto importante removido
Armário permaneceu aberto
Equipamento ligado fora do horário
Câmera obstruída
Atendimento aguardando há mais de 15 minutos
Fila acima do limite
```

### Cada alerta deve informar

```text
o que aconteceu
por que é relevante
estado anterior
estado atual
horário
evidências
confiança
ação sugerida
```

---

# Melhorias contínuas

## Vocabulário visual normalizado

Normalizar variações como:

```text
roxo
purple
dark purple
maroon
vinho
marrom/roxo escuro
```

Para famílias internas estáveis:

```text
purple
burgundy
brown
black
white
gray
blue
green
red
orange
yellow
pink
beige
unknown
```

A exibição permanece em português.

---

## Pesos de características

Sugestão inicial:

| Característica | Peso |
|---|---:|
| Roupa superior | Alto |
| Zona e posição | Alto |
| Intervalo temporal | Alto |
| Acessório distinto | Alto |
| Roupa inferior | Médio |
| Objeto carregado | Médio/alto |
| Atividade observada | Alto |
| Cabelo | Baixo |
| Barba | Baixo |
| Porte físico | Baixo |
| Óculos comuns | Baixo/médio |

---

## Correções rápidas na interface

Oferecer ações como:

```text
Mesmo atendimento
Novo atendimento
Mesma pessoa provável
Pessoa diferente
Funcionário A
Funcionário B
Não foi possível determinar
Estado visual correto
Estado visual incorreto
```

Essas correções devem ajustar parâmetros e referências operacionais, sem serem chamadas de treinamento automático.

---

## Explicação das decisões

### Agrupado porque

```text
intervalo de 73 segundos
roupa superior compatível
calça compatível
mesmo acessório no peito
mesma zona de cliente
não houve saída clara
```

### Não agrupado porque

```text
pessoa anterior saiu
nova roupa incompatível
acessórios diferentes
sobreposição temporal
duas pessoas visíveis ao mesmo tempo
```

A explicação deve estar disponível para auditoria e demonstração comercial.

---

# Ordem recomendada

1. Eventos em tempo real.
2. Fase 3 — Sessões e capítulos operacionais.
3. Fase 4 — Rotinas e desvios.
4. Fase 7 — Saúde e drift da câmera.
5. Fase 5 — Processos e ações.
6. Fase 8 — Captura inteligente no Agent.
7. Fase 9 — Análise seletiva.
8. Fase 10 — Assistente operacional avançado.
9. Fase 12 — Alertas inteligentes.
10. Fase 11 — Relação entre múltiplas câmeras.
11. Fase 6 — Evolução contínua dos perfis operacionais de funcionários.

---

# Critérios permanentes de qualidade

Uma evolução será considerada positiva quando melhorar pelo menos um dos seguintes pontos sem degradar os demais:

- precisão visual;
- continuidade temporal;
- utilidade operacional;
- capacidade de explicação;
- latência;
- custo;
- privacidade;
- consistência entre câmeras;
- capacidade de rollback;
- confiança do usuário.

---

# Controle de status

| Item | Status |
|---|---|
| Fase 1 — Estados visuais | Entregue para aplicação |
| Fase 2 — Memória curta | Entregue para aplicação |
| Eventos em tempo real | Recomendado como próximo ajuste |
| Fase 3 — Sessões | Planejada |
| Fase 4 — Rotinas | Planejada |
| Fase 5 — Processos | Planejada |
| Fase 6 — Funcionários | Base criada na Fase 2 |
| Fase 7 — Saúde da câmera | Planejada |
| Fase 8 — Agent inteligente | Planejada |
| Fase 9 — Análise seletiva | Planejada |
| Fase 10 — Assistente avançado | Planejada |
| Fase 11 — Múltiplas câmeras | Planejada |
| Fase 12 — Alertas inteligentes | Planejada |

---

## Regra de manutenção deste documento

Ao concluir uma etapa:

1. atualizar o status;
2. registrar migrations e arquivos alterados;
3. descrever comportamento liberado;
4. registrar limitações conhecidas;
5. anotar rollback;
6. definir a próxima prioridade;
7. evitar remover ideias ainda não implementadas.
