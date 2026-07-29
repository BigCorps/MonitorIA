# Protocolo de validação da v0.7.3

## 1. Segmentação

Deixe cada modo ativo por um período representativo.

Critérios:

- `maximum_duration` abaixo de 10%;
- `motion_stopped` acima de 70%;
- nenhum evento causado somente pelo relógio;
- mais de 80% dos eventos considerados úteis;
- falhas de análise abaixo de 2%.

Os logs devem mostrar:

```text
Calibração concluída
ruído p95
início efetivo
continuação efetiva
células automáticas ignoradas
```

## 2. Modos

Teste separadamente:

- Econômico: mínimo de 30 eventos;
- Equilibrado: mínimo de 30 eventos;
- Detalhado: mínimo de 30 eventos.

Não compare os custos enquanto o A/B estiver ligado sem separar
`continuous_event` de `vision_ab_candidate`.

## 3. A/B

Ative:

```env
VISION_AB_TEST_ENABLED=true
VISION_AB_TEST_SAMPLE_PERCENT=100
VISION_AB_TEST_MAX_PER_CAMERA=50
```

Avalie em `/dashboard/vision-tests`:

- contagem;
- tipo;
- zonas;
- resumo;
- necessidade de revisão;
- utilidade para pesquisa;
- latência;
- custo.

Depois desative o A/B.

## 4. Metas marginais

| Modo | Meta mensal por câmera |
|---|---:|
| Econômico | até R$ 10 |
| Equilibrado | até R$ 25 |
| Detalhado | até R$ 50 |

As metas só serão confirmadas depois de pelo menos 24 horas representativas
em cada modo.

## 5. Consulta de diagnóstico

Avaliar por plano:

- eventos por hora;
- motivo de encerramento;
- duração média;
- tokens normais;
- tokens em cache;
- reasoning tokens;
- custo por chamada;
- percentual de escalonamento;
- preferência humana nano versus mini.
