import Link from "next/link";

const WHATSAPP =
  "https://wa.me/5511926828418?text=" +
  encodeURIComponent(
    "Olá! Quero saber mais sobre o MonitorIA para as câmeras do meu negócio."
  );

const steps = [
  {
    number: "01",
    title: "Você conecta as câmeras que já tem",
    text: "Um programa roda no computador da sua loja e conversa com o seu DVR. Suas gravações continuam onde sempre estiveram.",
  },
  {
    number: "02",
    title: "O MonitorIA anota o que acontece",
    text: "Enquanto está tudo parado, nada é registrado. Quando alguém entra, um carro chega ou algo sai do lugar, ele anota o horário e descreve o que viu.",
  },
  {
    number: "03",
    title: "Você pergunta com suas palavras",
    text: "Em vez de rebobinar duas horas de vídeo, pergunte o que quer saber e receba o horário exato para conferir.",
  },
];

const questions = [
  { q: "Quantos clientes entraram hoje?", tag: "Movimento" },
  { q: "A que horas a loja abriu ontem?", tag: "Operação" },
  { q: "Qual foi o horário de pico desta semana?", tag: "Operação" },
  { q: "Teve movimento depois que fechamos?", tag: "Segurança" },
  { q: "A que horas o carro branco chegou?", tag: "Segurança" },
  { q: "O sábado foi mais movimentado que o anterior?", tag: "Movimento" },
];

const timeline = [
  { time: "08:12:04", title: "Loja aberta, primeira movimentação no balcão", tag: "Abertura" },
  { time: "09:06:20", title: "Cliente entrou pela porta principal", tag: "Entrada" },
  { time: "09:14:18", title: "Carro branco parou em frente à loja", tag: "Veículo" },
  { time: "19:47:02", title: "Movimento no balcão depois do fechamento", tag: "Fora de horário" },
];

