#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <strsafe.h>
#include <stdio.h>
#include <wchar.h>

#pragma comment(lib, "Shell32.lib")
#pragma comment(lib, "User32.lib")

#define IDI_MONITORIA 101
#define WM_TRAYICON (WM_APP + 1)
#define WM_OPEN_PRIMARY (WM_APP + 2)

#define ID_CMD_STATUS 2101
#define ID_CMD_CONNECT 2102
#define ID_CMD_DASHBOARD 2103
#define ID_CMD_RESTART 2104
#define ID_CMD_EXIT 2105

#define ID_PAIR_EDIT 2201
#define ID_PAIR_CONNECT 2202
#define ID_PAIR_DASHBOARD 2203
#define ID_PAIR_STATUS 2204

#define TIMER_HEALTH 1
#define TIMER_RESTART 2
#define TIMER_PAIRING 3

#define EXIT_OK 0
#define EXIT_CORE_NOT_RUNNING 4
#define EXIT_NO_PERMISSION 5
#define EXIT_PAIRING_REJECTED 6
#define EXIT_NOT_PAIRED 7
#define EXIT_INVALID_INPUT 9

static const wchar_t *WINDOW_CLASS_NAME =
  L"MonitorIADesktopHostV103";
static const wchar_t *PAIR_WINDOW_CLASS_NAME =
  L"MonitorIAPairingWindowV103";
static const wchar_t *MUTEX_NAME =
  L"Local\\MonitorIADesktopHostV103";
static const wchar_t *DASHBOARD_URL =
  L"https://monitoria.cam/dashboard";

static HWND g_window = NULL;
static HWND g_pair_window = NULL;
static HWND g_pair_edit = NULL;
static HWND g_pair_status = NULL;
static HWND g_pair_connect = NULL;
static NOTIFYICONDATAW g_notify;
static HICON g_icon = NULL;
static UINT g_taskbar_created = 0;

static PROCESS_INFORMATION g_agent;
static HANDLE g_job = NULL;
static BOOL g_agent_running = FALSE;
static BOOL g_shutting_down = FALSE;
static DWORD g_restart_attempts = 0;

/* -1 desconhecido, 0 precisa de código, 1 pareado e utilizável. */
static int g_pair_state = -1;
static BOOL g_pair_prompt_dismissed = FALSE;
static BOOL g_pair_timer_slow = FALSE;

static void UpdateTray(BOOL force);
static void ShowPairingWindow(void);

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

