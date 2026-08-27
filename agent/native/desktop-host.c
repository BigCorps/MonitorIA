#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <shellapi.h>
#include <shlobj.h>
#include <strsafe.h>
#include <wchar.h>

#pragma comment(lib, "Shell32.lib")
#pragma comment(lib, "User32.lib")

#define IDI_MONITORIA 101
#define WM_TRAYICON (WM_APP + 1)
#define WM_OPEN_DASHBOARD (WM_APP + 2)

#define ID_CMD_STATUS 2101
#define ID_CMD_DASHBOARD 2102
#define ID_CMD_RESTART 2103
#define ID_CMD_EXIT 2104

#define TIMER_HEALTH 1
#define TIMER_RESTART 2

static const wchar_t *WINDOW_CLASS_NAME =
  L"MonitorIADesktopHostV103";
static const wchar_t *MUTEX_NAME =
  L"Local\\MonitorIADesktopHostV103";
static const wchar_t *DASHBOARD_URL =
  L"https://monitoria.cam/dashboard";

static HWND g_window = NULL;
static NOTIFYICONDATAW g_notify;
static HICON g_icon = NULL;
static UINT g_taskbar_created = 0;

static PROCESS_INFORMATION g_agent;
static HANDLE g_job = NULL;
static BOOL g_agent_running = FALSE;
static BOOL g_shutting_down = FALSE;
static DWORD g_restart_attempts = 0;

static BOOL ModuleDirectory(
  wchar_t *buffer,
  size_t count
) {
  DWORD length =
    GetModuleFileNameW(
      NULL,
      buffer,
      (DWORD)count
    );
  wchar_t *slash;

  if (
    length == 0 ||
    length >= count
  ) {
    return FALSE;
  }

  slash = wcsrchr(
    buffer,
    L'\\'
  );
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

  if (
    !ModuleDirectory(
      directory,
      ARRAYSIZE(directory)
    )
  ) {
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
        CSIDL_LOCAL_APPDATA |
          CSIDL_FLAG_CREATE,
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

  if (
    !SetEnvironmentVariableW(
      L"MONITORIA_DESKTOP_MODE",
      L"1"
    )
  ) {
    return FALSE;
  }

  if (
    !SetEnvironmentVariableW(
      L"MONITORIA_CONFIG_DIR",
      data_root
    )
  ) {
    return FALSE;
  }

  return TRUE;
}

static BOOL AgentProcessAlive(void) {
  DWORD exit_code;

  if (
    !g_agent_running ||
    !g_agent.hProcess
  ) {
    return FALSE;
  }

  if (
    !GetExitCodeProcess(
      g_agent.hProcess,
      &exit_code
    )
  ) {
    return FALSE;
  }

  if (
    exit_code == STILL_ACTIVE
  ) {
    return TRUE;
  }

  CloseHandle(
    g_agent.hThread
  );
  CloseHandle(
    g_agent.hProcess
  );
  ZeroMemory(
    &g_agent,
    sizeof(g_agent)
  );
  g_agent_running = FALSE;
  return FALSE;
}

static void CloseAgentHandles(void) {
  if (g_agent.hThread) {
    CloseHandle(
      g_agent.hThread
    );
  }

  if (g_agent.hProcess) {
    CloseHandle(
      g_agent.hProcess
    );
  }

  ZeroMemory(
    &g_agent,
    sizeof(g_agent)
  );
  g_agent_running = FALSE;
}

static BOOL EnsureJobObject(void) {
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION info;

  if (g_job) {
    return TRUE;
  }

  g_job =
    CreateJobObjectW(
      NULL,
      NULL
    );

  if (!g_job) {
    return FALSE;
  }

  ZeroMemory(
    &info,
    sizeof(info)
  );

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
    !ModuleDirectory(
      directory,
      ARRAYSIZE(directory)
    )
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

  ZeroMemory(
    &startup,
    sizeof(startup)
  );
  startup.cb =
    sizeof(startup);

  ZeroMemory(
    &process,
    sizeof(process)
  );

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
    !AssignProcessToJobObject(
      g_job,
      process.hProcess
    )
  ) {
    TerminateProcess(
      process.hProcess,
      70
    );
    CloseHandle(
      process.hThread
    );
    CloseHandle(
      process.hProcess
    );
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
    /*
     * Desktop Host e Core vivem no mesmo Job Object.
     * Esta edição usa somente processos da sessão do usuário e não depende
     * do gerenciador de serviços do Windows nem de processo SYSTEM.
     *
     * O encerramento explícito da edição Store encerra também o Core.
     * A fila já é durável antes desta fronteira.
     */
    TerminateProcess(
      g_agent.hProcess,
      0
    );
    WaitForSingleObject(
      g_agent.hProcess,
      5 * 1000
    );
  }

  CloseAgentHandles();
}

