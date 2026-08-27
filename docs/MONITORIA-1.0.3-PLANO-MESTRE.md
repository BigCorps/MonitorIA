# MonitorIA 1.0.3 — Plano Mestre de Desenvolvimento, Testes e Microsoft Store

**Projeto:** MonitorIA  
**Versão alvo:** 1.0.3  
**Status:** Planejamento aprovado — início da nova etapa  
**Repositório:** `BigCorps/MonitorIA`  
**Objetivo principal:** consolidar uma versão comercial confiável do MonitorIA, sem perder acontecimentos importantes, com abertura/fechamento corretos, fotos e vídeos coerentes e duas formas de execução no Windows usando o mesmo núcleo.

---

## 1. Decisão arquitetural principal

A partir da versão 1.0.3 existirão **duas distribuições do MonitorIA para Windows**, mas **não dois Agents diferentes**.

As duas distribuições devem compartilhar o mesmo núcleo de captura, análise local, RTSP, movimento, fila, vídeos, imagens, sincronização, pareamento e comunicação com o backend.

### 1.1 MonitorIA 24/7 — instalador direto `.exe`

Distribuição pelo site do MonitorIA.

Características:

- continua usando o Windows Service;
- pode funcionar mesmo antes de um usuário entrar no Windows;
- recomendado para computador dedicado ao monitoramento;
- inicia automaticamente com o Windows;
- terá **ícone visível na bandeja do sistema**, mesmo sendo executado em segundo plano;
- o ícone deve indicar claramente que o MonitorIA está ativo;
- deve permitir abrir status, painel, diagnóstico e ações de suporte;
- continua sendo a opção mais adequada para operação totalmente 24/7.

O usuário final **não deve ter a sensação de que existe um programa invisível rodando sem controle**.

A aplicação deverá ter um pequeno componente de interface/tray separado do serviço, enquanto o serviço continua sendo responsável pelo runtime 24/7.

### 1.2 MonitorIA — Microsoft Store

Distribuição pela Microsoft Store.

Características:

- não instala Windows Service;
- não inclui WinSW;
- não registra NT Service;
- não instala driver de kernel;
- não depende de `sc.exe` para funcionar;
- possui aplicativo visível no Menu Iniciar;
- possui ícone na bandeja do sistema;
- inicia automaticamente após o login do usuário;
- mantém o mesmo núcleo funcional do MonitorIA 24/7;
- continua funcionando com navegador/dashboard fechado;
- continua funcionando com a sessão bloqueada;
- deixa de monitorar após logoff completo ou antes do primeiro login após reinicialização.

Esta diferença deve ser transparente para a lógica de câmeras, eventos, vídeos, IA e backend.

---

# 2. Como apresentar as duas versões ao cliente

A página **Instalação** do dashboard deve explicar a diferença sem linguagem técnica desnecessária.

## 2.1 Opção recomendada — MonitorIA 24/7

Texto conceitual sugerido:

> **MonitorIA 24/7**
>
> Recomendado para computadores que ficam dedicados ao monitoramento.
> O MonitorIA inicia junto com o Windows e continua protegendo o local mesmo antes de alguém entrar na conta do computador.
>
> **Ideal para:** lojas, empresas, portarias e computadores que permanecem ligados continuamente.

Aviso simples:

> Por ser instalado diretamente no Windows e trabalhar continuamente em segundo plano, o SmartScreen ou alguns antivírus podem pedir confirmação durante a instalação. Isso não significa que o MonitorIA seja inseguro. O instalador oficial é assinado digitalmente e deve sempre ser baixado pelo painel ou site oficial do MonitorIA.

Nunca instruir o usuário a desativar permanentemente antivírus.

## 2.2 Opção mais simples — Microsoft Store

Texto conceitual sugerido:

