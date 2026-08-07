#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wincrypt.h>
#include <stdio.h>
#include <string.h>

#pragma comment(lib, "Crypt32.lib")

static char *read_line(void) {
  SIZE_T capacity = 4096;
  SIZE_T length = 0;
  char *buffer = (char *)HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, capacity);
  int character;

  if (!buffer) return NULL;

  while ((character = fgetc(stdin)) != EOF && character != '\n') {
    if (character == '\r') continue;

    if (length + 1 >= capacity) {
      SIZE_T next_capacity = capacity * 2;
      char *next;

      if (next_capacity > 1024 * 1024) {
        HeapFree(GetProcessHeap(), 0, buffer);
        return NULL;
      }

      next = (char *)HeapReAlloc(
        GetProcessHeap(), HEAP_ZERO_MEMORY, buffer, next_capacity
      );
      if (!next) {
        HeapFree(GetProcessHeap(), 0, buffer);
        return NULL;
      }

      buffer = next;
      capacity = next_capacity;
    }

    buffer[length++] = (char)character;
  }

  buffer[length] = '\0';
  return buffer;
}

static BOOL decode_base64(const char *text, DATA_BLOB *blob) {
  DWORD bytes = 0;

  blob->cbData = 0;
  blob->pbData = NULL;

  if (!text || text[0] == '\0') return TRUE;

  if (!CryptStringToBinaryA(
        text, 0, CRYPT_STRING_BASE64_ANY, NULL, &bytes, NULL, NULL
      )) {
    return FALSE;
  }

  blob->pbData = (BYTE *)HeapAlloc(
    GetProcessHeap(), HEAP_ZERO_MEMORY, bytes
  );
  if (!blob->pbData) return FALSE;

  blob->cbData = bytes;
  if (!CryptStringToBinaryA(
        text, 0, CRYPT_STRING_BASE64_ANY,
        blob->pbData, &blob->cbData, NULL, NULL
      )) {
    SecureZeroMemory(blob->pbData, bytes);
    HeapFree(GetProcessHeap(), 0, blob->pbData);
    blob->pbData = NULL;
    blob->cbData = 0;
    return FALSE;
  }

  return TRUE;
}

static BOOL write_base64(const DATA_BLOB *blob) {
  DWORD characters = 0;
  char *output;
  BOOL ok;
  const DWORD flags = CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF;

  if (!CryptBinaryToStringA(
        blob->pbData, blob->cbData, flags, NULL, &characters
      )) {
    return FALSE;
  }

  output = (char *)HeapAlloc(
    GetProcessHeap(), HEAP_ZERO_MEMORY, characters
  );
  if (!output) return FALSE;

  ok = CryptBinaryToStringA(
    blob->pbData, blob->cbData, flags, output, &characters
  );
  if (ok) fputs(output, stdout);

  SecureZeroMemory(output, characters);
  HeapFree(GetProcessHeap(), 0, output);
  return ok;
}

static void clear_blob(DATA_BLOB *blob) {
  if (!blob->pbData) return;
  SecureZeroMemory(blob->pbData, blob->cbData);
  HeapFree(GetProcessHeap(), 0, blob->pbData);
  blob->pbData = NULL;
  blob->cbData = 0;
}

int main(int argc, char **argv) {
  char *payload_line = NULL;
  char *entropy_line = NULL;
  DATA_BLOB input = {0};
  DATA_BLOB entropy = {0};
  DATA_BLOB output = {0};
  DATA_BLOB *entropy_pointer = NULL;
  BOOL success = FALSE;
  int result = 1;

  if (argc != 2 ||
      (strcmp(argv[1], "protect") != 0 &&
       strcmp(argv[1], "unprotect") != 0)) {
    return 2;
  }

  payload_line = read_line();
  entropy_line = read_line();
  if (!payload_line || !entropy_line || payload_line[0] == '\0') {
    result = 2;
    goto cleanup;
  }

  if (!decode_base64(payload_line, &input) ||
      !decode_base64(entropy_line, &entropy)) {
    result = 3;
    goto cleanup;
  }

  if (entropy.cbData > 0) entropy_pointer = &entropy;

  if (strcmp(argv[1], "protect") == 0) {
    success = CryptProtectData(
      &input,
      L"MonitorIA Agent",
      entropy_pointer,
      NULL,
      NULL,
      CRYPTPROTECT_UI_FORBIDDEN | CRYPTPROTECT_LOCAL_MACHINE,
      &output
    );
  } else {
    success = CryptUnprotectData(
      &input,
      NULL,
      entropy_pointer,
      NULL,
      NULL,
      CRYPTPROTECT_UI_FORBIDDEN,
      &output
    );
  }

  if (!success) {
    result = 4;
    goto cleanup;
  }

  result = write_base64(&output) ? 0 : 5;

cleanup:
  if (output.pbData) {
    SecureZeroMemory(output.pbData, output.cbData);
    LocalFree(output.pbData);
  }
  clear_blob(&input);
  clear_blob(&entropy);

  if (payload_line) {
    SecureZeroMemory(payload_line, strlen(payload_line));
    HeapFree(GetProcessHeap(), 0, payload_line);
  }
  if (entropy_line) {
    SecureZeroMemory(entropy_line, strlen(entropy_line));
    HeapFree(GetProcessHeap(), 0, entropy_line);
  }

  return result;
}
