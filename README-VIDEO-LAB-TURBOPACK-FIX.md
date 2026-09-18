# MonitorIA — correção FFmpeg/Turbopack

O erro:

`Cannot find module as expression is too dynamic`

acontece antes da leitura do HEVC. O `@ffmpeg/ffmpeg` estava sendo empacotado pelo
Turbopack do Next.js e o worker interno usa URLs/imports dinâmicos que o bundle
reescreve.

Este patch:

- mantém `@ffmpeg/ffmpeg` como dependência;
- copia sua distribuição ESM original para `public/vendor/ffmpeg` antes de
  `npm run dev` e `npm run build`;
- carrega `/vendor/ffmpeg/index.js` com o import ESM nativo do navegador,
  fora do bundle do Turbopack;
- mantém o processamento local e o fallback WORKERFS/memória já criado;
- não altera Agent, banco, Supabase ou API de análise.

## Aplicar

Na raiz do repositório:

```bash
python APLICAR-VIDEO-LAB-TURBOPACK-FIX.py

npm run check
npm test
npm run build
```

Durante o build deve aparecer antes do Next:

```text
[vendor-ffmpeg] distribuição ESM copiada para public/vendor/ffmpeg
```

Confira também:

```bash
ls public/vendor/ffmpeg | head
```

Deve haver arquivos como `index.js`, `classes.js` e `worker.js`.

## Limpeza antes do commit

```bash
git restore tsconfig.tsbuildinfo 2>/dev/null || true

rm -f   APLICAR-VIDEO-LAB-TURBOPACK-FIX.py   README-VIDEO-LAB-TURBOPACK-FIX.md   app/dashboard/admin/video-lab/video-lab-client.tsx.before-turbopack-fix

rm -rf __pycache__

git status
```

O diretório `public/vendor/ffmpeg` é gerado automaticamente e fica ignorado no
Git. O que deve entrar no commit é:

- `.gitignore`
- `package.json`
- `scripts/vendor-ffmpeg.mjs`
- `app/dashboard/admin/video-lab/video-lab-client.tsx`
- `test/admin-video-lab.test.ts`

O `package-lock.json` não precisa mudar, porque não foi adicionada nova dependência.
