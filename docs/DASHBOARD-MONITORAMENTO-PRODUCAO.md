# MonitorIA — Fase Dashboard de Produção

Base de planejamento: `main` em 20/08/2026, após o fechamento do Agent 1.0.1 e das correções de Pesquisa IA/estados visuais.

## Progresso de execução

- ✅ Etapa 1 — Fundação compartilhada
- ✅ Etapa 2 — Acontecimentos
- 🟡 Etapa 3 — Períodos — pacote preparado
- ⬜ Etapa 4 — Rotinas
- ⬜ Etapa 5 — Processos
- ⬜ Etapa 6 — Padrões da operação
- ⬜ Etapa 7 — Funcionamento das câmeras
- ⬜ Etapa 8 — Alertas
- ⬜ Etapa 9 — Entre câmeras
- ⬜ Etapa 10 — Navegação final e auditoria

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

# Etapa 3 — Períodos

## Linguagem

Trocar:
- sessão → período/atividade;
- capítulo → registro;
- história operacional → atividade agrupada;
- memória curta → não expor ao cliente.

## Detalhe

- Resumo
- Participantes
- Resultado observado
- Registros deste período
- Detalhes da análise

## Reconciliação

- acontecimento irrelevante deixa de compor o período;
- período sem nenhum registro relevante deixa de aparecer;
- participantes associados somente a registros irrelevantes deixam de aparecer;
- resultados cuja evidência ficou irrelevante deixam de aparecer;
- classificação corrigida atualiza o tipo do registro relacionado;
- contagens, duração, início, fim e nível de certeza são recalculados;
- alterar a avaliação novamente restaura o agrupamento automaticamente;
- Pesquisa IA e MCP usam o mesmo período reconciliado;
- fuso do local é usado no detalhe.

---

# Próximas etapas

- Etapa 4 — Rotinas
- Etapa 5 — Processos
- Etapa 6 — Padrões da operação
- Etapa 7 — Funcionamento das câmeras
- Etapa 8 — Alertas
- Etapa 9 — Entre câmeras
- Etapa 10 — Navegação final e auditoria

---

# Regra de congelamento

Durante toda esta fase:

- Agent 1.0.1 permanece congelado;
- instalador Microsoft Store permanece congelado;
- ONVIF/RTSP permanece congelado;
- descoberta automática permanece congelada;
- pareamento permanece congelado;
- FFmpeg e dependências permanecem congelados.
