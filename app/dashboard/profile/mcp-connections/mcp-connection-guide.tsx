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

const iconSvgStyle = { width: "1em", height: "1em", display: "block" } as const;

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      style={iconSvgStyle}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      style={iconSvgStyle}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4.5 1.5L21.5 8.5L12.5 11.5L9.5 20.5L4.5 1.5Z" />
    </svg>
  );
}

function ChatGPTIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      style={iconSvgStyle}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.032.067L9.74 19.946a4.5 4.5 0 0 1-6.14-1.642zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0L4.075 14.02A4.5 4.5 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387 2.02-1.168a.076.076 0 0 1 .071 0l4.742 2.738a4.5 4.5 0 0 1-.695 8.118v-5.681a.79.79 0 0 0-.305-.62zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.74-2.738a4.5 4.5 0 0 1 6.69 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  );
}

function platformIcon(name: "chatgpt" | "claude" | "cursor") {
  if (name === "chatgpt") return <ChatGPTIcon />;
  if (name === "claude") return <ClaudeIcon />;
  return <CursorIcon />;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function McpConnectionGuide({ mcpUrl }: { mcpUrl: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(
    null,
  );
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
      note: "Use registro dinâmico. Não selecione “cliente OAuth definido pelo usuário” quando o DCR estiver disponível.",
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
      note: "Claude aceita Streamable HTTP, OAuth, DCR e também credenciais estáticas quando necessário.",
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
      note: "O Cursor abre o fluxo OAuth no navegador quando o servidor remoto exige autenticação.",
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
            Use exatamente este endereço, <strong>sem www</strong>, como
            Resource URI.
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

          <button type="button" onClick={runDiagnostics} disabled={checking}>
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
            [
              "1",
              "Capacidades",
              "Pergunte quais módulos do MonitorIA estão disponíveis.",
            ],
            [
              "2",
              "Locais e câmeras",
              "Liste os locais e depois as câmeras autorizadas.",
            ],
            [
              "3",
              "Visão da câmera",
              "Peça o panorama operacional de uma câmera.",
            ],
            ["4", "Eventos", "Pesquise acontecimentos nas últimas 24 horas."],
            ["5", "Sessões", "Liste sessões e abra os detalhes de uma delas."],
            [
              "6",
              "Estados",
              "Consulte o estado visual atual e suas transições.",
            ],
            ["7", "Resumo", "Peça um resumo operacional do período."],
            ["8", "Comparação", "Compare hoje com o mesmo intervalo de ontem."],
            ["9", "Insights", "Pesquise rotinas, desvios, processos e saúde."],
            ["10", "Evidência", "Solicite uma imagem temporária de um evento."],
            [
              "11",
              "Assistente",
              "Faça uma pergunta aberta usando ask_monitoria.",
            ],
            [
              "12",
              "Revogação",
              "Revogue a conexão e confirme que o acesso é bloqueado.",
            ],
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
