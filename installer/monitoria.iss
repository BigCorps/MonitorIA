; Instalador do MonitorIA Agent para Windows.
;
; Compilar com Inno Setup 6.3 ou superior:
;   ISCC.exe /DAppVersion=1.0.2 installer\monitoria.iss
;
; Para assinar, adicione ao comando:
;   /DSignCommand="<comando de assinatura>"
;
; Sem /DSignCommand o instalador é gerado sem assinatura, o que serve para
; testar antes de o certificado sair. Não distribua build sem assinatura.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

#define AppPublisher "BIGCORPS TECNOLOGIA LTA"
#define AppName "MonitorIA"
#define ServiceName "MonitorIAAgent"

[Setup]
AppId={{7E4B1A93-5C6D-4F82-9A1E-3D8C7B2F4E60}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription=Instalador do MonitorIA Agent
DefaultDirName={autopf}\{#AppName}
DisableDirPage=yes
DisableProgramGroupPage=yes
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\monitoria-agent.exe
PrivilegesRequired=admin
MinVersion=10.0.17763
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist

#ifdef StoreBuild
OutputBaseFilename=MonitorIA-Store-Setup
#else
OutputBaseFilename=MonitorIA-Setup
#endif

Compression=lzma2/ultra64
SolidCompression=yes
LZMANumBlockThreads=4

#ifdef SignCommand
SignTool=monitoria
SignedUninstaller=yes
#endif

WizardStyle=modern
SetupIconFile=monitoria.ico

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
Source: "..\agent\dist\monitoria-agent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\monitoria-dpapi.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\monitoria-service.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "monitoria-service.xml"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffmpeg.exe"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffprobe.exe"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\*.dll"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\LICENSE.txt"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\FFMPEG-ORIGEM.txt"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion

[Run]
; Na primeira instalação registra o WinSW. Em upgrade, o serviço já existe:
; PrepareToInstall o interrompe, os arquivos são substituídos e CurStepChanged
; o inicia novamente. Isso evita ERROR_SERVICE_EXISTS (1073).
Filename: "{app}\monitoria-service.exe"; Parameters: "install"; \
  StatusMsg: "Registrando o serviço do Windows..."; \
  Flags: runhidden waituntilterminated; \
  Check: PrecisaInstalarServico

[UninstallRun]
Filename: "{app}\monitoria-service.exe"; Parameters: "stop"; \
  Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM monitoria-agent.exe"; \
  Flags: runhidden waituntilterminated; RunOnceId: "KillAgentTree"
Filename: "{app}\monitoria-service.exe"; Parameters: "uninstall"; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"
Filename: "{sys}\sc.exe"; Parameters: "delete MonitorIAAgent"; \
  Flags: runhidden waituntilterminated; RunOnceId: "DeleteServiceFallback"

[UninstallDelete]
; Desinstalação explícita remove também o estado local.
; Reinstalação/upgrade NÃO passa por esta seção e preserva os dados.
Type: filesandordirs; Name: "{commonappdata}\MonitorIA"
Type: filesandordirs; Name: "{app}"

[Code]
var
  PairingPage: TInputQueryWizardPage;
  ServicoPronto: Boolean;
  ConfiguracaoLocalExistente: Boolean;
  UltimoCodigoConfiguracao: Integer;

const
  SAIDA_OK = 0;
  SAIDA_SERVICO_PARADO = 4;
  SAIDA_SEM_PERMISSAO = 5;
  SAIDA_PAREAMENTO_RECUSADO = 6;
  SAIDA_CONFIGURACAO_INCOMPLETA = 7;
  SAIDA_CAMERA_NAO_CONFIGURADA = 8;
  SAIDA_ENTRADA_INVALIDA = 9;

function ServicoInstalado(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(
    ExpandConstant('{sys}\sc.exe'),
    'query MonitorIAAgent',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) and (ResultCode = 0);
end;

function PrecisaInstalarServico(): Boolean;
begin
  Result := not ServicoInstalado();
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  Tentativa: Integer;
begin
  Result := '';

  if not ServicoInstalado() then
    Exit;

  Exec(
    ExpandConstant('{sys}\sc.exe'),
    'stop MonitorIAAgent',
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  );

  for Tentativa := 1 to 20 do
  begin
    Sleep(1000);
    Exec(
      ExpandConstant('{cmd}'),
      '/C sc query MonitorIAAgent | find "RUNNING"',
      '',
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    );

    if ResultCode <> 0 then
      Break;
  end;

  Sleep(2000);
end;

procedure InitializeWizard();
begin
  { FileExists é usado apenas para reconhecer que vale esperar o serviço
    recuperar um pareamento antigo. A presença de agent.json NUNCA é usada
    como prova de pareamento: token ilegível/revogado precisa pedir reparo. }
  ConfiguracaoLocalExistente := FileExists(
    ExpandConstant('{commonappdata}\MonitorIA\agent.json')
  );

  PairingPage := CreateInputQueryPage(
    wpInstalling,
    'Conectar este computador',
    'Informe o código de conexão do MonitorIA',
    'No painel do MonitorIA, abra os próximos passos da instalação e gere ' +
    'o código para conectar este computador ao local. O código vale 15 minutos.'
  );

  PairingPage.Add('Código de conexão:', False);
end;

function IniciarServico(): Boolean;
var
  ResultCode: Integer;
  Tentativa: Integer;
begin
  Result := False;

  for Tentativa := 1 to 6 do
  begin
    if Exec(
      ExpandConstant('{app}\monitoria-service.exe'),
      'start',
      ExpandConstant('{app}'),
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    ) then
    begin
      if ResultCode = 0 then
      begin
        Result := True;
        Exit;
      end;
    end;

    Sleep(5000);
  end;
end;

function AgentCheck(const Command: String): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(
    ExpandConstant('{app}\monitoria-agent.exe'),
    Command,
    ExpandConstant('{app}'),
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) and (ResultCode = SAIDA_OK);
end;

function AgentPareado(): Boolean;
begin
  Result := ServicoPronto and AgentCheck('paired-check');
end;

function AguardarPareamentoExistente(): Boolean;
var
  Tentativa: Integer;
begin
  Result := AgentPareado();
  if Result or (not ConfiguracaoLocalExistente) then
    Exit;

  { Em upgrade, antivírus pode reter o helper DPAPI assinado enquanto valida.
    Damos até 60 s para o próprio Agent concluir as retentativas. Se ainda não
    estiver utilizável, mostramos a tela de reparo em vez de pular o código. }
  for Tentativa := 1 to 30 do
  begin
    Sleep(2000);
    Result := AgentPareado();
    if Result then
      Exit;
  end;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;

  if PageID = PairingPage.ID then
  begin
    if WizardSilent then
      Result := True
    else
      Result := AguardarPareamentoExistente();
  end;
end;

function JsonEscape(Value: String): String;
begin
  Result := Value;
  StringChangeEx(Result, '\', '\\', True);
  StringChangeEx(Result, '"', '\"', True);
  StringChangeEx(Result, #13, '\r', True);
  StringChangeEx(Result, #10, '\n', True);
  StringChangeEx(Result, #9, '\t', True);
end;

function RunSetup(): Boolean;
var
  ResultCode: Integer;
  SetupFile: String;
  Json: String;
begin
  Result := False;
  SetupFile := ExpandConstant('{tmp}\monitoria-initial-setup.json');
  Json := '{' + '"code":"' + JsonEscape(Trim(PairingPage.Values[0])) + '"' + '}';

  if not SaveStringToFile(SetupFile, Json, False) then
  begin
    UltimoCodigoConfiguracao := SAIDA_ENTRADA_INVALIDA;
    Exit;
  end;

  WizardForm.NextButton.Enabled := False;
  WizardForm.BackButton.Enabled := False;
  WizardForm.StatusLabel.Caption := 'Conectando ao painel...';
  WizardForm.Refresh;

  try
    if not Exec(
      ExpandConstant('{app}\monitoria-agent.exe'),
      'setup --file "' + SetupFile + '"',
      ExpandConstant('{app}'),
      SW_HIDE,
      ewWaitUntilTerminated,
      ResultCode
    ) then
      ResultCode := SAIDA_SERVICO_PARADO;
  finally
    DeleteFile(SetupFile);
    WizardForm.NextButton.Enabled := True;
    WizardForm.BackButton.Enabled := True;
    WizardForm.StatusLabel.Caption := '';
  end;

  UltimoCodigoConfiguracao := ResultCode;
  Result := ResultCode = SAIDA_OK;
end;

function MensagemDeFalha(): String;
begin
  if UltimoCodigoConfiguracao = SAIDA_SEM_PERMISSAO then
    Result :=
      'O MonitorIA não conseguiu acessar a própria pasta de dados.' + #13#10#13#10 +
      'Feche o instalador e abra-o novamente, confirmando a solicitação de ' +
      'administrador do Windows.'
  else if UltimoCodigoConfiguracao = SAIDA_SERVICO_PARADO then
    Result :=
      'O serviço do MonitorIA ainda não estava em execução.' + #13#10#13#10 +
      'Aguarde a análise do antivírus terminar e tente novamente. A ' +
      'configuração já feita será preservada.'
  else if UltimoCodigoConfiguracao = SAIDA_PAREAMENTO_RECUSADO then
    Result :=
      'O painel recusou este código de conexão.' + #13#10#13#10 +
      'Ele vale 15 minutos e só pode ser usado uma vez. ' +
      'Gere um código novo e tente de novo.'
  else if UltimoCodigoConfiguracao = SAIDA_ENTRADA_INVALIDA then
    Result := 'Informe o código gerado no painel do MonitorIA.'
  else
    Result :=
      'Não foi possível conectar este computador ao painel.' + #13#10#13#10 +
      'Verifique a internet e tente novamente.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep <> ssPostInstall then
    Exit;

  ServicoPronto := IniciarServico();

  if ServicoPronto then
    Exit;

  if WizardSilent then
    Exit;

  MsgBox(
    'O MonitorIA foi instalado, mas o serviço não iniciou.' + #13#10#13#10 +
    'Isso pode acontecer enquanto o antivírus valida o programa recém-instalado. ' +
    'Aguarde a análise terminar e execute novamente este instalador. A instalação ' +
    'será reconhecida e a configuração será preservada.',
    mbInformation,
    MB_OK
  );
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Code: String;
begin
  Result := True;

  if WizardSilent then
    Exit;

  if CurPageID <> PairingPage.ID then
    Exit;

  { O token pode ter ficado disponível enquanto o usuário lia a tela. Nesse
    caso a atualização saudável segue sem exigir código. }
  if AgentPareado() then
    Exit;

  Code := Trim(PairingPage.Values[0]);

  if Code = '' then
  begin
    MsgBox(
      'Informe o código gerado no painel do MonitorIA.',
      mbError,
      MB_OK
    );
    Result := False;
    Exit;
  end;

  if RunSetup() then
  begin
    MsgBox(
      'Pronto! Este computador está conectado ao painel.' + #13#10#13#10 +
      'Agora abra o painel do MonitorIA e clique em "Procurar câmeras". ' +
      'Ele encontra as câmeras sozinho e mostra o andamento na tela.' + #13#10#13#10 +
      'O MonitorIA inicia junto com o Windows. Pode fechar o instalador.',
      mbInformation,
      MB_OK
    );
    Exit;
  end;

  MsgBox(MensagemDeFalha(), mbError, MB_OK);
  Result := False;
end;
