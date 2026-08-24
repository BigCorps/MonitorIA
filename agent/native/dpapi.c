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

/*
 * Base64 próprio para a saída do helper.
 *
 * Em campo, CryptUnprotectData retornou sucesso sob LocalSystem, porém
 * CryptBinaryToStringA falhou ao serializar o plaintext e o helper terminou
 * com exit code 5. Isso fazia o Agent interpretar um token íntegro como se a
 * entropia tivesse mudado.
 *
 * A decodificação de entrada continua usando CryptStringToBinaryA (ela foi
 * comprovadamente bem-sucedida); somente a serialização de saída deixa de
 * depender de CryptBinaryToStringA.
 */
static BOOL write_base64(const DATA_BLOB *blob) {
  static const char table[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const SIZE_T input_length = (SIZE_T)blob->cbData;
  const SIZE_T output_length = ((input_length + 2) / 3) * 4;
  char *output;
  SIZE_T i = 0;
  SIZE_T j = 0;
  BOOL ok;

  if (input_length > 0 && !blob->pbData) return FALSE;

  /*
   * O helper limita a entrada textual a 1 MiB; esta checagem evita overflow
   * e alocação inesperada caso a API do Windows devolva um blob anômalo.
   */
  if (input_length > 1024 * 1024) return FALSE;
  if (output_length > (SIZE_T)-2) return FALSE;

  output = (char *)HeapAlloc(
    GetProcessHeap(), HEAP_ZERO_MEMORY, output_length + 1
  );
  if (!output) return FALSE;

  while (i + 2 < input_length) {
    const unsigned int value =
      ((unsigned int)blob->pbData[i] << 16) |
      ((unsigned int)blob->pbData[i + 1] << 8) |
      (unsigned int)blob->pbData[i + 2];

    output[j++] = table[(value >> 18) & 0x3F];
    output[j++] = table[(value >> 12) & 0x3F];
    output[j++] = table[(value >> 6) & 0x3F];
    output[j++] = table[value & 0x3F];
    i += 3;
  }

  if (i < input_length) {
    const unsigned int first = (unsigned int)blob->pbData[i];
    const unsigned int second =
      (i + 1 < input_length) ? (unsigned int)blob->pbData[i + 1] : 0;
    const unsigned int value = (first << 16) | (second << 8);

    output[j++] = table[(value >> 18) & 0x3F];
    output[j++] = table[(value >> 12) & 0x3F];

    if (i + 1 < input_length) {
      output[j++] = table[(value >> 6) & 0x3F];
    } else {
      output[j++] = '=';
    }

    output[j++] = '=';
  }

  output[j] = '\0';

  ok =
    fwrite(output, 1, output_length, stdout) == output_length &&
    fflush(stdout) == 0;

  SecureZeroMemory(output, output_length + 1);
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
