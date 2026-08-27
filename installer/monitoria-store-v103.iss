; MonitorIA 1.0.3 — Microsoft Store / Desktop Host
;
; Instalador por usuário. Não registra serviço do Windows e não pede
; privilégio administrativo. O primeiro pareamento acontece no próprio
; monitoria-desktop.exe quando o usuário abre o MonitorIA.
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
Source: "..\build\monitoria-dpapi.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffmpeg.exe"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffprobe.exe"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\*.dll"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\LICENSE.txt"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\FFMPEG-ORIGEM.txt"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion

[Icons]
; Método de abertura acessível e visível no Menu Iniciar.
Name: "{autoprograms}\MonitorIA"; \
  Filename: "{app}\monitoria-desktop.exe"; \
  WorkingDir: "{app}"; \
  IconFilename: "{app}\monitoria-desktop.exe"; \
  Comment: "Abrir o MonitorIA"

[Registry]
; A edição Store começa somente depois do login do usuário.
Root: HKCU; \
  Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; \
  ValueName: "MonitorIA"; \
  ValueData: """{app}\monitoria-desktop.exe"" --autostart"; \
  Flags: uninsdeletevalue

[Run]
; Em instalação interativa fora da Store, abrir o aplicativo ao terminar.
; A instalação silenciosa usada pelo canal Store não inicia processos extras;
; o usuário abre pelo botão da Store/Menu Iniciar e recebe a tela de conexão.
Filename: "{app}\monitoria-desktop.exe"; \
  WorkingDir: "{app}"; \
  Flags: nowait skipifsilent

[UninstallRun]
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
