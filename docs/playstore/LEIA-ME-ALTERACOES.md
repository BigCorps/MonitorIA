# MonitorIA — revisão da landing, do login e do onboarding

Pacote com **16 arquivos**, todos já existentes no repositório. Nenhum arquivo
novo, nenhuma dependência nova, nenhuma classe de CSS nova.

Para aplicar: descompacte na raiz do projeto sobrescrevendo os arquivos, ou
copie um por um. Depois rode `npm run check`.

**Verificado aqui:** `npx tsc --noEmit` passa sem nenhum erro, e todas as
classes `styles.*` referenciadas existem no `landing.module.css`.

---

## Arquivos

| Arquivo | O que mudou |
|---|---|
| `src/lib/landing-content.ts` | Reescrito. Todo o texto da página. |
| `src/lib/app-config.ts` | **Slogan: fonte única.** |
| `src/components/landing/hero.tsx` | Herói enxuto, compatibilidade, menu. |
| `src/components/landing/story.tsx` | Problema fundido com retenção; seção nova de inteligência. |
| `src/components/landing/commerce.tsx` | Assistente invertido, planos, limites dentro do teste. |
| `src/components/landing/scenes.tsx` | Só texto dentro dos SVGs. Nenhuma animação tocada. |
| `src/components/landing/landing.module.css` | **Uma linha.** Altura dos vídeos no mobile. |
| `src/components/seo/monitoria-structured-data.tsx` | FAQPage e lista de recursos. |
| `app/page.tsx` | Ordem e quantidade de seções. |
| `app/onboarding/page.tsx` | Jargão. |
| `app/login/page.tsx` | Jargão. |
| `app/login/auth-buttons.tsx` | Mensagens de erro. |
| `app/login/actions.ts` | Mensagens de erro (SMTP). |
| `src/components/seo/social-image.tsx` | Slogan lido do config. |
| `README.md` | Slogan. |

---

## 1 · Estrutura: de 11 para 9 seções

Com mais conteúdo do que antes.

| Antes (11) | Depois (9) |
|---|---|
| Herói | Herói |
| Onde funciona | **Onde funciona** (segue em 2º) |
| O problema | O problema · *absorveu "365 dias"* |
| Como funciona | Como funciona |
| Limites declarados | **Ele não só guarda. Ele entende.** ← nova |
| 365 dias | Assistente · *absorveu ChatGPT/Claude* |
| Planos | Planos |
| Assistente | Teste grátis · *absorveu "limites declarados"* |
| Teste grátis | Dúvidas |
| Dúvidas | *(+ fechamento, como antes)* |
| Fechamento | |

- **O problema** e **365 dias** defendiam a mesma ideia em duas seções. Agora
  a dor está nos três cartões e a prova de retenção logo abaixo.
- **Limites declarados** saiu do meio da página, onde oito frases negativas
  seguidas travavam a leitura antes dos planos. Foram reduzidas a cinco e
  encostadas no botão do teste, onde respondem a última objeção.
- A integração com ChatGPT e Claude entrou dentro do Assistente em vez de
  virar uma décima seção.

### Fundo alternado
Nenhuma seção teve o próprio fundo alterado. A seção nova ficou **sem** o
modificador `sectionDeep`, seguindo o mesmo ritmo que os "limites declarados"
tinham naquela posição. Se quiser inverter, é adicionar ou remover
`styles.sectionDeep` no componente `Understands`.

---

## 2 · Compatibilidade, sem porcentagem

Substituí a ideia dos "99%" por uma formulação verificável, que cobre a câmera
de aplicativo e nomeia a exceção. Vive em `compatibility`, no
`landing-content.ts`, e é reaproveitada no herói, no FAQ e nos limites:

> Funciona com a câmera que você já tem — pelo DVR, pelo NVR ou pelo
> aplicativo que dá acesso ao vídeo.
> Fica de fora só a câmera que vive presa na nuvem do fabricante, como Ring,
> Nest, Blink e Arlo.
> Não sabe qual é a sua? Manda o modelo no WhatsApp que a gente confirma em
> minutos.

