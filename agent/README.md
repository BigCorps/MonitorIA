# MonitorIA Agent v0.10.4

O Agent mantém o vídeo contínuo no computador local e envia somente quadros
selecionados de acontecimentos reais.

## Instalação no Windows

O usuário final utiliza apenas o `MonitorIA-Setup.exe`:

1. gera o código de pareamento da câmera no painel;
2. abre o instalador e confirma a solicitação do Windows;
3. informa código, IP, usuário, senha e canal da câmera ou DVR;
4. aguarda a validação automática do vídeo.

O instalador registra e inicia o serviço, faz o pareamento, descobre o stream
RTSP compatível e configura a inicialização automática. Nenhum terminal ou
shell é necessário. Atualizações preservam pareamento e câmeras já configuradas.

## Movimento e custo

A versão 0.10.4 rejeita localmente mudanças globais de exposição, comutação
de infravermelho e ruído difuso de sensor em baixa luz. Esses quadros não são
enviados ao servidor e não geram chamada de modelo.

O plano Detalhada também passa a exigir três quadros consecutivos, agrupa
atividade por mais tempo e usa 15 segundos de intervalo antes de abrir outro
evento. O limite rígido de cinco minutos permanece como proteção.

Se um token preservado de uma instalação anterior não puder mais ser aberto
pelo cofre do Windows ou tiver sido revogado, o assistente gráfico solicita
automaticamente um novo código. Não é necessário limpar arquivos nem abrir
terminal para recuperar o pareamento.

A validação inicial também é compatível com a build compartilhada do FFmpeg
8.1 para Windows: o limite de tempo do processo substitui a opção
`rw_timeout`, que essa combinação aceitava no ffprobe mas recusava no ffmpeg.

## Desenvolvimento

O cofre do Windows usa `CryptProtectData` por meio do componente nativo
`agent/native/dpapi.c`. O workflow compila e assina esse componente junto com
o Agent; não há dependência de terminal no computador do cliente.
