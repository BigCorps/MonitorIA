# MonitorIA — Gate Comercial das Landings

Aplique este ZIP **por cima do `main` atual**, preservando os caminhos.

Base usada para construir o overlay:

`cadb71c6acf1689fba267c3f2b9932e9a4821393`

## O que muda

- landing padrão: hero orientado à dor e CTA `Testar nas minhas câmeras`;
- landing padrão: `Problema` passa a vir antes de `Setores`;
- landing VIP: `Problema` passa a vir antes de `Setores`;
- nova prova interativa compartilhada padrão/VIP;
- comparação visual `antes x MonitorIA` específica para cada público;
- hero VIP `Muitas câmeras. Uma operação pesquisável.` permanece intacto;
- restante das duas landings mantém planos, piloto, FAQ, formulário e identidade atual.

## O que NÃO muda

- `agent/**`;
- Agent 1.0.3;
- banco / migrations;
- Supabase;
- autenticação;
- trial padrão;
- piloto VIP;
- preços;
- entitlement;
- cobrança;
- Motor Máximo 2.0;
- rotas de API.

## Upload

Não é necessário reaplicar os Gates de Robustez. Suba somente o conteúdo
deste ZIP preservando a estrutura de pastas.

Depois do upload, valide:

1. GitHub `Validate Web App`;
2. Vercel no mesmo SHA;
3. `/` em desktop e mobile;
4. `vip.monitoria.cam` em desktop e mobile;
5. editar quantidade de câmeras e horas nas duas calculadoras;
6. CTA padrão abre criação/teste;
7. CTA VIP rola para `#contato`;
8. formulário VIP continua sem criar conta ou iniciar piloto sozinho.
