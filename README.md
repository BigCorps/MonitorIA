# MonitorIA Core — início do MVP

Esta entrega contém a fundação combinada:

- contrato Zod do evento visual;
- perfil e zonas da câmera;
- adaptador de visão substituível;
- implementação inicial com GPT-5 mini e Responses API;
- teste local com 1 a 4 imagens;
- migration inicial do Supabase com RLS, retenção e tabelas operacionais.

## 1. Instalar

```bash
npm install
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Preencha `OPENAI_API_KEY` no `.env`.

## 2. Validar o código

```bash
npm run check
npm test
```

## 3. Fazer a primeira análise visual

Use de uma a quatro imagens do mesmo evento:

```bash
npm run analyze -- frame-inicial.jpg frame-pico.jpg frame-final.jpg
```

O exemplo usa uma zona cobrindo o quadro inteiro. No produto, o perfil virá do Supabase.

## 4. Aplicar a migration

Crie um projeto Supabase separado para o MonitorIA e aplique:

```text
supabase/migrations/202607280001_initial_schema.sql
```

A migration cria buckets privados e RLS. As tabelas operacionais aceitam escrita apenas pelo backend/service role; o painel autenticado lê somente os dados da própria organização.

## Troca futura do modelo

O modelo fica em uma única variável:

```env
VISION_MODEL=gpt-5-mini
```

A aplicação depende da interface `VisionProvider`, não diretamente do nome do modelo. O starter fixa Zod 3 para usar os helpers oficiais de Structured Outputs do SDK OpenAI.

## Segurança

- Não versionar `.env`.
- Nunca enviar URL RTSP ou senha da câmera à OpenAI.
- Nunca armazenar credenciais RTSP em texto puro.
- `store: false` é o padrão da integração visual.
- Placas são salvas apenas como sugestões com confiança e visibilidade.
