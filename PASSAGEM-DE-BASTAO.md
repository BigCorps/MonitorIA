# MonitorIA — Passagem de bastão: descoberta de câmeras no painel

Documento para o agente que vai assumir esta fase. Escrito por quem trabalhou
no projeto antes, com o que foi medido, decidido e aprendido.

---

## 1 · Quem usa isto

**Dono de comércio de bairro.** Mercado, pet shop, oficina, farmácia. Tem
entre 2 e 6 câmeras, já instaladas, compradas de um técnico que talvez nem
atenda mais o telefone.

Ele **não sabe** o que é DVR, RTSP, ONVIF, IP fixo, porta ou stream. Chama a
caixinha embaixo do balcão de "o gravador". Se algo pedir uma informação
técnica, ele para e liga para alguém — ou desiste.

**A regra do produto é autoatendimento.** O cliente instala, configura e usa
sozinho, sem suporte. Toda decisão de interface deve ser medida por: *"o dono
do mercado consegue fazer isso sozinho, sem ligar para ninguém?"*

Isto não é uma preferência de estilo. É o modelo de negócio: o preço por
câmera (R$ 39,90 a R$ 149,90/mês) não sustenta atendimento humano em cada
instalação.

---

## 2 · A missão

**Tirar a descoberta de câmeras do instalador e levar para o painel.**

### Como é hoje

O instalador pede o código de pareamento, depois usuário e senha das câmeras,
e roda a busca ali mesmo. Enquanto busca, **a janela congela** — o Inno Setup
usa execução síncrona e a fila de mensagens do Windows para. O cliente vê uma
tela travada por até 75 segundos e conclui que o programa morreu.

Já foram adicionadas saídas de emergência (pular a etapa, concluir mesmo com
falha), mas o desenho continua errado: instalação e configuração de câmera são
momentos diferentes e não deveriam estar na mesma janela.

### Como deve ficar

**Instalador:** o mais simples possível. Código de pareamento, instala, pronto.
Termina dizendo, em palavras simples, que agora é só abrir o painel para
adicionar as câmeras.

**Painel:** uma tela que procura as câmeras, mostra o progresso enquanto
procura, lista o que encontrou, e permite tentar de novo o que falhou.

### Por que é melhor

- A janela do painel não congela — dá para mostrar progresso de verdade
- O cliente pode instalar hoje e configurar amanhã, quando o eletricista ligar as câmeras
- Instalação grande (20, 30 câmeras) deixa de ser inviável
- **Fica registro no banco**, e isso muda o jogo: hoje, quando a busca falha,
  a informação morre na tela do instalador. Com registro, dá para ver quais
  modelos de equipamento falham no parque inteiro de clientes e corrigir para
  todos de uma vez

---

## 3 · Como escrever para este cliente

Esta seção é a mais importante do documento. O produto já tem uma diretriz de
linguagem estabelecida — siga.

### Palavras proibidas na interface

Nunca aparecem em tela para o cliente:

`ONVIF` · `RTSP` · `snapshot` · `metadados` · `frames` · `stream` · `endpoint`
· `token` · `payload` · `timeout` · `polling` · `Agent` (em inglês) ·
`x64` · `RLS` · `SMTP` · `hash` · `parsing` · `franquia`

**Podem aparecer:** DVR e NVR. O público conhece essas duas, e usá-las prova
que falamos a língua dele.

### Traduções já estabelecidas

| Em vez de | Escreva |
|---|---|
| Agent | o programa do MonitorIA / o programa da loja |
| pareamento, parear | conectar, ativar |
| ONVIF/RTSP | as formas de conexão do seu equipamento |
| descoberta / discovery | procurar câmeras |
| timeout | demorou demais |
| retry | tentar de novo |
| credenciais | usuário e senha |
| metadados | o registro do que aconteceu |
| frames | imagens |

### Regras de redação

**O produto é masculino: "o MonitorIA".** Slogan oficial: *"Sua câmera vê, o
MonitorIA lembra!"* — vive em `src/lib/app-config.ts` como fonte única. Nunca
escreva o slogan à mão em outro arquivo; importe de lá.

**Toda mensagem de erro precisa dizer o que fazer.** "Falha na conexão" é
inútil. "Não encontramos nenhuma câmera nesta rede. Confira se elas estão
ligadas e no mesmo roteador do computador" é útil.