> **MonitorIA pela Microsoft Store**
>
> Instalação mais simples pelo próprio Windows, com atualizações e validação da Microsoft.
> O MonitorIA começa a funcionar automaticamente depois que você entra no Windows.
>
> **Ideal para:** computadores de uso normal que permanecem com um usuário conectado durante o funcionamento da empresa.

Aviso:

> Nesta versão o monitoramento começa após o login do Windows. Se o computador reiniciar e permanecer parado na tela de login, o MonitorIA aguardará alguém entrar para iniciar.

## 2.3 Comparação simples na tela

| | MonitorIA 24/7 | Microsoft Store |
|---|---|---|
| Instalação | Pelo site/painel | Pela Microsoft Store |
| Inicia com Windows | Sim, mesmo antes do login | Após o login |
| Segundo plano | Sim | Sim |
| Ícone na bandeja | Sim | Sim |
| Atualização | Instalador MonitorIA | Microsoft Store |
| SmartScreen/antivírus | Pode pedir confirmação | Instalação normalmente mais simples pelo Windows |
| Recomendado para | PC dedicado | PC de uso normal |

Não prometer que antivírus **nunca** examinará a versão Store. A mensagem correta é que a distribuição pela Store reduz fricção de instalação e evita o problema atual relacionado ao serviço NT.

---

# 3. Resultado da certificação Microsoft que motivou a mudança

Último relatório conhecido:

- Produto: MonitorIA
- Product ID: `58a13316-402e-4bb9-beb3-28d224d02d01`
- Publisher: `BIGCORPS TECNOLOGIA LTA`
- Review completed: 27/08/2026
- Status: Attention needed

Problemas apontados:

### 10.1.2.10 Functionality

> The product has no accessible method of being launched.

Causa atual:

- o instalador registra o Agent como serviço;
- não existe aplicativo/launcher claramente acessível no Menu Iniciar;
- o MonitorIA fica efetivamente invisível para o avaliador após a instalação.

Correção 1.0.3 Store:

- aplicativo visível;
- entrada no Menu Iniciar;
- bandeja;
- tela de status;
- launcher real.

### 10.2.4.2 Security — Software Dependencies

> Your product contains drivers that have not been provided by Microsoft.

Causa prática identificada:

- `monitoria-service.exe` / WinSW;
- Windows NT Service;
- execução como LocalSystem.

A nova versão Store **não pode conter nenhum desses componentes**.

---

# 4. Regra fundamental: um único MonitorIA Core

Todas as funcionalidades abaixo pertencem ao **core compartilhado**:

- conexão RTSP;
- descoberta ONVIF;
- captura de frames;
- detector de movimento;
- calibração adaptativa;
- criação de acontecimentos;
- timeline circular;
- fotos start/peak/extra/end;
- geração de clipes;
- fila durável;
- retry;
- upload;
- heartbeat;
- pareamento;
- estado das câmeras;
- telemetria;
- detecção de abertura/fechamento;
- movimentações fora do horário;
- armazenamento local;
- limpeza automática;
- políticas de espaço em disco.

Nenhuma correção dessas funcionalidades pode existir apenas na Store ou apenas no `.exe`.

A diferença deve ficar limitada ao **host Windows**:

- Service Host;
- Desktop/Tray Host.

---

# 5. Ícone e interface em segundo plano — obrigatório nas duas versões

Tanto a versão `.exe 24/7` quanto a Store devem possuir ícone visível na bandeja do Windows.

O ícone deve representar o estado:

- MonitorIA ativo;
- atenção;
- câmeras desconectadas;
- pouco espaço em disco;
- monitoramento parado.

Menu mínimo do ícone:

- Monitoramento ativo / status;
- câmeras conectadas;
- abrir painel;
- diagnóstico;
- sincronizar;
- reiniciar monitoramento;
- verificar atualização, quando aplicável;
- sair da interface;
- encerrar MonitorIA apenas quando permitido e com confirmação.

Na versão 24/7, fechar a interface **não pode parar o Windows Service**.

