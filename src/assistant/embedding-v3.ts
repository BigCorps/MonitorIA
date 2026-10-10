import OpenAI from "openai";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_TEXT_VERSION = 1;
// Published standard price, configurable rollout estimates should be rechecked.
export const EMBEDDING_USD_PER_MILLION_TOKENS = 0.02;
export const estimateEmbeddingCost = (tokens: number) => tokens * EMBEDDING_USD_PER_MILLION_TOKENS / 1_000_000;

const concepts: Array<[string, RegExp]> = [
  ["entrega", /entreg|delivery|encomenda|remessa|recebimento/i],
  ["pacote", /pacot|encomenda|caixa|volume/i],
  ["pessoa", /pessoa|person|cliente|visitante|funcion|entregador|crianc|criança|adult/i],
  ["crianca", /crianc|criança|infantil|bebe|bebê/i], ["adulto", /adult/i],
  ["veiculo", /veicul|veícul|carro|moto|vehicle/i], ["objeto", /objet|object/i],
  ["retirada", /retir|remov|removed/i], ["entrada", /entrad|entrou|entry/i],
  ["saida", /saída|saida|saiu|exit/i], ["atendimento", /atend|service/i],
  ["fila", /fila|queue|espera/i], ["porta", /porta|door/i],
  ["balcao", /balcão|balcao|counter/i], ["movimento", /moviment|motion|activity/i],
  ["intrusao", /intrus|intrusion/i], ["mudanca", /mudan|change/i],
  ["capacete", /capacete|helmet/i], ["mochila", /mochila|backpack/i],
  ["bicicleta", /biciclet|bicycle/i], ["animal", /animal|cachorro|gato/i],
  ["caminhao", /caminhão|caminhao|truck/i],
];
const safeWords = new Set(["acontecimento", "atividade", ...concepts.map(([word]) => word)]);

/** Intent projection, not PII redaction by best effort. No free-text token is sent. */
export function projectEmbeddingQuery(query: string): string | null {
  // Negation / exact phrases must retain lexical semantics rather than be widened.
  const clean = query.replace(/@time=\d{2}:\d{2}-\d{2}:\d{2}/g, " ").replace(/@important/gi, " ");
  if (/\b(n[aã]o|sem|exceto|menos|not|nenhum[a]?|ningu[eé]m|nunca|nem|aus[eê]ncia)\b|["-]/i.test(clean)) return null;
  const words = concepts.filter(([, pattern]) => pattern.test(clean)).map(([word]) => word).sort();
  return words.length ? `acontecimento ${words.join(" ")}` : null;
}

export function isSafeEmbeddingText(text: string): boolean {
  return text.length > 0 && Buffer.byteLength(text, "utf8") <= 1024 &&
    text.split(" ").every((word) => safeWords.has(word)) && text.startsWith("acontecimento ");
}

export function validEmbedding(vector: unknown): vector is number[] {
  return Array.isArray(vector) && vector.length === EMBEDDING_DIMENSIONS &&
    vector.every((v) => typeof v === "number" && Number.isFinite(v)) && vector.some((v) => v !== 0);
}
export type EmbeddingBatch = { vectors: number[][]; tokens: number; costUsd: number };
export type EmbedTexts = (texts: string[], timeoutMs?: number) => Promise<EmbeddingBatch>;

/** Existing server credential contract. No automatic SDK retries or live calls in tests. */
export const embedTexts: EmbedTexts = async (texts, timeoutMs = 1000) => {
  if (!texts.length || texts.length > 16 || !texts.every(isSafeEmbeddingText)) throw new Error("embedding_input_invalid");
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("embedding_provider_unavailable");
  const client = new OpenAI({ apiKey: key, maxRetries: 0, timeout: timeoutMs });
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS, input: texts, encoding_format: "float",
  }, { signal: AbortSignal.timeout(timeoutMs) });
  const ordered = [...response.data].sort((a, b) => a.index - b.index);
  if (response.model !== EMBEDDING_MODEL || ordered.length !== texts.length ||
    ordered.some((row, index) => row.index !== index || !validEmbedding(row.embedding))) throw new Error("embedding_response_invalid");
  const tokens = response.usage.total_tokens;
  if (!Number.isFinite(tokens) || tokens < 0) throw new Error("embedding_usage_invalid");
  return { vectors: ordered.map((r) => r.embedding), tokens, costUsd: estimateEmbeddingCost(tokens) };
};
