# TWA — do repositório ao AAB na Play Store

Guia completo para gerar o app Android do MonitorIA com Bubblewrap.

Você já tem conta de empresa e 4 apps publicados, então pulei a parte de criar
conta e de taxa de registro. O que está aqui é o específico deste app.

---

## O que eu já preparei no repositório

| Arquivo | O que é |
|---|---|
| `app/manifest.ts` | Manifest do PWA, com os campos que o Bubblewrap lê. |
| `public/maskable-icon-512x512.png` | **Novo.** Ícone adaptativo do Android. |
| `app/.well-known/assetlinks.json/route.ts` | Digital Asset Links, por variável de ambiente. |
| `twa/twa-manifest.json` | Configuração do Bubblewrap, já apontada para `monitoria.cam`. |
| `.gitignore` | Ignora keystore e artefatos de build do Android. |
| `proxy.ts` | Tira o `assetlinks.json` do caminho da sessão. |

### Sobre o ícone que eu gerei

O `android-chrome-512x512.png` que existia **não serve como ícone adaptativo**:
tem só 3,5% de margem e fundo transparente. Sob a máscara circular do Android
ele seria cortado nas bordas e ficaria com buraco no lugar do fundo.

Gerei o `maskable-icon-512x512.png` a partir do `logo.png`: fundo sólido
`#07111F` (o mesmo `background_color` do manifest) e conteúdo ocupando 56% do
lado, dentro da zona segura de 80% que o Android exige. Os ícones antigos
continuam no manifest com `purpose: "any"` — os dois papéis coexistem.

### Mudanças no manifest, e por quê

| Campo | Antes | Agora |
|---|---|---|
| `name` | `MonitorIA.cam — Sua câmera vê, o MonitorIA lembra!` | `MonitorIA.cam` |
| `short_name` | `MonitorIA.cam` | `MonitorIA` |
| `id` | ausente | `/` |
| `orientation`, `lang`, `categories`, `description` | ausentes | preenchidos |
| ícone maskable | ausente | adicionado |

O nome com o slogan virava rótulo do aplicativo no lançador — ficava enorme e
cortado. O `id` fixo evita que uma mudança futura de `start_url` faça o
navegador tratar como um app diferente e duplicar a instalação.

---

## Antes de começar

Precisa ter instalado:

- **Node 18+** (você já tem)
- **JDK 17** — o Bubblewrap baixa sozinho se você deixar, mas ter ajuda
- **Android SDK** — idem

Instale o Bubblewrap:

```bash
npm install -g @bubblewrap/cli
```

Na primeira execução ele pergunta se pode baixar JDK e Android SDK. Aceite.

---

## ORDEM IMPORTANTE — leia antes

Existe uma armadilha aqui que pega quase todo mundo, e ela é a razão de o
passo 3 do outro documento não poder ser feito ainda.

**O `assetlinks.json` precisa da fingerprint da chave que assina o app
instalado. Com Play App Signing, essa chave é gerada pelo Google — e você só
consegue vê-la depois de subir o primeiro AAB.**

Ou seja, a ordem certa é:

```
1. Gerar keystore de upload
2. Bubblewrap init + build  →  AAB
3. Subir o AAB na Play Console (teste interno)
4. AÍ SIM pegar a fingerprint do Play App Signing
5. Configurar as variáveis na Vercel + deploy
6. Só então a TWA valida e a biometria funciona
```

Se você tentar validar antes do passo 4, vai falhar — e não é erro seu.

Enquanto isso, entre os passos 2 e 5, o app abre com barra de endereço
visível. É esperado. Some quando o assetlinks validar.

---

## Passo 1 — Gerar a keystore de upload

Na raiz do repositório:

```bash
keytool -genkeypair \
  -alias monitoria \
  -keystore twa/android.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype PKCS12
```

Responda o que ele perguntar (nome, organização BigCorps, país BR).

> **Guarde essa keystore e as senhas fora do repositório.** Ela já está no
> `.gitignore`. Se você perder a chave de upload dá para pedir reset ao
> Google, mas é burocrático — melhor ter backup em cofre de senha.

Anote a fingerprint local, que você vai usar mais adiante:

```bash
keytool -list -v -keystore twa/android.keystore -alias monitoria \
  | grep "SHA256:"
```

## Passo 2 — Inicializar o projeto

```bash
cd twa
bubblewrap init --manifest https://monitoria.cam/manifest.webmanifest
```

Ele vai ler o manifest do ar e propor valores. **Confira estes:**

| Pergunta | Responda |
|---|---|
| Domain | `monitoria.cam` |
| URL path | `/` |
| Application name | `MonitorIA.cam` |
| Short name | `MonitorIA` |
| Application ID | `cam.monitoria.app` |
| Display mode | `standalone` |
| Orientation | `portrait` |
| Status bar color | `#07111F` |
| Splash screen color | `#07111F` |
| Icon URL | `https://monitoria.cam/android-chrome-512x512.png` |
| Maskable icon URL | `https://monitoria.cam/maskable-icon-512x512.png` |
| Include support for shortcuts | `No` |
| Signing key | `./twa/android.keystore`, alias `monitoria` |

**Em nenhum campo use `www.monitoria.cam`.** É exatamente essa troca de origem
que quebra a TWA e a passkey.

> **O `Application ID` não pode mudar depois de publicado.** Deixei
> `cam.monitoria.app` no `twa-manifest.json` como padrão, derivado do domínio.
> Se seus outros 4 apps usam um prefixo da empresa, tipo
> `br.com.bigcorps.monitoria`, troque **agora** — e lembre de usar o mesmo
> valor na variável `TWA_PACKAGE_NAME` da Vercel.

