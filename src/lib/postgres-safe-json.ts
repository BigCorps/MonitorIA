/**
 * PostgreSQL jsonb não aceita U+0000 e também rejeita pares surrogate
 * inválidos. Modelos/firmwares podem produzir essas sequências em nomes ou
 * descrições; elas nunca podem derrubar a persistência de um acontecimento.
 */
export function sanitizePostgresText(value: string) {
  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        output += value[index] ?? "";
        output += value[index + 1] ?? "";
        index += 1;
      } else {
        output += "�";
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "�";
      continue;
    }
    output += value[index] ?? "";
  }
  return output;
}

export function sanitizePostgresJson<T>(value: T): T {
  if (typeof value === "string") return sanitizePostgresText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizePostgresJson(item)) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[sanitizePostgresText(key)] = sanitizePostgresJson(item);
    }
    return output as T;
  }
  return value;
}
