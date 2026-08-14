#!/usr/bin/env node
/**
 * Atualiza a versão do MonitorIA Agent em todos os pontos do repositório.
 *
 * A versão do Agent aparece em nove arquivos, de package.json a workflow do
 * Actions, passando por fallback de rota e asserção de teste. Esquecer um
 * ponto costuma aparecer tarde: no melhor caso o `npm test` quebra, no pior
 * o painel recomenda uma versão que não existe mais.
 *
 * Uso:
 *   node scripts/bump-agent-version.mjs 1.0.0
 *   node scripts/bump-agent-version.mjs 1.0.0 --dry-run
 *   node scripts/bump-agent-version.mjs --check
 *
 * Opções:
 *   --dry-run   mostra o que mudaria, sem escrever
 *   --check     não altera nada; só verifica se a versão está consistente
 *   --force     permite versão menor ou igual à atual (rollback)
 *
 * A versão de referência é sempre `agent/package.json`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Cada alvo declara quantas ocorrências são esperadas. O número não é
 * decoração: se um arquivo passar a ter mais ou menos ocorrências do que o
 * previsto, alguém mexeu na estrutura e o bump cego deixaria de ser seguro.
 */
const ALVOS = [
  { arquivo: "agent/package.json", ocorrencias: 2, nota: 'campo "version" e --windows-version' },
  { arquivo: "agent/src/service.ts", ocorrencias: 1, nota: "AGENT_VERSION" },
  { arquivo: ".github/workflows/build-agent.yml", ocorrencias: 1, nota: "env.AGENT_VERSION" },
  { arquivo: ".github/workflows/build-agent-linux.yml", ocorrencias: 1, nota: "env.AGENT_VERSION" },
  { arquivo: "test/agent-0102-production.test.ts", ocorrencias: 5, nota: "3 asserções + 2 regex escapados dos workflows" },
  { arquivo: "test/agent-0106-auto-discovery.test.ts", ocorrencias: 1, nota: "título do teste" },
  { arquivo: "src/lib/support-diagnostics.ts", ocorrencias: 1, nota: "fallback de AGENT_RECOMMENDED_VERSION" },
  { arquivo: "src/lib/installer-data.ts", ocorrencias: 1, nota: "fallback de AGENT_RECOMMENDED_VERSION" },
  { arquivo: "app/api/cron/operations/route.ts", ocorrencias: 1, nota: "fallback de AGENT_RECOMMENDED_VERSION" },
  { arquivo: "installer/monitoria.iss", ocorrencias: 1, nota: "exemplo de /DAppVersion no cabeçalho" },
  { arquivo: "docs/MICROSOFT-STORE.md", ocorrencias: null, nota: "documentação e URL da release" },
];

/** Não varre: histórico, dependências, artefatos e resíduos. */
const IGNORAR_DIR = new Set([
  ".git", "node_modules", ".next", "dist", "build", ".vercel",
  ".monitoria-backups", "MonitorIA-Store-Trial", "Nova pasta (9)",
]);

const IGNORAR_ARQUIVO = new Set([
  "package-lock.json", "bun.lockb", "tsconfig.tsbuildinfo",
]);

const EXT_TEXTO = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".yml", ".yaml",
  ".md", ".txt", ".iss", ".xml", ".ps1", ".sh", ".sql", ".example",
]);

const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * A versão aparece em duas formas no repositório.
 *
 * A literal (`0.15.3`) é a óbvia. A outra é a escapada para regex
 * (`0\.15\.3`), usada em `test/agent-0102-production.test.ts` para conferir o
 * conteúdo dos workflows. Substituição literal não encontra a segunda, e o
 * bump passava despercebido até o `npm test` quebrar com uma mensagem que não
 * deixa claro que o problema é de versão.
 *
 * A escapada vem primeiro: ela contém barras invertidas, então nunca colide
 * com a busca literal, mas a ordem deixa a intenção explícita.
 */
function formasDe(versao) {
  return [versao.split(".").join("\\."), versao];
}

function contar(conteudo, versao) {
  return formasDe(versao).reduce(
    (total, forma) => total + conteudo.split(forma).length - 1,
    0,
  );
}

function substituir(conteudo, atual, nova) {
  const de = formasDe(atual);
  const para = formasDe(nova);
  let saida = conteudo;
  for (let i = 0; i < de.length; i++) {
    saida = saida.split(de[i]).join(para[i]);
  }
  return saida;
}

const cor = {
  reset: "\x1b[0m", vermelho: "\x1b[31m", verde: "\x1b[32m",
  amarelo: "\x1b[33m", ciano: "\x1b[36m", cinza: "\x1b[90m",
};

