# MonitorIA 1.0.3 RC — Handoff de continuidade

**Atualizado em:** 28/08/2026, ~16:33 (America/Sao_Paulo)  
**Repositório:** `BigCorps/MonitorIA`  
**Supabase:** `xwejfayeackbrilipgrj`  
**Objetivo:** concluir a 1.0.3 como versão de produção, sem publicar/taguear antes de fechar todos os testes.

---

## 1. Regra de trabalho

- GitHub, Supabase e Vercel devem ser usados em modo de consulta por padrão.
- Alterações no Supabase/Vercel só com autorização explícita separada.
- Entregas de código: ZIP contendo somente arquivos completos alterados/novos, nos caminhos corretos.
- Não criar ainda:
  - tag `agent-v1.0.3`;
  - release pública;
  - troca do download público 1.0.2 → 1.0.3;
  - `MONITORIA_STORE_PUBLIC_URL`;
  - alteração de `AGENT_RECOMMENDED_VERSION`;
  - envio da atualização à Microsoft Store.

---

## 2. O que já está aprovado na 1.0.3

### Core / Windows 24/7

Aprovado em campo:

- upgrade 1.0.2 → 1.0.3 sem perder pareamento;
- Windows Service `MonitorIAAgent`;
- serviço `Running` e `Automatic`;
- execução antes do login;
- heartbeat confirmado no backend ainda na tela de login;
- 2 câmeras simultâneas;
- fila durável;
- queda de internet + recuperação;
- ausência de duplicação de eventos;
- evidências visuais com `start + peak + end + extra`;
- vídeo `preserved_clip`;
- correção dos gaps `visual_evidence_unavailable`;
- Agent principal com Authenticode válido;
- instalador 24/7 assinado;
- `unins000.exe` agora com Authenticode válido + timestamp.

### Fase 05B.3 — evidência JPEG

Corrigiu a perda intermitente de frames. A causa era FFmpeg poder sair com código 0 sem produzir JPEG ao ler segmento ainda aberto.

Resultado validado: eventos recentes chegaram com 4 imagens + vídeo.

### Fase 05B.4 / 05B.4.1 — desinstalador assinado

- Inno Setup chama SignTool sobre `uninst.e32.tmp`.
- SSL.com rejeitava `.tmp`.
- Wrapper passou a assinar cópia `.exe`, validar e devolver os mesmos bytes ao temporário do Inno.
- `unins000.exe` instalado foi verificado como `Status: Valid`.

### Fase 05B.5 — UTF-8 dos hosts nativos

Sintoma Store:

- `cÃ³digo`
- `conexÃ£o`
- `instalaÃ§Ã£o`

Causa: MSVC compilando fontes UTF-8 sem `/utf-8`.

Correção: `/utf-8` nos hosts nativos + trava de CI.

Resultado: tela Store agora mostra os acentos corretamente.

### Store — embalagem e isolamento

Já aprovado:

- instalação per-user em `%LOCALAPPDATA%\Programs\MonitorIA`;
- `monitoria-desktop.exe` assinado;
- `monitoria-agent.exe` assinado;
- `unins000.exe` assinado;
- Desktop Host separado do Windows Service;
- Store sem pareamento não cria Agent novo no backend;
- desinstalar Store remove apenas:
  - pasta Store;
  - autostart HKCU;
  - dados per-user;
- desinstalar Store NÃO remove nem para o 24/7.

---

## 3. Teste Store atual e descoberta do problema de reparo

Foi criada a Fase 05B.6 para disponibilizar um código de pareamento por local depois do onboarding.

### Problema 1 — loader infinito

Após consumir o código, a página permaneceu em:

> Esperando o computador se conectar

A causa foi identificada:

- a 05B.6 reutilizou `FirstRunWaiting`;
- `FirstRunWaiting` verifica `getFirstRunStatusAction()`;
- em uma conta que já concluiu onboarding, o estágio global permanece **5**;
- portanto o loader de reparo nunca tem uma mudança de estágio para detectar.

**Conclusão:** reparo precisa de polling específico do novo Agent, não do estágio global de onboarding.

### Problema 2 — câmeras duplicadas

Depois de entrar manualmente em Câmeras e executar nova descoberta, o ambiente ficou com quatro registros:

Câmeras originais:

- `700a81b8-fcd4-45ec-aeaf-d7f278fb9dfb` — `Lateral`
- `a8d64941-6785-4063-ab2a-77f31ae5844c` — `Balcão Alto`

