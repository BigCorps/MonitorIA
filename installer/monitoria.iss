; Instalador do MonitorIA Agent para Windows.
;
; Compilar com Inno Setup 6.3 ou superior:
;   ISCC.exe /DAppVersion=0.9.0 installer\monitoria.iss
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
#define AppPublisher "BIGCORPS"
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
OutputBaseFilename=MonitorIA-Setup
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
Source: "..\build\monitoria-service.exe";   DestDir: "{app}"; Flags: ignoreversion
Source: "monitoria-service.xml";            DestDir: "{app}"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffmpeg.exe";       DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\ffprobe.exe";      DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\*.dll";            DestDir: "{app}\ffmpeg"; Flags: ignoreversion

; Obrigações de licença do FFmpeg. O binário é redistribuído sem modificação
; e a origem exata fica registrada em FFMPEG-ORIGEM.txt.
Source: "..\build\ffmpeg\LICENSE.txt";      DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "..\build\ffmpeg\FFMPEG-ORIGEM.txt"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion

[Run]
; A ordem importa: instalar o serviço antes de iniciá-lo, e só então a tela
; de pareamento aparece, com o serviço já no ar para receber o comando.
Filename: "{app}\monitoria-service.exe"; Parameters: "install"; \
  StatusMsg: "Registrando o serviço do Windows..."; Flags: runhidden waituntilterminated


[UninstallRun]
Filename: "{app}\monitoria-service.exe"; Parameters: "stop"; \
  Flags: runhidden waituntilterminated; RunOnceId: "StopService"

Filename: "{app}\monitoria-service.exe"; Parameters: "uninstall"; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"

[UninstallDelete]
; Os logs e a fila são apagados. A configuração pareada em agent.json e a
; entropia em machine.key permanecem de propósito: reinstalar não deve
; obrigar a loja a gerar novo código de pareamento.
Type: filesandordirs; Name: "{commonappdata}\MonitorIA\logs"
Type: filesandordirs; Name: "{commonappdata}\MonitorIA\queue"
Type: filesandordirs; Name: "{commonappdata}\MonitorIA\frames"

[Code]
var
  PairingPage: TInputQueryWizardPage;

function ServicoInstalado(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\\sc.exe'), 'query MonitorIAAgent',
                 '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
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

  Exec(ExpandConstant('{sys}\\sc.exe'), 'stop MonitorIAAgent',
       '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  { O encerramento fecha as sessões de captura no servidor e leva alguns
    segundos. Espera ativa, com teto de 20 segundos. }
  for Tentativa := 1 to 20 do
  begin
    Sleep(1000);

    Exec(ExpandConstant('{cmd}'), '/C sc query MonitorIAAgent | find "RUNNING"',
         '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

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
    'digite-o abaixo. O código vale 15 minutos.' + #13#10#13#10 +
    'Você pode deixar em branco e parear depois — o MonitorIA já está ' +
    'instalado e continuará aguardando.'
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
    if Exec(ExpandConstant('{app}\monitoria-service.exe'), 'start',
            ExpandConstant('{app}'), SW_HIDE, ewWaitUntilTerminated, ResultCode) then
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

var
  UltimoCodigoPareamento: Integer;

function RunPairing(const Code: String): Boolean;
var
  ResultCode: Integer;
begin
  { O instalador não pareia por conta própria: ele delega ao serviço pelo
    canal local. Assim existe um caminho de código só, o mesmo que o
    operador usa depois, e o serviço segue sendo o único dono dos segredos. }
  if not Exec(
    ExpandConstant('{app}\monitoria-agent.exe'),
    'pair --code ' + Code,
    ExpandConstant('{app}'),
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then
  begin
    UltimoCodigoPareamento := SAIDA_SERVICO_PARADO;
    Result := False;
    Exit;
  end;

  UltimoCodigoPareamento := ResultCode;
  Result := ResultCode = SAIDA_OK;
end;

function MensagemDeFalha(): String;
begin
  { Cada causa exige uma ação diferente do operador. Atribuir tudo a "código
    expirado" fazia gerar código novo indefinidamente sem resolver nada. }
  if UltimoCodigoPareamento = SAIDA_SEM_PERMISSAO then
    Result :=
      'O MonitorIA não conseguiu acessar a própria pasta de dados.' + #13#10#13#10 +
      'Cancele, clique no instalador com o botão direito e escolha ' +
      '"Executar como administrador".'
  else if UltimoCodigoPareamento = SAIDA_SERVICO_PARADO then
    Result :=
      'O serviço do MonitorIA ainda não estava em execução.' + #13#10#13#10 +
      'Isso costuma ser o antivírus retendo o programa recém-instalado. ' +
      'Aguarde alguns minutos e pareie depois pelo painel.'
  else if UltimoCodigoPareamento = SAIDA_PAREAMENTO_RECUSADO then
    Result :=
      'O painel recusou este código de pareamento.' + #13#10#13#10 +
      'Ele vale 15 minutos e só pode ser usado uma vez. ' +
      'Gere um código novo e tente de novo.'
  else
    Result :=
      'Não foi possível concluir o pareamento.' + #13#10#13#10 +
      'Verifique se o computador está conectado à internet.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep <> ssPostInstall then
    Exit;

  if IniciarServico() then
    Exit;

  MsgBox(
    'O MonitorIA foi instalado, mas o serviço não iniciou.' + #13#10#13#10 +
    'Isso costuma ser o antivírus retendo o programa recém-instalado. ' +
    'Aguarde alguns minutos e inicie "MonitorIA Agent" pelos Serviços do ' +
    'Windows, ou reinicie o computador.',
    mbInformation,
    MB_OK
  );
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Code: String;
begin
  Result := True;

  if CurPageID <> PairingPage.ID then
    Exit;

  Code := Trim(PairingPage.Values[0]);

  if Code = '' then
  begin
    MsgBox(
      'O MonitorIA foi instalado e está aguardando pareamento.' + #13#10#13#10 +
      'Quando tiver o código, abra o Prompt de Comando como administrador e execute:' + #13#10 +
      ExpandConstant('"{app}\monitoria-agent.exe" pair --code SEUCODIGO'),
      mbInformation,
      MB_OK
    );
    Exit;
  end;

  if RunPairing(Code) then
  begin
    MsgBox(
      'Pareamento concluído.' + #13#10#13#10 +
      'O próximo passo é informar o endereço RTSP da câmera. ' +
      'Consulte o painel para as instruções.',
      mbInformation,
      MB_OK
    );
    Exit;
  end;

  { Falha de pareamento não aborta a instalação. O serviço já está no ar e
    o lojista pode tentar de novo sem reinstalar 100 MB. }
  Result := MsgBox(
    MensagemDeFalha() + #13#10#13#10 +
    'Deseja continuar mesmo assim? O MonitorIA fica instalado e você pode ' +
    'parear depois.',
    mbConfirmation,
    MB_YESNO
  ) = IDYES;
end;
