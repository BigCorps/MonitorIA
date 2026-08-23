; Instalador do MonitorIA Agent para Windows.
;
; Compilar com Inno Setup 6.3 ou superior:
;   ISCC.exe /DAppVersion=1.0.1 installer\monitoria.iss
;
; Para assinar, adicione ao comando:
;   /DSignCommand="<comando de assinatura>"
;
; Sem /DSignCommand o instalador é gerado sem assinatura, o que serve para
; testar antes de o certificado sair. Não distribua build sem assinatura.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

; TROCAR pela razão social exata que constar no certificado OV. O Windows
; compara o editor exibido com o da assinatura; divergência é tratada como
; inconsistência pelo SmartScreen.
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

; O serviço roda como LocalSystem e a pasta de dados recebe ACL restrita.
; As duas coisas exigem elevação.
PrivilegesRequired=admin

; Windows 10 1809 em diante. O plano de produção define Windows 10/11 como
; alvo, e 1809 é a primeira versão ainda dentro de suporte estendido.
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
Source: "..\build\monitoria-dpapi.exe";       DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\monitoria-service.exe";     DestDir: "{app}"; Flags: ignoreversion
Source: "monitoria-service.xml";              DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffmpeg.exe";         DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffprobe.exe";        DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\*.dll";              DestDir: "{app}\ffmpeg"; Flags: ignoreversion

; Obrigações de licença do FFmpeg. O binário é redistribuído sem modificação
; e a origem exata fica registrada em FFMPEG-ORIGEM.txt.
Source: "..\build\ffmpeg\LICENSE.txt";        DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\FFMPEG-ORIGEM.txt"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion

[Run]
; A ordem importa: instalar o serviço antes de iniciá-lo, e só então a tela
; de pareamento aparece, com o serviço já no ar para receber o comando.
Filename: "{app}\monitoria-service.exe"; Parameters: "install"; \
  StatusMsg: "Registrando o serviço do Windows..."; Flags: runhidden waituntilterminated


[UninstallRun]
; Primeiro pede encerramento limpo para o serviço e para o Agent.
Filename: "{app}\monitoria-service.exe"; Parameters: "stop"; \
  Flags: runhidden waituntilterminated; RunOnceId: "StopService"

; Em alguns computadores o wrapper retorna antes de o processo-filho liberar
; monitoria-agent.exe/FFmpeg. Mata somente a árvore iniciada pelo Agent para
; evitar que arquivos em uso sobrevivam à desinstalação.
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM monitoria-agent.exe"; \
  Flags: runhidden waituntilterminated; RunOnceId: "KillAgentTree"

Filename: "{app}\monitoria-service.exe"; Parameters: "uninstall"; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"

; Fallback idempotente: se o wrapper não removeu o registro do SCM,
; o Windows recebe uma segunda solicitação direta.
Filename: "{sys}\sc.exe"; Parameters: "delete MonitorIAAgent"; \
  Flags: runhidden waituntilterminated; RunOnceId: "DeleteServiceFallback"

[UninstallDelete]
; Desinstalar significa remover também todo o estado local. Isso evita deixar
; token pareado, chave de máquina, fila, logs ou segmentos temporários de vídeo
; no computador. Uma futura reinstalação começa limpa e exige novo pareamento.
Type: filesandordirs; Name: "{commonappdata}\MonitorIA"

; O Inno Setup remove automaticamente os arquivos que instalou. Esta limpeza
; adicional cobre arquivos residuais que tenham sido criados/alterados em
; execução ou que tenham ficado bloqueados em uma tentativa anterior.
Type: filesandordirs; Name: "{app}"

[Code]
var
  PairingPage: TInputQueryWizardPage;
  ServicoPronto: Boolean;

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

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  Tentativa: Integer;
begin
  Result := '';

  { O serviço mantém o monitoria-agent.exe aberto, e o Windows não permite
    substituir arquivo em uso. Sem parar antes, toda reinstalação falhava com
    "DeleteFile falhou; código 5", e o instalador oferecia ignorar o arquivo —
    o que deixaria o executável antigo com os componentes novos ao redor.

    Usamos sc.exe e não o WinSW porque na primeira instalação o
    monitoria-service.exe ainda não existe. }
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

  { O encerramento fecha as sessões de captura no servidor e leva alguns
    segundos. Espera ativa, com teto de 20 segundos. }
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

  { Folga final para o antivírus liberar o arquivo recém-fechado. }
  Sleep(2000);
end;

procedure InitializeWizard();
begin
  { Criada depois de wpInstalling: a página só aparece com os arquivos já
    copiados e o serviço rodando. O código de pareamento vale 15 minutos,
    e começar essa contagem antes da cópia de 100 MB desperdiça o prazo. }
  PairingPage := CreateInputQueryPage(
    wpInstalling,
    'Conectar ao painel',
    'Informe o código de pareamento da câmera',
    'Abra a câmera no painel do MonitorIA, gere o código de pareamento e ' +
    'digite-o abaixo. O código vale 15 minutos.'
  );

  PairingPage.Add('Código de pareamento:', False);