Na versão Store, fechar a janela deve minimizar para a bandeja. Encerramento completo exige ação explícita.

---

# 6. Abertura e fechamento — requisitos 1.0.3

A identificação de abertura/fechamento é uma função **opt-in por câmera**.

O usuário deve marcar explicitamente que uma câmera possui visão adequada da porta, portão, grade, persiana, cancela ou acesso que define abertura/fechamento do local.

Nem todas as câmeras precisam exercer essa função.

## 6.1 Horário configurado pelo usuário

O usuário informa:

- horário aproximado de abertura;
- horário aproximado de fechamento.

Esses horários:

- são contexto;
- aumentam atenção operacional;
- ajudam na interpretação;
- **não são prova** de abertura/fechamento.

Abrir às 03:00 continua sendo detectável e deve ser ainda mais relevante.

## 6.2 Tipos de precisão

### `visible_transition`

Só é permitido quando existe evidência temporal real.

Exemplos:

- `closed -> opening -> open`;
- `open -> closing -> closed`.

Não aceitar:

- `previousVisibleState = null`;
- apenas um frame já aberto;
- apenas um frame já fechado.

### `estimated_interval`

Quando a transição não foi registrada diretamente, armazenar:

- última evidência do estado anterior;
- primeira evidência do novo estado;
- início da janela;
- fim da janela;
- horário representativo estimado;
- confiança;
- fonte da inferência.

A UI, Pesquisa IA e MCP devem dizer **“aproximadamente”** e informar a faixa quando relevante.

## 6.3 Problema encontrado em 27/08/2026

O sistema registrou abertura às aproximadamente 10:14 como `visible_transition`, apesar de já existir:

- observação `partially_open` antes;
- observação `open` antes;
- `previousVisibleState = null` no evento usado.

Isso deve virar teste de regressão obrigatório.

---

# 7. Movimento estrutural lento

Portões, persianas e portas podem mudar lentamente.

O detector 1.0.3 deve usar duas escalas:

1. mudança quadro a quadro — pessoas/movimento rápido;
2. mudança estrutural acumulada em uma janela temporal.

A referência estrutural deve permitir detectar:

- persiana subindo devagar;
- persiana descendo devagar;
- porta grande abrindo;
- cancela;
- mudança relevante na área operacional.

Essa lógica deve ser genérica e funcionar em qualquer câmera configurada para a função.

---

# 8. Movimentação estranha fora do horário

O MonitorIA deve distinguir movimento comum de contexto operacional relevante.

Após fechamento confirmado, exemplos que precisam receber prioridade:

- abertura do acesso;
- pessoa dentro do estabelecimento;
- pessoa entrando em zona sensível;
- movimento prolongado;
- mudança estrutural grande;
- atividade inesperada;
- veículo em área monitorada, se configurado;
- portão parcialmente aberto;
- tentativa de acesso.

Classificações possíveis:

- acesso aberto fora do horário;
- atividade após fechamento;
- movimentação inesperada;
- presença em área interna fora do expediente;
- mudança estrutural fora do horário.

O sistema não deve inventar crime, invasão ou intenção sem evidência.

---

# 9. Nenhum acontecimento importante pode ser perdido

Este é um requisito comercial da 1.0.3.

A arquitetura deve priorizar preservação de evidência antes de processamento pesado.

Ao iniciar um acontecimento relevante:

1. fixar segmentos necessários da timeline;
2. preservar frames;
3. persistir na fila durável;
4. só depois depender de IA, rede ou backend.

Eventos operacionais importantes:

- abertura;
- fechamento;
- acesso fora do horário;
- pessoa em zona sensível;
- evento marcado crítico pelo perfil;
- eventos de segurança configurados.

---

# 10. Fotos e vídeo precisam representar o mesmo acontecimento

Este é um critério bloqueante.

Para cada acontecimento existirá um intervalo canônico:

