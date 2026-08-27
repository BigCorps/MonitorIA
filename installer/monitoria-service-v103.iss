; MonitorIA 1.0.3 — edição Windows 24/7 / Service Host.
;
; Este arquivo é DELIBERADAMENTE separado do futuro instalador Microsoft Store.
; Ele reaproveita o instalador 1.0.2 homologado para preservar:
; - AppId;
; - upgrade;
; - pareamento;
; - WinSW;
; - DPAPI;
; - estado em ProgramData.
;
; E acrescenta somente o companion de bandeja da edição 24/7.
;
; Build de validação:
;   ISCC.exe /DAppVersion=1.0.3 installer\monitoria-service-v103.iss

#ifndef AppVersion
  #define AppVersion "1.0.3"
#endif

#include "monitoria.iss"

[Files]
Source: "..\build\monitoria-tray.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Método de abertura visível no Menu Iniciar.
; Se o tray já estiver em execução, uma segunda abertura apenas leva ao painel.
Name: "{autoprograms}\MonitorIA"; \
  Filename: "{app}\monitoria-tray.exe"; \
  Parameters: "--service-companion"; \
  WorkingDir: "{app}"; \
  IconFilename: "{app}\monitoria-tray.exe"; \
  Comment: "Abrir o MonitorIA"

[Registry]
; O serviço continua iniciando antes do login.
; O companion visual inicia somente quando existe uma sessão de usuário.
Root: HKLM; \
  Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; \
  ValueName: "MonitorIATray"; \
  ValueData: """{app}\monitoria-tray.exe"" --service-companion"; \
  Flags: uninsdeletevalue

[Run]
; Executa o tray na sessão do usuário original, nunca como LocalSystem/admin.
Filename: "{app}\monitoria-tray.exe"; \
  Parameters: "--service-companion"; \
  WorkingDir: "{app}"; \
  Flags: nowait runasoriginaluser; \
  Check: not WizardSilent

[UninstallRun]
; Fechar o companion não interfere no serviço. Aqui ele é encerrado somente
; porque o produto inteiro está sendo desinstalado.
Filename: "{sys}\taskkill.exe"; \
  Parameters: "/F /T /IM monitoria-tray.exe"; \
  Flags: runhidden waituntilterminated; \
  RunOnceId: "KillTrayV103"
