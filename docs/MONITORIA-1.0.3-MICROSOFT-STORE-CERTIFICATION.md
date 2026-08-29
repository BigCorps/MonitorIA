# MonitorIA 1.0.3 — Auditoria para Microsoft Store (Win32 EXE)

## Estado desta auditoria

Documento de pré-certificação atualizado após a Fase 05B7. Não publicar, não criar `agent-v1.0.3`, não alterar o download público 1.0.2, não configurar `MONITORIA_STORE_PUBLIC_URL` e não enviar ao Partner Center enquanto os itens marcados como **PENDENTE** não forem fechados.

## Requisitos oficiais relevantes para MSI/EXE

A Microsoft Store aceita instaladores Win32 tradicionais `.exe`/`.msi`. Para EXE, o fluxo do Partner Center exige um link HTTPS direto e versionado, instalador autônomo/offline, instalação silenciosa e assinatura confiável do instalador e dos arquivos PE distribuídos. O arquivo hospedado no URL submetido deve permanecer imutável; uma atualização precisa usar um novo URL versionado.

No cadastro do pacote EXE também são informados arquitetura, tipo do instalador e parâmetros de instalação silenciosa. A certificação inclui segurança, funcionamento e conformidade da listagem. Produtos Win32 que tratam informações pessoais devem disponibilizar política de privacidade pública coerente com o produto.

## MonitorIA Store 1.0.3 — situação técnica

### FECHADO no código/CI até a 05B7

- Instalador: `MonitorIA-Store-Setup.exe`.
- Instalação por usuário em `%LOCALAPPDATA%\\Programs\\MonitorIA`.
- Sem Windows Service e sem privilégio administrativo no canal Store.
- Core, Desktop Host, DPAPI e launcher Store passam pelo pipeline de assinatura.
- Setup e uninstaller passam pelo SignTool do Inno e são validados com Authenticode + timestamp.
- FFmpeg/ffprobe/DLLs são conferidos pelo pipeline antes do empacotamento.
- Instalador offline: os binários necessários estão dentro do Setup.
- Instalação silenciosa usa `skipifsilent` e não abre o MonitorIA.
- CI executa o instalador Store real com os mesmos parâmetros previstos para o Partner Center.
- CI confirma que instalação silenciosa não cria `HKCU\\...\\CurrentVersion\\Run\\MonitorIA`.
- CI confirma que nenhum processo MonitorIA é iniciado automaticamente durante a instalação silenciosa.
- O launcher Store pergunta, na primeira abertura manual, se o usuário deseja iniciar o MonitorIA automaticamente ao entrar no Windows.
- A opção começa desligada e o diálogo usa **Não como botão padrão**.
- Se o usuário disser Sim, a entrada HKCU Run é criada para aquele usuário; se disser Não, permanece ausente.
- A escolha é persistida em `HKCU\\Software\\BIGCORPS\\MonitorIA\\Store\\AutoStartChoice`.
- Um upgrade pode remover a entrada legada criada por RC antigo, mas o launcher reaplica silenciosamente a escolha já consentida pelo usuário; não transforma upgrade em novo consentimento implícito.
- O Menu Iniciar oferece `MonitorIA — Inicialização automática` para mudar a preferência posteriormente.
- A desinstalação remove a entrada Run e a preferência Store.
- Desinstalação Store não encerra o Agent 24/7 por nome.
- Unicode/acentuação dos hosts nativos e do launcher é testada diretamente no PE.
- Store e 24/7 usam o mesmo Core 1.0.3.
- Retenção de evidência de vídeo vinculada à fila durável está endurecida desde a 05B6.3.

### Parâmetros previstos para Partner Center

Para o instalador Inno Setup:

`/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`

A Fase 05B7 adiciona ao workflow RC uma instalação e desinstalação silenciosas reais. O build final ainda deve ser repetido no commit congelado e depois validado em uma máquina Windows limpa antes da submissão.

## PENDENTE antes de submeter

### 1. RC Store final em máquina limpa

Depois de congelar o commit final:

- gerar o RC assinado Store;
- instalar com os parâmetros silenciosos acima e confirmar exit code 0;
- confirmar que não existe autostart antes da primeira abertura manual;
- abrir manualmente e validar os dois caminhos de consentimento (Não e Sim);
- validar que Sim sobrevive a logout/login e que Não não inicia o app;
- validar pareamento, duas câmeras, lock/unlock, fechamento/reabertura e uninstall;
- confirmar Authenticode + timestamp dos PEs instalados e do uninstaller.

### 2. URL HTTPS imutável/versionada

Somente depois do último binário Store aprovado:

- hospedar o `MonitorIA-Store-Setup.exe` em URL HTTPS exclusiva da 1.0.3;
- conferir SHA-256 hospedado contra o manifesto do RC;
- nunca substituir os bytes nesse mesmo URL;
- preencher o URL no Partner Center;
- configurar `MONITORIA_STORE_PUBLIC_URL` apenas no momento definido para publicação, não durante RC.

### 3. Política de privacidade pública

A auditoria de código da 05B7 não encontrou rota/documento público de política de privacidade no repositório. Antes da submissão, criar e publicar uma política específica do MonitorIA que descreva de forma fiel, no mínimo:

- dados de conta e organização;
- dados técnicos do Agent/computador e câmeras;
- imagens, vídeos e acontecimentos capturados;
- finalidade de monitoramento e análise por IA;
- armazenamento/retenção e exclusão;
- fornecedores/subprocessadores realmente utilizados;
- segurança e controle de acesso;
- direitos do titular e canal real de contato;
- data de vigência/atualização.

Não preencher informações legais ou contatos por suposição. A versão pública deve usar os dados reais da BIGCORPS e um canal de suporte confirmado.

### 4. Listing do Partner Center

Conferir e congelar:

- nome `MonitorIA` reservado/correto;
- descrição sem promessas que não estejam demonstradas;
- categoria e classificação etária;
- mercados;
- logo/ícones;
- screenshots de PC representativas;
- URL pública de privacidade;
- site/canal real de suporte;
- notas para certificação explicando: instalar → abrir → escolher autostart → conectar por código → procurar câmeras → dashboard web.

## Ordem restante para fechar a Store

1. Fase 05B7 — consentimento de autostart + silent install automatizado.
2. Fase final de privacidade/listing — criar a política pública com dados reais e preparar os textos/evidências do Partner Center.
3. Gerar RC final do mesmo commit aprovado.
4. Fazer a prova Store em máquina limpa.
5. Congelar SHA-256 e hospedar URL HTTPS versionada imutável.
6. Preencher Partner Center e notas de certificação.
7. Somente após essas provas decidir a ordem de tag `agent-v1.0.3`, release, recomendação pública e submissão/atualização da Store.
