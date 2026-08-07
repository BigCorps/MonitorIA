# Autenticação — o que eu corrigi e o que você precisa fazer à mão

Este documento cobre só a parte de autenticação e TWA. A revisão da landing
está no `LEIA-ME-ALTERACOES.md`.

---

## Resumo: duas causas, não uma

### Causa 1 — o helper existia e nunca era chamado

`src/lib/auth-origin.ts` já estava no repositório, com a função
`ensureCanonicalAuthOrigin()` pronta. Ela **não era chamada em lugar nenhum**.
Confirmei por varredura: zero ocorrências fora da própria definição.

Enquanto isso, os quatro fluxos de autenticação montavam a origem sozinhos:

| Arquivo | Fazia |
|---|---|
| `app/login/auth-buttons.tsx` | `${window.location.origin}/auth/callback` |
| `app/dashboard/profile/security-settings.tsx` | `${window.location.origin}/auth/callback` |
| `app/auth/callback/route.ts` | destino final a partir de `x-forwarded-host` |
| `proxy.ts` | canonicalizava só `www`, deixava passar qualquer outro host |

E o helper tinha um buraco: terminava em `return true`, então **qualquer host
desconhecido era aprovado**. Só `www.` era tratado.

**Por que isso devolve o usuário para a landing:** o Supabase exige que o
`redirectTo` esteja na lista de Redirect URLs. Quando o `redirectTo` gerado não
está autorizado, ele ignora e usa a **Site URL** — que é a landing. Casa
exatamente com o sintoma que você descreveu: autentica, cai em `/`, e ao
recarregar `/login` a sessão já existe.

### Causa 2 — o `assetlinks.json` não existe

Esta o relatório não menciona, e é a que eu apostaria para o erro de RP ID
dentro do TWA.

Não existe `public/.well-known/assetlinks.json` nem rota equivalente no
projeto. Confirmei: `https://monitoria.cam/.well-known/assetlinks.json`
responde 404 hoje.

Sem esse arquivo:

1. A TWA não valida a origem e o Chrome abre o app como Custom Tab.
2. **Passkeys não funcionam.** Dentro do app Android a cerimônia WebAuthn não
   parte de uma origem `https://`, e sim de uma origem de aplicativo
   (`android:apk-key-hash:...`). Para o Chrome aceitar que esse app fale em
   nome de `monitoria.cam`, o domínio precisa declarar a relação
   `delegate_permission/common.get_login_creds`.

**O detalhe que quase todo mundo erra:** a maioria dos tutoriais de TWA cita
apenas `delegate_permission/common.handle_all_urls`. Essa relação resolve a
barra de endereço e **não resolve passkey nenhuma**. As duas precisam estar no
arquivo. Criei a rota já com as duas.

Isso também explica por que o erro aparece "principalmente no TWA": no desktop
a origem é `https://monitoria.cam` de verdade, e aí o problema é só o da causa
1.

---

## O que mudou no código

| Arquivo | Mudança |
|---|---|
| `src/lib/auth-origin.ts` | Reescrito. Fonte única + núcleo puro testável. |
| `proxy.ts` | Canonicaliza qualquer host, não só `www`. |
| `app/login/auth-buttons.tsx` | Guarda de origem, callback canônico, suporte a WebAuthn, diagnóstico. |
| `app/dashboard/profile/security-settings.tsx` | Idem, no `linkGoogle` e no `registerPasskey`. |
| `app/auth/callback/route.ts` | Em produção usa `appConfig.url`, não `x-forwarded-host`. |
| `app/.well-known/assetlinks.json/route.ts` | **Novo.** Digital Asset Links. |
| `test/auth-origin.test.ts` | **Novo.** 10 testes de regressão. |

### Uma decisão diferente do relatório

O relatório pede para detectar produção por `VERCEL_ENV` também no browser.
**Não dá:** `VERCEL_ENV` não existe no cliente a menos que alguém crie
`NEXT_PUBLIC_VERCEL_ENV`, e esse projeto não tem essa variável. Seguir o
relatório ao pé da letra deixaria o helper silenciosamente inerte em produção
— exatamente o defeito que estamos corrigindo.

