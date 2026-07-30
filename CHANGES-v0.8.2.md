# MonitorIA v0.8.2

## Navegação

- **Eventos** permanece como linha do tempo;
- **Pesquisa** recebe ícone de bot e vira a conversa com o Assistente MonitorIA;
- **Instalador** substitui “Agents locais”.

## Eventos

- exportação completa do período filtrado;
- cópia e download em Markdown ou JSON;
- exporta todos os resultados, não apenas a página atual;
- inclui indicadores estimados de clientes, funcionários, entregas,
  eventos com sinais de atendimento, objetos e veículos;
- limite técnico de 5.000 eventos por arquivo, com aviso quando atingido.

## Pesquisa

- Assistente MonitorIA com GPT-5 nano configurável;
- conversa armazenada com acesso aos dados da organização;
- histórico privado por usuário;
- período, local e câmera opcionais;
- planejamento estruturado da consulta;
- agregações e pesquisas executadas no Supabase;
- somente os resultados necessários voltam ao modelo;
- eventos aparecem como evidência somente depois da pergunta;
- comparação entre períodos;
- custo do Assistente registrado separadamente;
- sem franquia mensal visível;
- proteção automática contra abuso: 15 perguntas por minuto por usuário.

## Instalador

- página `/dashboard/installer`;
- versão e status do Agent;
- CPU, memória, espaço livre e fila;
- instruções de instalação Windows;
- rota autenticada para o download comercial;
- durante a validação, o artifact do GitHub Actions continua sendo usado.

## Backend

Já aplicado via MCP:

- `assistant_threads`;
- `assistant_messages`;
- `assistant_period_summary(...)`;
- classificador refinado de eventos com sinais de atendimento;
- RLS dos eventos da organização e histórico de conversa privado por usuário;
- telemetria em `usage_events` com `purpose=assistant_query`.
