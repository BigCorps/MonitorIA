# 0.15.0 — gravadores, endereço que muda, e um jeito de descobrir

Nove arquivos. Oito substituem os atuais, um é novo
(`agent/src/discovery/mac.ts`). Sem migration, sem variável nova.

Quase tudo é Agent, então **precisa de build novo pelo Actions**.

---

## Antes de tudo: o que está provado e o que não está

Isto precisa ficar registrado, porque daqui a duas semanas nós dois vamos ter
esquecido.

**Provado em aparelho real:** câmera IP com ONVIF, na mesma rede do
computador. É a sua `.140`. Continua funcionando — testei que as mudanças não
quebram esse caminho.

**Escrito com cuidado, não testado:** tudo que envolve gravador. Não temos
DVR. O código segue o que a especificação ONVIF define e o que os fabricantes
de fato implementam, mas especificação e realidade divergem em firmware
barato — foi exatamente o que aconteceu com a `GetStreamUri` que já está
tratada em duas gerações no código.

Por isso a peça mais importante deste pacote talvez seja o comando de
relatório, na seção 4. Ele transforma "não funcionou" em um diagnóstico que
eu consigo ler.

---

## 1 · Um gravador vira várias câmeras

O problema: a unidade do sistema era o **aparelho**. Um DVR de oito canais
tem um endereço na rede, então virava uma câmera no painel. O cliente pagaria
por oito e receberia uma.

Duas mudanças fizeram a unidade virar o **canal**:

**Pelo ONVIF, que é o caminho da maioria dos gravadores.** Cada perfil ONVIF
agora carrega o token da fonte de vídeo. É o que separa "canal 2" de "canal 1
em resolução menor" — sem isso as duas coisas eram indistinguíveis. E a busca
deixou de parar no primeiro stream válido: agora só encerra quando toda fonte
anunciada tem vídeo confirmado.

**Pelo plano B, para gravador sem ONVIF decente.** O laço foi invertido,
que era a correção apontada no relatório original. Antes a ordem era caminho,
canal, porta — o que multiplicava o tempo pelo número de câmeras informado,
inclusive nos caminhos que nunca funcionariam. Agora: acha um caminho que
funciona testando só o canal 1, e só então varre os canais seguintes nesse
mesmo caminho. Canal vazio custa uma tentativa em vez de dez, e duas
ausências seguidas encerram a numeração.

Quando um aparelho devolve mais de um canal, os nomes sugeridos ganham o
número — "Gravador 1", "Gravador 2" — porque oito câmeras chamadas "Gravador"
não ajudam ninguém.

**Efeito colateral que você deve conhecer:** a comparação do que já está
conectado passou a ser por endereço de stream, não por endereço do aparelho.
Sem isso, o canal 1 de um gravador faria os outros sete parecerem "já
conectados". Câmeras existentes não são afetadas.

## 2 · A câmera sobrevive à troca de IP

Quando a busca encontra uma câmera, o Agent lê o endereço físico dela da
tabela ARP e guarda junto. Depois de **três falhas seguidas de conexão** — e
só quando não é erro de senha — ele provoca tráfego na rede, procura aquele
MAC, e se achar o mesmo aparelho em outro endereço, testa o vídeo lá antes de
gravar. Endereço que não entrega imagem não substitui um que ao menos já
funcionou.

Três limites que você precisa saber, porque nenhum é defeito:

- **Câmeras instaladas antes desta versão não têm MAC guardado.** Elas passam
  a ter na próxima busca. Até lá, comportamento antigo.
- **Câmera atrás de outro roteador não aparece na tabela ARP.** Foi o seu
  caso de ontem. A recuperação não alcança, e o log diz isso com clareza em
  vez de tentar em silêncio.
- **Não substitui reservar o IP no roteador.** Reduz o chamado, não elimina.

## 3 · Os avisos

Dois textos novos na tela de busca. Antes de procurar, o aviso de que câmeras
em outro roteador não são encontradas — explicando por que elas continuam
aparecendo no aplicativo do fabricante, que é a parte que confunde. Depois de
encontrar, o aviso para reservar o endereço no roteador.

Escrevi os dois assumindo que quem lê é dono de mercado, não técnico de rede.
Nenhum usa "DHCP" sem dizer onde procurar.

## 4 · O comando para levar na visita

```
monitoria-agent scan-report --username admin --password SENHA
```

E para um aparelho específico:

```
monitoria-agent scan-report --host 192.168.0.140 --username admin --password SENHA
```

Ele varre a rede e imprime, para cada aparelho: origem, MAC, se fala ONVIF,
marca, modelo, quais canais têm vídeo, e o que falhou em cada porta testada.
Não imprime senha nem URL completa, então dá para colar num e-mail.

**Use isso na visita ao cliente com DVR.** Se o gravador não entregar todos
os canais, esse relatório me diz em qual das quatro etapas ele parou:
descoberta, ONVIF, caminho RTSP ou enumeração de canal. Cada uma tem uma
correção diferente, e sem o relatório eu escolho por chute — que é como
gastamos três mensagens debugando uma impressora.

Vale rodar antes da apresentação, não durante.

---

## 5 · O que continua aberto

**O desinstalador sem assinatura.** Nunca foi tocado. É o CodeSignTool, e
continua sendo um problema separado.

**Câmeras em redes diferentes.** Hoje um Agent enxerga uma rede. Uma loja com
dois roteadores precisa de duas instalações, em dois computadores. Funciona,
mas ninguém explicou isso ao cliente em lugar nenhum além do aviso da tela de
busca. Se isso for comum na sua base, vira produto, não aviso.

**Reserva de IP automática.** Dá para fazer o Agent configurar a reserva no
roteador via UPnP em alguns modelos. É frágil e específico por fabricante.
Não recomendo antes de ter dez clientes e saber quais roteadores eles usam.
