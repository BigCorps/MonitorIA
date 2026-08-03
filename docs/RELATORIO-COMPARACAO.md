# Comparação — antes e depois da INT-4

## Antes

O MonitorIA consegue informar:

- o que aconteceu;
- quando aconteceu;
- quem ou o que provavelmente participou;
- como eventos próximos formam uma sessão;
- quando um estado visual mudou.

Porém, ainda não possui uma referência histórica formal para dizer se um horário, duração ou volume ficou diferente do habitual.

## Depois

O MonitorIA passa a responder com base em faixas calculadas:

```text
A abertura visual costuma ocorrer entre 08:47 e 09:08.
Hoje foi confirmada às 09:26, 18 minutos depois do limite habitual.
Confiança do baseline: 0,89.
```

Também passa a distinguir:

```text
acontecimento individual
sessão operacional
padrão histórico
desvio do padrão
ausência de confirmação visual
```

## Ganhos

- comparação por câmera e dia da semana;
- resultado reproduzível no banco;
- nenhuma nova chamada de IA;
- evidências relacionadas;
- integração com Realtime;
- suporte ao Assistente;
- suporte ao MCP sem alterar ferramentas públicas;
- preparação para alertas da INT-12.

## Limite preservado

A fase não transforma correlação em diagnóstico. A interface e o Assistente devem continuar usando linguagem de observação e probabilidade.
