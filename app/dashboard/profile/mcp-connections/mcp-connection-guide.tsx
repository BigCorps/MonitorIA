"use client";

import { useMemo, useState } from "react";
import styles from "./mcp-connections.module.css";

type DiagnosticCheck = {
  id: string;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
};

type DiagnosticsResponse = {
  ok: boolean;
  generatedAt: string;
  canonicalMcpUrl: string;
  protectedResourceMetadataUrl: string;
  authorizationServer: string | null;
  authorizationMetadataUrl: string | null;
  checks: DiagnosticCheck[];
};

function platformIcon(name: "chatgpt" | "claude" | "cursor") {
  if (name === "chatgpt") return "◎";
  if (name === "claude") return "A";
  return "➤";
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function McpConnectionGuide({ mcpUrl }: { mcpUrl: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] =
    useState<DiagnosticsResponse | null>(null);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [checking, setChecking] = useState(false);

  const cursorConfig = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            monitoria: {
              url: mcpUrl,
            },
          },
        },
        null,
        2,
      ),
    [mcpUrl],
  );

  async function copy(value: string, id: string) {
    await copyText(value);
    setCopied(id);
    window.setTimeout(() => setCopied(null), 1800);
  }

  async function runDiagnostics() {
    setChecking(true);
    setDiagnosticError("");

    try {
      const response = await fetch("/api/mcp/diagnostics", {
        cache: "no-store",
      });
      const body = (await response.json()) as DiagnosticsResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error || "diagnostic_failed");
      }

      setDiagnostics(body);
    } catch (error) {
      setDiagnosticError(
        error instanceof Error
          ? error.message
          : "Não foi possível verificar o servidor.",
      );
    } finally {
      setChecking(false);
    }
  }

  const platforms = [
    {
      id: "chatgpt" as const,
      title: "ChatGPT",
      subtitle: "App MCP em modo de desenvolvedor",
      note:
        "Use registro dinâmico. Não selecione “cliente OAuth definido pelo usuário” quando o DCR estiver disponível.",
      href: "https://chatgpt.com",
      steps: [
        "Abra Configurações → Apps e ative o modo de desenvolvedor.",
        "Crie um novo app MCP e informe a URL do MonitorIA.",
        "Em OAuth, escolha o registro automático/dinâmico.",
        "Faça login no MonitorIA, escolha as organizações e autorize.",
        "Execute “Verificar ferramentas” e salve o app como rascunho.",
      ],
    },
    {
      id: "claude" as const,
      title: "Claude",
      subtitle: "Conector personalizado remoto",
      note:
        "Claude aceita Streamable HTTP, OAuth, DCR e também credenciais estáticas quando necessário.",
      href: "https://claude.ai/settings/connectors",
      steps: [
        "Abra Settings → Connectors.",
        "Clique em Add custom connector.",
        "Informe um nome e cole a URL do MonitorIA.",
        "Clique em Add e depois em Connect.",
        "Faça login, selecione as organizações e autorize.",
      ],
    },
    {
      id: "cursor" as const,
      title: "Cursor",
      subtitle: "Servidor MCP remoto para desenvolvimento",
      note:
        "O Cursor abre o fluxo OAuth no navegador quando o servidor remoto exige autenticação.",
      href: "https://cursor.com/settings",
      steps: [
        "Abra Settings → Tools & MCP.",
        "Adicione um novo servidor MCP remoto.",
        "Cole a URL do MonitorIA ou use o mcp.json abaixo.",
        "Ative o servidor e conclua o login OAuth no navegador.",
        "Confirme se as 14 ferramentas aparecem como disponíveis.",
      ],
    },
  ];

  return (
    <>
      <section className={styles.urlCard}>
        <div>
          <span>URL CANÔNICA DO SERVIDOR</span>
          <code>{mcpUrl}</code>
          <p>
            Use exatamente o endereço com <strong>www</strong>. O endereço sem
            www é redirecionado e não deve ser usado como Resource URI.
          </p>
        </div>

        <button type="button" onClick={() => copy(mcpUrl, "url")}>
          {copied === "url" ? "Copiado" : "Copiar URL"}
        </button>
      </section>

      <section className={styles.platformSection}>
        <div className={styles.sectionTitle}>
          <div>
            <span>CONEXÃO MANUAL</span>
            <h2>Plataformas disponíveis</h2>
          </div>
          <small>
            A aprovação nos diretórios não é necessária para os testes privados.
          </small>
        </div>

        <div className={styles.platformGrid}>
          {platforms.map((platform) => (
            <article className={styles.platformCard} key={platform.id}>
              <header>
                <div
                  className={`${styles.platformIcon} ${
                    styles[`${platform.id}Icon`]
                  }`}
                  aria-hidden="true"
                >
                  {platformIcon(platform.id)}
                </div>
                <div>
                  <h3>{platform.title}</h3>
                  <p>{platform.subtitle}</p>
                </div>
                <span className={styles.availableBadge}>TESTE PRIVADO</span>
              </header>

              <ol>
                {platform.steps.map((step, index) => (
                  <li key={step}>
                    <span>{index + 1}</span>
                    <p>{step}</p>
                  </li>
                ))}
              </ol>

              <div className={styles.platformNote}>{platform.note}</div>

              <div className={styles.platformActions}>
                <button
                  type="button"
                  onClick={() => copy(mcpUrl, `${platform.id}-url`)}
                >
                  {copied === `${platform.id}-url`
                    ? "URL copiada"
                    : "Copiar URL"}
                </button>
                <a href={platform.href} target="_blank" rel="noreferrer">
                  Abrir {platform.title}
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cursorConfig}>
        <div>
          <span>CURSOR · CONFIGURAÇÃO MANUAL</span>
          <h2>Arquivo mcp.json</h2>
          <p>
            Salve em <code>.cursor/mcp.json</code> no projeto ou na configuração
            global do Cursor.
          </p>
        </div>
        <pre>{cursorConfig}</pre>
        <button type="button" onClick={() => copy(cursorConfig, "cursor")}>
          {copied === "cursor" ? "Configuração copiada" : "Copiar mcp.json"}
        </button>
      </section>

      <section className={styles.diagnostics}>
        <div className={styles.diagnosticHeader}>
          <div>
            <span>DIAGNÓSTICO TÉCNICO</span>
            <h2>OAuth e servidor MCP</h2>
            <p>
              Verifica o endpoint, o Protected Resource Metadata, PKCE, refresh
              token e o registro dinâmico de clientes.
            </p>
          </div>

          <button
            type="button"
            onClick={runDiagnostics}
            disabled={checking}
          >
            {checking ? "Verificando…" : "Verificar servidor"}
          </button>
        </div>

        {diagnosticError ? (
          <div className={styles.diagnosticError}>{diagnosticError}</div>
        ) : null}

        {diagnostics ? (
          <div className={styles.checkGrid}>
            {diagnostics.checks.map((check) => (
              <article
                key={check.id}
                className={`${styles.checkCard} ${
                  styles[`check_${check.status}`]
                }`}
              >
                <span>
                  {check.status === "ok"
                    ? "✓"
                    : check.status === "warning"
                      ? "!"
                      : "×"}
                </span>
                <div>
                  <h3>{check.label}</h3>
                  <p>{check.detail}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.diagnosticPlaceholder}>
            Execute a verificação antes de tentar cadastrar o conector.
          </div>
        )}
      </section>

      <section className={styles.testPlan}>
        <div className={styles.sectionTitle}>
          <div>
            <span>HOMOLOGAÇÃO</span>
            <h2>Roteiro depois da conexão</h2>
          </div>
        </div>

        <div className={styles.testGrid}>
          {[
            ["1", "Capacidades", "Pergunte quais módulos do MonitorIA estão disponíveis."],
            ["2", "Locais e câmeras", "Liste os locais e depois as câmeras autorizadas."],
            ["3", "Visão da câmera", "Peça o panorama operacional de uma câmera."],
            ["4", "Eventos", "Pesquise acontecimentos nas últimas 24 horas."],
            ["5", "Sessões", "Liste sessões e abra os detalhes de uma delas."],
            ["6", "Estados", "Consulte o estado visual atual e suas transições."],
            ["7", "Resumo", "Peça um resumo operacional do período."],
            ["8", "Comparação", "Compare hoje com o mesmo intervalo de ontem."],
            ["9", "Insights", "Pesquise rotinas, desvios, processos e saúde."],
            ["10", "Evidência", "Solicite uma imagem temporária de um evento."],
            ["11", "Assistente", "Faça uma pergunta aberta usando ask_monitoria."],
            ["12", "Revogação", "Revogue a conexão e confirme que o acesso é bloqueado."],
          ].map(([number, title, description]) => (
            <article key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