const plans = [
  {
    badge: "Base",
    title: "Local",
    text: "Suas câmeras registram acontecimentos, você pesquisa em português e o histórico fica guardado por 12 meses.",
    items: ["Registro de acontecimentos", "Busca por horário e por área", "Histórico de 12 meses"],
  },
  {
    badge: "Upgrade",
    title: "Câmera atenta",
    text: "Para pontos que merecem mais cuidado, como a área de atendimento ou o estoque.",
    items: ["Descrição mais detalhada", "Conferência reforçada fora do padrão", "Escolhida câmera a câmera"],
  },
  {
    badge: "Upgrade",
    title: "Câmera crítica",
    text: "Para caixa, entrada e cofre, onde cada minuto precisa estar registrado.",
    items: ["Registro mais frequente", "Análise aprofundada", "Precisão de horário mais fina"],
  },
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
        <Link className="brand" href="/" aria-label="MonitorIA.cam — página inicial">
          <LogoMark />
          <span>Monitor<span>IA</span>.cam</span>
        </Link>
        <nav className="header-nav" aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#perguntas">O que dá para perguntar</a>
          <a href="#planos">Planos</a>
          <Link className="button button-ghost" href="/dashboard">Abrir painel</Link>
        </nav>
      </header>

      <section className="hero container">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Funciona com as câmeras que você já tem</div>
          <h1>Sua câmera vê.<br /><strong>O MonitorIA lembra.</strong></h1>
          <p>
            Pergunte o que aconteceu na sua loja e receba a resposta com o horário exato.
            Sem rebobinar gravação, sem trocar de câmera, sem instalar equipamento novo.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href={WHATSAPP} target="_blank" rel="noopener noreferrer">
              Falar com a gente
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
            </a>
            <a className="button button-secondary" href="#como-funciona">Ver como funciona</a>
          </div>
          <div className="proof-row">
            <div><strong>Suas câmeras</strong><span>Não troque nada</span></div>
            <div><strong>12 meses</strong><span>De histórico pesquisável</span></div>
            <div><strong>Em segundos</strong><span>Para achar o momento</span></div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Exemplo da linha do tempo do MonitorIA">
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
            <div><span>Anotado às 09:18</span><strong>Objeto retirado do balcão</strong></div>
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
          <h2>Três passos.<br />Nenhum equipamento novo.</h2>
          <p>O vídeo continua gravando no seu DVR, como sempre. O MonitorIA só cria um índice do que aconteceu, para você achar o momento certo em segundos.</p>
        </div>
        <div className="feature-grid">
          {steps.map((step) => (
            <article className="feature-card" key={step.number}>
              <span className="feature-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="perguntas" className="section container">
        <div className="section-heading">
          <span>O que dá para perguntar</span>
          <h2>Não é só para quando<br />algo dá errado.</h2>
          <p>A rotina é o que faz você abrir o MonitorIA todo dia. A segurança é o que faz valer a pena no dia em que precisar.</p>
        </div>
        <div className="question-grid">
          {questions.map((item) => (
            <article className="question-card" key={item.q}>
              <span className="question-tag" data-tag={item.tag}>{item.tag}</span>
              <p className="question-text">“{item.q}”</p>
            </article>
          ))}
        </div>
      </section>

      <section id="estrutura" className="section container architecture-section">
        <div className="architecture-copy">
          <span className="section-kicker">Segurança e rotina</span>
          <h2>Não procure no vídeo.<br />Procure no que aconteceu.</h2>
          <p>
            Cada acontecimento vira uma anotação com horário, descrição e uma foto.
            Dá para filtrar por horário, por área da loja, por tipo de situação, por cor de roupa
            ou de veículo — e conferir no seu DVR só o trecho que interessa.
          </p>
          <ul className="check-list">
            <li>Suas gravações continuam no seu DVR, como sempre</li>
            <li>A senha da sua câmera nunca sai da loja</li>
            <li>Sem reconhecimento facial: descrevemos o que aparece, não quem é</li>
            <li>Cada empresa enxerga apenas os próprios dados</li>
          </ul>
        </div>
        <div className="timeline-panel">
          <div className="panel-header">
            <div><span>Ontem</span><strong>O que aconteceu</strong></div>
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

<section className="section container retention-section">
        <div className="retention-card">
          <div className="retention-copy">
            <span className="section-kicker">Por que 12 meses importa</span>
            <h2>Gravação some.<br />O histórico fica.</h2>
            <p>
              HD de DVR se sobrescreve sozinho. Gravação em nuvem costuma guardar de 3 a 7 dias.
              O MonitorIA guarda o registro escrito do que aconteceu por até um ano — e ocupa
              menos espaço que duas músicas por mês.
            </p>
          </div>

          <div className="retention-scale">
            <span className="scale-head">Quanto tempo você ainda consegue consultar</span>

            <div className="scale-row">
              <div className="scale-label"><strong>Gravação em nuvem</strong><span>3 a 7 dias</span></div>
              <div className="scale-track is-cloud"><i /></div>
            </div>

            <div className="scale-row">
              <div className="scale-label"><strong>HD do seu DVR</strong><span>15 a 30 dias</span></div>
              <div className="scale-track is-dvr"><i /></div>
            </div>

            <div className="scale-row is-highlight">
              <div className="scale-label"><strong>Histórico no MonitorIA</strong><span>12 meses</span></div>
              <div className="scale-track is-monitoria"><i /></div>
            </div>

            <div className="scale-axis"><span>hoje</span><span>6 meses</span><span>12 meses</span></div>

            <p className="scale-note">
              O MonitorIA guarda o registro escrito e uma foto de cada acontecimento.
              O vídeo continua no seu DVR.
            </p>
          </div>
        </div>
      </section>

      <section id="planos" className="section container">
        <div className="section-heading">
          <span>Planos</span>
          <h2>Você escolhe quais câmeras<br />merecem mais atenção.</h2>
          <p>Nem toda câmera precisa do mesmo cuidado. A do estoque pode ficar no básico; a do caixa e a da entrada valem o detalhe. Monte com a gente o que faz sentido para o seu negócio.</p>
        </div>
        <div className="plan-grid">
          {plans.map((plan) => (
            <article className="plan-card" key={plan.title}>
              <span className="plan-badge">{plan.badge}</span>
              <h3>{plan.title}</h3>
              <p>{plan.text}</p>
              <ul className="plan-items">
                {plan.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
        <div className="plans-cta">
          <p>Conte quantas câmeras você tem e o que precisa acompanhar.</p>
          <a className="button button-primary" href={WHATSAPP} target="_blank" rel="noopener noreferrer">
            Falar com a gente no WhatsApp
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
          </a>
        </div>
      </section>

      <section className="cta-section container">
        <div>
          <span>MonitorIA.cam · Para lojas, postos, oficinas e condomínios</span>
          <h2>Suas câmeras já gravam.<br />Falta alguém lembrar.</h2>
        </div>
        <a className="button button-light" href={WHATSAPP} target="_blank" rel="noopener noreferrer">
          Falar com a gente
        </a>
      </section>

      <footer className="site-footer container">
        <div className="brand footer-brand"><LogoMark /><span>Monitor<span>IA</span></span></div>
        <p>Desenvolvido por BigCorps · Sua câmera vê. O MonitorIA lembra.</p>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