Se preferir, o `twa/twa-manifest.json` que eu deixei já tem tudo preenchido:
ajuste o `packageId` e rode `bubblewrap init` apontando para ele.

## Passo 3 — Build

```bash
bubblewrap build
```

Saem dois arquivos em `twa/`:

- `app-release-bundle.aab` — **é este que vai para a Play Store**
- `app-release-signed.apk` — para testar direto no aparelho

Para instalar e testar antes de publicar:

```bash
adb install -r app-release-signed.apk
```

Nesta etapa o app **vai abrir com barra de endereço**. Normal: o assetlinks
ainda não está publicado.

## Passo 4 — Subir na Play Console

1. Play Console → **Criar app**
2. Nome: `MonitorIA` · Idioma: Português (Brasil) · Tipo: App · Gratuito
3. Vá em **Teste** → **Teste interno** → **Criar versão**
4. Suba o `app-release-bundle.aab`
5. Complete o que a Play exigir: política de privacidade
   (`https://monitoria.cam/privacidade`), classificação de conteúdo,
   segurança dos dados, público-alvo

> Sobre **segurança dos dados**: o app coleta e-mail, e imagens são
> processadas. Declare com honestidade — a Play cruza a declaração com o
> comportamento real e reprova divergência.

> Como é um app de câmeras de segurança, é provável que peçam esclarecimento
> sobre uso de câmera. Vale explicar na descrição que o app **não acessa a
> câmera do celular**: ele consulta câmeras já instaladas no comércio.

## Passo 5 — Pegar a fingerprint certa

Este é o passo que destrava tudo.

**Play Console** → seu app → **Versão** → **Configuração** → **Integridade do
app** → aba **Assinatura de apps**

Você vai ver dois certificados. Copie o SHA-256 do primeiro:

| Certificado | Usar? |
|---|---|
| **Certificado da chave de assinatura do app** | ✅ **é este** |
| Certificado da chave de upload | ❌ não |

A chave de upload só prova que foi você quem enviou. Quem assina o que o
usuário instala é o Google, com a chave de assinatura do app. Usar a de upload
aqui é o erro mais comum — o app instala, mas nunca valida.

## Passo 6 — Variáveis na Vercel

Vercel → projeto → **Settings** → **Environment Variables** → ambiente
**Production**:

| Nome | Valor |
|---|---|
| `TWA_PACKAGE_NAME` | `cam.monitoria.app` (ou o que você escolheu) |
| `TWA_SHA256_FINGERPRINTS` | a fingerprint do passo 5 |

Se você também quiser testar o APK local assinado com a sua keystore, some as
duas separadas por vírgula:

```
AA:BB:...:11,CC:DD:...:22
```

Faça o deploy e confirme:

```bash
curl -s https://monitoria.cam/.well-known/assetlinks.json | head -20
```

Precisa responder 200 e conter **as duas relações**:

```json
[{
  "relation": [
    "delegate_permission/common.handle_all_urls",
    "delegate_permission/common.get_login_creds"
  ],
  "target": {
    "namespace": "android_app",
    "package_name": "cam.monitoria.app",
    "sha256_cert_fingerprints": ["AA:BB:..."]
  }
}]
```

**A segunda relação é a que habilita passkey dentro do app.** Quase todo
tutorial de TWA cita só a primeira, que resolve a barra de endereço e não
resolve biometria nenhuma.

Se responder 404, alguma das variáveis não está definida no ambiente
Production.

Validador oficial do Google, se quiser conferir:

```
https://developers.google.com/digital-asset-links/tools/generator
```

## Passo 7 — Validar no aparelho

1. Desinstale e reinstale o app (o Chrome guarda o resultado da validação em
   cache)
2. Abra: **não pode ter barra de endereço**
3. Login com Google → tem que terminar em `/dashboard`, dentro do app
4. Cadastre uma passkey e teste o login biométrico

Se ainda falhar, conecte o celular por USB e abra `chrome://inspect` no
desktop. O diagnóstico que eu adicionei imprime `[MonitorIA Passkey]` com
`hostname`, `origin` e `expectedOrigin` — sem challenge, sem credential ID,
sem token.

- `hostname` diferente de `monitoria.cam` → o pacote TWA está errado, refaça
  o passo 2
- `hostname` correto e ainda falha → é a fingerprint, refaça o passo 5

**Em nenhum caso mude o RP ID.**

---

## Atualizações futuras

Quando mudar `name`, `short_name`, `start_url`, `scope` ou ícones no
`app/manifest.ts`:

```bash
cd twa
bubblewrap update
bubblewrap build
```

Suba o novo AAB. Lembre de subir `appVersionCode` no `twa-manifest.json` — a
Play recusa o mesmo código duas vezes. O `bubblewrap build` costuma
incrementar sozinho; confira antes de enviar.

---

## Uma sugestão que eu não apliquei

O `start_url` está em `/`, então o app abre na landing toda vez — inclusive
para quem já está logado. Para um app instalado isso é estranho, e a Play às
vezes olha com desconfiança para algo que parece só um site embrulhado.

Abrir direto no painel seria mais natural: quem tem sessão cai no dashboard,
quem não tem é mandado ao login pelo próprio proxy.

É uma linha em `app/manifest.ts`:

```ts
start_url: "/dashboard",
```

Não apliquei porque muda comportamento e você não pediu. Se quiser, avise —
mas faça **antes** do passo 2, porque depois exige `bubblewrap update` e uma
versão nova na loja.

---

## O que ficou fora, e por quê

Não consigo gerar o AAB aqui: exige Android SDK, JDK e a sua keystore
assinando. Também não posso criar a keystore por você — se ela vazasse pelo
zip, qualquer um poderia publicar atualizações em nome do seu app.

Os passos 1 a 5 são necessariamente seus. Tudo o que dependia do repositório
está pronto.