`event_start_at -> event_end_at`

Fotos:

- `start`;
- `peak`;
- `extra`;
- `end`.

Vídeo:

- margem curta antes;
- todo o intervalo do acontecimento;
- margem curta depois.

Exemplo:

Se o acontecimento foi de 18:11:00 até 18:11:44, não é aceitável:

- fotos de 18:11:05 e 18:11:11;
- vídeo contendo apenas 18:11:44–18:11:47.

## 10.1 Validação obrigatória de clipe

O backend não pode confiar somente na duração pedida.

Deve validar:

- duração real do MP4;
- cobertura da janela solicitada;
- segmentos realmente utilizados;
- início e fim reais;
- tolerância de margem.

Se um pedido de 50 segundos produzir 4 segundos:

- não marcar como vídeo completo;
- usar estado `partial`/`incomplete` ou equivalente;
- comunicar claramente ao usuário;
- tentar recuperação se as fontes ainda existirem.

---

# 11. Política de disco e limpeza local

Continuar preservando:

- fila de acontecimentos ainda não enviada;
- fotos necessárias;
- segmentos presos a eventos importantes;
- evidência em construção.

Continuar limpando automaticamente:

- timeline circular antiga;
- fotos já enviadas;
- arquivos temporários;
- fontes de vídeo que não são mais necessárias;
- evidências locais já entregues e liberadas conforme política.

Prioridade quando faltar espaço:

1. nunca perder fila durável;
2. nunca apagar fotos de acontecimento não enviado;
3. manter fontes presas a evento importante;
4. apagar timeline descartável antiga;
5. reduzir vídeo;
6. avisar o usuário.

## 11.1 Alertas de disco

Sugestão inicial:

- >= 10 GB livres: normal;
- < 10 GB: atenção;
- < 6 GB: alerta importante;
- < 4 GB/reserva efetiva: vídeos ameaçados/suspensos.

O dashboard e o ícone da bandeja devem mostrar isso.

---

# 12. Problema de fila de vídeo encontrado na 1.0.2

Um pedido com 20 tentativas estava sendo selecionado novamente.

A tentativa 21 violava o limite do banco e bloqueava toda a fila posterior.

A correção deve permanecer definitivamente na 1.0.3:

- pedido esgotado vira `failed`;
- nunca volta a envenenar a fila;
- próximos pedidos continuam normalmente.

Criar teste de regressão.

---

# 13. Testes obrigatórios da 1.0.3

A versão não será considerada candidata sem passar por estes cenários:

### Pareamento

- instalação nova exige código;
- upgrade saudável preserva pareamento;
- token realmente inválido/revogado exige novo código;
- upgrade nunca apaga câmeras.

### Câmeras

- 1 câmera;
- múltiplas câmeras;
- câmeras de marcas diferentes;
- ONVIF;
- RTSP manual;
- perda e retorno de conexão.

### Abertura/fechamento

- portão rápido;
- portão lento;
- porta;
- persiana;
- abertura antes do horário;
- abertura depois do horário;
- abertura às 03:00;
- fechamento normal;
- parcialmente aberto;
- evento sem transição;
- duas câmeras corroborando;
- câmera secundária errando sem alterar estado oficial.

### Eventos

- pessoa passa;
- cliente chega;
- funcionário continua dentro após fechar;
- movimento depois do fechamento;
- local vazio;
- movimento pequeno;
- movimento estrutural grande.

### Fotos e vídeo

- evento curto;
- evento longo;
- start/peak/end;
- vídeo cobrindo exatamente o mesmo período;
- clipe parcial rejeitado como completo;
- arquivo indisponível;
- disco sob pressão.

### Reinício

- Agent crash;
- host crash;
- reinício Windows;
- bloqueio de tela;
- logoff;
- login;
- retomada de fila.

---

# 14. Processo de validação

## Etapa A — validar o Core usando o MonitorIA 24/7

