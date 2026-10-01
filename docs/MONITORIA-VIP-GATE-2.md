# MonitorIA VIP — Gate 2: onboarding e readiness

## Objetivo

Transformar o trial VIP em uma implantação guiada, sem abandonar o núcleo técnico já
validado no MonitorIA.

O cliente recebe sempre:
1. estado atual;
2. próxima ação;
3. resolução da pendência;
4. confirmação de que o progresso está salvo;
5. garantia explícita de que o relógio ainda não começou antes do readiness.

## Arquitetura

O VIP não cria um segundo sistema de câmeras.

`vip_projects` guarda estado comercial/implantação.

`refresh_vip_onboarding_v1` lê as fontes reais:
- `agents`;
- `cameras`;
- `camera_profiles`;
- `trial_runs`;
- `trial_run_cameras`;
- `private.monitoria_trial_readiness`.

A função consolida um snapshot, mas não substitui nenhuma dessas tabelas.

## Aprendizados do Clarity incorporados

### Autenticação
Contas existentes usam a tela central de login e podem escolher o método compatível.
A UI passa a dizer explicitamente para não criar uma nova conta quando aquele e-mail já
foi usado.

### Câmeras
Pendências de readiness deixam de ser mensagens genéricas. Cada causa é apresentada em
português com uma ação ou orientação.

### Inatividade
O onboarding informa que o progresso é salvo e mantém uma caixa “Próxima ação” visível.
Ao voltar, o backend recalcula o estado real em vez de depender da última tela aberta.

## Gate de navegação

Enquanto o Projeto VIP estiver diferente de `active/cancelled`, o layout do dashboard
redireciona para `/vip/onboarding`.

Isso vale somente para organizações que possuem um Projeto VIP.

## MFA

Como `/vip` não herda o layout de `/dashboard`, foi criado `app/vip/layout.tsx` com a
mesma checagem de MFA efetiva para não reduzir a segurança da organização.

## Fronteira do Gate 2

O Gate 2 prepara e atualiza o trial, mas **não o inicia**. O início, contador compartilhado,
Pesquisa IA e acompanhamento ao vivo pertencem ao Gate 3.
