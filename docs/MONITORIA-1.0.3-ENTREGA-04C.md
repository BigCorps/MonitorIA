# MonitorIA 1.0.3 — Entrega 04C

## Instalação, primeira execução e experiência final antes da Release Candidate

**Data:** 27/08/2026  
**Versão alvo:** 1.0.3  
**Etapa:** 04C  
**Status deste pacote:** implementação pronta para subir e validar em CI; ainda não é Release Candidate nem pacote de produção.

Este documento é um **adendo obrigatório** ao arquivo existente:

`docs/MONITORIA-1.0.3-PLANO-MESTRE.md`

Qualquer agente que continuar o trabalho deve ler os dois documentos. O Plano
Mestre contém as decisões e entregas 01–04B; este arquivo registra exatamente o
que foi fechado na 04C e o que ainda falta na Fase 05.

---

# 1. Decisão importante descoberta na 04C

O pareamento da edição Microsoft Store **não pode depender da tela do
instalador**.

Motivo: o canal Store precisa ser compatível com instalação silenciosa/passiva.
Se o código de conexão existisse somente como uma página do Inno Setup, uma
instalação feita silenciosamente terminaria sem parear e, pior, o cliente não
teria um local acessível para informar o código depois.

Por isso a arquitetura final da edição Store é:

`Microsoft Store -> instalador por usuário -> Menu Iniciar -> monitoria-desktop.exe`

`monitoria-desktop.exe -> primeira execução/pareamento -> monitoria-agent.exe run`

O instalador apenas coloca os binários, cria o atalho e configura autostart.

O **Desktop Host** é quem detecta o estado real do pareamento e mostra a tela
“Conecte este computador ao MonitorIA”.

---

# 2. Invariante de pareamento preservado

A 04C mantém a regra já homologada no Agent:

1. **Cliente novo / computador novo:** pede código de conexão.
2. **Upgrade com token utilizável:** não pede novo código.
3. **Token ilegível, ausente ou recusado:** volta a pedir código para reparo.
4. Código inválido não substitui uma configuração antiga antes de o servidor
   aceitar o novo pareamento.
5. A Store usa `%LOCALAPPDATA%\MonitorIA`; a edição 24/7 continua usando
   `%PROGRAMDATA%\MonitorIA`.

A tela Store consulta o comando `paired-check`, que já usa o estado real de
pareamento do Core, e executa `setup --file` com arquivo temporário quando um
novo código é necessário.

O código não é gravado em `agent.json`.

---

# 3. Primeira execução da Microsoft Store

O arquivo alterado:

`agent/native/desktop-host.c`

agora possui uma interface Win32 simples de conexão.

Comportamento:

- inicia o Core compartilhado 1.0.3;
- aguarda o canal local ficar disponível;
- consulta `paired-check`;
- se o computador já estiver pareado, não interrompe o usuário;
- se precisar de conexão, abre a tela com campo de código;
- oferece botão para abrir o painel;
- usa arquivo temporário para `setup --file`;
- apaga o arquivo temporário depois da tentativa;
- mostra erro amigável para código recusado, entrada inválida, falta de
  permissão ou Core ainda iniciando;
- depois do sucesso, mantém o Desktop Host e o mesmo Core em execução;
- o menu do tray também possui “Conectar este computador” enquanto necessário;
- se um pareamento antes válido deixar de ser utilizável, a tela de reparo pode
  reaparecer.

Isso resolve o caso de instalação silenciosa da Store sem inventar um segundo
Core ou um segundo fluxo de credenciais.

---

# 4. Instalador Microsoft Store 1.0.3

Novo arquivo:

`installer/monitoria-store-v103.iss`

Características:

- `PrivilegesRequired=lowest`;
- instalação por usuário em `{localappdata}\Programs\MonitorIA`;
- AppId próprio da edição Store;
- inclui somente:
  - `monitoria-desktop.exe`;
  - `monitoria-agent.exe`;
  - `monitoria-dpapi.exe`;
  - FFmpeg/ffprobe LGPL e DLLs necessárias;
- cria `MonitorIA` no Menu Iniciar;
- registra autostart em HKCU depois do login;
- não cria página de pareamento no instalador;
- instalação silenciosa não depende de UI;
- instalação interativa pode abrir o MonitorIA ao terminar;
- upgrade preserva `%LOCALAPPDATA%\MonitorIA`;
- desinstalação explícita remove os dados daquela edição/usuário;
- não finaliza `monitoria-agent.exe` por nome durante uninstall, evitando
  atingir por engano a edição 24/7 numa máquina que tenha as duas instaladas.

