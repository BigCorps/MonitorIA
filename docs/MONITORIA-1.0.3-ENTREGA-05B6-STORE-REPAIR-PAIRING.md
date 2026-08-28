# MonitorIA 1.0.3 — Entrega 05B.6

## Objetivo

Permitir que uma organização já configurada gere novamente um código de
pareamento **por local** sem depender do onboarding inicial.

O caso foi identificado durante a validação da edição Microsoft Store:
o Desktop Host corretamente pede um código quando a Store ainda não possui
pareamento próprio, porém o gerador por local estava visível apenas no primeiro
acesso.

## Correção

Nova rota autenticada:

`/dashboard/installer/pair`

Ela:

- aparece nas abas de Câmeras como **Parear computador**;
- reutiliza o fluxo oficial `SitePairingCode`;
- gera código por local, válido por 15 minutos e de uso único;
- restringe a tela a `owner` e `admin`;
- explica que o computador anterior do local é desativado quando o novo código
  é consumido, evitando Agents concorrentes;
- serve para troca de máquina, reparo de instalação e alternância entre
  MonitorIA 24/7 e Microsoft Store.

Nenhum segredo, token de Agent, senha de câmera ou URL RTSP é exibido.

## Escopo

Arquivos:

- `app/dashboard/installer/pair/page.tsx` — novo
- `app/dashboard/installer/pair/pair.module.css` — novo
- `app/dashboard/dashboard-navigation.ts`
- `test/agent-0103-store-install-experience.test.ts`
- `docs/MONITORIA-1.0.3-ENTREGA-05B6-STORE-REPAIR-PAIRING.md` — novo

Não altera:

- Core 1.0.3;
- timeline/RTSP;
- filas/evidências;
- instaladores;
- assinatura;
- Supabase schema/functions;
- Vercel configuration;
- publicação/tag.

## Teste RC

1. Instalar a edição Store e deixar a tela de conexão aberta.
2. Parar a edição anterior.
3. Abrir `Câmeras > Parear computador`.
4. Gerar código.
5. Informar o código no Desktop Host.
6. Confirmar criação do novo Agent e continuidade do fluxo de descoberta.
