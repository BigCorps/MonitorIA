import Link from "next/link";

const metrics = [
  { label: "Câmeras", value: "0", helper: "Aguardando configuração" },
  { label: "Agentes online", value: "0", helper: "Nenhum agente instalado" },
  { label: "Eventos hoje", value: "0", helper: "A linha do tempo está vazia" },
  { label: "Uso estimado", value: "R$ 0,00", helper: "COGS visual no mês" },
];

const steps = [
  { title: "Cadastre o local", text: "Crie a primeira unidade e defina o fuso horário." },
  { title: "Adicione a câmera", text: "Nomeie a câmera e configure o perfil de monitoramento." },
  { title: "Instale o agente", text: "O Agent conecta ao RTSP e envia somente eventos relevantes." },
];

function SmallLogo() {
  return (
    <span className="dashboard-logo-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48"><path d="M24 6c8.7 0 15.9 6.1 18 14.2-2.1 8.1-9.3 14.2-18 14.2S8.1 28.3 6 20.2C8.1 12.1 15.3 6 24 6Z" /><circle cx="24" cy="20.2" r="6.6" /></svg>
    </span>
  );
}

export const metadata = { title: "Painel inicial" };

export default function DashboardPage() {
  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link href="/" className="dashboard-brand"><SmallLogo /><span>Monitor<span>IA</span></span></Link>
        <nav>
          <a className="active" href="#visao-geral"><span>⌂</span> Visão geral</a>
          <a href="#cameras"><span>◉</span> Câmeras</a>
          <a href="#eventos"><span>≋</span> Eventos</a>
          <a href="#pesquisa"><span>⌕</span> Pesquisa</a>
          <a href="#agentes"><span>◆</span> Agentes</a>
        </nav>
        <div className="sidebar-footer">
          <span className="dev-dot" /> Ambiente de desenvolvimento
        </div>
      </aside>

      <section className="dashboard-content" id="visao-geral">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">VISÃO GERAL</span>
            <h1>Bom dia. Vamos configurar o MonitorIA.</h1>
            <p>A fundação do painel está publicada e pronta para receber autenticação e dados reais.</p>
          </div>
          <Link href="/" className="back-link">Ver apresentação ↗</Link>
        </header>

        <div className="metric-grid">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.helper}</small>
            </article>
          ))}
        </div>

        <div className="dashboard-grid">
          <section className="empty-panel" id="cameras">
            <div className="panel-title-row">
              <div><span>PRIMEIROS PASSOS</span><h2>Conecte a primeira câmera</h2></div>
              <span className="status-chip">0 de 3</span>
            </div>
            <div className="steps-list">
              {steps.map((step, index) => (
                <article key={step.title}>
                  <span>{index + 1}</span>
                  <div><strong>{step.title}</strong><p>{step.text}</p></div>
                </article>
              ))}
            </div>
            <button type="button" disabled>Configuração disponível na próxima etapa</button>
          </section>

          <section className="health-panel" id="agentes">
            <div className="panel-title-row">
              <div><span>INFRAESTRUTURA</span><h2>Saúde do sistema</h2></div>
              <span className="online-chip"><i /> Operacional</span>
            </div>
            <div className="health-list">
              <div><span>Aplicação web</span><strong>Online</strong></div>
              <div><span>Banco de dados</span><strong>Preparado</strong></div>
              <div><span>Storage privado</span><strong>Preparado</strong></div>
              <div><span>Agente local</span><strong className="muted">Não instalado</strong></div>
              <div><span>Análise GPT-5 mini</span><strong className="muted">Não configurada</strong></div>
            </div>
            <a href="/api/health" target="_blank" rel="noreferrer">Abrir endpoint de saúde →</a>
          </section>
        </div>

        <section className="event-empty" id="eventos">
          <div className="event-empty-icon">≋</div>
          <div><h2>Nenhum evento recebido</h2><p>Quando o Agent estiver conectado, os acontecimentos aparecerão aqui em ordem cronológica.</p></div>
          <span>Timeline vazia</span>
        </section>
      </section>
    </main>
  );
}
