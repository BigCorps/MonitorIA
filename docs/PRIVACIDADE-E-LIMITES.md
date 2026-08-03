# Privacidade e limites da INT-4

## O que a fase aprende

A fase aprende horários e volumes visuais agregados por câmera, por exemplo:

- quando uma abertura costuma ser confirmada;
- quando ocorre o primeiro atendimento;
- quantas sessões normalmente aparecem;
- quanto tempo um tipo de sessão costuma durar;
- quando um fechamento costuma ser confirmado.

## O que a fase não conclui

Ela não conclui automaticamente:

- que alguém cometeu uma infração;
- que houve fraude;
- que uma pessoa teve determinada intenção;
- que a empresa realmente não abriu;
- que uma atividade não ocorreu fora do enquadramento;
- que uma câmera representa toda a operação do local.

## Ausência de evidência

`opening_not_observed` e `closing_not_observed` significam ausência de confirmação visual suficiente até determinado horário.

Não significam prova de que a abertura ou o fechamento não aconteceu.

## Fontes de erro

- câmera desligada ou deslocada;
- obstrução;
- baixa iluminação;
- perfil visual desatualizado;
- evento não capturado;
- período histórico curto;
- feriado, manutenção ou exceção não configurada;
- mudança legítima de rotina;
- atividades fora do campo de visão.

## Proteções

- baseline só fica ativo após amostra mínima;
- confiança acompanha baseline e desvio;
- exceções podem ser registradas;
- expectativas podem ser pausadas;
- evidências são preservadas quando existem;
- a redação evita transformar padrão em acusação.
