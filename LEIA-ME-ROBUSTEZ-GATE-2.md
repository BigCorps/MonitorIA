# MonitorIA — Robustez Gate 2/3

Base usada para construir este overlay: `main` em `593eaf36ebccf6a88f24e31870d92711726f8e6c`.

## Objetivo

Este Gate implementa **descoberta inteligente + deduplicação + limpeza assistida** no núcleo compartilhado usado pelo MonitorIA padrão e pelo VIP.

A regra de produto é: **encontrar uma câmera não deve significar criar outra linha sem antes conferir o que já existe**.

## O que muda

### 1. Núcleo compartilhado de classificação

Novo arquivo: `src/camera/discovery-review.ts`.

Ele centraliza regras puras para:

- normalizar sinais de descoberta sem guardar credenciais/RTSP;
- comparar nome + fabricante + modelo de forma conservadora;
- escolher uma câmera existente que pode ser reaproveitada;
- reconhecer vínculo obsoleto de Agent `disabled`;
- montar a revisão da busca com os estados:
  - **Nova câmera**;
  - **Já cadastrada**;
  - **Outro Local**;
  - **Possível duplicata**;
  - **Indisponível**.

Fabricante + modelo iguais **não bastam** para identificar uma câmera física. Um match forte também precisa de evidência de nome e deve ser único.

### 2. Cadastro automático endurecido

`app/api/agent/cameras/discovered/route.ts` agora:

- consulta o inventário da organização antes de inserir;
- reaproveita câmera órfã do mesmo Local mesmo se `pairing_status` ficou incorretamente em `paired`;
- considera um vínculo `enabled=true` apontando para Agent `disabled` como obsoleto;
- só desabilita esse vínculo obsoleto **depois** que a nova associação foi salva;
- devolve o mesmo ID quando a câmera já pertence ao Agent atual e existe match forte/único;
- bloqueia uma nova linha quando há match forte/único em outro Local;
- bloqueia uma nova linha quando há match forte/único ligado a outro Agent ainda operacional;
- mantém o limite de 32 câmeras por Agent;
- não envia nem armazena URL RTSP, usuário ou senha.

Nenhuma câmera existente é apagada, renomeada ou movida automaticamente. Os únicos `DELETE`s preservados são rollback técnico de uma linha/vínculo criado pela própria requisição quando a operação não consegue concluir.

### 3. Revisão real da busca

`getDiscoveryStatusAction` agora cruza o `discovery_run` com:

- `cameras`;
- `agent_cameras`;
- `agents`;
- `sites`.

Para itens efetivamente reassociados, o sistema usa os timestamps do run e dos vínculos para distinguir com alta confiança:

- câmera criada agora;
- câmera antiga reaproveitada, preservando ID/histórico.

Nome/fabricante/modelo ficam reservados para correspondências prováveis que exigem revisão, especialmente conflito com outro Local e possível duplicata.

### 4. Frontend padrão + VIP

O `DiscoveryPanel` compartilhado passa a mostrar uma seção **Revisão da busca**.

Quando há conflito, aparece **Limpeza assistida** deixando explícito que nada foi apagado ou movido automaticamente. Fora do onboarding, uma câmera existente pode ser aberta para conferência. Durante onboarding, o painel não cria links de revisão que levem o cliente para fora do fluxo.

O avanço automático só ocorre quando a quantidade esperada foi conectada **e não existe conflito pendente**.

## O que NÃO muda

- nenhum arquivo em `agent/**`;
- Agent continua **1.0.3**;
- nenhuma migration nova;
- nenhuma Edge Function nova;
- nenhum plano/preço/entitlement;
- nenhuma regra do Motor Máximo/Pesquisa IA;
- nenhuma câmera real é limpa automaticamente.

## Limitação conhecida e intencional

O Agent 1.0.3 mantém URL RTSP e o identificador técnico do stream apenas na máquina local. O backend atual não possui um fingerprint de fonte que identifique com certeza uma câmera física.

Por isso este Gate não finge uma certeza inexistente. Casos ambíguos viram **Possível duplicata** e exigem revisão humana. Uma futura evolução do Agent 1.0.4 pode fornecer um fingerprint derivado e não sensível, mas isso ficou fora deste Gate por decisão de congelar o Agent.

## Aplicação

Este ZIP é overlay: envie os arquivos mantendo exatamente os caminhos internos. Não há SQL para executar.

Depois do upload, a validação autoritativa é:

```bash
npm run check
npm test
npm run build
```

Em seguida confirme GitHub Actions e Vercel no mesmo SHA.