A cena 2 do "como funciona" também passou a ilustrar isso: os selos das
câmeras encontradas agora são **DIRETA**, **DVR** e **APP**, em vez de ONVIF
e RTSP.

---

## 3 · A seção nova

Seis cartões, cada um ligado a um módulo que já existia no código e não
aparecia na página:

| Cartão | Origem |
|---|---|
| Atendimentos, entregas e visitas | `src/contracts/interaction-session.ts` |
| A rotina, aprendida sozinha | `src/contracts/routine-intelligence.ts` |
| Aviso quando a câmera para de servir | `src/contracts/camera-health.ts` |
| Portão, porta e cofre | `src/contracts/visual-state.ts` |
| Sua equipe, sem reconhecimento facial | `src/contracts/staff-operational-profile.ts` |
| A mesma pessoa em momentos diferentes | `src/lib/event-continuity.ts` |

**São 6 de propósito.** Fecham a grade 3×2 do `.problemGrid` e casam com os
seis passos declarados em `.stagger` no CSS. Um sétimo cartão entraria sem
animação de cascata — se quiser adicionar, estenda o `nth-child` primeiro.

---

## 4 · Vídeos no mobile

`landing.module.css`, regra `.sectorCard`. Única alteração no arquivo:

```css
/* antes */ min-height: clamp(280px, 45vh, 400px);
/* agora  */ min-height: clamp(210px, 32vh, 270px);
```

**Confira no aparelho:** o `object-position: center 42%` foi calibrado para
card alto. Com o card mais baixo o enquadramento pode cortar diferente. Se
acontecer, o ajuste é só nesse percentual — não precisa mexer em mais nada.

---

## 5 · Jargão

Além da lista que já tínhamos combinado, o jargão também estava **desenhado
dentro dos SVGs** das cenas — eu não tinha visto na primeira análise. Corrigido
sem tocar em nenhuma animação: só strings de texto, com tamanhos parecidos para
não desencaixar o layout.

- "MonitorIA Agent" → "Programa MonitorIA"
- "Agent conectado" → "Programa conectado"
- "Agent ID" → "Identificação" · "Windows 11 x64" → "Windows 11"
- "ONVIF, depois DVR e NVR, depois endereços RTSP conhecidos." → "Testamos
  cada forma de conexão do seu equipamento, uma por uma."
- "Parear as 4 câmeras" → "Ativar as 4 câmeras"
- "90 interações no mês" → "90 perguntas no mês"
- "Só a pergunta respondida desconta da franquia." → "…entra na conta do mês."

No login havia mais três linhas que eu não tinha reportado, no painel da
esquerda: "Dados isolados por organização com **RLS**", "Credenciais **RTSP**
permanecem no **agente local**" e "**link mágico**". Todas trocadas.

---

## 6 · Correções

- **Gênero.** O corpo do site dizia "**o** MonitorIA" em 27 lugares. Agora é
  masculino em toda parte. Ver também a seção 8, sobre o slogan.
- **Duplicação nos planos.** O selo repetia o nome do plano ("Câmera Atenta"
  com "Atenta" logo abaixo). Virou posicionamento: *Mais simples*, *Mais
  escolhida*, *Máximo detalhe*.
- **`/recursos` no menu**, que existia e não era linkado de lugar nenhum.
- **SMTP exposto ao cliente.** `app/login/actions.ts` mostrava "Verifique a
  configuração SMTP" a quem não tem como verificar SMTP nenhum. Virou "Não
  conseguimos enviar o e-mail agora. Tente em alguns minutos ou fale com a
  gente no WhatsApp."
- **"não está habilitada no projeto"** em `auth-buttons.tsx` — vocabulário do
  Supabase escapando para a tela. Agora diz o que fazer.

---

## 7 · Brinde

`monitoria-structured-data.tsx` ganhou um **FAQPage**, gerado do mesmo array
`faq` que a página renderiza — então a marcação nunca sai de sincronia com o
texto visível, que é o que o Google exige para exibir o resultado rico. A
`featureList` também cresceu com as capacidades novas. Aqui o vocabulário
técnico ficou de propósito: essa parte é lida por buscador, não por cliente.

---

## Dois pontos para você decidir

