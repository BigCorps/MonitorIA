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

#define WM_TRAYICON (WM_APP + 1)
#define WM_OPEN_DASHBOARD (WM_APP + 2)

#define ID_CMD_STATUS 2001
#define ID_CMD_DASHBOARD 2002
#define ID_CMD_RESTART 2003
#define ID_CMD_EXIT_TRAY 2004

#define TIMER_STATUS 1

static const wchar_t *WINDOW_CLASS_NAME = L"MonitorIATrayWindowV103";
static const wchar_t *MUTEX_NAME = L"Local\\MonitorIATrayV103";
static const wchar_t *SERVICE_NAME = L"MonitorIAAgent";
static const wchar_t *DASHBOARD_URL = L"https://monitoria.cam/dashboard";

static HWND g_window = NULL;
static NOTIFYICONDATAW g_notify;
static HICON g_icon = NULL;
static UINT g_taskbar_created = 0;
static int g_last_service_state = -1;

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

static BOOL ServiceRunning(void) {
  SC_HANDLE manager = NULL;
  SC_HANDLE service = NULL;
  SERVICE_STATUS_PROCESS status;
  DWORD bytes_needed = 0;
  BOOL running = FALSE;

  ZeroMemory(&status, sizeof(status));

  manager = OpenSCManagerW(
    NULL,
    NULL,
    SC_MANAGER_CONNECT
  );

  if (!manager) {
    return FALSE;
  }

  service = OpenServiceW(
    manager,
    SERVICE_NAME,
    SERVICE_QUERY_STATUS
  );

  if (!service) {
    CloseServiceHandle(manager);
    return FALSE;
  }

  if (
    QueryServiceStatusEx(
      service,
      SC_STATUS_PROCESS_INFO,
      (LPBYTE)&status,
      sizeof(status),
      &bytes_needed
    )
  ) {
    running =
      status.dwCurrentState == SERVICE_RUNNING ||
      status.dwCurrentState == SERVICE_START_PENDING;
  }

  CloseServiceHandle(service);
  CloseServiceHandle(manager);
  return running;
}

static void UpdateTrayStatus(BOOL force) {
  BOOL running = ServiceRunning();
  int state = running ? 1 : 0;

  if (!force && g_last_service_state == state) {
    return;
  }

  g_last_service_state = state;

  StringCchCopyW(
    g_notify.szTip,
    ARRAYSIZE(g_notify.szTip),
    running
      ? L"MonitorIA — monitoramento 24/7 ativo"
      : L"MonitorIA — atenção: serviço parado"
  );

  if (g_window) {
    Shell_NotifyIconW(NIM_MODIFY, &g_notify);
  }
}

static BOOL AddTrayIcon(void) {
  ZeroMemory(&g_notify, sizeof(g_notify));

  g_notify.cbSize = sizeof(g_notify);
  g_notify.hWnd = g_window;
  g_notify.uID = 1;
  g_notify.uFlags =
    NIF_MESSAGE |
    NIF_ICON |
    NIF_TIP;
  g_notify.uCallbackMessage = WM_TRAYICON;
  g_notify.hIcon = g_icon;

  StringCchCopyW(
    g_notify.szTip,
    ARRAYSIZE(g_notify.szTip),
    L"MonitorIA — verificando monitoramento..."
  );

  if (!Shell_NotifyIconW(NIM_ADD, &g_notify)) {
    return FALSE;
  }

  UpdateTrayStatus(TRUE);
  return TRUE;
}