function comparar(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function versaoAtual() {
  const caminho = join(RAIZ, "agent/package.json");
  const pkg = JSON.parse(readFileSync(caminho, "utf8"));
  if (!SEMVER.test(pkg.version)) {
    throw new Error(`agent/package.json tem versão inválida: "${pkg.version}"`);
  }
  return pkg.version;
}

async function* arquivosDoRepo(dir = RAIZ) {
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (IGNORAR_DIR.has(entrada.name)) continue;
      yield* arquivosDoRepo(caminho);
      continue;
    }
    if (IGNORAR_ARQUIVO.has(entrada.name)) continue;
    if (!EXT_TEXTO.has(extname(entrada.name))) continue;
    yield caminho;
  }
}

/** Varre o repositório inteiro atrás de sobras da versão antiga. */
async function varrer(versao) {
  const alvos = new Set(ALVOS.map((a) => a.arquivo));
  const encontrados = [];

  for await (const caminho of arquivosDoRepo()) {
    const rel = relative(RAIZ, caminho).split("\\").join("/");
    let conteudo;
    try {
      conteudo = await readFile(caminho, "utf8");
    } catch {
      continue;
    }
    const formas = formasDe(versao);
    if (!formas.some((f) => conteudo.includes(f))) continue;

    const linhas = [];
    conteudo.split("\n").forEach((linha, i) => {
      if (formas.some((f) => linha.includes(f))) {
        linhas.push({ numero: i + 1, texto: linha.trim().slice(0, 100) });
      }
    });

    encontrados.push({ arquivo: rel, declarado: alvos.has(rel), linhas });
  }

  return encontrados;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const check = args.includes("--check");
  const force = args.includes("--force");
  const nova = args.find((a) => !a.startsWith("--"));

  const atual = versaoAtual();

  // ---------------------------------------------------------------- --check
  if (check) {
    console.log(`\nVersão de referência: ${cor.ciano}${atual}${cor.reset}  ${cor.cinza}(agent/package.json)${cor.reset}\n`);

    let problemas = 0;
    for (const alvo of ALVOS) {
      let conteudo;
      try {
        conteudo = readFileSync(join(RAIZ, alvo.arquivo), "utf8");
      } catch {
        console.log(`  ${cor.vermelho}ausente${cor.reset}  ${alvo.arquivo}`);
        problemas++;
        continue;
      }
      const n = contar(conteudo, atual);
      const esperado = alvo.ocorrencias;
      const ok = esperado === null ? n > 0 : n === esperado;
      const marca = ok ? `${cor.verde}ok${cor.reset}     ` : `${cor.vermelho}difere${cor.reset} `;
      const detalhe = esperado === null ? `${n}` : `${n}/${esperado}`;
      console.log(`  ${marca} ${alvo.arquivo} ${cor.cinza}(${detalhe} — ${alvo.nota})${cor.reset}`);
      if (!ok) problemas++;
    }

    const sobras = (await varrer(atual)).filter((f) => !f.declarado);
    if (sobras.length) {
      console.log(`\n${cor.amarelo}Fora da lista de alvos:${cor.reset}`);
      for (const f of sobras) {
        console.log(`  ${f.arquivo} ${cor.cinza}(linha${f.linhas.length > 1 ? "s" : ""} ${f.linhas.map((l) => l.numero).join(", ")})${cor.reset}`);
      }
      console.log(`${cor.cinza}  Se algum destes precisa acompanhar a versão, adicione em ALVOS.${cor.reset}`);
    }

    if (problemas) {
      console.log(`\n${cor.vermelho}${problemas} inconsistência(s).${cor.reset}\n`);
      process.exit(1);
    }
    console.log(`\n${cor.verde}Versão consistente em todos os alvos.${cor.reset}\n`);
    return;
  }

  // ------------------------------------------------------------------ bump
  if (!nova) {
    console.error(`\n${cor.vermelho}Informe a versão nova.${cor.reset}\n`);
    console.error(`  node scripts/bump-agent-version.mjs 1.0.0`);
    console.error(`  node scripts/bump-agent-version.mjs --check\n`);
    console.error(`Versão atual: ${atual}\n`);
    process.exit(1);
  }

  if (!SEMVER.test(nova)) {
    console.error(`\n${cor.vermelho}Versão inválida: "${nova}". Use X.Y.Z, sem prefixo e sem sufixo.${cor.reset}\n`);
    process.exit(1);
  }

  if (nova === atual) {
    console.error(`\n${cor.amarelo}A versão já é ${atual}. Nada a fazer.${cor.reset}\n`);
    process.exit(1);
  }

  if (comparar(nova, atual) < 0 && !force) {
    console.error(`\n${cor.vermelho}${nova} é menor que a atual ${atual}.${cor.reset}`);
    console.error(`Use --force se o rollback for intencional.\n`);
    process.exit(1);
  }

  console.log(`\n${cor.ciano}${atual}${cor.reset} → ${cor.ciano}${nova}${cor.reset}${dryRun ? `  ${cor.amarelo}(dry-run)${cor.reset}` : ""}\n`);

  const erros = [];
  const aplicados = [];

  for (const alvo of ALVOS) {
    const caminho = join(RAIZ, alvo.arquivo);
    let conteudo;
    try {
      conteudo = readFileSync(caminho, "utf8");
    } catch {
      erros.push(`${alvo.arquivo}: arquivo não encontrado`);
      continue;
    }

    const n = contar(conteudo, atual);

    if (n === 0) {
      erros.push(`${alvo.arquivo}: nenhuma ocorrência de ${atual} (esperado ${alvo.ocorrencias ?? "1+"})`);
      continue;
    }

    if (alvo.ocorrencias !== null && n !== alvo.ocorrencias) {
      erros.push(`${alvo.arquivo}: ${n} ocorrência(s), esperado ${alvo.ocorrencias}. O arquivo mudou de estrutura — revise antes de rodar de novo.`);
      continue;
    }

    aplicados.push({ caminho, alvo, n, novo: substituir(conteudo, atual, nova) });
  }

  if (erros.length) {
    console.error(`${cor.vermelho}Nada foi escrito. Problemas encontrados:${cor.reset}\n`);
    for (const erro of erros) console.error(`  - ${erro}`);
    console.error("");
    process.exit(1);
  }

  for (const item of aplicados) {
    if (!dryRun) writeFileSync(item.caminho, item.novo, "utf8");
    console.log(`  ${cor.verde}${String(item.n).padStart(2)}×${cor.reset}  ${item.alvo.arquivo} ${cor.cinza}— ${item.alvo.nota}${cor.reset}`);
  }

  const total = aplicados.reduce((s, i) => s + i.n, 0);
  console.log(`\n  ${total} substituição(ões) em ${aplicados.length} arquivo(s).`);

  if (dryRun) {
    console.log(`\n${cor.amarelo}Dry-run: nenhum arquivo foi alterado.${cor.reset}\n`);
    return;
  }

  // ------------------------------------------------------------- verificação
  const sobras = await varrer(atual);
  if (sobras.length) {
    console.log(`\n${cor.amarelo}Ainda existem referências a ${atual}:${cor.reset}`);
    for (const f of sobras) {
      console.log(`\n  ${f.arquivo}`);
      for (const l of f.linhas) {
        console.log(`    ${cor.cinza}${String(l.numero).padStart(4)}:${cor.reset} ${l.texto}`);
      }
    }
    console.log(`\n${cor.cinza}  Documentação histórica pode manter a versão antiga de propósito.`);
    console.log(`  Se algum destes precisa acompanhar o bump, adicione em ALVOS.${cor.reset}`);
  } else {
    console.log(`  ${cor.verde}Nenhuma referência a ${atual} restou no repositório.${cor.reset}`);
  }

  console.log(`
${cor.ciano}Próximos passos${cor.reset}

  1. npm run check && npm test
  2. git diff
  3. git commit -am "agent: ${nova}"
  4. git push origin main
  5. Conferir o summary do Actions: dois instaladores, ambos Valid
  6. git tag agent-v${nova} && git push origin agent-v${nova}
  7. Baixar o MonitorIA-Store-Setup.exe da release
  8. scripts\\validar-instalador-store.ps1 em VM limpa
  9. Partner Center → produto → Update → nova Installer URL:
     ${cor.cinza}https://github.com/BigCorps/MonitorIA/releases/download/agent-v${nova}/MonitorIA-Store-Setup.exe${cor.reset}

${cor.amarelo}Não esqueça${cor.reset}
  - AGENT_RECOMMENDED_VERSION na Vercel, se estiver definida, precisa virar
    ${nova}. Os fallbacks do código só valem quando a variável não existe.
  - Manter a URL da ${atual} no ar até a ${nova} ser publicada na Store.
`);
}

main().catch((erro) => {
  console.error(`\n${cor.vermelho}${erro.message}${cor.reset}\n`);
  process.exit(1);
});