Decidi **por hostname**, no cliente:

- `monitoria.cam` → segue
- `localhost`, `127.0.0.1`, `.local` → segue (desenvolvimento)
- `*.vercel.app` → segue (previews não quebram)
- **qualquer outro** → canonicaliza e interrompe o fluxo

Além de não depender de variável nenhuma, inverte o padrão para o lado seguro:
host desconhecido agora é canonicalizado, não liberado. No servidor
(`proxy.ts` e `callback/route.ts`) uso `VERCEL_ENV === "production"`, que ali
existe de verdade.

O RP ID **não foi tocado**. Continua `monitoria.cam`, como você pediu.

### Verificado

```
tsc --noEmit           sem erros
test/auth-origin.test  10/10 passando
npm test               82 testes, 78 passando
```

As 4 falhas restantes **já existiam antes das minhas mudanças**. Rodei a suíte
no repositório intocado e comparei: são exatamente as mesmas quatro, nenhuma
relacionada a autenticação.

<details>
<summary>As 4 falhas pré-existentes</summary>

```
aceita um evento visual válido
normaliza QR Code em base64 para data URL
remove zonas que não pertencem ao perfil ativo
valor desconhecido volta para o modo equilibrado
```

Não mexi nelas — está fora do escopo que combinamos. Vale abrir depois.
</details>

---

# PASSO A PASSO MANUAL

Faça na ordem. Os passos 1 e 2 são obrigatórios; sem eles o código novo não
resolve nada.

## Passo 1 — Supabase: Redirect URLs

**Onde:** supabase.com → projeto `xwejfayeackbrilipgrj` → **Authentication** →
**URL Configuration**

1. **Site URL** deve ser exatamente:
   ```
   https://monitoria.cam
   ```
   Sem `www`, sem barra no final.

2. Em **Redirect URLs**, confirme que existe:
   ```
   https://monitoria.cam/auth/callback
   ```

3. Se houver `https://www.monitoria.cam/auth/callback`, pode remover — nada
   mais aponta para lá depois desta correção.

4. Para previews, adicione um padrão separado se você usa:
   ```
   https://*-bigcorps.vercel.app/auth/callback
   ```
   Não use wildcard largo em produção.

5. **Salve.** A mudança vale na hora, sem deploy.

> Este passo sozinho já pode resolver o Google no desktop.

## Passo 2 — Google Cloud Console

**Onde:** console.cloud.google.com → **APIs e serviços** → **Credenciais** →
seu OAuth 2.0 Client ID (tipo Web)

1. **Origens JavaScript autorizadas** deve conter:
   ```
   https://monitoria.cam
   ```

2. **URIs de redirecionamento autorizados** deve conter **apenas**:
   ```
   https://xwejfayeackbrilipgrj.supabase.co/auth/v1/callback
   ```
   Não cadastre `https://monitoria.cam/auth/callback` aqui. O Google volta
   primeiro para o Supabase, nunca direto para o app.

3. Salve. O Google pode levar alguns minutos para propagar.

**Não troque Client ID nem secret.**

## Passo 3 — Vercel: variáveis do TWA

**Onde:** vercel.com → projeto → **Settings** → **Environment Variables** →
ambiente **Production**

Crie as duas:

| Nome | Valor |
|---|---|
| `TWA_PACKAGE_NAME` | o package name do seu app Android, ex. `cam.monitoria.twa` |
| `TWA_SHA256_FINGERPRINTS` | a fingerprint SHA-256, ex. `AA:BB:CC:...` |

**Como achar a fingerprint certa** — e aqui é onde quase todo mundo erra:

- **Se o app está na Play Store com Play App Signing** (o padrão):
  Play Console → seu app → **Versão** → **Configuração** → **Integridade do
  app** → aba **App signing**. Copie a **"SHA-256 certificate fingerprint"**
  da seção *App signing key certificate*, **não** a da *Upload key
  certificate*. A chave de upload não é a que assina o que o usuário instala.

