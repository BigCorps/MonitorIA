# MonitorIA — Sua câmera vê. A IA lembra.

Fundação do MVP do MonitorIA: aplicação web em Next.js, contratos de análise visual, provedor OpenAI substituível e schema Supabase multiempresa.

## O que já existe

- landing page responsiva;
- painel inicial em `/dashboard`;
- endpoint de saúde em `/api/health`;
- contrato Zod do evento visual;
- perfil e zonas da câmera;
- adaptador `VisionProvider` com `gpt-5-mini` configurável;
- migrations do Supabase com RLS e retenção;
- placas tratadas apenas como sugestões.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Validar antes de publicar

```bash
npm run check
npm test
npm run build
```

## Vercel

O projeto usa Next.js App Router. O arquivo `vercel.json` apenas fixa o preset `nextjs`; o deploy funciona sem configurações especiais quando os arquivos estão na raiz do repositório.

Cadastre em **Vercel → Settings → Environment Variables**:

```env
NEXT_PUBLIC_APP_URL=https://monitoria.bigcorps.com.br
NEXT_PUBLIC_SUPABASE_URL=https://xwejfayeackbrilipgrj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
VISION_PROVIDER=openai
VISION_MODEL=gpt-5-mini
VISION_DETAIL=low
VISION_MAX_OUTPUT_TOKENS=700
VISION_STORE_RESPONSES=false
GROQ_API_KEY=...
```

A landing e o painel inicial publicam mesmo antes das chaves serem cadastradas. O endpoint `/api/health` mostra apenas se cada variável existe, sem revelar valores.

## Teste visual local

Use de uma a quatro imagens do mesmo evento:

```bash
npm run analyze -- frame-inicial.jpg frame-pico.jpg frame-final.jpg
```

## Segurança

- nunca versione `.env` ou `.env.local`;
- nunca envie a URL RTSP ou a senha da câmera à OpenAI;
- credenciais RTSP devem permanecer criptografadas no agente local;
- `VISION_STORE_RESPONSES=false` é o padrão;
- placas são somente sugestões, nunca confirmação ANPR.
