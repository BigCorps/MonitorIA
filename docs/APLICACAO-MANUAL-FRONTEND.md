# Aplicação manual do frontend

O método recomendado é executar `apply-frontend.py`. Para aplicar manualmente:

## 1. Copie o overlay

Copie todo o conteúdo de:

```text
frontend/overlay/
```

para a raiz do repositório MonitorIA, preservando as pastas.

## 2. Edite o Perfil

Em:

```text
app/dashboard/profile/page.tsx
```

adicione:

```ts
import { SecuritySettings } from "./security-settings";
```

imediatamente antes do import de `profile.module.css`.

No card `SEGURANÇA`, depois do bloco do Magic Link e antes do fechamento da section, adicione:

```tsx
<div className={styles.securityDivider} />

<SecuritySettings
  userEmail={profile.user.email}
/>
```

## 3. Não é necessário instalar pacote novo

O MonitorIA já usa uma versão do `@supabase/supabase-js` compatível com passkeys nativas. O frontend não usa `@simplewebauthn/browser`.

## 4. Valide

```bash
npm ci
npm run check
npm test
npm run build
```
