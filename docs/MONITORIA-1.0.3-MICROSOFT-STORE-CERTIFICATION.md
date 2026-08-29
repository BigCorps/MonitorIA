# MonitorIA 1.0.3 — Auditoria para Microsoft Store (Win32 EXE)

## Estado desta auditoria

Documento de pré-certificação. Não publicar, não criar `agent-v1.0.3`, não alterar o download público 1.0.2, não configurar `MONITORIA_STORE_PUBLIC_URL` e não enviar ao Partner Center enquanto os itens marcados como **PENDENTE** não forem fechados.

## Requisitos oficiais relevantes para MSI/EXE

A Microsoft Store aceita instaladores Win32 tradicionais `.exe`/`.msi`. Para EXE, o Partner Center exige um link HTTPS direto e versionado, instalador autônomo/offline, instalação silenciosa e assinatura confiável do instalador e de todos os arquivos PE instalados. O binário hospedado no URL submetido não pode ser substituído depois da submissão; uma atualização exige um novo URL versionado.

No cadastro do pacote EXE também devem ser informados arquitetura, tipo de app e parâmetros de instalação silenciosa.

A certificação inclui testes de segurança, funcionamento e conformidade de conteúdo. Aplicativos Win32 que acessam informações pessoais precisam manter uma política de privacidade. A listagem precisa representar corretamente o comportamento do produto.

## MonitorIA Store 1.0.3 — situação técnica

### OK no RC atual

- Instalador: `MonitorIA-Store-Setup.exe`.
- Instalação por usuário em `%LOCALAPPDATA%\\Programs\\MonitorIA`.
- Sem Windows Service e sem exigir administrador no canal Store.
- Core/desktop host/DPAPI assinados.
- FFmpeg/ffprobe/DLLs são conferidos pelo pipeline antes de empacotar.
- Setup e uninstaller passam pelo SignTool do Inno e são validados com Authenticode + timestamp.
- Instalador é offline: todos os binários necessários estão dentro do Setup.
- `[Run]` usa `skipifsilent`, portanto a instalação silenciosa não abre o MonitorIA durante a instalação.
- Desinstalação Store não encerra o Agent da edição 24/7 por nome.
- Unicode/acentuação dos hosts nativos é testada no PE.
- Store e 24/7 usam o mesmo Core 1.0.3.

### Parâmetros previstos para Partner Center

Como o instalador é Inno Setup, o candidato de parâmetros para o EXE é:

`/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`

Antes da submissão final, executar o instalador Store final com exatamente esses parâmetros em uma máquina limpa e registrar:

- exit code 0;
- nenhuma janela de wizard/progresso;
- nenhum reboot;
- instalação no escopo do usuário;
- aplicativo não aberto automaticamente durante a instalação;
- primeira abertura manual funciona e mostra o fluxo correto de conexão.

## PENDENTE antes de submeter

### 1. Consentimento explícito para iniciar com o Windows

O instalador Store atual grava diretamente `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\MonitorIA`.

A política da Store exige uso de métodos suportados e consentimento do usuário quando o produto altera configurações/preferências ou a experiência do Windows. Para reduzir risco de certificação e melhorar a experiência do usuário final, a versão Store final deve mudar para:

- instalação silenciosa **não** habilita autostart;
- primeira execução/Configurações oferece uma escolha clara: **“Iniciar MonitorIA automaticamente quando eu entrar no Windows”**;
- padrão desligado até o usuário aceitar;
- a mesma tela permite desligar novamente;
- desinstalação remove a entrada caso exista.

Este item será tratado na fase Store-specific imediatamente após a 05B6.3.

### 2. URL imutável/versionada

Somente depois de congelar o último binário Store aprovado localmente:

- criar URL HTTPS versionada para 1.0.3;
- conferir SHA-256 do arquivo hospedado contra o manifesto do RC;
- nunca substituir os bytes nesse mesmo URL;
- só então preencher `MONITORIA_STORE_PUBLIC_URL`/Partner Center conforme o fluxo de release.

### 3. Listing e privacidade

Antes da submissão final conferir no Partner Center:

- nome `MonitorIA` reservado/correto;
- descrição sem promessas que não estejam demonstradas;
- categoria;
- logo da Store;
- pelo menos uma captura de tela adequada ao PC;
- política de privacidade pública e atualizada;
- contato/site de suporte;
- classificação etária e mercados;
- notas para certificação explicando o fluxo: instalar → abrir → conectar por código → dashboard web.

## Ordem para fechar a Store

1. Fase 05B6.3 — retenção de vídeo durável.
2. Fase Store-specific — consentimento de autostart + teste silencioso.
3. Gerar RC final do mesmo commit aprovado.
4. Instalar Store final em ambiente limpo e coletar Authenticode, silent install, primeira abertura, pareamento, 2 câmeras, lock/unlock, reboot/login e uninstall.
5. Congelar SHA-256 e hospedar URL HTTPS versionada imutável.
6. Preencher Partner Center/listing/notas de certificação.
7. Só depois criar a tag/release pública e atualizar recomendação/download conforme a ordem de publicação definida.
