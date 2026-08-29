; MonitorIA 1.0.3 — Microsoft Store / Desktop Host
;
; Instalador por usuário. Não registra serviço do Windows e não pede
; privilégio administrativo. O primeiro pareamento acontece no próprio
; monitoria-desktop.exe quando o usuário abre o MonitorIA.
;
; A instalação silenciosa NÃO habilita início automático. Na primeira abertura
; manual, monitoria-store-launcher.exe pede consentimento explícito do usuário.
;
; Build de validação:
;   ISCC.exe /DAppVersion=1.0.3 installer\monitoria-store-v103.iss

#ifndef AppVersion
  #define AppVersion "1.0.3"
#endif

#define AppPublisher "BIGCORPS TECNOLOGIA LTA"
#define AppName "MonitorIA"

[Setup]
AppId={{D4B8D1D7-1F4A-4E5A-9C3D-7E2F8B6A1030}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription=MonitorIA para Microsoft Store
DefaultDirName={localappdata}\Programs\MonitorIA
DisableDirPage=yes
DisableProgramGroupPage=yes
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\monitoria-desktop.exe
PrivilegesRequired=lowest
MinVersion=10.0.17763
ArchitecturesAllowed=x64compatible
OutputDir=..\dist-store-v103
OutputBaseFilename=MonitorIA-Store-Setup
Compression=lzma2/ultra64
SolidCompression=yes
LZMANumBlockThreads=4

; Na RC assinada, o Inno chama o mesmo eSigner usado pelo pipeline.
; Isso assina o Setup e também o unins???.exe antes de ele ser embutido.
#ifdef SignCommand
SignTool=monitoria
SignedUninstaller=yes
#endif

WizardStyle=modern
SetupIconFile=monitoria.ico
CloseApplications=yes
RestartApplications=no
UsePreviousAppDir=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "..\agent\dist\monitoria-agent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\monitoria-desktop.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\monitoria-store-launcher.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\monitoria-dpapi.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffmpeg.exe"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffprobe.exe"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\*.dll"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\LICENSE.txt"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\FFMPEG-ORIGEM.txt"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion

[Icons]
; Abertura normal passa pelo consentimento de inicialização somente na primeira
; vez. Depois disso o launcher apenas entrega o controle ao Desktop Host.
Name: "{autoprograms}\MonitorIA"; \
  Filename: "{app}\monitoria-store-launcher.exe"; \
  WorkingDir: "{app}"; \
  IconFilename: "{app}\monitoria-desktop.exe"; \
  Comment: "Abrir o MonitorIA"

; O usuário pode mudar a escolha posteriormente sem reinstalar o produto.
Name: "{autoprograms}\MonitorIA — Inicialização automática"; \
  Filename: "{app}\monitoria-store-launcher.exe"; \
  Parameters: "--startup-settings"; \
  WorkingDir: "{app}"; \
  IconFilename: "{app}\monitoria-desktop.exe"; \
  Comment: "Ativar ou desativar o início automático do MonitorIA"

[Registry]
; Upgrade de RCs antigos: remove somente a entrada legada criada pelo próprio
; MonitorIA. A versão final só recria CurrentVersion\Run depois de consentimento
; explícito no launcher. `dontcreatekey` evita criar a chave caso não exista.
Root: HKCU; \
  Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: none; \
  ValueName: "MonitorIA"; \
  Flags: deletevalue dontcreatekey noerror

[Run]
; Em instalação interativa fora da Store, abrir o launcher ao terminar.
; A instalação silenciosa usada pelo canal Store não inicia processos extras;
; o usuário abre pelo botão da Store/Menu Iniciar e decide o autostart antes do
; Desktop Host ser iniciado pela primeira vez.
Filename: "{app}\monitoria-store-launcher.exe"; \
  WorkingDir: "{app}"; \
  Flags: nowait skipifsilent

[UninstallRun]
; Remove qualquer opt-in de autostart feito pelo usuário antes de apagar os
; binários. É uma limpeza apenas de HKCU e não interfere na edição 24/7.
Filename: "{app}\monitoria-store-launcher.exe"; \
  Parameters: "--remove-startup"; \
  Flags: runhidden waituntilterminated; \
  RunOnceId: "RemoveMonitorIAStartup"

; Encerrar o Desktop Host fecha também o Core filho pelo Job Object.
; Não finalizamos monitoria-agent.exe por nome para não atingir uma eventual
; edição 24/7 instalada na mesma máquina.
Filename: "{sys}\taskkill.exe"; \
  Parameters: "/F /T /IM monitoria-desktop.exe"; \
  Flags: runhidden waituntilterminated; \
  RunOnceId: "StopMonitorIADesktop"

[UninstallDelete]
; Upgrade preserva estes dados. A remoção só acontece na desinstalação
; explícita desta edição/usuário.
Type: filesandordirs; Name: "{localappdata}\MonitorIA"
Type: filesandordirs; Name: "{app}"
