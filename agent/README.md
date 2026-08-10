# MonitorIA Agent v0.10.7

O Agent mantém o vídeo contínuo no computador local e envia somente quadros
selecionados de acontecimentos reais.

## Instalação no Windows

O usuário final utiliza apenas o `MonitorIA-Setup.exe`:

1. gera o código de pareamento da câmera no painel;
2. abre o instalador e confirma a solicitação do Windows;
3. informa o código, o usuário e a senha usados nas câmeras;
4. aguarda a busca automática em toda a rede local;
5. se outro grupo de câmeras usar credenciais diferentes, informa apenas o
   outro usuário e a outra senha quando o instalador perguntar.

O instalador registra e inicia o serviço, encontra todos os aparelhos que
aceitam cada credencial, descobre o stream RTSP compatível e configura a
inicialização automática. Câmeras que já existem no painel são reaproveitadas;
as demais são cadastradas automaticamente. Nenhum terminal ou shell é
necessário. Atualizações preservam pareamento e câmeras já configuradas.

## Movimento e custo

A versão 0.10.7 rejeita localmente mudanças globais de exposição, comutação
de infravermelho e ruído difuso de sensor em baixa luz. Esses quadros não são
enviados ao servidor e não geram chamada de modelo.

O plano Detalhada exige três quadros consecutivos, mantém pausas curtas dentro
do mesmo acontecimento e só separa capítulos depois de uma mudança espacial
persistente ou do limite de quatro minutos. Isso reduz cenas duplicadas sem
esconder chegadas, entregas e saídas reais.

Mudanças estruturais concentradas, como cortina ou portão abrindo e fechando,
não são confundidas com a troca uniforme de exposição da câmera. O filtro de
ruído global só atua quando praticamente todo o quadro muda de forma uniforme.

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
