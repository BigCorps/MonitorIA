# MonitorIA — Vídeo Lab POC

POC interna para validar análise de uma gravação de até 1 hora sem enviar o vídeo original.

## O que este pacote faz

- adiciona `Vídeo Lab` ao menu do Admin;
- cria `/dashboard/admin/video-lab` protegida por `requireInternalOperator()`;
- permite selecionar um vídeo local de até 1 hora;
- percorre o vídeo no navegador em baixa resolução;
- compensa mudança global simples de iluminação e encontra trechos com mudança visual;
- escolhe os maiores picos e extrai JPEGs de início/pico/fim;
- envia apenas esses JPEGs para `/api/admin/video-lab/analyze`;
- reaproveita `createVisionProvider().analyzeEvent()` do MonitorIA;
- mostra resumo, tipo, confiança, revisão, modelo, tokens, latência e bytes enviados;
- permite exportar os resultados em JSON;
- não cria tabela, migration, câmera, evento, storage ou cobrança;
- não altera o Agent 1.0.3.

## Limitações intencionais do POC

1. Primeiro teste focado em **câmera fixa**. Dashcam/câmera em movimento exige outra metodologia de seleção local.
2. O navegador precisa conseguir decodificar o codec. MP4/H.264 e WebM são os melhores candidatos iniciais.
3. O algoritmo local ainda é experimental. O objetivo é medir falsos positivos, falsos negativos, tempo de processamento e custo de IA antes de transformar em produto.
4. A análise com IA fica limitada, por escolha do operador, a 3, 6 ou 12 candidatos por execução.
5. Nada é persistido no banco neste POC. O JSON exportado serve para comparar rodadas.

## Instalação no Codespace

Arraste a pasta/conteúdo deste pacote para a raiz do repositório MonitorIA e execute:

```bash
python APLICAR-VIDEO-LAB.py
python VERIFICAR-VIDEO-LAB.py
npm run check
npm test
npm run build
```

Se tudo passar, remova os arquivos de aplicação/verificação e o backup antes do commit:

```bash
rm -f APLICAR-VIDEO-LAB.py VERIFICAR-VIDEO-LAB.py README-VIDEO-LAB.md
rm -f app/dashboard/admin/admin-shell.tsx.before-video-lab
```

Depois confira:

```bash
git status
git diff -- app/dashboard/admin/admin-shell.tsx
git diff -- app/dashboard/admin/video-lab app/api/admin/video-lab test/admin-video-lab.test.ts
```

Arquivos esperados no commit:

```text
app/dashboard/admin/admin-shell.tsx
app/dashboard/admin/video-lab/page.tsx
app/dashboard/admin/video-lab/video-lab-client.tsx
app/dashboard/admin/video-lab/video-lab.module.css
app/api/admin/video-lab/analyze/route.ts
test/admin-video-lab.test.ts
```

## Teste funcional

1. Abra `Admin MonitorIA > Vídeo Lab`.
2. Selecione primeiro um vídeo curto (5–15 min) de câmera fixa.
3. Use `Equilibrado`, sensibilidade 7 e máximo 6 acontecimentos na IA.
4. Clique em `Mapear acontecimentos localmente`.
5. Confira se os horários candidatos fazem sentido clicando nas linhas.
6. Clique em `Analisar ... com IA`.
7. Compare os resultados com o vídeo original.
8. Exporte o JSON para guardarmos as métricas da rodada.
9. Depois faça um segundo teste com um arquivo maior, chegando gradualmente a 1 hora.

Não há SQL para executar nesta etapa.