static void RemoveTrayIcon(void) {
  if (g_window) {
    Shell_NotifyIconW(NIM_DELETE, &g_notify);
  }
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

static void ShowStatusDialog(void) {
  BOOL running = ServiceRunning();

  MessageBoxW(
    g_window,
    running
      ? L"O MonitorIA está monitorando em segundo plano.\n\n"
        L"Fechar apenas este ícone NÃO interrompe o serviço 24/7."
      : L"O serviço do MonitorIA não está em execução.\n\n"
        L"Use “Reiniciar monitoramento” ou abra o painel para conferir a instalação.",
    running
      ? L"MonitorIA — monitoramento ativo"
      : L"MonitorIA — atenção necessária",
    MB_OK | (running ? MB_ICONINFORMATION : MB_ICONWARNING)
  );
}

static void RestartMonitoring(void) {
  wchar_t service_executable[MAX_PATH];
  wchar_t directory[MAX_PATH];
  HINSTANCE result;

  if (
    !SiblingPath(
      L"monitoria-service.exe",
      service_executable,
      ARRAYSIZE(service_executable)
    ) ||
    !ModuleDirectory(
      directory,
      ARRAYSIZE(directory)
    )
  ) {
    MessageBoxW(
      g_window,
      L"Não foi possível localizar o componente de serviço do MonitorIA.",
      L"MonitorIA",
      MB_OK | MB_ICONERROR
    );
    return;
  }

  /*
   * Reiniciar o serviço é uma ação administrativa e, portanto, solicita UAC.
   * O tray nunca para o serviço ao ser fechado.
   */
  result = ShellExecuteW(
    g_window,
    L"runas",
    service_executable,
    L"restart",
    directory,
    SW_HIDE
  );

  if ((INT_PTR)result <= 32) {
    MessageBoxW(
      g_window,
      L"O Windows não autorizou a reinicialização do serviço.",
      L"MonitorIA",
      MB_OK | MB_ICONWARNING
    );
    return;
  }

  SetTimer(
    g_window,
    TIMER_STATUS,
    2 * 1000,
    NULL
  );
}

static void ShowContextMenu(void) {
  HMENU menu;
  POINT cursor;
  BOOL running = ServiceRunning();

  menu = CreatePopupMenu();
  if (!menu) {
    return;
  }

  AppendMenuW(
    menu,
    MF_STRING | MF_DISABLED,
    ID_CMD_STATUS,
    running
      ? L"● Monitoramento 24/7 ativo"
      : L"● Serviço parado"
  );

  AppendMenuW(menu, MF_SEPARATOR, 0, NULL);
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
    L"Reiniciar monitoramento"
  );
  AppendMenuW(menu, MF_SEPARATOR, 0, NULL);
  AppendMenuW(
    menu,
    MF_STRING,
    ID_CMD_EXIT_TRAY,
    L"Fechar apenas este ícone"
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

  PostMessageW(
    g_window,
    WM_NULL,
    0,
    0
  );

  DestroyMenu(menu);
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

      if (
        l_param == WM_LBUTTONDBLCLK
      ) {
        OpenDashboard();
        return 0;
      }
      break;

    case WM_OPEN_DASHBOARD:
      OpenDashboard();
      return 0;

    case WM_COMMAND:
      switch (LOWORD(w_param)) {
        case ID_CMD_STATUS:
          ShowStatusDialog();
          return 0;

        case ID_CMD_DASHBOARD:
          OpenDashboard();
          return 0;

        case ID_CMD_RESTART:
          RestartMonitoring();
          return 0;

        case ID_CMD_EXIT_TRAY:
          DestroyWindow(window);
          return 0;

        default:
          break;
      }
      break;

    case WM_TIMER:
      if (w_param == TIMER_STATUS) {
        UpdateTrayStatus(FALSE);
        return 0;
      }
      break;

    case WM_DESTROY:
      KillTimer(window, TIMER_STATUS);
      RemoveTrayIcon();
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
  wchar_t sibling[MAX_PATH];
  HICON icon;

  if (
    !SiblingPath(
      L"monitoria-service.exe",
      sibling,
      ARRAYSIZE(sibling)
    )
  ) {
    return 10;
  }

  icon = (HICON)LoadImageW(
    GetModuleHandleW(NULL),
    MAKEINTRESOURCEW(IDI_MONITORIA),
    IMAGE_ICON,
    16,
    16,
    LR_DEFAULTCOLOR
  );

  if (!icon) {
    return 11;
  }

  DestroyIcon(icon);

  /*
   * O serviço pode legitimamente não existir no runner de CI.
   * A chamada é feita apenas para verificar que o caminho de consulta
   * não provoca falha do processo.
   */
  (void)ServiceRunning();

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

  UNREFERENCED_PARAMETER(previous_instance);
  UNREFERENCED_PARAMETER(command_line);
  UNREFERENCED_PARAMETER(show_command);

  if (HasArgument(L"--self-test")) {
    return SelfTest();
  }

  mutex = CreateMutexW(
    NULL,
    TRUE,
    MUTEX_NAME
  );

  if (!mutex) {
    return 2;
  }

  if (
    GetLastError() ==
    ERROR_ALREADY_EXISTS
  ) {
    existing = FindWindowW(
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

  g_icon = (HICON)LoadImageW(
    instance,
    MAKEINTRESOURCEW(IDI_MONITORIA),
    IMAGE_ICON,
    0,
    0,
    LR_DEFAULTSIZE
  );

  if (!g_icon) {
    g_icon = LoadIconW(
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
    return 3;
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
    return 4;
  }

  g_taskbar_created =
    RegisterWindowMessageW(
      L"TaskbarCreated"
    );

  if (!AddTrayIcon()) {
    DestroyWindow(g_window);
    CloseHandle(mutex);
    return 5;
  }

  SetTimer(
    g_window,
    TIMER_STATUS,
    15 * 1000,
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
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }

  CloseHandle(mutex);

  if (
    g_icon &&
    g_icon != LoadIconW(
      NULL,
      IDI_APPLICATION
    )
  ) {
    DestroyIcon(g_icon);
  }

  return (int)message.wParam;
}