end;

function IniciarServico(): Boolean;
var
  ResultCode: Integer;
  Tentativa: Integer;
begin
  Result := False;

  { Retentativa deliberada. Na primeira instalação em máquina com antivírus
    ativo, o serviço falhou ao iniciar com "Acesso negado": o binário
    recém-gravado ainda estava retido para varredura. Dez minutos depois
    subiu sem alteração nenhuma. Enquanto o executável não for assinado, isso
    vai se repetir em campo. }
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

{ Códigos devolvidos por monitoria-agent.exe. }
const
  SAIDA_OK = 0;
  SAIDA_SERVICO_PARADO = 4;
  SAIDA_SEM_PERMISSAO = 5;
  SAIDA_PAREAMENTO_RECUSADO = 6;
  SAIDA_CONFIGURACAO_INCOMPLETA = 7;
  SAIDA_CAMERA_NAO_CONFIGURADA = 8;
  SAIDA_ENTRADA_INVALIDA = 9;

var
  UltimoCodigoConfiguracao: Integer;

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

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;

  if PageID = PairingPage.ID then
  begin
    { Instalações /SILENT e /VERYSILENT são usadas para upgrade,
      CI e distribuição automatizada. Nunca devem exigir interação
      nem um novo código de pareamento.

      Em atualização, os dados existentes em ProgramData\MonitorIA
      permanecem intactos. Em uma instalação silenciosa nova, o
      Agent é instalado e fica aguardando pareamento posterior. }
    if WizardSilent then
      Result := True
    else
      Result := AgentPareado();
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

  { Só o código de pareamento. As câmeras são adicionadas pelo painel, onde
    a janela não trava e dá para mostrar progresso de verdade. }
  Json :=
    '{' +
    '"code":"' + JsonEscape(Trim(PairingPage.Values[0])) + '"' +
    '}';

  if not SaveStringToFile(SetupFile, Json, False) then
  begin
    UltimoCodigoConfiguracao := SAIDA_ENTRADA_INVALIDA;
    Exit;
  end;

  { O pareamento é uma chamada curta. A janela ainda para durante ela, mas
    por instantes, não pelo minuto que a busca de câmeras levava. }
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
  { Cada causa exige uma ação diferente do operador. Atribuir tudo a "código
    expirado" fazia gerar código novo indefinidamente sem resolver nada. }
  if UltimoCodigoConfiguracao = SAIDA_SEM_PERMISSAO then
    Result :=
      'O MonitorIA não conseguiu acessar a própria pasta de dados.' +
      #13#10#13#10 +
      'Feche o instalador e abra-o novamente, confirmando a solicitação de ' +
      'administrador do Windows.'
  else if UltimoCodigoConfiguracao = SAIDA_SERVICO_PARADO then
    Result :=
      'O serviço do MonitorIA ainda não estava em execução.' +
      #13#10#13#10 +
      'Reinicie o computador e execute novamente este instalador. A ' +
      'configuração já feita será preservada.'
  else if UltimoCodigoConfiguracao = SAIDA_PAREAMENTO_RECUSADO then
    Result :=
      'O painel recusou este código de pareamento.' +
      #13#10#13#10 +
      'Ele vale 15 minutos e só pode ser usado uma vez. ' +
      'Gere um código novo e tente de novo.'
  else if UltimoCodigoConfiguracao = SAIDA_ENTRADA_INVALIDA then
    Result :=
      'Informe o código gerado no painel do MonitorIA.'
  else
    Result :=
      'Não foi possível conectar este computador ao painel.' +
      #13#10#13#10 +
      'Verifique a internet e tente novamente.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep <> ssPostInstall then
    Exit;

  ServicoPronto := IniciarServico();

  if ServicoPronto then
    Exit;

  MsgBox(
    'O MonitorIA foi instalado, mas o serviço não iniciou.' +
    #13#10#13#10 +
    'Isso costuma ser o antivírus retendo o programa recém-instalado. ' +
    'Reinicie o computador e execute novamente este instalador. A instalação ' +
    'será reconhecida e continuará da etapa pendente.',
    mbInformation,
    MB_OK
  );
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Code: String;
begin
  Result := True;

  { Defesa adicional para instalação ou atualização silenciosa.
    ShouldSkipPage já impede a exibição da página, mas esta verificação
    garante que uma futura mudança no fluxo não volte a exigir código
    durante /SILENT ou /VERYSILENT. }
  if WizardSilent then
    Exit;

  if CurPageID <> PairingPage.ID then
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
      'Pronto! Este computador está conectado ao painel.' +
      #13#10#13#10 +
      'Agora abra o painel do MonitorIA e clique em "Procurar câmeras". ' +
      'Ele encontra as câmeras sozinho e mostra o andamento na tela.' +
      #13#10#13#10 +
      'O MonitorIA inicia junto com o Windows. Pode fechar o instalador.',
      mbInformation,
      MB_OK
    );
    Exit;
  end;

  MsgBox(
    MensagemDeFalha(),
    mbError,
    MB_OK
  );

  Result := False;
end;