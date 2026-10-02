# MonitorIA — Robustez compartilhada / validação VIP — Gate 1

## Princípio

A regra de câmera pronta deve ser derivada no núcleo compartilhado. A camada VIP
somente escolhe apresentar a UX nova antes do padrão.

Não existe `VipCameraSetup` separado. Os novos módulos são compartilhados:

- `src/camera/product-state.ts`
- `src/lib/camera-product-state-data.ts`
- `app/dashboard/cameras/guided-camera-profile.tsx`
- `app/dashboard/onboarding-camera-context.tsx`

## Estado de produto

O estado não lê somente `cameras.status`. Ele considera:

1. pareamento e Agent/câmera;
2. imagem real recebida;
3. `camera_entitlements.monitoring_allowed`;
4. perfil ativo;
5. `capture_sessions` aberta;
6. sinais fortes de falha no pipeline.

### Atenção necessária

Para evitar falsos positivos, a câmera não é marcada como problemática somente
porque não houve evento. Neste Gate, `pipelineIssue` exige monitor ativo e pelo
menos um sinal forte:

- sessão aberta há >= 10 min com `frames_observed = 0`; ou
- `camera_evidence_gap` não resolvido, criado na última hora, ainda sem uma
  ingestão concluída posterior ao gap.

Isso é diagnóstico do backend/dashboard; não é o watchdog definitivo do Agent.

## Multi-Site

A nova escolha de Local é ativada apenas quando `SitePairingCode` detecta caminho
`/vip/`. `createSitePairingCodeAction` passa a aceitar `site_id` e valida que ele
pertence à organização. Chamadas antigas sem `site_id` mantêm o fallback atual,
para não mudar o padrão antes da aprovação.

## Perfil guiado

`OnboardingCameraContext` continua compartilhado. Em `/vip/`, ele usa
`GuidedCameraProfile`; fora de `/vip/`, continua usando `CameraProfilePanel`.

O novo wrapper não cria uma segunda API de perfil. Ele chama as Server Actions
existentes:

- `analyzeCameraProfileAction`
- `approveCameraProfileAction`

Portanto custo de IA, `gpt-5-nano`, audit e `usage_events` continuam passando
pelo mesmo caminho já existente.

## Convites

O fluxo próprio de 6 dígitos já existia no `main`. O Gate adiciona cooldown e
remove o fallback silencioso do Resend em produção.

Não há link de autenticação Supabase no e-mail enviado ao usuário. O token
Supabase só é gerado no servidor depois de o código próprio ser validado.
