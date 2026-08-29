#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <shellapi.h>
#include <strsafe.h>
#include <wchar.h>

#pragma comment(lib, "Advapi32.lib")
#pragma comment(lib, "Shell32.lib")
#pragma comment(lib, "User32.lib")

#define IDI_MONITORIA 101

#define RUN_SUBKEY L"Software\\Microsoft\\Windows\\CurrentVersion\\Run"
#define SETTINGS_SUBKEY L"Software\\BIGCORPS\\MonitorIA\\Store"
#define RUN_VALUE L"MonitorIA"
#define CHOICE_VALUE L"AutoStartChoice"

static BOOL HasArgument(const wchar_t *expected) {
  int argc = 0;
  LPWSTR *argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  int index;

  if (!argv) {
    return FALSE;
  }

  for (index = 1; index < argc; index += 1) {
    if (_wcsicmp(argv[index], expected) == 0) {
      LocalFree(argv);
      return TRUE;
    }
  }

  LocalFree(argv);
  return FALSE;
}

static BOOL ModuleDirectory(wchar_t *buffer, size_t count) {
  DWORD length = GetModuleFileNameW(NULL, buffer, (DWORD)count);
  wchar_t *slash;

  if (length == 0 || length >= count) {
    return FALSE;
  }

  slash = wcsrchr(buffer, L'\\');
  if (!slash) {
    return FALSE;
  }

  *slash = L'\0';
  return TRUE;
}

static BOOL SiblingPath(
  const wchar_t *file_name,
  wchar_t *buffer,
  size_t count
) {
  wchar_t directory[MAX_PATH];

  if (!ModuleDirectory(directory, ARRAYSIZE(directory))) {
    return FALSE;
  }

  return SUCCEEDED(
    StringCchPrintfW(
      buffer,
      count,
      L"%s\\%s",
      directory,
      file_name
    )
  );
}

static BOOL BuildAutostartCommand(wchar_t *buffer, size_t count) {
  wchar_t desktop_path[MAX_PATH];

  if (
    !SiblingPath(
      L"monitoria-desktop.exe",
      desktop_path,
      ARRAYSIZE(desktop_path)
    )
  ) {
    return FALSE;
  }

  return SUCCEEDED(
    StringCchPrintfW(
      buffer,
      count,
      L"\"%s\" --autostart",
      desktop_path
    )
  );
}

static BOOL ReadStartupChoice(DWORD *choice) {
  HKEY key = NULL;
  DWORD type = 0;
  DWORD value = 0;
  DWORD size = sizeof(value);
  LONG result;

  if (choice) {
    *choice = 0;
  }

  result = RegOpenKeyExW(
    HKEY_CURRENT_USER,
    SETTINGS_SUBKEY,
    0,
    KEY_QUERY_VALUE,
    &key
  );
  if (result != ERROR_SUCCESS) {
    return FALSE;
  }

  result = RegQueryValueExW(
    key,
    CHOICE_VALUE,
    NULL,
    &type,
    (LPBYTE)&value,
    &size
  );
  RegCloseKey(key);

  if (
    result != ERROR_SUCCESS ||
    type != REG_DWORD ||
    size != sizeof(value) ||
    (value != 0 && value != 1)
  ) {
    return FALSE;
  }

  if (choice) {
    *choice = value;
  }
  return TRUE;
}

static BOOL WriteStartupChoice(DWORD choice) {
  HKEY key = NULL;
  DWORD disposition = 0;
  LONG result = RegCreateKeyExW(
    HKEY_CURRENT_USER,
    SETTINGS_SUBKEY,
    0,
    NULL,
    REG_OPTION_NON_VOLATILE,
    KEY_SET_VALUE,
    NULL,
    &key,
    &disposition
  );

  UNREFERENCED_PARAMETER(disposition);

  if (result != ERROR_SUCCESS) {
    return FALSE;
  }

  result = RegSetValueExW(
    key,
    CHOICE_VALUE,
    0,
    REG_DWORD,
    (const BYTE *)&choice,
    sizeof(choice)
  );
  RegCloseKey(key);
  return result == ERROR_SUCCESS;
}