static void RestartAgentCore(void) {
  StopAgentCore();
  StartAgentCore();
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

static void UpdateTray(BOOL force) {
  BOOL running =
    AgentProcessAlive();
  static int last_state = -1;
  int state =
    running ? 1 : 0;

  if (
    !force &&
    last_state == state
  ) {
    return;
  }

  last_state = state;

  StringCchCopyW(
    g_notify.szTip,
    ARRAYSIZE(g_notify.szTip),
    running
      ? L"MonitorIA — ativo após login"
      : L"MonitorIA — iniciando monitoramento"
  );

  if (g_window) {
    Shell_NotifyIconW(
      NIM_MODIFY,
      &g_notify
    );
  }
}

static BOOL AddTrayIcon(void) {
  ZeroMemory(
    &g_notify,
    sizeof(g_notify)
  );

  g_notify.cbSize =
    sizeof(g_notify);
  g_notify.hWnd =
    g_window;
  g_notify.uID = 1;
  g_notify.uFlags =
    NIF_MESSAGE |
    NIF_ICON |
    NIF_TIP;
  g_notify.uCallbackMessage =
    WM_TRAYICON;
  g_notify.hIcon =
    g_icon;

  StringCchCopyW(
    g_notify.szTip,
    ARRAYSIZE(g_notify.szTip),
    L"MonitorIA — iniciando..."
  );

  if (
    !Shell_NotifyIconW(
      NIM_ADD,
      &g_notify
    )
  ) {
    return FALSE;
  }

  UpdateTray(TRUE);
  return TRUE;
}

static void RemoveTrayIcon(void) {
  if (g_window) {
    Shell_NotifyIconW(
      NIM_DELETE,
      &g_notify
    );
  }
}

static void ShowStatus(void) {
  BOOL running =
    AgentProcessAlive();

  MessageBoxW(
    g_window,
    running
      ? L"O MonitorIA está ativo nesta sessão do Windows.\n\n"
        L"Esta edição começa após o login. Ao sair da conta do Windows, o monitoramento é encerrado até o próximo login."
      : L"O Core do MonitorIA não está em execução.\n\n"
        L"O aplicativo tentará reiniciá-lo automaticamente.",
    running
      ? L"MonitorIA — ativo"
      : L"MonitorIA — atenção",
    MB_OK |
      (
        running
          ? MB_ICONINFORMATION
          : MB_ICONWARNING
      )
  );
}

static void ShowContextMenu(void) {
  HMENU menu =
    CreatePopupMenu();
  POINT cursor;
  BOOL running =
    AgentProcessAlive();

  if (!menu) {
    return;
  }

  AppendMenuW(
    menu,
    MF_STRING |
      MF_DISABLED,
    ID_CMD_STATUS,
    running
      ? L"● Monitoramento ativo"
      : L"● Monitoramento reiniciando"
  );

  AppendMenuW(
    menu,
    MF_SEPARATOR,
    0,
    NULL
  );

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

  AppendMenuW(
    menu,
    MF_SEPARATOR,
    0,
    NULL
  );

  AppendMenuW(
    menu,
    MF_STRING,
    ID_CMD_EXIT,
    L"Sair do MonitorIA"
  );

  GetCursorPos(&cursor);
  SetForegroundWindow(
    g_window
  );

  TrackPopupMenu(
    menu,
    TPM_RIGHTBUTTON |
      TPM_BOTTOMALIGN,
    cursor.x,
    cursor.y,
    0,
    g_window,
    NULL
  );

  PostMessageW(
    g_window,
    WM_NULL,
    0,
    0
  );

  DestroyMenu(menu);
}

static void ScheduleRestart(void) {
  DWORD delay_ms;

  if (g_shutting_down) {
    return;
  }

  g_restart_attempts += 1;

  if (g_restart_attempts <= 1) {
    delay_ms = 2 * 1000;
  } else if (
    g_restart_attempts <= 3
  ) {
    delay_ms = 5 * 1000;
  } else {
    delay_ms = 15 * 1000;
  }

  SetTimer(
    g_window,
    TIMER_RESTART,
    delay_ms,
    NULL
  );
}

static LRESULT CALLBACK WindowProcedure(
  HWND window,
  UINT message,
  WPARAM w_param,
  LPARAM l_param
) {
  if (
    g_taskbar_created != 0 &&
    message ==
      g_taskbar_created
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

      if (
        l_param ==
        WM_LBUTTONDBLCLK
      ) {
        OpenDashboard();
        return 0;
      }
      break;

    case WM_OPEN_DASHBOARD:
      OpenDashboard();
      return 0;

    case WM_COMMAND:
      switch (
        LOWORD(w_param)
      ) {
        case ID_CMD_STATUS:
          ShowStatus();
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
      if (
        w_param ==
        TIMER_HEALTH
      ) {
        if (
          !AgentProcessAlive() &&
          !g_shutting_down
        ) {
          ScheduleRestart();
        }

        UpdateTray(FALSE);
        return 0;
      }

      if (
        w_param ==
        TIMER_RESTART
      ) {
        KillTimer(
          window,
          TIMER_RESTART
        );

        if (
          !g_shutting_down &&
          !AgentProcessAlive()
        ) {
          StartAgentCore();
          UpdateTray(TRUE);
        }
        return 0;
      }
      break;

    case WM_QUERYENDSESSION:
      return TRUE;

    case WM_ENDSESSION:
      if (
        w_param == TRUE
      ) {
        g_shutting_down = TRUE;
        DestroyWindow(window);
      }
      return 0;

    case WM_DESTROY:
      g_shutting_down = TRUE;
      KillTimer(
        window,
        TIMER_HEALTH
      );
      KillTimer(
        window,
        TIMER_RESTART
      );
      RemoveTrayIcon();
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

  return DefWindowProcW(
    window,
    message,
    w_param,
    l_param
  );
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

  UNREFERENCED_PARAMETER(
    previous_instance
  );
  UNREFERENCED_PARAMETER(
    command_line
  );
  UNREFERENCED_PARAMETER(
    show_command
  );

  if (
    wcsstr(
      GetCommandLineW(),
      L"--self-test"
    ) != NULL
  ) {
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
      MB_OK |
        MB_ICONERROR
    );
    return 20;
  }

  mutex =
    CreateMutexW(
      NULL,
      TRUE,
      MUTEX_NAME
    );

  if (!mutex) {
    return 21;
  }

  if (
    GetLastError() ==
      ERROR_ALREADY_EXISTS
  ) {
    existing =
      FindWindowW(
        WINDOW_CLASS_NAME,
        NULL
      );

    if (existing) {
      PostMessageW(
        existing,
        WM_OPEN_DASHBOARD,
        0,
        0
      );
    }

    CloseHandle(mutex);
    return 0;
  }

  g_icon =
    (HICON)LoadImageW(
      instance,
      MAKEINTRESOURCEW(
        IDI_MONITORIA
      ),
      IMAGE_ICON,
      0,
      0,
      LR_DEFAULTSIZE
    );

  if (!g_icon) {
    g_icon =
      LoadIconW(
        NULL,
        IDI_APPLICATION
      );
  }

  ZeroMemory(
    &window_class,
    sizeof(window_class)
  );

  window_class.cbSize =
    sizeof(window_class);
  window_class.lpfnWndProc =
    WindowProcedure;
  window_class.hInstance =
    instance;
  window_class.hIcon =
    g_icon;
  window_class.hCursor =
    LoadCursorW(
      NULL,
      IDC_ARROW
    );
  window_class.lpszClassName =
    WINDOW_CLASS_NAME;

  if (
    !RegisterClassExW(
      &window_class
    )
  ) {
    CloseHandle(mutex);
    return 22;
  }

  g_window =
    CreateWindowExW(
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

  g_taskbar_created =
    RegisterWindowMessageW(
      L"TaskbarCreated"
    );

  if (!AddTrayIcon()) {
    DestroyWindow(g_window);
    CloseHandle(mutex);
    return 24;
  }

  StartAgentCore();

  SetTimer(
    g_window,
    TIMER_HEALTH,
    10 * 1000,
    NULL
  );

  while (
    GetMessageW(
      &message,
      NULL,
      0,
      0
    ) > 0
  ) {
    TranslateMessage(
      &message
    );
    DispatchMessageW(
      &message
    );
  }

  CloseHandle(mutex);

  if (g_icon) {
    DestroyIcon(g_icon);
  }

  return (int)message.wParam;
}
