# Validação — MonitorIA v0.8.1

## Antes da coleta

1. publique o frontend;
2. atualize o Agent para v0.8.1;
3. escolha uma imagem com o ambiente representativo;
4. informe onde ficam funcionários e clientes;
5. ajuste as zonas;
6. aprove o novo perfil;
7. reinicie o Agent para sincronizar imediatamente.

## Primeira conferência

Retorne após duas horas de movimento normal, desde que tenham sido
formados pelo menos 15 eventos novos.

Consultar:

- distribuição de `primary_event_type`;
- distribuição de `headline`;
- duração média e mediana;
- motivo do encerramento;
- quantidade de capítulos;
- pessoas por papel;
- confiança do papel;
- custo e latência por evento.

## Critérios iniciais

| Métrica | Meta |
|---|---:|
| `person_present` | abaixo de 40% |
| `maximum_duration` | abaixo de 10% |
| falhas de análise | abaixo de 2% |
| títulos úteis | acima de 80% |
| staff/customer úteis em posições claras | acima de 80% |

## Avaliação humana

Ao abrir eventos novos:

- confirme se o título descreve a ação;
- confira se o tipo técnico corresponde;
- confira funcionário versus cliente;
- marque eventos úteis, irrelevantes ou incorretos;
- não use os eventos antigos para avaliar papéis.

## Custo

A divisão por capítulos pode aumentar o número de chamadas quando a
loja permanece em movimento contínuo. Por isso a avaliação deve medir
qualidade e custo juntos antes de reduzir ainda mais os capítulos.