static BOOL IsAutostartEnabled(void) {
  HKEY key = NULL;
  wchar_t current[512];
  DWORD type = 0;
  DWORD size = sizeof(current);
  LONG result;

  ZeroMemory(current, sizeof(current));

  result = RegOpenKeyExW(
    HKEY_CURRENT_USER,
    RUN_SUBKEY,
    0,
    KEY_QUERY_VALUE,
    &key
  );
  if (result != ERROR_SUCCESS) {
    return FALSE;
  }

  result = RegQueryValueExW(
    key,
    RUN_VALUE,
    NULL,
    &type,
    (LPBYTE)current,
    &size
  );
  RegCloseKey(key);

  if (
    result != ERROR_SUCCESS ||
    (type != REG_SZ && type != REG_EXPAND_SZ)
  ) {
    return FALSE;
  }

  return wcsstr(current, L"monitoria-desktop.exe") != NULL;
}

static BOOL SetAutostartEnabled(BOOL enabled) {
  HKEY key = NULL;
  LONG result;

  if (!enabled) {
    result = RegOpenKeyExW(
      HKEY_CURRENT_USER,
      RUN_SUBKEY,
      0,
      KEY_SET_VALUE,
      &key
    );
    if (result == ERROR_FILE_NOT_FOUND) {
      return TRUE;
    }
    if (result != ERROR_SUCCESS) {
      return FALSE;
    }

    result = RegDeleteValueW(key, RUN_VALUE);
    RegCloseKey(key);
    return result == ERROR_SUCCESS || result == ERROR_FILE_NOT_FOUND;
  }

  {
    wchar_t command[512];
    DWORD disposition = 0;

    if (!BuildAutostartCommand(command, ARRAYSIZE(command))) {
      return FALSE;
    }

    result = RegCreateKeyExW(
      HKEY_CURRENT_USER,
      RUN_SUBKEY,
      0,
      NULL,
      REG_OPTION_NON_VOLATILE,
      KEY_SET_VALUE,
      NULL,
      &key,
      &disposition
    );

    UNREFERENCED_PARAMETER(disposition);

    if (result != ERROR_SUCCESS) {
      return FALSE;
    }

    result = RegSetValueExW(
      key,
      RUN_VALUE,
      0,
      REG_SZ,
      (const BYTE *)command,
      (DWORD)((wcslen(command) + 1) * sizeof(wchar_t))
    );
    RegCloseKey(key);
    return result == ERROR_SUCCESS;
  }
}

static void RemoveStartupSettings(void) {
  HKEY key = NULL;

  SetAutostartEnabled(FALSE);

  if (
    RegOpenKeyExW(
      HKEY_CURRENT_USER,
      SETTINGS_SUBKEY,
      0,
      KEY_SET_VALUE,
      &key
    ) == ERROR_SUCCESS
  ) {
    RegDeleteValueW(key, CHOICE_VALUE);
    RegCloseKey(key);
  }

  RegDeleteKeyW(HKEY_CURRENT_USER, SETTINGS_SUBKEY);
}

static BOOL ApplyStartupChoice(BOOL enabled, BOOL show_confirmation) {
  DWORD choice = enabled ? 1 : 0;

  if (!SetAutostartEnabled(enabled) || !WriteStartupChoice(choice)) {
    MessageBoxW(
      NULL,
      L"O MonitorIA não conseguiu atualizar a preferência de inicialização deste usuário. Você pode continuar usando o aplicativo normalmente e tentar novamente pelo Menu Iniciar.",
      L"MonitorIA — inicialização automática",
      MB_OK | MB_ICONWARNING
    );
    return FALSE;
  }

  if (show_confirmation) {
    MessageBoxW(
      NULL,
      enabled
        ? L"Inicialização automática ativada. O MonitorIA será iniciado quando você entrar no Windows."
        : L"Inicialização automática desativada. O MonitorIA só será iniciado quando você abrir o aplicativo.",
      L"MonitorIA",
      MB_OK | MB_ICONINFORMATION
    );
  }

  return TRUE;
}

