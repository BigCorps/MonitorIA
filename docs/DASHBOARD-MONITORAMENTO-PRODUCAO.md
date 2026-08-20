# MonitorIA — Fase Dashboard de Produção

Base de planejamento: `main` em 20/08/2026, após o fechamento do Agent 1.0.1 e das correções de Pesquisa IA/estados visuais.

## Objetivo

Transformar o dashboard tecnicamente completo do MonitorIA em um produto simples, profissional e seguro para o cliente final, sem remover a inteligência já implementada.

Princípio desta fase:

> A complexidade continua no motor. O cliente recebe contexto, conclusão, ação e refinamento — não nomes internos, scores ou estruturas de banco.

## Regras gerais da fase

1. Não alterar o Agent 1.0.1 nem o instalador enviado à Microsoft Store.
2. Fazer cada seção em ZIP separado e testável.
3. Preferir migrations aditivas; evitar mudanças destrutivas.
4. Toda informação de horário deve respeitar o fuso do local da câmera.
5. Nenhum enum, nome de campo, RPC, estrutura interna ou métrica crua deve aparecer para o cliente.
6. Percentuais de confiança só aparecem dentro de “Detalhes da análise”, quando realmente úteis.
7. Feedback humano nunca muda silenciosamente o comportamento após um único clique.
8. Aprendizado segue: observar → acumular → sugerir → usuário aprovar → versionar → permitir desfazer.
9. Pesquisa IA e MCP devem consumir os mesmos refinamentos aprovados.
10. Owner/admin podem refinar; membros comuns priorizam leitura.

---

# Navegação final desejada

## Monitoramento

- Acontecimentos
- Períodos
- Alertas
- Mais análises
  - Rotinas
  - Processos
  - Padrões da operação
  - Entre câmeras

## Câmeras

- Câmeras
- Instalação
- Como conectar
- Funcionamento

A navegação só será reorganizada na etapa final, depois que cada tela estiver pronta.

---

# Etapa 1 — Fundação compartilhada

## Objetivo

Criar contratos reutilizáveis antes de modificar as telas.

### Entregas

- formatador único de data/hora com fuso explícito;
- duração amigável;
- classificação simples de certeza;
- labels de prioridade e status em português;
- componente único “Detalhes da análise”;
- política de feedback supervisionado.

### Política de feedback

Um único feedback:
- corrige o registro atual;
- pode corrigir métricas e consultas derivadas;
- entra como evidência de refinamento;
- não altera automaticamente o comportamento futuro.

Refinamento automático só pode virar sugestão quando houver recorrência mínima consistente.

Padrão inicial:
- mínimo de 3 correções semelhantes;
- recomendação preferencial com 5 ou mais;
- nunca aplicar sem aprovação humana;
- guardar versão e permitir desfazer.

---

# Etapa 2 — Acontecimentos

## Interface

### Lista

Exibir:
- imagem;
- título;
- horário;
- câmera/local;
- resumo curto;
- pessoas;
- veículos;
- duração;
- aviso de revisão apenas quando houver ação necessária.

Ocultar da área principal:
- capítulos;
- confidence score;
- status técnico de revisão;
- tags internas;
- sessão/grupo interno.

### Detalhe

Ordem:
1. Resumo
2. Imagens/vídeo
3. O que aconteceu
4. Pessoas e veículos
5. Objetos
6. “Essa análise está correta?”
7. Detalhes da análise

### Revisão

Botões:
- Sim
- Não é relevante
- Está classificado errado

## Backend

- evento irrelevante deixa de influenciar Pesquisa IA, MCP e métricas derivadas;
- classificação corrigida tem precedência em todos os consumidores;
- registrar feedback para aprendizado supervisionado por câmera/contexto;
- sugerir refinamento somente após recorrência consistente.

---

# Etapa 3 — Períodos

## Linguagem

Trocar:
- sessão → período/atividade;
- capítulo → registro;
- história operacional → atividade agrupada;
- memória curta → não expor ao cliente.

## Lista

Exemplo:

> Atendimento no balcão  
> 12:04–12:11 · 7 minutos  
> 1 cliente provável · 1 funcionário provável  
> 4 registros relacionados

## Detalhe

- Resumo
- Participantes
- Resultado observado
- Registros deste período
- Detalhes da análise

## Regras

Correções em Acontecimentos devem poder refletir no período reconstruído.

---

# Etapa 4 — Rotinas

## Valor para o cliente

Mostrar o que normalmente acontece e quando algo foge do habitual.

Exemplo:

> Abertura habitual  
> Normalmente entre 08:02 e 08:14  
> Aprendido com os últimos 18 dias.

Desvio:

> Abertura mais tarde que o habitual  
> Hoje: 08:42  
> Normal: 08:02–08:14

## Refinamentos

Cliente pode informar:
- horário esperado;
- dias de funcionamento;
- tolerância: Mais tolerante / Equilibrada / Mais rigorosa;
- feriados e exceções;
- horários especiais.

## Regra importante

Manter separados:
- horário declarado;
- padrão aprendido;
- comportamento observado hoje.

Isso permite respostas como:

> A loja deveria abrir às 08:00, normalmente abre por volta de 08:12 e hoje abriu às 08:38.

---

# Etapa 5 — Processos

## Interface

Exemplo:

> Abertura da loja  
> ✓ Portão aberto  
> ✓ Iluminação ligada  
> ✓ Presença no balcão  
> Concluído às 08:14