**Nunca mostre erro técnico ao cliente.** Já houve um caso em produção em que
o cliente via *"Verifique a configuração SMTP"* — coisa que ele não tem como
verificar. Erro técnico vai para o log; para a tela vai a tradução.

**Espera precisa ser explicada.** Se algo demora, diga quanto tempo e o que
está acontecendo. "Procurando câmeras. Isso costuma levar menos de um minuto"
é melhor que uma barra girando.

**Pergunte só o que ele sabe responder.** Já foi descartada a ideia de
perguntar *"é câmera de aplicativo ou DVR?"* justamente por isso: ele pode
errar e ficar preso. A alternativa aprovada é perguntar **"quantas câmeras
você tem?"** — todo mundo sabe, e a resposta serve tecnicamente como teto de
canais a sondar.

---

## 4 · Acessos

### Repositório

```
https://github.com/BigCorps/MonitorIA
```

Next.js (App Router) + TypeScript. Painel em `app/dashboard/`, o programa da
loja em `agent/` (subprojeto com `tsconfig.json` próprio — erros de `tsc` em
`agent/` não são do app web).

### Supabase — via MCP

```
project_id: xwejfayeackbrilipgrj   (nome: MonitorIA, us-west-2, Postgres 17)
```

Ferramentas: `execute_sql`, `apply_migration`, `list_tables`, `get_advisors`.

**Atenção:** as ferramentas do MCP caem com alguma frequência. Se
`Supabase:execute_sql` sumir, rode `tool_search` de novo para recarregar.

### Vercel — via MCP

```
team_id:    team_CA9mEPGKBLKZprw1aPyQRDIF
project_id: prj_5YEoHm2nwgMhcQZooDGSYm4okdvk   (monitoria)
```

Útil: `get_runtime_errors` e `get_runtime_logs` para ver o que está quebrando
em produção.

### Domínio

Produção é **`https://monitoria.cam`**, origem única e canônica. `www`
redireciona. Nunca construa URL de autenticação a partir de
`window.location.origin` — use `src/lib/auth-origin.ts`.

---

## 5 · Arquitetura sugerida

O Agent **já consulta o servidor a cada 60 segundos**
(`CONFIG_SYNC_INTERVAL_MS` em `agent/src/service.ts`). Aproveite esse canal;
não crie conexão permanente nem abra porta na rede da loja.

```
Painel  →  grava pedido de busca no banco
Agent   →  na próxima consulta, vê o pedido e executa
Agent   →  reporta progresso em etapas (não só no fim)
Painel  →  mostra progresso e as câmeras encontradas
```

### As cinco peças

| Peça | Onde |
|---|---|
| Tabela `discovery_runs` | migration nova |
| Devolver pedido pendente | `app/api/agent/config/route.ts` |
| Executar e reportar em etapas | `agent/src/service.ts` |
| Receber progresso e resultado | `app/api/agent/discovery/` (rotas novas) |
| Tela de busca | `app/dashboard/cameras/` |

### Decisões que ficam com você

- Quanto tempo um pedido vale antes de expirar
- Se o Agent tenta de novo sozinho quando falha
- Quantas buscas simultâneas por organização
- **Se o intervalo de 60s diminui quando há pedido pendente.** Sem isso, o
  cliente clica em "Procurar câmeras" e pode esperar um minuto até algo
  acontecer. Ou a tela explica isso com honestidade, ou o intervalo cai — a
  segunda é melhor para o cliente e dá mais trabalho

---

## 6 · O que já se sabe (não redescubra)

Levantado no código e medido em produção:

**ONVIF enumera perfis, não canais.** Em `agent/src/discovery/index.ts`, se o
ONVIF devolve stream válido, a função retorna antes do laço de canais. Ou
seja: câmera IP e DVR com ONVIF **já funcionam completos hoje**. O parâmetro
`channels: [1]` só entra no plano B, para aparelhos sem ONVIF.

**O laço de força bruta é caro.** Linhas 328-331: `candidatos × canais ×
portas`. Subir os canais de 1 para 8 multiplica tudo por 8, inclusive
caminhos que não funcionam. A solução aprovada é **inverter**: achar um
stream válido primeiro, depois testar os canais seguintes **no mesmo caminho
e porta que já se provaram bons** — 7 tentativas num endereço que responde,
em vez de 8× tudo. Com parada antecipada após dois canais vazios seguidos.