Usar inicialmente o Service Edition porque o ambiente já é conhecido.

Validar pelo menos:

`abertura -> expediente -> fechamento -> madrugada -> abertura seguinte`

Não promover a Store antes desse ciclo estar confiável.

## Etapa B — executar o mesmo Core no Desktop Host

Comparar resultados.

Se houver diferença, a causa deve estar no host, não na lógica.

## Etapa C — máquina limpa

Testar:

- instalação nova;
- login;
- autostart;
- SmartScreen no instalador direto;
- Store package;
- desinstalação;
- atualização.

---

# 15. Critérios bloqueantes antes de enviar à Microsoft

Não submeter enquanto qualquer um destes pontos falhar:

1. Store package contém WinSW ou Windows Service.
2. Store package não possui launcher visível.
3. Store package não possui entrada no Menu Iniciar.
4. fotos e vídeo divergem temporalmente.
5. vídeo parcial é apresentado como completo.
6. abertura/fechamento pode ser “exato” sem transição real.
7. evento crítico pode ser eliminado antes de ser persistido.
8. upgrade perde pareamento.
9. duas câmeras não funcionam simultaneamente.
10. Store e EXE produzem eventos diferentes usando a mesma entrada.

---

# 16. Entregas planejadas

## Entrega 1 — Fundação 1.0.3

- criar branch/base 1.0.3;
- consolidar Agent Core;
- separar host de execução;
- criar suíte de regressão;
- manter 1.0.2 congelada;
- incluir este documento no repositório.

## Entrega 2 — Operação e segurança

- abertura/fechamento;
- transições corretas;
- movimento estrutural lento;
- câmera opt-in;
- atividade fora do horário;
- regressões.

## Entrega 3 — Evidência confiável

- fotos/vídeo unificados;
- pinning de timeline;
- validação real de MP4;
- clipe incompleto;
- fila;
- armazenamento;
- alertas de disco.

## Entrega 4 — Hosts Windows

### 24/7 EXE

- Windows Service;
- tray visível;
- status;
- diagnóstico;
- experiência de instalação.

### Microsoft Store

- Desktop Host;
- tray;
- launcher;
- Menu Iniciar;
- autostart no login;
- sem serviço.

## Entrega 5 — Certificação

- testes completos;
- build limpo;
- assinatura;
- WACK;
- auditoria do pacote;
- notas da certificação;
- submissão à Microsoft.

---

# 17. Regras para qualquer agente que continuar este trabalho

1. **Não criar dois núcleos diferentes.**
2. **Não alterar a 1.0.2 já congelada como referência.**
3. **Toda correção funcional deve entrar no Core compartilhado.**
4. **Nunca afirmar que um horário foi exato se só foi inferido.**
5. **Nunca aceitar vídeo parcial como vídeo completo.**
6. **Nunca apagar evidência ainda não enviada para liberar espaço.**
7. **Nunca executar alteração de produção sem autorização explícita do usuário.**
8. **Não quebrar o pareamento já validado.**
9. **Novo cliente sempre precisa de código de conexão.**
10. **Upgrade saudável não pede novo código.**
11. **Token realmente inutilizável/revogado precisa de reparo e novo código.**
12. **A versão EXE e a Store precisam mostrar claramente que o MonitorIA está rodando em segundo plano.**
13. **Antes de corrigir um bug, criar/atualizar o teste de regressão correspondente quando possível.**
14. **Não enviar nova versão à Microsoft antes dos critérios bloqueantes deste documento passarem.**

---

# 18. Estado conhecido no momento em que este documento foi criado

- 1.0.2 funciona com duas câmeras e fila durável.
- Service Edition atual usa WinSW/Windows Service.
- Microsoft Store rejeitou novamente esse formato.
- Último relatório de certificação: 27/08/2026.
- Motivos atuais:
  - falta de método acessível de lançamento;
  - dependência classificada como driver/serviço não-Microsoft.