Ou:

> Fechamento incompleto  
> ✓ Portão fechado  
> ✓ Luzes apagadas  
> Não foi possível confirmar o fechamento do caixa.

## Configuração

Botão:
> Configurar este processo

Cliente descreve em linguagem comum. O sistema transforma em etapas estruturadas e pede aprovação.

Cliente pode:
- mudar nome;
- reordenar;
- marcar obrigatório/opcional;
- pausar;
- aprovar nova versão.

## Aprendizado

Processos nunca se alteram sozinhos.

Se o MonitorIA observar um padrão diferente repetidamente:
> Percebemos que esta etapa normalmente ocorre antes da outra. Deseja atualizar o processo?

---

# Etapa 6 — Padrões da operação

## Objetivo

Manter o aprendizado já implementado, mas apresentar de forma humana.

Renome opcional:
> Aprendizado da operação

## Mostrar

- padrão;
- câmera;
- faixa de horário;
- áreas habituais;
- ações recorrentes;
- estado: aprendendo/ativo;
- última observação;
- ações de aprovação.

## Recolher em “Detalhes do aprendizado”

- score de aparência;
- score de zona;
- score de ação;
- score de horário;
- semelhança mínima;
- quantidade de amostras;
- detalhes de versão.

## Fluxo de revisão

- Aprovar padrão
- Continuar observando
- Não é equipe
- Associar a outro padrão

Atualizações continuam versionadas e aprovadas.

---

# Etapa 7 — Funcionamento das câmeras

Mover para o grupo Câmeras somente no final.

## Tela principal

Exemplo normal:

> Balcão Alto — Funcionando normalmente  
> ✓ Imagem clara  
> ✓ Nitidez normal  
> ✓ Enquadramento correto  
> Última verificação: 14:07

Exemplo problema:

> Balcão Lateral — Imagem escura  
> Detectado às 19:34  
> Verifique a iluminação ou a lente da câmera.

## Não mostrar na área principal

- brightness_mean;
- contrast_stddev;
- edge_density;
- blur_score;
- dark_pixel_ratio;
- baseline_distance.

Essas métricas ficam em:
> Detalhes da imagem

## Referência visual

Pergunta simples:
> Esta é a posição normal desta câmera?

- Sim, usar como referência
- Não

Também permitir:
> A câmera foi reposicionada de propósito

Isso inicia uma nova referência aprovada.

---

# Etapa 8 — Alertas

Promover Alertas para a navegação principal de Monitoramento.

## Objetivo

Virar a caixa de entrada única de situações que pedem ação.

Exemplos:
- câmera offline;
- Agent sem comunicação;
- imagem escura;
- câmera deslocada;
- abertura atrasada;
- atividade fora do horário;
- processo incompleto;
- falha operacional.

## Card

> Câmera Balcão Alto possivelmente deslocada  
> Detectado às 14:21  
> Recomendação: confira se a câmera foi movimentada.

Ações:
- Estou verificando
- Resolvido
- Ver registro

Funcionamento continua mostrando saúde da câmera, mas o tratamento do alerta fica centralizado aqui.

---

# Etapa 9 — Entre câmeras

## Interface

> Possível passagem entre câmeras  
> Balcão Alto → Balcão Lateral  
> Aproximadamente 18 segundos  
> Os registros parecem mostrar a mesma pessoa, mas o MonitorIA não faz reconhecimento facial.

Mostrar dois registros visuais lado a lado.

## Recolher

- percentual;
- hipóteses concorrentes;
- scores;
- detalhes temporais técnicos.

## Refinamento futuro

Opcional após go-live:
- Parece ser a mesma pessoa/veículo?
  - Sim
  - Não
  - Não sei

Não é requisito para o primeiro lançamento público.

---

# Etapa 10 — Navegação final e auditoria de produção

Somente depois das etapas anteriores:

1. Promover Alertas.
2. Renomear Avançado → Mais análises.
3. Mover Funcionamento para Câmeras.
4. Revisar desktop.
5. Revisar mobile.
6. Testar owner.
7. Testar admin.
8. Testar member.
9. Testar Pesquisa IA.
10. Testar MCP.
11. Auditar todos os termos técnicos.
12. Auditar timezone em todas as telas.
13. Auditar empty states e onboarding tardio.
14. Confirmar que nenhuma alteração tocou Agent 1.0.1.

---

# Critério de conclusão da fase

A fase estará pronta para divulgação quando um novo cliente conseguir:

1. instalar e parear sozinho;
2. cadastrar e contextualizar câmeras;
3. entender acontecimentos sem treinamento;
4. consultar informações pela Pesquisa IA;
5. usar MCP sem conhecer termos técnicos;
6. perceber rotinas e diferenças;
7. revisar análises com linguagem simples;
8. entender o que o sistema aprendeu;
9. aprovar ou rejeitar refinamentos;
10. receber alertas acionáveis;
11. verificar funcionamento das câmeras;
12. nunca precisar entender arquitetura, campos internos, scores ou nomes técnicos para operar o produto.

---

# Regra de congelamento

Durante toda esta fase:

- Agent 1.0.1 permanece congelado;
- instalador Microsoft Store permanece congelado;
- ONVIF/RTSP permanece congelado;
- descoberta automática permanece congelada;
- pareamento permanece congelado;
- FFmpeg e dependências permanecem congelados.

As mudanças ficam restritas ao dashboard, APIs web e migrations necessárias para inteligência/refinamento.