- **Se você também testa um build de debug local**, ele tem fingerprint
  diferente. Pegue com:
  ```
  keytool -list -v -keystore ~/.android/debug.keystore \
    -alias androiddebugkey -storepass android -keypass android
  ```
  E some as duas no valor, separadas por vírgula:
  ```
  AA:BB:...:11,CC:DD:...:22
  ```

Depois de criar as variáveis, faça deploy. Confirme com:

```
curl -i https://monitoria.cam/.well-known/assetlinks.json
```

Tem que responder **200** com `content-type: application/json`, e o JSON
precisa conter as duas relações (`handle_all_urls` e `get_login_creds`). Se
responder 404, alguma das duas variáveis não está definida em Production.

## Passo 4 — Regerar o pacote TWA

Este é o passo que o relatório acertou em cheio, e é o único que eu não tinha
como fazer por você: **não existe projeto Android no repositório**.

Descubra com que ferramenta o APK/AAB foi gerado — Bubblewrap ou PWABuilder — e
confira, no `twa-manifest.json` ou equivalente:

| Campo | Precisa ser |
|---|---|
| `host` | `monitoria.cam` |
| `startUrl` | `https://monitoria.cam/` |
| `scope` | `https://monitoria.cam/` |
| `webManifestUrl` | `https://monitoria.cam/manifest.webmanifest` |
| `packageId` | o mesmo de `TWA_PACKAGE_NAME` |

**Se estiver com `www.monitoria.cam` em qualquer um deles, é aí que está o seu
problema no Android.** A TWA valida cada origem individualmente; ao abrir em
`www` e o site redirecionar para `monitoria.cam`, o Chrome trata a segunda
origem como fora da TWA — e a cerimônia WebAuthn começa fora do contexto
confiável.

Com Bubblewrap:
```
bubblewrap update
bubblewrap build
```

Depois suba o novo AAB na Play Store. **A Play Store não atualiza sozinha** —
o app instalado no seu celular continua com a configuração antiga até você
publicar e atualizar.

> O `app/manifest.ts` está correto com `start_url: "/"` e `scope: "/"`. Não é
> ali que está o problema — o manifest é resolvido relativo à origem que o
> serve. Não mexa nele.

## Passo 5 — Teste no desktop

1. Logout completo. Limpe os cookies de `monitoria.cam`.
2. Abra `https://monitoria.cam/login` e clique em Google.
3. **Esperado:** termina direto em `/dashboard`, sem passar pela landing e sem
   precisar recarregar.
4. Agora repita entrando por `https://www.monitoria.cam/login`. A barra de
   endereço deve saltar para `monitoria.cam` **antes** de abrir o Google.
5. Passkey: cadastre em `/dashboard/profile`, faça logout, entre com biometria.

## Passo 6 — Teste no TWA

Só depois dos passos 3 e 4.

1. Abra o app. **Não pode ter barra de endereço visível** — se tiver, o
   assetlinks ainda não validou.
2. Faça login com Google. Deve terminar em `/dashboard`, dentro do app.
3. Cadastre uma passkey nova e teste o login biométrico.

**Se o erro de RP ID persistir**, o diagnóstico já está no código. Abra o
console (`chrome://inspect` no desktop com o celular conectado por USB) e
procure por `[MonitorIA Passkey]`. Ele imprime `hostname`, `origin`,
`expectedOrigin` e a mensagem — sem challenge, sem credential ID, sem token.

- Se `hostname` vier diferente de `monitoria.cam` → é o pacote TWA, passo 4.
- Se vier exatamente `monitoria.cam` e ainda assim falhar → é o assetlinks,
  passo 3. Confira principalmente se a fingerprint é a da Play App Signing.

**Em nenhum caso mude o RP ID.** Ele está certo.

---

## O que eu não toquei, de propósito

- A migration `20260805183000_fix_google_auth_hook.sql`. Não criei SQL novo.
- Login por senha, link no e-mail, cadastro, reset, MFA TOTP.
- Políticas de MFA, Auth Hook, RLS, organizações.
- Passkeys já cadastradas e o vínculo Google existente.
- MCP.
- O RP ID.
