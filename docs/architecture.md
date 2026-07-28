# Arquitetura inicial

```text
Câmera RTSP
  → Agent local TypeScript/Bun + FFmpeg
  → detecção local e agrupamento
  → API autenticada
  → analysis_jobs
  → GPT-5 mini
  → JSON validado com Zod
  → events + pessoas + veículos + sugestão de placa
  → keyframe anual + frames temporários
```

## Retenção

- Frames de análise: 3 dias no Básico; 7 dias nos demais.
- Um keyframe comprimido por evento: 365 dias.
- Metadados: 365 dias.
- Vídeo contínuo: permanece local.

## Limites do MVP

- Sem reconhecimento facial.
- Placa apenas como sugestão visual.
- Sem afirmar crime ou intenção a partir das imagens.
- Modelo visual selecionado por variável de ambiente.