Câmeras criadas somente pelo teste de reparo:

- `78d02bfa-3346-426b-b4e0-af269fcb6a5a` — `Lateral2`
- `9a3c7672-79f7-4da1-8708-40d77d43c536` — `Alto2`

Agent Store atual:

- `dc9f6be2-6d4b-4953-8694-bdaa17aa97c5`
- versão 1.0.3
- online no momento da checagem

Agent 24/7 anterior:

- `e650af3b-92ed-47d5-b7df-af3826fa28ce`
- versão 1.0.3
- corretamente `disabled` após o novo pareamento

Portanto o contrato “um computador ativo por local” funcionou. O erro está na reassociação das câmeras.

### Causa da duplicação

`/api/agent/cameras/discovered` já sabe reutilizar câmeras em:

- `unpaired`;
- `pairing`;

desde que não exista vínculo `agent_cameras.enabled=true`.

Porém, ao trocar o Agent:

- as câmeras antigas continuaram `paired`;
- os vínculos com o Agent desativado continuaram `enabled=true`.

Assim a descoberta não encontrou câmeras reaproveitáveis e criou registros novos.

---

## 4. Fase 05B.6.1 — correção preparada

A 05B.6.1 deve substituir a 05B.6 antes de qualquer publicação.

### UX final

A aba principal **Parear computador** deve desaparecer.

As abas voltam a ser apenas:

- Câmeras
- Instalação
- Como conectar

Na página **Instalação**, aparecerá uma ação secundária:

> Trocar ou reparar computador

Ela é manutenção, não onboarding.

### Assistente de reparo

Segue o padrão já validado do onboarding, com barra de progresso:

1. **Conectar**
   - gera código por local;
   - mostra código de 15 minutos;
   - loader acompanha especificamente o novo Agent;
   - avança ao receber o primeiro heartbeat;
   - sem refresh manual.

2. **Procurar**
   - reaproveita as server actions de descoberta validadas;
   - pede usuário/senha uma única vez;
   - credenciais são apagadas ao terminar;
   - mostra progresso real:
     - queued;
     - starting;
     - scanning;
     - testing;
     - saving;
     - done.

3. **Concluir**
   - mostra quantidade reassociada;
   - link para conferir câmeras;
   - link para voltar à Instalação.

### Backend / preservação

Migration preparada:

`supabase/migrations/20260828195500_repair_pairing_preserves_cameras.sql`

No pareamento **por local**:

- identifica o Agent anterior;
- desativa o Agent anterior;
- desabilita somente vínculos de câmeras que estavam realmente habilitados;
- NÃO apaga linhas de `cameras`;
- muda essas câmeras temporariamente para `pairing/offline`;
- cria o novo Agent;
- move `trial_runs.agent_id` de demonstrações em andamento para o Agent substituto;
- a descoberta do Agent novo reencontra os streams;
- o endpoint já existente reutiliza os IDs antigos;
- o Agent grava o RTSP novamente no cofre local do novo host.

Isso preserva:

- `camera.id`;
- nome;
- perfil;
- zonas;
- plano;
- histórico;
- acontecimentos;
- evidências;
- inteligência ligada à câmera.

### Observação sobre ordem das câmeras

O Agent já ordena candidatos de descoberta por IPv4/canal antes das associações.
O fluxo original também usou essa ordenação. A migration permite reutilizar os
IDs existentes na mesma sequência de criação. Após o reparo, ainda deve haver
uma conferência visual dos nomes/imagens antes de chamar esta parte de
certificada para troca de PC em produção.

---

## 5. Não aplicar a 05B.6.1 sobre o estado duplicado sem limpeza

O ambiente RC atual possui `Lateral2` e `Alto2`.

Antes do teste final da 05B.6.1:

1. verificar se os dois registros novos têm acontecimentos/evidências criados no teste;
2. preservar as câmeras originais `Lateral` e `Balcão Alto`;
3. remover somente os dados de teste que forem seguros;
4. reassociar o ambiente à situação esperada;
5. confirmar que o painel volta a mostrar **2 câmeras**, não 4.

Essa limpeza exige autorização explícita antes de qualquer `DELETE`/mudança no Supabase.

---

## 6. Trial RC

O mesmo trial usado nos testes foi reaberto em 28/08/2026 para validação Store.

Na última atualização:

