import Link from "next/link";

const features = [
  {
    number: "01",
    title: "Eventos em vez de horas de vídeo",
    text: "O agente local detecta mudanças, agrupa acontecimentos e envia somente os quadros que realmente importam.",
  },
  {
    number: "02",
    title: "Pesquisa em linguagem natural",
    text: "Encontre pessoas por roupas e cores, veículos, objetos, zonas e possíveis placas sem assistir à gravação inteira.",
  },
  {
    number: "03",
    title: "Retenção inteligente",
    text: "Frames temporários por poucos dias, um keyframe por evento e metadados pesquisáveis por até um ano.",
  },
];

const timeline = [
  { time: "09:06:20", title: "Pessoa entrou pela porta principal", tag: "Entrada" },
  { time: "09:07:04", title: "Pessoa se dirigiu ao balcão", tag: "Atendimento" },
  { time: "09:14:18", title: "Veículo branco chegou à área externa", tag: "Veículo" },
  { time: "09:18:42", title: "Objeto retirado do balcão", tag: "Objeto" },
];

function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <img src="/favicon.svg" alt="" width={25} height={25} />
    </span>
  );
}

export default function HomePage() {
  return (
    <main className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="site-header container">
        <Link className="brand" href="/" aria-label="MonitorIA — página inicial">
          <LogoMark />
          <span>Monitor<span>IA</span></span>
        </Link>
        <nav className="header-nav" aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#estrutura">Estrutura</a>
          <Link className="button button-ghost" href="/dashboard">Abrir painel</Link>
        </nav>
      </header>

      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow"><span /> MVP em desenvolvimento</div>
          <h1>Sua câmera vê.<br /><strong>A IA lembra.</strong></h1>
          <p>
            Transforme câmeras comuns em uma memória visual pesquisável. Encontre em segundos
            o que aconteceu há dias ou meses, sem assistir horas de gravação.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/dashboard">
              Conhecer o painel
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
            </Link>
            <a className="button button-secondary" href="#como-funciona">Ver como funciona</a>
          </div>
          <div className="proof-row">
            <div><strong>RTSP</strong><span>Câmeras existentes</span></div>
            <div><strong>365 dias</strong><span>Metadados pesquisáveis</span></div>
            <div><strong>GPT-5 mini</strong><span>Análise estruturada</span></div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Exemplo visual da linha do tempo inteligente">
          <div className="visual-topbar">
            <div className="camera-name"><i /> Câmera · Entrada principal</div>
            <span className="live-badge">AO VIVO</span>
          </div>
          <div className="camera-frame">
            <div className="scan-grid" />
            <div className="zone zone-entry"><span>ENTRADA</span></div>
            <div className="zone zone-counter"><span>BALCÃO</span></div>
            <div className="person person-one"><span /></div>
            <div className="person person-two"><span /></div>
            <div className="camera-overlay">
              <span>28/07/2026</span><strong>09:18:42</strong>
            </div>
          </div>
          <div className="event-card">
            <div className="event-icon">
              <svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18" /></svg>
            </div>
            <div><span>Evento identificado</span><strong>Objeto retirado do balcão</strong></div>
            <time>09:18:42</time>
          </div>
          <div className="search-pill">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
            <span>“Quando o objeto saiu do balcão?”</span>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="section container">
        <div className="section-heading">
          <span>Como funciona</span>
          <h2>Vídeo bruto entra.<br />Informação útil sai.</h2>
          <p>O vídeo integral continua no local. A nuvem recebe apenas o necessário para tornar os acontecimentos pesquisáveis.</p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <span className="feature-number">{feature.number}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="estrutura" className="section container architecture-section">
        <div className="architecture-copy">
          <span className="section-kicker">Linha do tempo inteligente</span>
          <h2>Não procure no vídeo.<br />Procure no que aconteceu.</h2>
          <p>
            Eventos estruturados permitem filtrar por horário, tipo de situação, cores,
            objetos, veículos e zonas. A IA organiza a resposta e aponta o período que merece verificação.
          </p>
          <ul className="check-list">
            <li>Sem reconhecimento facial no MVP</li>
            <li>Placas tratadas somente como sugestão</li>
            <li>Credenciais RTSP permanecem no agente local</li>
            <li>Metadados isolados por organização com RLS</li>
          </ul>
        </div>
        <div className="timeline-panel">
          <div className="panel-header">
            <div><span>Hoje</span><strong>Eventos recentes</strong></div>
            <button type="button">Filtrar</button>
          </div>
          <div className="timeline-list">
            {timeline.map((item, index) => (
              <div className="timeline-item" key={`${item.time}-${item.title}`}>
                <div className="timeline-rail"><span className={index === 3 ? "active" : ""} /></div>
                <time>{item.time}</time>
                <div><strong>{item.title}</strong><span>{item.tag}</span></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section container">
        <div>
          <span>MonitorIA · Fundação do MVP</span>
          <h2>A base está pronta.<br />Agora vamos ligar a primeira câmera.</h2>
        </div>
        <Link className="button button-light" href="/dashboard">Acessar painel inicial</Link>
      </section>

      <footer className="site-footer container">
        <div className="brand footer-brand"><LogoMark /><span>Monitor<span>IA</span></span></div>
        <p>Uma solução BigCorps · Sua câmera vê. A IA lembra.</p>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