## 4.1 Proibido na edição Store

O instalador e o Desktop Host são testados para não conter referências a:

- WinSW;
- XML do host 24/7;
- instalação de NT Service;
- Service Control Manager;
- `sc.exe`;
- `MonitorIAAgent`.

O Core funcional continua sendo o mesmo `monitoria-agent.exe` 1.0.3.

---

# 5. Comportamento de ciclo de vida da Store

Depois da 04C:

| Situação | Microsoft Store |
|---|---|
| Instalou silenciosamente | Instala sem pedir código |
| Primeira abertura | Desktop Host pede código se necessário |
| Upgrade saudável | Pareamento preservado |
| Token inutilizável/revogado | Interface pede reparo |
| Login do Windows | Autostart inicia Desktop Host |
| Tela bloqueada | Continua monitorando |
| Logoff | Desktop Host/Core encerram |
| Reboot parado na tela de login | Ainda não monitora |
| Próximo login | Inicia novamente |
| Usuário escolhe “Sair do MonitorIA” | Desktop Host e Core encerram |

---

# 6. Edição MonitorIA 24/7 permanece separada

A 04C **não substitui** a arquitetura já entregue na 04A.

O build final direto deve usar:

`installer/monitoria-service-v103.iss`

Esse instalador mantém:

- Windows Service;
- WinSW;
- `%PROGRAMDATA%\MonitorIA`;
- inicialização antes do login;
- companion `monitoria-tray.exe` visível depois do login;
- fechar apenas o tray não interrompe o monitoramento 24/7.

A Fase 05 não deve voltar a usar `installer/monitoria.iss` sozinho como pacote
final 1.0.3, pois isso perderia o tray da edição direta.

---

# 7. Página Instalação do dashboard

Arquivos:

- `app/dashboard/installer/page.tsx`;
- `app/dashboard/installer/installer.module.css`;
- `src/lib/installer-data.ts`;
- `src/components/installer/smartscreen-notice.tsx`.

A tela agora apresenta duas opções Windows lado a lado quando houver espaço:

## MonitorIA 24/7

- recomendado para PC dedicado;
- inicia antes do login;
- continua sem usuário conectado;
- tray aparece após login;
- download pelo canal oficial MonitorIA;
- informa que SmartScreen/antivírus pode analisar o instalador;
- nunca orienta a desativar proteção.

## MonitorIA via Microsoft Store

- recomendado para PC de uso diário;
- instalação por usuário;
- inicia após login;
- continua com tela bloqueada;
- tray visível;
- atualização pelo canal Store;
- não promete que antivírus nunca examinará o aplicativo.

A tela inclui comparação simples de reboot/login, segundo plano, tray,
atualização e perfil de computador recomendado.

Linux permanece na mesma página e continua descrito como parte do mesmo Core.

---

# 8. Botão público da Microsoft Store

A 04C não publica antecipadamente uma submissão ainda não aprovada.

Nova variável opcional:

`MONITORIA_STORE_PUBLIC_URL`

Enquanto ela não existir, a página mostra:

**Em preparação para a Microsoft Store**

Depois da aprovação, definir somente uma URL oficial no domínio:

`https://apps.microsoft.com/...`

`publicStoreUrl()` rejeita protocolos/hosts diferentes.

**Não configurar essa variável antes da aprovação da 1.0.3.**

---

# 9. SmartScreen e antivírus

O texto anterior fazia afirmações fortes sobre o aviso desaparecer sozinho.

A 04C troca por uma orientação mais segura:

- arquivo direto pode ser analisado;
- baixar somente pelo MonitorIA oficial;
- conferir assinatura digital/editor;
- não desativar antivírus;
- se houver bloqueio, manter a proteção e acionar suporte;
- Store tende a reduzir atrito de instalação, mas ferramentas de segurança
  continuam podendo analisar o app.

---

# 10. Validação automatizada

Novo workflow:

`.github/workflows/validate-store-install-v103.yml`

Nome no Actions:

**Validate MonitorIA 1.0.3 Store Install Experience**

O job:

