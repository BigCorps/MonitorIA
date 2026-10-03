# MonitorIA — checklist de aceite manual dos Gates de Robustez 1/3 → 3/3

Base para validação: `main` com Gates 1, 2 e 3 aplicados. Agent local permanece em **1.0.3**.

## 0. Pré-condições

- [ ] Usar somente câmeras/contas próprias de teste; não apagar dados reais para simular falha.
- [ ] Confirmar que o Agent continua em 1.0.3.
- [ ] Confirmar que não houve migration nova por causa dos Gates 2/3.
- [ ] Testar ao menos um fluxo padrão e, quando disponível, um Projeto VIP.

## 1. Gate 1 — estado real da câmera

- [ ] Câmera conectada, mas sem perfil aprovado, **não** aparece como “Monitorando”.
- [ ] Câmera com plano/perfil prontos, mas sem sessão de monitor local confirmada, aparece como “Pronta para monitorar” ou estado equivalente — nunca como falso positivo de monitoramento.
- [ ] Câmera realmente ativa mostra “Monitorando”.
- [ ] Ausência de acontecimentos/movimento não é tratada como falha por si só.
- [ ] O card mostra próximo passo/CTA coerente quando falta alguma etapa.

## 2. Multi-Site

- [ ] Ao conectar um computador, o sistema pergunta explicitamente em qual **Local** ele está instalado.
- [ ] É possível selecionar Local existente ou criar novo Local.
- [ ] Conectar um novo Local não desativa o Agent/câmeras de outro Local.
- [ ] Uma câmera continua associada ao Local correto após refresh/login novamente.

## 3. Gate 2 — descoberta inteligente e deduplicação

### 3.1 Repetir descoberta

- [ ] Rode a descoberta de uma câmera já cadastrada.
- [ ] O resultado deve indicar “Já cadastrada”/reaproveitada em vez de criar uma segunda câmera.
- [ ] Repetir a descoberta novamente não aumenta a quantidade de câmeras cadastradas.
- [ ] Perfil, histórico e configurações da câmera original permanecem no mesmo `camera.id` quando o registro é reaproveitado.

### 3.2 Conflitos e possíveis duplicatas

- [ ] Uma correspondência forte com câmera ligada a outro Local não é movida automaticamente.
- [ ] O painel informa “Outro Local” ou necessidade de revisão.
- [ ] Câmeras de mesmo fabricante/modelo não são automaticamente fundidas só por serem iguais.
- [ ] Casos ambíguos aparecem como “Possível duplicata”, sem exclusão automática.
- [ ] Nenhuma ação de descoberta apaga câmera de produção.

### 3.3 Agent antigo/desativado

- [ ] Se houver uma câmera de teste órfã ligada a um Agent desativado, a descoberta pode reaproveitar o cadastro existente.
- [ ] O vínculo antigo só deixa de ser utilizado depois que a nova associação estiver salva.
- [ ] Histórico/perfil da câmera continuam preservados.

## 4. Gate 3 — diagnóstico e recuperação assistida

### 4.1 Câmera saudável

- [ ] “Ver diagnóstico avançado” mostra último heartbeat, última imagem e última análise.
- [ ] O diagnóstico saudável não pede reparos desnecessários.

### 4.2 Agent/computador offline

- [ ] Em uma câmera de teste, pare/feche temporariamente o Agent ou use um Agent já offline.
- [ ] O painel identifica o **computador/Agent** como causa provável, em vez de culpar plano ou câmera.
- [ ] O CTA leva ao fluxo de instalação/reparo.

### 4.3 Câmera/stream

- [ ] Em uma câmera de teste com credencial/endereço inválido, o diagnóstico aponta câmera/stream.
- [ ] Quando houver código sanitizado conhecido (`rtsp_unauthorized`, `rtsp_unreachable`, etc.), a orientação aparece em português.
- [ ] URL RTSP, senha e detalhes crus não aparecem no painel.
- [ ] O painel explica quando o Agent 1.0.3 já fará retry/backoff automaticamente.

### 4.4 Plano e perfil

- [ ] Se a parte técnica estiver pronta e faltar entitlement/plano, o diagnóstico aponta **plano**, não Agent.
- [ ] Se houver imagem/plano mas faltar perfil, o diagnóstico aponta **perfil inteligente** e oferece o CTA correto.

### 4.5 Monitor/pipeline

- [ ] Uma falha `continuous_monitor_failed` é apresentada como problema do **monitor local**, separada de RTSP, plano e perfil.
- [ ] Lacuna de processamento/evidência é apresentada como problema de **pipeline**, sem afirmar que a câmera está offline quando ela não está.
- [ ] “Verificar novamente” apenas atualiza os sinais; não promete reiniciar runtime/Agent.

### 4.6 Saúde visual

- [ ] Se houver incidente visual real já detectado (escuro, obstrução, congelamento etc.), o diagnóstico aponta **qualidade/saúde visual**, não conexão do Agent.
- [ ] O CTA leva ao funcionamento/saúde da câmera.

## 5. VIP + padrão

- [ ] O padrão usa o mesmo núcleo de estado/diagnóstico do VIP.
- [ ] Os CTAs do padrão levam às rotas padrão.
- [ ] Os CTAs do VIP mantêm o fluxo VIP/onboarding quando aplicável.
- [ ] O VIP continua exibindo apenas câmeras vinculadas ao Projeto VIP.
- [ ] Nenhuma câmera padrão é convertida para entitlement VIP por causa dos Gates de robustez.

## 6. Não-regressão

- [ ] Convite corporativo continua usando link + código próprio de 6 dígitos.
- [ ] Perfil guiado continua oferecendo “Aprovar e iniciar monitoramento”.
- [ ] Trial não começa durante descoberta/configuração/calibração.
- [ ] Nenhum fluxo novo exige alteração do Agent 1.0.3.
- [ ] Nenhum dado/câmera foi apagado automaticamente durante os testes.

## 7. Critério de aceite técnico

Depois do upload do patch final:

- [ ] `Validate Web App` verde no novo SHA.
- [ ] Vercel `READY/success` no mesmo SHA.
- [ ] Nenhum erro de build do Next.js.
- [ ] Gates 1/2/3 aprovados na validação manual acima.

### Workflow da Microsoft Store

O workflow `Validate MonitorIA 1.0.3 Store Install Experience` é uma trilha separada do frontend/backend dos Gates 1/2/3. No SHA anterior ele falhou porque `build/monitoria-store-launcher.exe` não estava presente no job. **Não corrigir isso neste pacote**, pois exigiria entrar novamente na trilha de empacotamento do Agent/Store, que está congelada até a evolução consolidada do Agent 1.0.4.