- Backend já possui mecanismo de inferência operacional.
- Fechamento de 26/08 foi detectado como estimado, mas horário ficou antecipado.
- Abertura de 27/08 foi registrada incorretamente como transição visível tardia.
- Já foi identificado caso de vídeo solicitado como longo, mas entregue com poucos segundos reais.
- Já foi identificado caso de fila de clips bloqueada por retry esgotado.
- Já existe política de limpeza local e reserva de disco, mas a UX de alerta precisa melhorar.
- Câmera operacional é opt-in.
- A experiência final deve funcionar com qualquer câmera compatível, não apenas com as câmeras usadas nos testes.

---

# 19. Resultado esperado da 1.0.3

Para o cliente final:

> Instalo o MonitorIA, vejo claramente que está funcionando, escolho quais câmeras têm funções especiais, e posso confiar que um acontecimento importante terá imagens, vídeo e horário coerentes.

Para o produto:

> Um único MonitorIA Core, duas distribuições Windows, evidência confiável e arquitetura compatível com Microsoft Store.

Para a certificação:

> A versão Store possui launcher acessível, não instala Windows Service/WinSW e não depende dos componentes que provocaram a rejeição atual.

---

**Este documento é a fonte de continuidade da etapa MonitorIA 1.0.3 e deve ser atualizado sempre que uma decisão arquitetural ou critério de aceitação mudar.**


---

# 20. Linux — requisito obrigatório de paridade da 1.0.3

A versão Linux **faz parte da mesma linha MonitorIA 1.0.3** e deve acompanhar todas as melhorias funcionais do Core.

## 20.1 Arquitetura

O MonitorIA terá **um único Core funcional** compartilhado entre:

- Windows 24/7: Windows Service + interface/tray;
- Microsoft Store: Desktop/Tray Host sem NT Service;
- Linux: `systemd`.

O Linux já possui uma arquitetura adequada para operação 24/7:

- serviço `monitoria-agent.service`;
- `systemd`;
- usuário dedicado `monitoria`;
- estado em `/var/lib/monitoria`;
- binários em `/opt/monitoria`;
- build x64 e arm64;
- reinício automático;
- inicialização sem depender de login gráfico.

O Linux não precisa reproduzir a bandeja do Windows em instalações headless. A interface operacional continua sendo o dashboard. Uma futura edição Linux Desktop poderá adicionar tray sem alterar o Core.

## 20.2 Regra de paridade

Toda melhoria independente do host deve ser aplicada e validada também em Linux:

- pareamento;
- ONVIF e RTSP;
- detector de movimento;
- movimento estrutural lento;
- abertura e fechamento;
- atividade fora do horário;
- criação e preservação de acontecimentos;
- fotos `start/peak/extra/end`;
- timeline;
- clipes;
- validação de duração/cobertura do vídeo;
- fila durável;
- retry;
- armazenamento;
- limpeza automática;
- alertas de disco;
- heartbeat e telemetria.

Não é aceitável deixar o Windows avançar para 1.0.3 e manter o Linux funcionalmente parado em 1.0.2.

## 20.3 Testes Linux obrigatórios

Além dos testes funcionais do Core, validar:

- Linux x64;
- Linux arm64;
- `systemd` ativo;
- reinício do serviço;
- reboot;
- upgrade preservando `/var/lib/monitoria`;
- fila pendente sobrevivendo a restart;
- FFmpeg/ffprobe;
- duas ou mais câmeras;
- perda e retorno de RTSP;
- instalação e desinstalação.

## 20.4 Critério de release

Uma alteração funcional do MonitorIA Core não deve ser considerada concluída enquanto:

1. passar nos testes Windows 24/7;
2. passar nos testes Linux compatíveis;
3. não criar comportamento funcional divergente sem justificativa de plataforma.

A Store será validada depois sobre o mesmo Core.