static BOOL AskStartupConsent(BOOL settings_mode) {
  BOOL currently_enabled = IsAutostartEnabled();
  int answer;

  answer = MessageBoxW(
    NULL,
    settings_mode
      ? L"Deseja que o MonitorIA inicie automaticamente sempre que você entrar no Windows?\n\nEscolha Sim para ativar ou manter ativado. Escolha Não para desativar. Esta preferência vale somente para o seu usuário do Windows."
      : L"Deseja iniciar o MonitorIA automaticamente sempre que você entrar no Windows?\n\nIsso mantém o monitoramento ativo durante sua sessão, inclusive quando a tela estiver bloqueada.\n\nA opção começa desligada e só será ativada se você escolher Sim. Você pode mudar esta preferência depois pelo Menu Iniciar.",
    L"MonitorIA — iniciar com o Windows",
    MB_YESNO | MB_ICONQUESTION | MB_DEFBUTTON2
  );

  if (answer == IDYES) {
    return ApplyStartupChoice(TRUE, settings_mode);
  }

  if (answer == IDNO) {
    return ApplyStartupChoice(FALSE, settings_mode);
  }

  return currently_enabled;
}

static BOOL LaunchDesktopHost(void) {
  wchar_t desktop_path[MAX_PATH];
  wchar_t directory[MAX_PATH];
  wchar_t command_line[MAX_PATH * 2];
  STARTUPINFOW startup;
  PROCESS_INFORMATION process;

  if (
    !SiblingPath(
      L"monitoria-desktop.exe",
      desktop_path,
      ARRAYSIZE(desktop_path)
    ) ||
    !ModuleDirectory(directory, ARRAYSIZE(directory))
  ) {
    return FALSE;
  }

  if (
    FAILED(
      StringCchPrintfW(
        command_line,
        ARRAYSIZE(command_line),
        L"\"%s\"",
        desktop_path
      )
    )
  ) {
    return FALSE;
  }

  ZeroMemory(&startup, sizeof(startup));
  startup.cb = sizeof(startup);
  ZeroMemory(&process, sizeof(process));

  if (
    !CreateProcessW(
      desktop_path,
      command_line,
      NULL,
      NULL,
      FALSE,
      0,
      NULL,
      directory,
      &startup,
      &process
    )
  ) {
    return FALSE;
  }

  CloseHandle(process.hThread);
  CloseHandle(process.hProcess);
  return TRUE;
}

static int SelfTest(void) {
  wchar_t desktop_path[MAX_PATH];
  wchar_t command[512];

  if (
    !SiblingPath(
      L"monitoria-desktop.exe",
      desktop_path,
      ARRAYSIZE(desktop_path)
    )
  ) {
    return 10;
  }

  if (!BuildAutostartCommand(command, ARRAYSIZE(command))) {
    return 11;
  }

  if (
    wcsstr(command, L"monitoria-desktop.exe") == NULL ||
    wcsstr(command, L"--autostart") == NULL
  ) {
    return 12;
  }

  return 0;
}

int WINAPI wWinMain(
  HINSTANCE instance,
  HINSTANCE previous_instance,
  PWSTR command_line,
  int show_command
) {
  UNREFERENCED_PARAMETER(instance);
  UNREFERENCED_PARAMETER(previous_instance);
  UNREFERENCED_PARAMETER(command_line);
  UNREFERENCED_PARAMETER(show_command);

  if (HasArgument(L"--self-test")) {
    return SelfTest();
  }

  if (HasArgument(L"--remove-startup")) {
    RemoveStartupSettings();
    return 0;
  }

  if (HasArgument(L"--startup-settings")) {
    AskStartupConsent(TRUE);
    return 0;
  }

  /*
   * Primeira abertura (incluindo upgrade de um RC antigo): só há consentimento
   * depois de uma ação explícita do usuário no aplicativo. A instalação
   * silenciosa jamais cria CurrentVersion\\Run.
   */
  {
    DWORD saved_choice = 0;

    if (!ReadStartupChoice(&saved_choice)) {
      AskStartupConsent(FALSE);
    } else {
      /*
       * Um upgrade pode remover a entrada legada no instalador. Se este
       * usuário já fez uma escolha explícita, reaplicamos essa mesma escolha
       * sem perguntar novamente. Nunca inferimos consentimento da instalação.
       */
      SetAutostartEnabled(saved_choice == 1);
    }
  }

  if (!LaunchDesktopHost()) {
    MessageBoxW(
      NULL,
      L"O MonitorIA foi instalado, mas não conseguiu iniciar o aplicativo. Tente abrir novamente pelo Menu Iniciar.",
      L"MonitorIA",
      MB_OK | MB_ICONERROR
    );
    return 20;
  }

  return 0;
}
