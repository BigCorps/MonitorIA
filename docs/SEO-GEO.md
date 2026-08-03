# Aplicação do pacote SEO/GEO — MonitorIA.cam

## Como aplicar

1. Faça backup ou commit do repositório atual.
2. Extraia o conteúdo deste ZIP na raiz do projeto `BigCorps/MonitorIA`.
3. Permita a substituição dos arquivos existentes.
4. Revise a diferença de `app/page.tsx`, pois ele preserva a estrutura visual atual e altera a marca para MonitorIA.cam.
5. Execute:

```bash
npm install --include=dev
npm run check
npm test
npm run build
```

## Vercel

Defina em Production, Preview e Development conforme necessário:

```env
NEXT_PUBLIC_APP_URL=https://monitoria.cam
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=
```

Mantenha temporariamente `monitoria.bigcorps.com.br` conectado ao projeto para os Agents antigos. Configure redirecionamento permanente para `monitoria.cam` somente depois de confirmar que o Agent instalado já utiliza o novo endereço ou que o domínio antigo continuará resolvendo para a mesma aplicação.

## Supabase Auth

Em Authentication > URL Configuration:

- Site URL: `https://monitoria.cam`
- Redirect URL: `https://monitoria.cam/auth/callback`

Mantenha o endereço anterior como redirect permitido durante a transição.

## Depois do deploy

Confirme estas URLs:

- `https://monitoria.cam/robots.txt`
- `https://monitoria.cam/sitemap.xml`
- `https://monitoria.cam/opengraph-image`
- `https://monitoria.cam/faq`
- `https://monitoria.cam/privacidade`

## Google Search Console

1. Cadastre a propriedade de domínio `monitoria.cam`.
2. Faça a verificação via DNS.
3. Coloque o código de verificação em `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` se usar a verificação por meta tag.
4. Envie `https://monitoria.cam/sitemap.xml`.
5. Solicite indexação da página inicial e das páginas prioritárias.

## Bing Webmaster Tools

1. Cadastre ou importe o domínio.
2. Envie o sitemap.
3. Ative IndexNow quando houver publicação recorrente de artigos.

## Páginas jurídicas

`/privacidade` e `/termos` foram entregues como bases operacionais coerentes com o desenho atual do produto. Antes da contratação comercial ampla, revise os textos com profissional jurídico e acrescente dados societários, foro, regras de pagamento, SLA, cancelamento e canais formais de privacidade.

## Próxima etapa de conteúdo

Crie uma área de artigos somente quando houver capacidade de manter conteúdo atualizado. Os melhores primeiros temas estão descritos no planejamento da conversa: compatibilidade com DVR, retenção, LGPD, diferença entre análise visual e reconhecimento facial e estudos reais de custo/qualidade dos modelos.