- trial: `a90acfa0-dfd3-4ac3-ab6b-d6b10684b710`
- status: `running`
- término configurado: `2026-08-28 20:58:25.75917+00`
  - aproximadamente 17:58:25 em Brasília
- `agent_id` ainda estava no Agent 24/7 anterior quando consultado antes da 05B.6.1.

Se esta janela já tiver passado quando outro agente assumir a conversa, não
assumir que o trial continua ativo. Consultar antes. Só estender novamente com
autorização explícita do usuário.

---

## 7. Sequência recomendada daqui para frente

### Etapa A — aplicar 05B.6.1

1. usuário sobe o ZIP no GitHub;
2. Validate RC deve ficar verde;
3. Vercel deve publicar o frontend;
4. NÃO executar ainda a migration sem combinar o teste/limpeza.

### Etapa B — limpar o ambiente RC duplicado

Com autorização explícita:

1. mapear referências de `Lateral2` e `Alto2`;
2. avaliar eventos/evidências criados apenas durante teste;
3. remover duplicados com segurança;
4. restaurar as duas câmeras originais;
5. confirmar 2 câmeras no painel.

### Etapa C — aplicar migration de reparo

Executar:

`20260828195500_repair_pairing_preserves_cameras.sql`

Depois ler `pg_get_functiondef(consume_agent_pairing_code)` e conferir que a
função ativa é a nova.

### Etapa D — retestar Store pelo assistente

1. garantir que somente o host a ser substituído está ativo;
2. instalar/abrir Store;
3. Instalação → Trocar ou reparar computador;
4. gerar código;
5. informar na Store;
6. confirmar avanço automático de Conectar → Procurar;
7. executar descoberta;
8. confirmar barra de progresso;
9. confirmar avanço automático para Concluir;
10. confirmar backend:
    - um único Agent ativo no local;
    - mesmas duas `camera.id` originais;
    - nenhuma câmera nova;
    - `agent_cameras` apontando para o novo Agent;
    - trial/entitlement correto;
    - 2/2 câmeras monitorando.

### Etapa E — eventos reais Store

Com Store como único host:

1. movimento em ambas as câmeras;
2. confirmar eventos;
3. confirmar 4 imagens + vídeo;
4. confirmar fila 0;
5. fechar/reabrir Desktop Host;
6. bloquear/desbloquear sessão do Windows;
7. confirmar Store continua monitorando enquanto a sessão está logada.

### Etapa F — retorno ao 24/7

Depois de fechar Store:

1. desinstalar Store;
2. reparar/reparear 24/7 usando o mesmo fluxo final;
3. confirmar que IDs das duas câmeras continuam os mesmos;
4. confirmar serviço 24/7 volta a 2/2.

### Etapa G — Linux

CI já passou em:

- Linux x64;
- Linux arm64;
- instalação;
- restart;
- upgrade-safe.

Decidir se haverá teste físico Linux ou se CI é suficiente para 1.0.3.

### Etapa H — fechar RC e publicar

Somente depois de todos os itens acima:

1. coletar hashes finais dos 4 artifacts;
2. confirmar manifesto final;
3. criar tag `agent-v1.0.3`;
4. publicar release;
5. alterar download público;
6. atualizar versão recomendada;
7. configurar URL Store somente quando existir URL oficial `apps.microsoft.com`;
8. preparar/submeter atualização Microsoft Store.

---

## 8. Itens que NÃO são bug neste momento

- `0 monitorando de 2` após expiração do trial: esperado por entitlement.
- Store pedir código em instalação nova: esperado.
- 24/7 e Store terem armazenamento local separado: intencional.
- Store não monitorar antes do login: intencional.
- 24/7 monitorar antes do login: já validado.

---

## 9. Pendências separadas / não misturar

Há ruído antigo de recuperação de vídeo `.sources` apontando para segmentos já
ausentes. Não misturar essa limpeza com o reparo Store sem uma política segura
de expiração.

---

## 10. Critério de pronto da 1.0.3

A 1.0.3 só deve ser considerada pronta para publicação quando:

- Windows 24/7 permanecer aprovado;
- Store instalar/atualizar/desinstalar isoladamente;
- Store parear pelo fluxo final sem loader infinito;
- troca 24/7 ↔ Store preservar `camera.id` e histórico;
- não criar câmeras duplicadas;
- Store gerar eventos reais em 2 câmeras;
- Linux aceito;
- todos os workflows RC verdes;
- hashes/manifests finais registrados;
- nenhuma tag/publicação antecipada.
