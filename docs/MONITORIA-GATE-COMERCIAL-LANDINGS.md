# MonitorIA — Gate Comercial das landings

Base de construção: `main` em `cadb71c6acf1689fba267c3f2b9932e9a4821393`.

## Objetivo

Reorganizar as duas landings para que o visitante reconheça a dor antes de
receber a lista de recursos, seguindo a estratégia comercial que funcionou na
PixWiki sem copiar seu visual.

## Landing padrão

Nova sequência inicial:

1. Hero orientado à dor: já existem câmeras; falta encontrar o que elas viram.
2. Problema real já existente na landing.
3. Prova matemática interativa com quantidade de câmeras e horas gravadas.
4. Comparação `Só câmera + DVR` x `Com o MonitorIA`.
5. Setores e, depois, funcionamento, inteligência, planos e teste.

O slogan oficial continua vindo de `appConfig.slogan`; não foi duplicado nem
alterado.

## Landing VIP

O hero `Muitas câmeras. Uma operação pesquisável.` foi preservado.

Nova sequência inicial:

1. Hero VIP.
2. Problema de escala.
3. Prova matemática com o tamanho real da operação.
4. Comparação `Operação tradicional em escala` x `Com MonitorIA VIP`.
5. Públicos prioritários e restante da landing.

O CTA comercial da prova leva ao formulário VIP já existente. Não cria conta,
não inicia piloto e não altera cobrança.

## Calculadora

A calculadora não usa benchmarks externos, ROI, produtividade presumida ou
percentuais de economia.

Ela faz somente:

- `câmeras × horas gravadas por dia`;
- resultado × 30 dias;
- horas de um dia ÷ 8 para exibir a quantidade equivalente de jornadas de 8h
  necessária para assistir todo o volume daquele dia de forma sequencial.

Exemplos determinísticos:

- 8 câmeras × 24h = 192h/dia = 5.760h/30 dias = 24 jornadas de 8h;
- 50 câmeras × 24h = 1.200h/dia = 36.000h/30 dias = 150 jornadas de 8h.

## Escopo preservado

- nenhuma alteração em `agent/**`;
- nenhuma migration;
- nenhuma alteração em trial, entitlement, autenticação, cobrança ou Agent;
- nenhuma mudança no motor VIP;
- nenhuma mudança nos preços;
- nenhuma dependência nova.
