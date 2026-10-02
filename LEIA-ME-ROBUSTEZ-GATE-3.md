# MonitorIA — Robustez Gate 3/3

## Diagnóstico e recuperação assistida

Este overlay implementa o terceiro Gate de robustez compartilhado entre o MonitorIA padrão e o MonitorIA VIP.

**Base analisada:** `main` em `593eaf36ebccf6a88f24e31870d92711726f8e6c`.

Este pacote foi construído para ser aplicado **junto e depois do Gate 2/3**. Os dois overlays não disputam os mesmos arquivos de implementação do Gate 2, portanto podem ser enviados no mesmo commit.

## O que muda

A área de câmeras deixa de mostrar apenas um checklist técnico e passa a transformar os sinais já existentes do backend em um diagnóstico operacional por câmera.

O mesmo motor é usado no padrão e no VIP e diferencia:

- problema do computador / Agent;
- problema da câmera ou stream;
- plano ainda não liberado;
- perfil inteligente pendente;
- monitor local ainda não confirmado;
- lacuna do pipeline;
- degradação visual;
- estados inconsistentes entre servidor, Agent e sessão de monitoramento.

O painel também mostra, quando disponível:

- último heartbeat do Agent;
- última imagem armazenada;
- última análise concluída;
- estado da sessão de monitoramento;
- fila do Agent;
- versão do Agent;
- espaço livre informado pelo computador.

## Falhas RTSP sem expor segredos

O Agent 1.0.3 já envia códigos sanitizados de falha ao backend. O Gate 3 usa somente o código, nunca a URL RTSP, IP, usuário, senha ou mensagem técnica crua.

Exemplos tratados:

- `rtsp_unauthorized`;
- `rtsp_forbidden`;
- `rtsp_path_not_found`;
- `rtsp_too_many_clients`;
- `rtsp_refused`;
- `rtsp_unreachable`;
- `rtsp_unsupported_stream`;
- `rtsp_capture_failed`;
- `continuous_monitor_failed`.

Cada código vira uma orientação em português e uma próxima ação segura.

## Recuperação assistida, não recuperação fictícia

O Gate não cria um botão que afirma reiniciar a câmera ou o Agent quando o backend não possui esse mecanismo.

Quando já existe uma recuperação automática no Agent 1.0.3, a tela explica isso. Por exemplo:

- retry/backoff de câmera;
- nova verificação periódica;
- tentativa de reencontrar endereço local após falhas repetidas de rede;
- nova autenticação periódica do Agent;
- preservação da fila local.

O botão **Verificar novamente** apenas consulta novamente o estado do servidor.

Ações que exigem intervenção local encaminham para a área correta de descoberta, instalação/reparo, perfil, plano ou funcionamento.

## Estados inconsistentes

O Gate não mascara divergências. Ele sinaliza explicitamente situações como:

- mais de um vínculo de Agent habilitado para a mesma câmera;
- sessão de monitoramento aberta sem Agent utilizável;
- sessão aberta com heartbeat antigo;
- câmera marcada online com último sinal antigo;
- câmera online sem pareamento concluído;
- vínculo habilitado apontando para Agent desativado.

Nenhuma dessas situações é corrigida apagando ou alterando dados automaticamente.

## Agent 1.0.3 permanece congelado

Este overlay contém **zero arquivos `agent/**`**.

Não foram implementados agora:

- watchdog novo;
- restart automático de monitor;
- alteração de RTSP;
- mudança automática de parâmetros da câmera;
- `runtime_revision`;
- `camera_monitor_self_recovered`;
- nova telemetria por câmera no binário.

Esses itens foram consolidados em `docs/MONITORIA-AGENT-1.0.4-BACKLOG.md` para uma evolução futura única do Agent.

## Banco de dados

Nenhuma migration nova é necessária.

O Gate reutiliza tabelas e sinais que já existem no MonitorIA. O schema de produção foi conferido em modo somente leitura antes da construção.

## Aplicação

Se você ainda não subiu o Gate 2, a forma mais simples é usar o ZIP combinado dos Gates 2 + 3.

Se preferir aplicar separadamente:

1. aplique o overlay do Gate 2;
2. aplique este overlay do Gate 3;
3. faça um único commit/push;
4. confira `npm run check`, `npm test` e `npm run build` no CI;
5. confirme Vercel `READY` no mesmo SHA.

Não publique uma nova versão do Agent por causa destes Gates.
