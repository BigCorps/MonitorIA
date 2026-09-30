import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const privacy = readFileSync(
  "app/integrations/monitoria-mcp/privacy/page.tsx",
  "utf8",
);
const terms = readFileSync(
  "app/integrations/monitoria-mcp/terms/page.tsx",
  "utf8",
);

test("política MCP cobre os cinco blocos exigidos na revisão pública", () => {
  assert.match(privacy, /Dados que o conector pode tratar/);
  assert.match(privacy, /Finalidades de uso/);
  assert.match(privacy, /Destinatários e compartilhamento/);
  assert.match(privacy, /Retenção/);
  assert.match(privacy, /Controles do usuário/);
});

test("política MCP descreve entradas e resultados reais das ferramentas", () => {
  assert.match(privacy, /ask_monitoria/);
  assert.match(privacy, /organização, local,\s*câmera, evento ou sessão/);
  assert.match(privacy, /Evidências visuais/);
  assert.match(privacy, /pessoas e veículos observados/);
  assert.match(privacy, /provável criança/);
  assert.match(privacy, /não determinado/);
});

test("política MCP explicita minimização, auditoria e ausência de chat completo", () => {
  assert.match(
    privacy,
    /não solicita, reconstrói nem importa o histórico\s+completo da conversa/,
  );
  assert.match(privacy, /hash criptográfico dos argumentos/);
  assert.match(
    privacy,
    /texto integral dos\s+argumentos e o conteúdo integral da resposta não são copiados/,
  );
  assert.match(privacy, /somente leitura/);
});

test("política MCP publica retenções concretas", () => {
  assert.match(privacy, /até <strong>90 dias<\/strong>/);
  assert.match(privacy, /aproximadamente <strong>5 minutos<\/strong>/);
  assert.match(privacy, /3 dias/);
  assert.match(privacy, /365 dias/);
  assert.match(privacy, /30 dias/);
  assert.match(privacy, /Concessões OAuth/);
});

test("política MCP explica destinatário ChatGPT e revogação", () => {
  assert.match(privacy, /quando a conexão é feita pelo ChatGPT/);
  assert.match(privacy, /OpenAI/);
  assert.match(privacy, /Subprocessadores/);
  assert.match(privacy, /Perfil e empresa → Conexões MCP/);
  assert.match(privacy, /revogação interrompe o acesso futuro imediatamente/i);
});

test("termos MCP não contêm mais aviso interno de revisão jurídica", () => {
  assert.doesNotMatch(
    terms,
    /deve ser revisado juridicamente antes da submissão pública final/i,
  );
  assert.match(terms, /Somente leitura/);
  assert.match(terms, /Dados restritos e credenciais/);
  assert.match(terms, /Política de Privacidade do MonitorIA MCP/);
});
