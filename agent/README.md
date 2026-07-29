# MonitorIA Agent v0.8.1

O Agent mantém o vídeo contínuo no computador local e envia
somente quadros selecionados de acontecimentos.

## Novidade: capítulos de atividade

Ambientes comerciais podem permanecer em movimento por vários
minutos sem atingir silêncio completo. A v0.8.1 divide esse fluxo
em capítulos quando:

- a região predominante do movimento muda de forma sustentada;
- o capítulo chega ao limite próprio do modo;
- o movimento realmente termina.

Limites iniciais:

| Modo | Mínimo antes de dividir | Limite do capítulo |
|---|---:|---:|
| Econômico | 60 s | 240 s |
| Equilibrado | 30 s | 150 s |
| Detalhado | 15 s | 90 s |

O limite rígido de cinco minutos permanece apenas como proteção.

## Atualização

A configuração local é compatível. Feche o executável anterior,
substitua o arquivo e não execute `reset`.

```powershell
Unblock-File "$env:USERPROFILE\Downloads\monitoria-agent.exe"

& "$env:USERPROFILE\Downloads\monitoria-agent.exe" self-test
& "$env:USERPROFILE\Downloads\monitoria-agent.exe" status
& "$env:USERPROFILE\Downloads\monitoria-agent.exe"
```

Nos logs, os novos motivos podem aparecer como:

```text
activity_region_changed
activity_resumed
activity_chapter_limit
motion_stopped
```