1. executa TypeScript do Agent e web;
2. roda os testes de host/instalação;
3. reroda as regressões funcionais 01–03E do Core;
4. compila o mesmo Core 1.0.3;
5. compila Desktop Host;
6. compila DPAPI;
7. roda self-test do Desktop Host;
8. baixa o FFmpeg LGPL oficial e verifica SHA256;
9. bloqueia referências aos componentes da edição 24/7;
10. compila `MonitorIA-Store-Setup.exe`;
11. verifica arquivos obrigatórios;
12. envia um artifact temporário por 3 dias.

Esse artifact é **somente para validação**. Ele ainda não passa pelo processo
final de assinatura da Fase 05 e não deve ser distribuído nem enviado à
Microsoft.

---

# 11. Testes adicionados/atualizados

`test/agent-0103-store-desktop-host.test.ts`

passa a cobrir também:

- pareamento gráfico na primeira execução;
- `paired-check`;
- `setup --file`;
- reparo depois de perda de pareamento utilizável;
- temporário do código;
- ausência dos componentes do host 24/7.

`test/agent-0103-store-install-experience.test.ts`

cobre:

- instalação per-user;
- Menu Iniciar;
- HKCU autostart;
- independência de tela interativa no instalador;
- ausência dos componentes proibidos;
- preservação de dados no upgrade;
- textos 24/7 x Store;
- política de segurança;
- validação do link público da Store.

---

# 12. O que NÃO fazer depois de aplicar a 04C

Ainda não:

- criar tag `agent-v1.0.3`;
- substituir o instalador público 1.0.2;
- trocar `AGENT_RECOMMENDED_VERSION` em produção para 1.0.3;
- configurar `MONITORIA_STORE_PUBLIC_URL`;
- instalar a 1.0.3 na máquina real da loja sem fechar a Fase 05;
- enviar o artifact de CI à Microsoft Store;
- publicar a edição Store para clientes.

Não há migration Supabase nesta entrega.

---

# 13. Próxima etapa — Fase 05 / Release Candidate

Depois de todos os builds da 04C ficarem verdes, a implementação funcional da
1.0.3 fica fechada e começa a preparação da RC.

A Fase 05 deve produzir e validar, a partir do mesmo commit:

1. **MonitorIA 24/7 1.0.3**
   - Core 1.0.3;
   - Windows Service;
   - tray companion;
   - instalador `monitoria-service-v103.iss`;
   - assinatura de todos os executáveis/instalador.
2. **MonitorIA Store 1.0.3**
   - mesmo Core;
   - Desktop Host;
   - primeira execução/pareamento;
   - instalador `monitoria-store-v103.iss`;
   - zero componentes exclusivos do host 24/7;
   - assinatura;
   - URL imutável para certificação.
3. **Linux 1.0.3 x64 e arm64**
   - mesmo Core;
   - systemd;
   - upgrades preservando estado.

Depois, executar matriz real:

- máquina Windows limpa;
- instalação nova Store;
- código de conexão;
- duas câmeras;
- reboot/login;
- lock/unlock;
- logoff/login;
- upgrade Store preservando pareamento;
- token revogado pedindo reparo;
- instalação nova 24/7;
- boot antes de login;
- tray após login;
- fechar tray sem parar host 24/7;
- eventos/fotos/vídeo coerentes;
- abertura/fechamento;
- atividade fora do horário;
- pressão de disco;
- Linux compatível.

Somente depois dessa matriz e da auditoria do pacote Store a nova submissão da
Microsoft deve ser criada.

---

# 14. Critérios bloqueantes que continuam valendo

Não enviar à Microsoft se qualquer item abaixo falhar:

- Store instala componente do host 24/7;
- Store não abre pelo Menu Iniciar;
- instalação silenciosa deixa o cliente sem caminho de pareamento;
- upgrade saudável pede código novamente;
- token realmente inutilizável não oferece reparo;
- Desktop Host não volta após login;
- Core Store difere funcionalmente do Core 24/7/Linux;
- vídeo parcial aparece como completo;
- fotos e vídeo não pertencem ao mesmo intervalo;
- abertura/fechamento exato sem evidência real;
- acontecimento importante pode sumir antes de persistir;
- duas câmeras não funcionam simultaneamente.

---

**Ponto de continuidade:** ao terminar a validação da Entrega 04C, seguir
exclusivamente para a Fase 05 / Release Candidate. Não abrir uma 04D sem um bug
real encontrado nos builds ou nos testes desta entrega.