static BOOL ModuleDirectory(
  wchar_t *buffer,
  size_t count
) {
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

static BOOL ConfigureUserDataEnvironment(
  wchar_t *data_root,
  size_t data_root_count
) {
  wchar_t local_app_data[MAX_PATH];

  if (
    FAILED(
      SHGetFolderPathW(
        NULL,
        CSIDL_LOCAL_APPDATA | CSIDL_FLAG_CREATE,
        NULL,
        SHGFP_TYPE_CURRENT,
        local_app_data
      )
    )
  ) {
    return FALSE;
  }

  if (
    FAILED(
      StringCchPrintfW(
        data_root,
        data_root_count,
        L"%s\\MonitorIA",
        local_app_data
      )
    )
  ) {
    return FALSE;
  }

  if (!SetEnvironmentVariableW(L"MONITORIA_DESKTOP_MODE", L"1")) {
    return FALSE;
  }

  if (!SetEnvironmentVariableW(L"MONITORIA_CONFIG_DIR", data_root)) {
    return FALSE;
  }

  return TRUE;
}

static BOOL AgentProcessAlive(void) {
  DWORD exit_code;

  if (!g_agent_running || !g_agent.hProcess) {
    return FALSE;
  }

  if (!GetExitCodeProcess(g_agent.hProcess, &exit_code)) {
    return FALSE;
  }

  if (exit_code == STILL_ACTIVE) {
    return TRUE;
  }

  if (g_agent.hThread) {
    CloseHandle(g_agent.hThread);
  }
  if (g_agent.hProcess) {
    CloseHandle(g_agent.hProcess);
  }

  ZeroMemory(&g_agent, sizeof(g_agent));
  g_agent_running = FALSE;
  return FALSE;
}

static void CloseAgentHandles(void) {
  if (g_agent.hThread) {
    CloseHandle(g_agent.hThread);
  }
  if (g_agent.hProcess) {
    CloseHandle(g_agent.hProcess);
  }

  ZeroMemory(&g_agent, sizeof(g_agent));
  g_agent_running = FALSE;
}

static BOOL EnsureJobObject(void) {
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION info;

  if (g_job) {
    return TRUE;
  }

  g_job = CreateJobObjectW(NULL, NULL);
  if (!g_job) {
    return FALSE;
  }

  ZeroMemory(&info, sizeof(info));
  info.BasicLimitInformation.LimitFlags =
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

  if (
    !SetInformationJobObject(
      g_job,
      JobObjectExtendedLimitInformation,
      &info,
      sizeof(info)
    )
  ) {
    CloseHandle(g_job);
    g_job = NULL;
    return FALSE;
  }

  return TRUE;
}

static BOOL StartAgentCore(void) {
  wchar_t agent_path[MAX_PATH];
  wchar_t directory[MAX_PATH];
  wchar_t command_line[MAX_PATH * 2];
  STARTUPINFOW startup;
  PROCESS_INFORMATION process;

  if (AgentProcessAlive()) {
    return TRUE;
  }

  if (
    !SiblingPath(
      L"monitoria-agent.exe",
      agent_path,
      ARRAYSIZE(agent_path)
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
        L"\"%s\" run",
        agent_path
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
      agent_path,
      command_line,
      NULL,
      NULL,
      FALSE,
      CREATE_NO_WINDOW,
      NULL,
      directory,
      &startup,
      &process
    )
  ) {
    return FALSE;
  }

  if (
    EnsureJobObject() &&
    !AssignProcessToJobObject(g_job, process.hProcess)
  ) {
    TerminateProcess(process.hProcess, 70);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return FALSE;
  }

  g_agent = process;
  g_agent_running = TRUE;
  g_restart_attempts = 0;
  return TRUE;
}

static void StopAgentCore(void) {
  if (
    g_agent_running &&
    g_agent.hProcess &&
    AgentProcessAlive()
  ) {
    TerminateProcess(g_agent.hProcess, 0);
    WaitForSingleObject(g_agent.hProcess, 5 * 1000);
  }

  CloseAgentHandles();
}

static void RestartAgentCore(void) {
  StopAgentCore();
  g_pair_state = -1;
  g_pair_timer_slow = FALSE;
  StartAgentCore();

  if (g_window) {
    SetTimer(g_window, TIMER_PAIRING, 2500, NULL);
  }
}

static BOOL RunAgentCommand(
  const wchar_t *arguments,
  DWORD timeout_ms,
  DWORD *exit_code
) {
  wchar_t agent_path[MAX_PATH];
  wchar_t directory[MAX_PATH];
  wchar_t command_line[4096];
  STARTUPINFOW startup;
  PROCESS_INFORMATION process;
  DWORD wait_result;
  DWORD local_exit = 1;

  if (exit_code) {
    *exit_code = 1;
  }

  if (
    !SiblingPath(
      L"monitoria-agent.exe",
      agent_path,
      ARRAYSIZE(agent_path)
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
        L"\"%s\" %s",
        agent_path,
        arguments
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
      agent_path,
      command_line,
      NULL,
      NULL,
      FALSE,
      CREATE_NO_WINDOW,
      NULL,
      directory,
      &startup,
      &process
    )
  ) {
    return FALSE;
  }

  CloseHandle(process.hThread);

  wait_result = WaitForSingleObject(process.hProcess, timeout_ms);
  if (wait_result != WAIT_OBJECT_0) {
    TerminateProcess(process.hProcess, 72);
    WaitForSingleObject(process.hProcess, 2000);
    CloseHandle(process.hProcess);
    return FALSE;
  }

  if (!GetExitCodeProcess(process.hProcess, &local_exit)) {
    CloseHandle(process.hProcess);
    return FALSE;
  }

  CloseHandle(process.hProcess);

  if (exit_code) {
    *exit_code = local_exit;
  }

  return TRUE;
}

static int CheckPairingState(void) {
  DWORD exit_code = 1;

  if (!AgentProcessAlive()) {
    return -1;
  }

  if (!RunAgentCommand(L"paired-check", 15 * 1000, &exit_code)) {
    return -1;
  }

  if (exit_code == EXIT_OK) {
    return 1;
  }

  if (exit_code == EXIT_NOT_PAIRED) {
    return 0;
  }

  return -1;
}

static BOOL PairCodeCharacterAllowed(wchar_t value) {
  return (
    (value >= L'0' && value <= L'9') ||
    (value >= L'A' && value <= L'Z') ||
    (value >= L'a' && value <= L'z') ||
    value == L'-' ||
    value == L'_'
  );
}

static BOOL WritePairingSetupFile(
  const wchar_t *code,
  wchar_t *file_path,
  size_t file_path_count
) {
  wchar_t temp_path[MAX_PATH];
  wchar_t generated[MAX_PATH];
  size_t code_length;
  size_t index;
  int utf8_length;
  char utf8_code[128];
  char json[180];
  HANDLE file;
  DWORD written = 0;
  int json_length;

  code_length = wcslen(code);
  if (code_length < 4 || code_length > 64) {
    return FALSE;
  }

  for (index = 0; index < code_length; index += 1) {
    if (!PairCodeCharacterAllowed(code[index])) {
      return FALSE;
    }
  }

  if (
    GetTempPathW(ARRAYSIZE(temp_path), temp_path) == 0 ||
    GetTempFileNameW(temp_path, L"mia", 0, generated) == 0
  ) {
    return FALSE;
  }

  utf8_length = WideCharToMultiByte(
    CP_UTF8,
    0,
    code,
    -1,
    utf8_code,
    sizeof(utf8_code),
    NULL,
    NULL
  );

  if (utf8_length <= 1) {
    DeleteFileW(generated);
    return FALSE;
  }

  json_length = sprintf_s(
    json,
    sizeof(json),
    "{\"code\":\"%s\"}",
    utf8_code
  );

  if (json_length <= 0) {
    DeleteFileW(generated);
    return FALSE;
  }

  file = CreateFileW(
    generated,
    GENERIC_WRITE,
    0,
    NULL,
    CREATE_ALWAYS,
    FILE_ATTRIBUTE_TEMPORARY,
    NULL
  );

  if (file == INVALID_HANDLE_VALUE) {
    DeleteFileW(generated);
    return FALSE;
  }

  if (
    !WriteFile(
      file,
      json,
      (DWORD)json_length,
      &written,
      NULL
    ) ||
    written != (DWORD)json_length
  ) {
    CloseHandle(file);
    DeleteFileW(generated);
    return FALSE;
  }

  CloseHandle(file);

  if (
    FAILED(
      StringCchCopyW(
        file_path,
        file_path_count,
        generated
      )
    )
  ) {
    DeleteFileW(generated);
    return FALSE;
  }

  return TRUE;
}

static DWORD PairWithCode(const wchar_t *code) {
  wchar_t setup_file[MAX_PATH];
  wchar_t arguments[MAX_PATH * 2];
  DWORD exit_code = 1;

  if (
    !WritePairingSetupFile(
      code,
      setup_file,
      ARRAYSIZE(setup_file)
    )
  ) {
    return EXIT_INVALID_INPUT;
  }

  if (
    FAILED(
      StringCchPrintfW(
        arguments,
        ARRAYSIZE(arguments),
        L"setup --file \"%s\"",
        setup_file
      )
    )
  ) {
    DeleteFileW(setup_file);
    return EXIT_INVALID_INPUT;
  }

  if (!RunAgentCommand(arguments, 75 * 1000, &exit_code)) {
    DeleteFileW(setup_file);
    return EXIT_CORE_NOT_RUNNING;
  }

  /* O próprio Agent também apaga o arquivo; esta chamada cobre falha precoce. */
  DeleteFileW(setup_file);
  return exit_code;
}

static void OpenDashboard(void) {
  ShellExecuteW(
    g_window,
    L"open",
    DASHBOARD_URL,
    NULL,
    NULL,
    SW_SHOWNORMAL
  );
}

static void SetPairingStatus(const wchar_t *text) {
  if (g_pair_status) {
    SetWindowTextW(g_pair_status, text);
  }
}

static void CenterWindow(HWND window) {
  RECT rect;
  int width;
  int height;
  int x;
  int y;

  if (!GetWindowRect(window, &rect)) {
    return;
  }

  width = rect.right - rect.left;
  height = rect.bottom - rect.top;
  x = (GetSystemMetrics(SM_CXSCREEN) - width) / 2;
  y = (GetSystemMetrics(SM_CYSCREEN) - height) / 2;

  SetWindowPos(
    window,
    HWND_TOP,
    x,
    y,
    0,
    0,
    SWP_NOSIZE | SWP_NOZORDER
  );
}

static LRESULT CALLBACK PairingWindowProcedure(
  HWND window,
  UINT message,
  WPARAM w_param,
  LPARAM l_param
) {
  UNREFERENCED_PARAMETER(l_param);

  switch (message) {
    case WM_CREATE:
      g_pair_edit = CreateWindowExW(
        WS_EX_CLIENTEDGE,
        L"EDIT",
        L"",
        WS_CHILD | WS_VISIBLE | ES_AUTOHSCROLL,
        28,
        104,
        414,
        30,
        window,
        (HMENU)(INT_PTR)ID_PAIR_EDIT,
        NULL,
        NULL
      );

      SendMessageW(
        g_pair_edit,
        EM_SETLIMITTEXT,
        64,
        0
      );

      CreateWindowExW(
        0,
        L"STATIC",
        L"Conecte este computador ao MonitorIA",
        WS_CHILD | WS_VISIBLE,
        28,
        22,
        414,
        22,
        window,
        NULL,
        NULL,
        NULL
      );

      CreateWindowExW(
        0,
        L"STATIC",
        L"No painel, gere um código de conexão e informe abaixo. O código vale 15 minutos e só é usado na primeira instalação ou em um reparo de pareamento.",
        WS_CHILD | WS_VISIBLE,
        28,
        50,
        414,
        46,
        window,
        NULL,
        NULL,
        NULL
      );

      g_pair_connect = CreateWindowExW(
        0,
        L"BUTTON",
        L"Conectar computador",
        WS_CHILD | WS_VISIBLE | BS_DEFPUSHBUTTON,
        28,
        148,
        190,
        34,
        window,
        (HMENU)(INT_PTR)ID_PAIR_CONNECT,
        NULL,
        NULL
      );

      CreateWindowExW(
        0,
        L"BUTTON",
        L"Abrir painel",
        WS_CHILD | WS_VISIBLE,
        230,
        148,
        212,
        34,
        window,
        (HMENU)(INT_PTR)ID_PAIR_DASHBOARD,
        NULL,
        NULL
      );

      g_pair_status = CreateWindowExW(
        0,
        L"STATIC",
        L"",
        WS_CHILD | WS_VISIBLE,
        28,
        194,
        414,
        38,
        window,
        (HMENU)(INT_PTR)ID_PAIR_STATUS,
        NULL,
        NULL
      );

      SetFocus(g_pair_edit);
      return 0;

    case WM_COMMAND:
      switch (LOWORD(w_param)) {
        case ID_PAIR_DASHBOARD:
          OpenDashboard();
          return 0;

        case ID_PAIR_CONNECT:
          {
            wchar_t code[80];
            DWORD result;

            ZeroMemory(code, sizeof(code));
            GetWindowTextW(g_pair_edit, code, ARRAYSIZE(code));

            if (wcslen(code) < 4) {
              SetPairingStatus(L"Informe o código gerado no painel.");
              return 0;
            }

            EnableWindow(g_pair_connect, FALSE);
            EnableWindow(g_pair_edit, FALSE);
            SetPairingStatus(L"Conectando ao painel...");
            UpdateWindow(window);

            result = PairWithCode(code);

            EnableWindow(g_pair_connect, TRUE);
            EnableWindow(g_pair_edit, TRUE);

            if (result == EXIT_OK) {
              g_pair_state = 1;
              g_pair_prompt_dismissed = FALSE;
              SetPairingStatus(L"Computador conectado com sucesso.");
              UpdateTray(TRUE);
              ShowWindow(window, SW_HIDE);

              MessageBoxW(
                g_window,
                L"Pronto! Este computador está conectado ao MonitorIA.\n\nAgora volte ao painel e use “Procurar câmeras”.",
                L"MonitorIA",
                MB_OK | MB_ICONINFORMATION
              );

              return 0;
            }

            if (result == EXIT_PAIRING_REJECTED) {
              SetPairingStatus(
                L"O código foi recusado. Gere um código novo no painel e tente novamente."
              );
            } else if (result == EXIT_NO_PERMISSION) {
              SetPairingStatus(
                L"O MonitorIA não conseguiu acessar a pasta local deste usuário."
              );
            } else if (result == EXIT_INVALID_INPUT) {
              SetPairingStatus(
                L"O código informado não está em um formato válido."
              );
            } else {
              SetPairingStatus(
                L"O MonitorIA ainda está iniciando ou não conseguiu falar com o painel. Tente novamente em instantes."
              );
            }

            SetFocus(g_pair_edit);
            return 0;
          }

        default:
          break;
      }
      break;

    case WM_CLOSE:
      g_pair_prompt_dismissed = TRUE;
      ShowWindow(window, SW_HIDE);
      return 0;

    case WM_DESTROY:
      g_pair_window = NULL;
      g_pair_edit = NULL;
      g_pair_status = NULL;
      g_pair_connect = NULL;
      return 0;

    default:
      break;
  }

  return DefWindowProcW(window, message, w_param, l_param);
}

static BOOL EnsurePairingWindowClass(HINSTANCE instance) {
  WNDCLASSEXW window_class;

  ZeroMemory(&window_class, sizeof(window_class));
  window_class.cbSize = sizeof(window_class);
  window_class.lpfnWndProc = PairingWindowProcedure;
  window_class.hInstance = instance;
  window_class.hIcon = g_icon;
  window_class.hCursor = LoadCursorW(NULL, IDC_ARROW);
  window_class.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
  window_class.lpszClassName = PAIR_WINDOW_CLASS_NAME;

  if (RegisterClassExW(&window_class)) {
    return TRUE;
  }

  return GetLastError() == ERROR_CLASS_ALREADY_EXISTS;
}

static void ShowPairingWindow(void) {
  HINSTANCE instance = GetModuleHandleW(NULL);

  if (g_pair_window) {
    ShowWindow(g_pair_window, SW_SHOWNORMAL);
    SetForegroundWindow(g_pair_window);
    if (g_pair_edit) {
      SetFocus(g_pair_edit);
    }
    return;
  }

  if (!EnsurePairingWindowClass(instance)) {
    MessageBoxW(
      g_window,
      L"Não foi possível abrir a tela de conexão do MonitorIA.",
      L"MonitorIA",
      MB_OK | MB_ICONERROR
    );
    return;
  }

  g_pair_window = CreateWindowExW(
    WS_EX_APPWINDOW,
    PAIR_WINDOW_CLASS_NAME,
    L"MonitorIA — conectar computador",
    WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX,
    CW_USEDEFAULT,
    CW_USEDEFAULT,
    486,
    286,
    g_window,
    NULL,
    instance,
    NULL
  );

  if (!g_pair_window) {
    return;
  }

  CenterWindow(g_pair_window);
  ShowWindow(g_pair_window, SW_SHOWNORMAL);
  SetForegroundWindow(g_pair_window);
}

static void RefreshPairingState(BOOL may_prompt) {
  int previous = g_pair_state;
  int current = CheckPairingState();

  if (current == -1) {
    return;
  }

  g_pair_state = current;

  if (current == 1) {
    g_pair_prompt_dismissed = FALSE;
    if (g_pair_window) {
      ShowWindow(g_pair_window, SW_HIDE);
    }
    return;
  }

  if (previous == 1) {
    /* Pareamento deixou de ser utilizável: um reparo deve voltar a aparecer. */
    g_pair_prompt_dismissed = FALSE;
  }

  if (may_prompt && !g_pair_prompt_dismissed) {
    ShowPairingWindow();
  }
}

static void UpdateTray(BOOL force) {
  BOOL running = AgentProcessAlive();
  static int last_state = -99;
  int state;

  if (!running) {
    state = -2;
  } else if (g_pair_state == 0) {
    state = 0;
  } else if (g_pair_state == 1) {
    state = 1;
  } else {
    state = -1;
  }

  if (!force && last_state == state) {
    return;
  }

  last_state = state;

  if (!running) {
    StringCchCopyW(
      g_notify.szTip,
      ARRAYSIZE(g_notify.szTip),
      L"MonitorIA — reiniciando monitoramento"
    );
  } else if (g_pair_state == 0) {
    StringCchCopyW(
      g_notify.szTip,
      ARRAYSIZE(g_notify.szTip),
      L"MonitorIA — conecte este computador ao painel"
    );
  } else if (g_pair_state == 1) {
    StringCchCopyW(
      g_notify.szTip,
      ARRAYSIZE(g_notify.szTip),
      L"MonitorIA — ativo após login"
    );
  } else {
    StringCchCopyW(
      g_notify.szTip,
      ARRAYSIZE(g_notify.szTip),
      L"MonitorIA — verificando conexão"
    );
  }

  if (g_window) {
    Shell_NotifyIconW(NIM_MODIFY, &g_notify);
  }
}

static BOOL AddTrayIcon(void) {
  ZeroMemory(&g_notify, sizeof(g_notify));

  g_notify.cbSize = sizeof(g_notify);
  g_notify.hWnd = g_window;
  g_notify.uID = 1;
  g_notify.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
  g_notify.uCallbackMessage = WM_TRAYICON;
  g_notify.hIcon = g_icon;

  StringCchCopyW(
    g_notify.szTip,
    ARRAYSIZE(g_notify.szTip),
    L"MonitorIA — iniciando..."
  );

  if (!Shell_NotifyIconW(NIM_ADD, &g_notify)) {
    return FALSE;
  }

  UpdateTray(TRUE);
  return TRUE;
}

static void RemoveTrayIcon(void) {
  if (g_window) {
    Shell_NotifyIconW(NIM_DELETE, &g_notify);
  }
}

static void ShowStatus(void) {
  if (!AgentProcessAlive()) {
    MessageBoxW(
      g_window,
      L"O núcleo do MonitorIA não está em execução. O aplicativo tentará reiniciá-lo automaticamente.",
      L"MonitorIA — atenção",
      MB_OK | MB_ICONWARNING
    );
    return;
  }

  if (g_pair_state == 0) {
    MessageBoxW(
      g_window,
      L"O MonitorIA está instalado, mas este computador ainda precisa ser conectado ao painel.\n\nUse “Conectar este computador” no ícone do MonitorIA.",
      L"MonitorIA — conexão necessária",
      MB_OK | MB_ICONINFORMATION
    );
    return;
  }

  MessageBoxW(
    g_window,
    L"O MonitorIA está ativo nesta sessão do Windows.\n\nEsta edição começa após o login, continua com a tela bloqueada e é encerrada quando o usuário sai da conta.",
    L"MonitorIA — ativo",
    MB_OK | MB_ICONINFORMATION
  );
}

static void ShowContextMenu(void) {
  HMENU menu = CreatePopupMenu();
  POINT cursor;

  if (!menu) {
    return;
  }

  AppendMenuW(
    menu,
    MF_STRING | MF_DISABLED,
    ID_CMD_STATUS,
    !AgentProcessAlive()
      ? L"● Monitoramento reiniciando"
      : g_pair_state == 0
        ? L"● Computador ainda não conectado"
        : g_pair_state == 1
          ? L"● Monitoramento ativo"
          : L"● Verificando conexão"
  );

  AppendMenuW(menu, MF_SEPARATOR, 0, NULL);

  if (g_pair_state != 1) {
    AppendMenuW(
      menu,
      MF_STRING,
      ID_CMD_CONNECT,
      L"Conectar este computador"
    );
  }

  AppendMenuW(
    menu,
    MF_STRING,
    ID_CMD_DASHBOARD,
    L"Abrir painel do MonitorIA"
  );

  AppendMenuW(
    menu,
    MF_STRING,
    ID_CMD_RESTART,
    L"Reiniciar MonitorIA"
  );

  AppendMenuW(menu, MF_SEPARATOR, 0, NULL);

  AppendMenuW(
    menu,
    MF_STRING,
    ID_CMD_EXIT,
    L"Sair do MonitorIA"
  );

  GetCursorPos(&cursor);
  SetForegroundWindow(g_window);

  TrackPopupMenu(
    menu,
    TPM_RIGHTBUTTON | TPM_BOTTOMALIGN,
    cursor.x,
    cursor.y,
    0,
    g_window,
    NULL
  );

  PostMessageW(g_window, WM_NULL, 0, 0);
  DestroyMenu(menu);
}

static void OpenPrimaryAction(void) {
  RefreshPairingState(FALSE);

  if (g_pair_state == 0) {
    g_pair_prompt_dismissed = FALSE;
    ShowPairingWindow();
    return;
  }

  OpenDashboard();
}

static void ScheduleRestart(void) {
  DWORD delay_ms;

  if (g_shutting_down) {
    return;
  }

  g_restart_attempts += 1;

  if (g_restart_attempts <= 1) {
    delay_ms = 2 * 1000;
  } else if (g_restart_attempts <= 3) {
    delay_ms = 5 * 1000;
  } else {
    delay_ms = 15 * 1000;
  }

  SetTimer(g_window, TIMER_RESTART, delay_ms, NULL);
}

static LRESULT CALLBACK WindowProcedure(
  HWND window,
  UINT message,
  WPARAM w_param,
  LPARAM l_param
) {
  if (
    g_taskbar_created != 0 &&
    message == g_taskbar_created
  ) {
    AddTrayIcon();
    return 0;
  }

  switch (message) {
    case WM_TRAYICON:
      if (
        l_param == WM_RBUTTONUP ||
        l_param == WM_CONTEXTMENU
      ) {
        ShowContextMenu();
        return 0;
      }

      if (l_param == WM_LBUTTONDBLCLK) {
        OpenPrimaryAction();
        return 0;
      }
      break;

    case WM_OPEN_PRIMARY:
      OpenPrimaryAction();
      return 0;

    case WM_COMMAND:
      switch (LOWORD(w_param)) {
        case ID_CMD_STATUS:
          ShowStatus();
          return 0;

        case ID_CMD_CONNECT:
          g_pair_prompt_dismissed = FALSE;
          ShowPairingWindow();
          return 0;

        case ID_CMD_DASHBOARD:
          OpenDashboard();
          return 0;

        case ID_CMD_RESTART:
          RestartAgentCore();
          UpdateTray(TRUE);
          return 0;

        case ID_CMD_EXIT:
          g_shutting_down = TRUE;
          DestroyWindow(window);
          return 0;

        default:
          break;
      }
      break;

    case WM_TIMER:
      if (w_param == TIMER_HEALTH) {
        if (!AgentProcessAlive() && !g_shutting_down) {
          ScheduleRestart();
        }

        UpdateTray(FALSE);
        return 0;
      }

      if (w_param == TIMER_RESTART) {
        KillTimer(window, TIMER_RESTART);

        if (!g_shutting_down && !AgentProcessAlive()) {
          StartAgentCore();
          g_pair_state = -1;
          g_pair_timer_slow = FALSE;
          SetTimer(window, TIMER_PAIRING, 2500, NULL);
          UpdateTray(TRUE);
        }
        return 0;
      }

      if (w_param == TIMER_PAIRING) {
        RefreshPairingState(TRUE);
        UpdateTray(FALSE);

        if (!g_pair_timer_slow && g_pair_state != -1) {
          g_pair_timer_slow = TRUE;
          SetTimer(window, TIMER_PAIRING, 60 * 1000, NULL);
        }

        return 0;
      }
      break;

    case WM_QUERYENDSESSION:
      return TRUE;

    case WM_ENDSESSION:
      if (w_param == TRUE) {
        g_shutting_down = TRUE;
        DestroyWindow(window);
      }
      return 0;

    case WM_DESTROY:
      g_shutting_down = TRUE;
      KillTimer(window, TIMER_HEALTH);
      KillTimer(window, TIMER_RESTART);
      KillTimer(window, TIMER_PAIRING);
      RemoveTrayIcon();

      if (g_pair_window) {
        DestroyWindow(g_pair_window);
      }

      StopAgentCore();

      if (g_job) {
        CloseHandle(g_job);
        g_job = NULL;
      }

      PostQuitMessage(0);
      return 0;

    default:
      break;
  }

  return DefWindowProcW(window, message, w_param, l_param);
}

static int SelfTest(void) {
  wchar_t data_root[MAX_PATH];
  wchar_t agent_path[MAX_PATH];

  if (
    !ConfigureUserDataEnvironment(
      data_root,
      ARRAYSIZE(data_root)
    )
  ) {
    return 10;
  }

  if (
    wcsstr(
      data_root,
      L"\\AppData\\Local\\MonitorIA"
    ) == NULL
  ) {
    return 11;
  }

  if (
    !SiblingPath(
      L"monitoria-agent.exe",
      agent_path,
      ARRAYSIZE(agent_path)
    )
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
  WNDCLASSEXW window_class;
  MSG message;
  HANDLE mutex;
  HWND existing;
  wchar_t data_root[MAX_PATH];

  UNREFERENCED_PARAMETER(previous_instance);
  UNREFERENCED_PARAMETER(command_line);
  UNREFERENCED_PARAMETER(show_command);

  if (HasArgument(L"--self-test")) {
    return SelfTest();
  }

  if (
    !ConfigureUserDataEnvironment(
      data_root,
      ARRAYSIZE(data_root)
    )
  ) {
    MessageBoxW(
      NULL,
      L"O MonitorIA não conseguiu localizar sua pasta local de dados.",
      L"MonitorIA",
      MB_OK | MB_ICONERROR
    );
    return 20;
  }

  mutex = CreateMutexW(NULL, TRUE, MUTEX_NAME);
  if (!mutex) {
    return 21;
  }

  if (GetLastError() == ERROR_ALREADY_EXISTS) {
    existing = FindWindowW(WINDOW_CLASS_NAME, NULL);

    if (existing) {
      PostMessageW(existing, WM_OPEN_PRIMARY, 0, 0);
    }

    CloseHandle(mutex);
    return 0;
  }

  g_icon = (HICON)LoadImageW(
    instance,
    MAKEINTRESOURCEW(IDI_MONITORIA),
    IMAGE_ICON,
    0,
    0,
    LR_DEFAULTSIZE
  );

  if (!g_icon) {
    g_icon = LoadIconW(NULL, IDI_APPLICATION);
  }

  ZeroMemory(&window_class, sizeof(window_class));
  window_class.cbSize = sizeof(window_class);
  window_class.lpfnWndProc = WindowProcedure;
  window_class.hInstance = instance;
  window_class.hIcon = g_icon;
  window_class.hCursor = LoadCursorW(NULL, IDC_ARROW);
  window_class.lpszClassName = WINDOW_CLASS_NAME;

  if (!RegisterClassExW(&window_class)) {
    CloseHandle(mutex);
    return 22;
  }

  g_window = CreateWindowExW(
    0,
    WINDOW_CLASS_NAME,
    L"MonitorIA",
    WS_OVERLAPPED,
    0,
    0,
    0,
    0,
    NULL,
    NULL,
    instance,
    NULL
  );

  if (!g_window) {
    CloseHandle(mutex);
    return 23;
  }

  g_taskbar_created = RegisterWindowMessageW(L"TaskbarCreated");

  if (!AddTrayIcon()) {
    DestroyWindow(g_window);
    CloseHandle(mutex);
    return 24;
  }

  StartAgentCore();

  SetTimer(g_window, TIMER_HEALTH, 10 * 1000, NULL);
  SetTimer(g_window, TIMER_PAIRING, 2500, NULL);

  while (GetMessageW(&message, NULL, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }

  CloseHandle(mutex);

  if (g_icon) {
    DestroyIcon(g_icon);
  }

  return (int)message.wParam;
}
