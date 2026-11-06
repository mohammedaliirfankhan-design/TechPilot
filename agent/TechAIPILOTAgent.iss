#define MyAppName "TechAIPILOT Agent"
#define MyAppVersion "1.2.0"
#define MyAppPublisher "TechAIPILOT"
#define MyAppExeName "TechAIPILOTAgent.exe"

[Setup]
AppId={{7E7B6C3D-3E3D-4B9D-9D4A-6E0A4F1D8C21}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}

DefaultDirName={autopf}\TechAIPILOT\Agent

DisableProgramGroupPage=yes
DisableDirPage=yes

PrivilegesRequired=admin

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

OutputDir=.\installer-output
OutputBaseFilename=TechAIPILOTAgentSetup

Compression=lzma2
SolidCompression=yes

WizardStyle=modern

UninstallDisplayIcon={app}\{#MyAppExeName}

ChangesEnvironment=yes
SetupLogging=yes
UninstallLogging=yes


[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"


[Files]
Source: ".\dist-fresh\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: ".\dist-fresh\TechAIPILOTEnrollment.exe"; DestDir: "{tmp}"; Flags: ignoreversion dontcopy


[Dirs]
Name: "{commonappdata}\TechAIPILOT\data"
Name: "{commonappdata}\TechAIPILOT\logs"
Name: "{commonappdata}\TechAIPILOT\config"


[Registry]
Root: HKCU; Subkey: "Environment"; ValueType: string; ValueName: "TECHAIPILOT_BACKEND_URL"; ValueData: "{code:BackendUrl}"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Environment"; ValueType: string; ValueName: "TECHAIPILOT_DATA_DIR"; ValueData: "{commonappdata}\TechAIPILOT\data"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Environment"; ValueType: string; ValueName: "TECHAIPILOT_LOG_DIR"; ValueData: "{commonappdata}\TechAIPILOT\logs"; Flags: uninsdeletevalue


[UninstallRun]
Filename: "schtasks.exe"; Parameters: "/End /TN ""TechAIPILOT Agent"""; Flags: runhidden; RunOnceId: "EndTechAIPILOTAgent"
Filename: "schtasks.exe"; Parameters: "/Delete /TN ""TechAIPILOT Agent"" /F"; Flags: runhidden; RunOnceId: "DeleteTechAIPILOTAgent"
Filename: "taskkill.exe"; Parameters: "/IM ""{#MyAppExeName}"" /F"; Flags: runhidden; RunOnceId: "KillTechAIPILOTAgent"


[UninstallDelete]
Type: files; Name: "{app}\TechAIPILOTAgentLauncher.ps1"


[Code]

var
  ConfigPage: TInputQueryWizardPage;
  EnrollmentToken: String;


function BackendUrl(Param: String): String;
begin
  Result := Trim(ConfigPage.Values[0]);
end;


function EnrollmentCode(Param: String): String;
begin
  Result := Trim(ConfigPage.Values[1]);
end;

function ReadEnrollmentToken(const ResultPath: String): String;
var
  Content: AnsiString;
  TextContent: String;
  Marker: String;
  StartPos: Integer;
  EndPos: Integer;
begin
  Result := '';

  if not LoadStringFromFile(ResultPath, Content) then
    Exit;

  TextContent := String(Content);

  Marker := '"agent_token": "';
  StartPos := Pos(Marker, TextContent);

  if StartPos = 0 then
    Exit;

  StartPos := StartPos + Length(Marker);
  EndPos := StartPos;

  while (EndPos <= Length(TextContent)) and
        (TextContent[EndPos] <> '"') do
  begin
    Inc(EndPos);
  end;

  if EndPos <= Length(TextContent) then
    Result := Copy(TextContent, StartPos, EndPos - StartPos);
end;

function RunEnrollment: Boolean;
var
  EnrollmentExePath: String;
  EnrollmentResultPath: String;
  Parameters: String;
  ResultCode: Integer;
begin
  Result := False;
  EnrollmentExePath :=
    ExpandConstant(
      '{tmp}\TechAIPILOTEnrollment.exe'
    );

  EnrollmentResultPath :=
    ExpandConstant(
      '{tmp}\TechAIPILOTEnrollmentResult.json'
    );

  ExtractTemporaryFile(
    'TechAIPILOTEnrollment.exe'
  );

  Parameters :=
    '--backend-url "' +
    BackendUrl('') +
    '" ' +
    '--enrollment-code "' +
    EnrollmentCode('') +
    '" ' +
    '--result-file "' +
    EnrollmentResultPath +
    '"';

  if FileExists(EnrollmentResultPath) then
    DeleteFile(EnrollmentResultPath);

  if not Exec(
    EnrollmentExePath,
    Parameters,
    '',
    SW_HIDE,
    ewWaitUntilTerminated,
    ResultCode
  ) then
  begin
    MsgBox(
      'TechAIPILOT device enrollment could not be started.',
      mbError,
      MB_OK
    );
    Exit;
  end;

  if ResultCode <> 0 then
  begin
    MsgBox(
      'Device enrollment failed. Please verify the enrollment code and try again.' +
      Chr(13) + Chr(10) + Chr(13) + Chr(10) +
      'If the server was idle, it can take up to a minute to wake up. Wait a moment and click Next again.',
      mbError,
      MB_OK
    );
    Exit;
  end;

  if not FileExists(EnrollmentResultPath) then
  begin
    MsgBox(
      'Device enrollment did not return a result.',
      mbError,
      MB_OK
    );
    Exit;
  end;

  EnrollmentToken := ReadEnrollmentToken(EnrollmentResultPath);

  if EnrollmentToken = '' then
  begin
    MsgBox(
      'Device enrollment completed, but no agent token was returned.',
      mbError,
      MB_OK
    );
    Exit;
  end;

  if Pos('tpa_', LowerCase(EnrollmentToken)) <> 1 then
  begin
    MsgBox(
      'Device enrollment returned an invalid agent token.',
      mbError,
      MB_OK
    );
    Exit;
  end;

  DeleteFile(EnrollmentResultPath);

  Result := True;
end;

function XmlEscape(const Value: String): String;
begin
  Result := Value;
  StringChangeEx(Result, '&', '&amp;', True);
  StringChangeEx(Result, '<', '&lt;', True);
  StringChangeEx(Result, '>', '&gt;', True);
  StringChangeEx(Result, '"', '&quot;', True);
  StringChangeEx(Result, '''', '&apos;', True);
end;


procedure InitializeWizard;
begin
  ConfigPage :=
    CreateInputQueryPage(
      wpSelectDir,
      'TechAIPILOT Agent Configuration',
      'Connect this agent to your TechAIPILOT server',
      'Enter the backend URL and the device enrollment code provided by your TechAIPILOT dashboard.'
    );

  ConfigPage.Add('Backend URL:', False);
  ConfigPage.Add('Enrollment code:', False);

  ConfigPage.Values[0] :=
    'https://techaipilot-api.onrender.com';
end;


function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  if CurPageID = ConfigPage.ID then
  begin

    if Trim(ConfigPage.Values[0]) = '' then
    begin
      MsgBox('Backend URL is required.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if (Pos('http://', LowerCase(Trim(ConfigPage.Values[0]))) <> 1) and
       (Pos('https://', LowerCase(Trim(ConfigPage.Values[0]))) <> 1) then
    begin
      MsgBox(
        'Backend URL must start with http:// or https://.',
        mbError,
        MB_OK
      );
      Result := False;
      Exit;
    end;

    if Trim(ConfigPage.Values[1]) = '' then
    begin
      MsgBox('Enrollment code is required.', mbError, MB_OK);
      Result := False;
      Exit;
    end;

    if not RunEnrollment then
    begin
      Result := False;
      Exit;
    end;

    if not RegWriteStringValue(
      HKEY_CURRENT_USER,
      'Environment',
      'TECHAIPILOT_AGENT_TOKEN',
      EnrollmentToken
    ) then
    begin
      MsgBox(
        'The device was enrolled, but the Agent configuration could not be saved.',
        mbError,
        MB_OK
      );
      Result := False;
      Exit;
    end;

  end;
end;


//
// Stop any running agent before files are replaced, so an
// update never fails with "file in use".
//
procedure StopRunningAgent;
var
  ResultCode: Integer;
begin
  Exec(
    ExpandConstant('{sys}\schtasks.exe'),
    '/End /TN "TechAIPILOT Agent"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode
  );

  Exec(
    ExpandConstant('{sys}\taskkill.exe'),
    '/IM "{#MyAppExeName}" /F',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode
  );

  Sleep(1500);
end;


procedure CurStepChanged(CurStep: TSetupStep);
var
  LauncherPath: String;
  TaskXmlPath: String;
  LauncherContent: String;
  TaskXmlContent: String;
  UserName: String;
  ResultCode: Integer;
begin

  if CurStep = ssInstall then
  begin
    StopRunningAgent;
  end;

  if CurStep = ssPostInstall then
  begin

    //
    // Launcher = watchdog.
    //
    // Loads the configuration from the user's environment and
    // keeps the agent running: if the agent exits for any
    // reason (crash, terminal window closed), it is started
    // again after 10 seconds. If an agent is already running,
    // it does nothing.
    //

    LauncherPath :=
      ExpandConstant('{app}\TechAIPILOTAgentLauncher.ps1');

    LauncherContent :=
      '$ErrorActionPreference = "Continue"' + '' + #13#10 +
      '$envKey = "HKCU:\Environment"' + '' + #13#10 +
      '' + #13#10 +
      'function Get-Setting([string]$name) {' + '' + #13#10 +
      '    (Get-ItemProperty -Path $envKey -Name $name -ErrorAction SilentlyContinue).$name' + '' + #13#10 +
      '}' + '' + #13#10 +
      '' + #13#10 +
      '$env:TECHAIPILOT_BACKEND_URL = Get-Setting "TECHAIPILOT_BACKEND_URL"' + '' + #13#10 +
      '$env:TECHAIPILOT_AGENT_TOKEN = Get-Setting "TECHAIPILOT_AGENT_TOKEN"' + '' + #13#10 +
      '$env:TECHAIPILOT_DATA_DIR = Get-Setting "TECHAIPILOT_DATA_DIR"' + '' + #13#10 +
      '$env:TECHAIPILOT_LOG_DIR = Get-Setting "TECHAIPILOT_LOG_DIR"' + '' + #13#10 +
      '' + #13#10 +
      '$exe = Join-Path $PSScriptRoot "TechAIPILOTAgent.exe"' + '' + #13#10 +
      '' + #13#10 +
      'while ($true) {' + '' + #13#10 +
      '    if (-not (Get-Process -Name "TechAIPILOTAgent" -ErrorAction SilentlyContinue)) {' + '' + #13#10 +
      '        try {' + '' + #13#10 +
      '            Start-Process -FilePath $exe -WorkingDirectory $PSScriptRoot -Wait' + '' + #13#10 +
      '        } catch { }' + '' + #13#10 +
      '    }' + '' + #13#10 +
      '    Start-Sleep -Seconds 10' + '' + #13#10 +
      '}' + #13#10;

    if not SaveStringToFile(LauncherPath, LauncherContent, False) then
    begin
      MsgBox(
        'Could not create the TechAIPILOT agent launcher.',
        mbError,
        MB_OK
      );
      Exit;
    end;

    UserName := XmlEscape(ExpandConstant('{username}'));

    //
    // Scheduled task.
    //
    // - Starts 20s after logon (network has time to come up).
    // - Repeats every 5 minutes; IgnoreNew means this only does
    //   something if the launcher itself has stopped.
    // - ExecutionTimeLimit PT0S = never stopped by Windows
    //   (the default would kill it after 72 hours).
    // - HighestAvailable: lets the remote technician control
    //   elevated windows (Task Manager, admin consoles). Change
    //   back to LeastPrivilege if that is not wanted.
    //

    TaskXmlPath := ExpandConstant('{tmp}\TechAIPILOTAgentTask.xml');

    TaskXmlContent :=
      '<?xml version="1.0" encoding="UTF-16"?>' + '' + #13#10 +
      '<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">' + '' + #13#10 +
      '  <RegistrationInfo>' + '' + #13#10 +
      '    <Author>TechAIPILOT</Author>' + '' + #13#10 +
      '    <Description>Starts the TechAIPILOT interactive agent when the user logs on and keeps it running.</Description>' + '' + #13#10 +
      '  </RegistrationInfo>' + '' + #13#10 +
      '  <Triggers>' + '' + #13#10 +
      '    <LogonTrigger>' + '' + #13#10 +
      '      <Enabled>true</Enabled>' + '' + #13#10 +
      '      <UserId>' + UserName + '</UserId>' + '' + #13#10 +
      '      <Delay>PT20S</Delay>' + '' + #13#10 +
      '      <Repetition>' + '' + #13#10 +
      '        <Interval>PT5M</Interval>' + '' + #13#10 +
      '        <StopAtDurationEnd>false</StopAtDurationEnd>' + '' + #13#10 +
      '      </Repetition>' + '' + #13#10 +
      '    </LogonTrigger>' + '' + #13#10 +
      '  </Triggers>' + '' + #13#10 +
      '  <Principals>' + '' + #13#10 +
      '    <Principal id="Author">' + '' + #13#10 +
      '      <UserId>' + UserName + '</UserId>' + '' + #13#10 +
      '      <LogonType>InteractiveToken</LogonType>' + '' + #13#10 +
      '      <RunLevel>HighestAvailable</RunLevel>' + '' + #13#10 +
      '    </Principal>' + '' + #13#10 +
      '  </Principals>' + '' + #13#10 +
      '  <Settings>' + '' + #13#10 +
      '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>' + '' + #13#10 +
      '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>' + '' + #13#10 +
      '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>' + '' + #13#10 +
      '    <AllowHardTerminate>true</AllowHardTerminate>' + '' + #13#10 +
      '    <StartWhenAvailable>true</StartWhenAvailable>' + '' + #13#10 +
      '    <AllowStartOnDemand>true</AllowStartOnDemand>' + '' + #13#10 +
      '    <Enabled>true</Enabled>' + '' + #13#10 +
      '    <Hidden>true</Hidden>' + '' + #13#10 +
      '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>' + '' + #13#10 +
      '    <RestartOnFailure>' + '' + #13#10 +
      '      <Interval>PT1M</Interval>' + '' + #13#10 +
      '      <Count>999</Count>' + '' + #13#10 +
      '    </RestartOnFailure>' + '' + #13#10 +
      '  </Settings>' + '' + #13#10 +
      '  <Actions Context="Author">' + '' + #13#10 +
      '    <Exec>' + '' + #13#10 +
      '      <Command>powershell.exe</Command>' + '' + #13#10 +
      '      <Arguments>-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' +
      XmlEscape(ExpandConstant('{app}\TechAIPILOTAgentLauncher.ps1')) +
      '"</Arguments>' + '' + #13#10 +
      '      <WorkingDirectory>' + XmlEscape(ExpandConstant('{app}')) + '</WorkingDirectory>' + '' + #13#10 +
      '    </Exec>' + '' + #13#10 +
      '  </Actions>' + '' + #13#10 +
      '</Task>';

    if not SaveStringToFile(TaskXmlPath, TaskXmlContent, False) then
    begin
      MsgBox(
        'Could not create the TechAIPILOT scheduled-task definition.',
        mbError,
        MB_OK
      );
      Exit;
    end;

    Exec(
      ExpandConstant('{sys}\schtasks.exe'),
      '/Create /TN "TechAIPILOT Agent" /XML "' + TaskXmlPath + '" /F',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode
    );

    if ResultCode <> 0 then
    begin
      MsgBox(
        'The TechAIPILOT Agent was installed, but Windows Task Scheduler could not create the automatic startup task.' +
        Chr(13) + Chr(10) + Chr(13) + Chr(10) +
        'You can retry the installation after checking Task Scheduler permissions.',
        mbError,
        MB_OK
      );
      Exit;
    end;

    Exec(
      ExpandConstant('{sys}\schtasks.exe'),
      '/Run /TN "TechAIPILOT Agent"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode
    );

  end;

end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    RegDeleteValue(
      HKEY_CURRENT_USER,
      'Environment',
      'TECHAIPILOT_AGENT_TOKEN'
    );
  end;
end;