1. **Uma linha com `style` inline.** Em `commerce.tsx`, o rótulo "Não gasta
   pergunta" usa `style={{ marginTop: "26px" }}`. Não havia classe existente
   para esse espaçamento e eu preferi não criar CSS novo sem combinar. Se
   preferir, mova para o módulo.
2. **Preços e regras** ficaram intocados: R$ 39,90 / 79,90 / 149,90, as faixas
   de desconto, o exemplo de fatura e as 90 perguntas seguem exatamente como
   estavam no `PLANO-DE-PRODUCAO.md`. Só a forma de dizer mudou.


---

## 8 · Slogan: uma fonte, oito consumidores

O slogan estava **escrito à mão em quatro arquivos** e havia divergido em três
versões diferentes:

| Onde | Estava |
|---|---|
| `src/lib/app-config.ts` | Sua câmera vê. **A** MonitorIA lembra. |
| `src/components/landing/hero.tsx` | Sua câmera vê. **O** MonitorIA lembra. |
| `app/login/page.tsx` | Sua câmera vê. **O** MonitorIA lembra. |
| `src/components/seo/social-image.tsx` | Sua câmera vê. **O** MonitorIA lembra. |
| `README.md` (2×) | Sua câmera vê. **A IA** lembra. |

Agora é **Sua câmera vê, o MonitorIA lembra!** em todos, e existe um só lugar
onde ele é escrito:

```ts
// src/lib/app-config.ts
const sloganParts = {
  first: "Sua câmera vê,",
  second: "o MonitorIA lembra!",
};
// appConfig.slogan  →  "Sua câmera vê, o MonitorIA lembra!"
```

Os arquivos que repetiam a frase agora leem do config. O herói usa
`sloganParts` porque ele precisa das duas metades separadas — a primeira vai
em `.heroSlogan`, que é bloco próprio e tom apagado. **Não escreva o slogan à
mão em nenhum arquivo novo.**

### Onde isso aparece

`appConfig.slogan` já era consumido em oito pontos, que herdam a correção sem
nenhuma edição:

- `app/manifest.ts` → **é este que nomeia o app no TWA e na tela inicial do Android**
- `app/layout.tsx` → `<title>` padrão, Open Graph e Twitter
- `app/page.tsx` → título da home
- `src/lib/seo.ts` → texto alternativo da imagem social
- `src/components/marketing/site-chrome.tsx` → rodapé das páginas internas
- `src/components/landing/hero.tsx` → rodapé da landing e o H1
- `src/components/seo/social-image.tsx` → arte de WhatsApp, LinkedIn e X
- `app/login/page.tsx` → assinatura do painel de acesso

Rodei os consumidores aqui para conferir o resultado real:

```
slogan            : Sua câmera vê, o MonitorIA lembra!
herói linha 1     : Sua câmera vê,
herói linha 2     : o MonitorIA lembra!
manifest.name/TWA : MonitorIA.cam — Sua câmera vê, o MonitorIA lembra!
<title> padrão    : MonitorIA.cam — Sua câmera vê, o MonitorIA lembra!
```

### Duas observações

1. **O TWA não atualiza sozinho.** O nome vem do `manifest.ts`, então o site
   corrige na hora do deploy. Mas o rótulo do ícone já instalado no Android e
   o nome na Play Store vêm do pacote gerado (Bubblewrap/PWABuilder) e da
   ficha da loja — precisam ser regerados e reenviados à parte. Não há
   arquivo de TWA no repositório, então isso não estava no meu alcance aqui.

2. **Pontuação.** Vírgula no meio e exclamação no fim, com o "o" minúsculo:
   *Sua câmera vê, o MonitorIA lembra!* — a forma correta pela norma. Se algum
   dia precisar mudar, é uma linha em `sloganParts` e os oito lugares
   acompanham sozinhos.

### Imagem social

A arte de compartilhamento renderiza o slogan a 82px com `letterSpacing: -5px`
e `maxWidth: 900`. A frase nova tem 34 caracteres, exatamente como a antiga —
não há risco de quebra. Mesmo assim, vale abrir `/opengraph-image` uma vez
depois do deploy.