**O buffer de vídeo do Agent guarda 2 minutos.** `KEEP_BUFFER_MS = 120_000`
em `agent/src/clip-buffer.ts`. O clipe de evidência é limitado a 120s por
causa disso. Pedir mais gera clipe truncado **sem aviso nenhum**. Se um dia
subir o teto, suba o buffer antes.

**`camera_entitlements` é uma view, não tabela.** Deriva de
`camera_plan_catalog`. Não tente atualizar direto — o Postgres recusa. Mude o
catálogo e a view acompanha.

**Medições de produção (1.288 acontecimentos, 7 dias):** duração média 35,9s,
mediana 24s, p90 76,3s, p99 180,3s. Armazenamento de vídeo custa cerca de
R$ 1,69/mês para todas as câmeras — custo não é restrição aqui.

**Painel admin é por e-mail**, na variável
`MONITORIA_INTERNAL_OPERATOR_EMAILS`. Se ela sumir do ambiente, o painel
admin desaparece para todo mundo, sem mensagem de erro.

**Custo e modelo de IA são informação interna.** Nunca exiba ao cliente. Já
foi corrigido no detalhe do evento; não reintroduza.

---

## 7 · Como entregar

O responsável **não programa**. Ele aplica o que você mandar, pelo GitHub, e
testa com clientes reais.

### Arquivos

- **Arquivos completos**, prontos para substituir — não trechos soltos, a não
  ser que ele peça diff explicitamente
- Junte tudo num **zip**, com um `LEIA-ME.md` dentro
- No LEIA-ME: tabela de *arquivo → destino no repositório*, o que mudou em
  cada um, e o que ele deve conferir depois
- Se um arquivo for novo, diga isso. Se for substituição, diga isso
- Quando precisar de edição pontual em arquivo grande, mande o diff em bloco
  de código, com o número da linha

### SQL

- Aplique você mesmo via `Supabase:apply_migration`, com nome em snake_case
- **Sempre confirme com uma consulta depois**, e mostre o resultado
- Explique em português o que a migration fez, em uma frase
- Se for `update` ou `delete` em dados de cliente, **mostre antes o que será
  afetado** e espere confirmação

### Como ele trabalha

- Aplica pelo site do GitHub: abre o arquivo, lápis, Ctrl+A, cola, Commit
- Não roda comandos no terminal a menos que você dê o comando exato e diga
  em que pasta
- Ele já se confundiu colando YAML no terminal. **Sempre diga se algo é
  comando de terminal ou conteúdo de arquivo**

### Ritmo

Ele pediu **execução, não deliberação**: sem propor testes automatizados,
sem pedir confirmação a cada passo, sem listar alternativas quando uma já é
claramente melhor. Decida e entregue.

Duas exceções, que ele vai querer saber de qualquer forma: **algo que possa
apagar ou expor dados de cliente**, e **algo que quebre uma promessa feita na
landing** — nesses dois casos, avise antes.

---

## 8 · Estado atual

**Pronto e no ar:** autenticação com origem canônica, painel, análise por IA,
sessões operacionais, cobrança, aplicativo Android (TWA), instalador Windows
assinado pela SSL.com.

**Concluído na 0.11.0:**

- Vídeo do acontecimento inteiro (até 120s) em vez de clipe fixo de 15s
- Aviso sobre a mensagem do SmartScreen na página de download e no onboarding
- Saídas de emergência no instalador: dá para concluir sem conectar câmeras
- Busca de câmeras com prazo de 75s em vez de 120s
- Migration `clip_covers_full_event_up_to_120s` aplicada no banco

O instalador continua congelando a janela durante a busca — o Inno Setup usa
execução síncrona. As saídas de emergência tornam isso tolerável, mas **é
exatamente por isso que a busca precisa sair do instalador**, que é a missão
descrita neste documento.

**Item conhecido em aberto:** o desinstalador sai sem assinatura, então o
Windows mostra "Editor desconhecido" ao desinstalar. Instalar funciona
perfeitamente. Resolver exige configurar o CodeSignTool como SignTool nomeado
do Inno Setup.

**Ponto de atenção comercial:** o plano Detalhada teve custo de IA acima do
teto aprovado. Uma correção foi aplicada e o resultado ainda estava sendo
medido. Se você mexer em algo que aumente o volume de análises, verifique
`ai_cost_alerts` antes.
