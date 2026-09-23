import styles from "./landing.module.css";

/**
 * Cenas do produto desenhadas em SVG e animadas em CSS.
 *
 * A arte de fundo (loja em 3D, visão da câmera e miniaturas) vem de
 * /public/landing/art, renderizada com o mesmo motor do vídeo de divulgação.
 * Texto, marcações de detecção e cartões continuam em SVG: nítidos e animados.
 *
 * Substituem as cinco gravações de tela. Vantagens sobre um MP4:
 * zero KB de JavaScript, alguns KB de peso, nítido em qualquer resolução,
 * nenhum dado real exposto, e não dependem do produto estar pronto.
 *
 * Todas usam ciclo de 10s. Os atrasos abaixo são o roteiro de cada cena.
 * Se o visitante pediu movimento reduzido, tudo aparece estático e completo.
 */

const C = {
  bg: "#08131f",
  panel: "#0e1d31",
  panelDeep: "#0a1726",
  line: "#1e2f45",
  ink: "#f2f7fd",
  ink2: "#9db0c6",
  ink3: "#5d7189",
  mint: "#58e2c7",
  blue: "#78b0ff",
  amber: "#f5c06b",
};

const FONT = "var(--font-display), sans-serif";
const MONO = "var(--font-mono), ui-monospace, monospace";

type D = { delay: number };
const d = (delay: number) => ({ animationDelay: `${delay}s` });

/** Bloco de texto que entra escalonado. */
function Line({
  x,
  y,
  children,
  size = 13,
  fill = C.ink2,
  weight = 400,
  mono = false,
  delay = 0,
  anchor = "start",
}: D & {
  x: number;
  y: number;
  children: string;
  size?: number;
  fill?: string;
  weight?: number;
  mono?: boolean;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      className={styles.sIn}
      style={d(delay)}
      x={x}
      y={y}
      fill={fill}
      fontSize={size}
      fontWeight={weight}
      fontFamily={mono ? MONO : FONT}
      textAnchor={anchor}
      letterSpacing={mono ? "0.02em" : "-0.01em"}
    >
      {children}
    </text>
  );
}

/** Moldura de janela usada por todas as cenas. */
function Frame({ title, right }: { title: string; right: string }) {
  return (
    <>
      <rect x="0" y="0" width="800" height="500" fill={C.bg} />
      <rect x="0" y="0" width="800" height="38" fill={C.panelDeep} />
      <line x1="0" y1="38" x2="800" y2="38" stroke={C.line} strokeWidth="1" />
      <circle className={styles.sPulse} cx="22" cy="19" r="3.5" fill={C.mint} />
      <text x="36" y="23" fill={C.ink2} fontSize="12" fontFamily={FONT}>
        {title}
      </text>
      <text x="778" y="23" fill={C.ink3} fontSize="11" fontFamily={MONO} textAnchor="end">
        {right}
      </text>
    </>
  );
}

/** Pasta pública com a arte renderizada (WebP, poucos KB cada). */
const ART = "/landing/art";

/** Imagem da arte, recortada com cantos arredondados. */
function Art({
  id,
  src,
  x,
  y,
  w,
  h,
  r = 6,
}: {
  id: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
}) {
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={w} height={h} rx={r} />
        </clipPath>
      </defs>
      <image
        href={`${ART}/${src}.webp`}
        x={x}
        y={y}
        width={w}
        height={h}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${id})`}
      />
      <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={C.line} />
    </g>
  );
}

/** Cantoneiras da detecção, no estilo da visão da câmera. */
function Bracket({ x0, y0, x1, y1, len = 10 }: { x0: number; y0: number; x1: number; y1: number; len?: number }) {
  const s = { stroke: C.mint, strokeWidth: 2.2, fill: "none", strokeLinecap: "round" as const };
  return (
    <g>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="rgba(88,226,199,.10)" />
      <path d={`M${x0} ${y0 + len}V${y0}H${x0 + len}`} {...s} />
      <path d={`M${x1 - len} ${y0}H${x1}V${y0 + len}`} {...s} />
      <path d={`M${x1} ${y1 - len}V${y1}H${x1 - len}`} {...s} />
      <path d={`M${x0 + len} ${y1}H${x0}V${y1 - len}`} {...s} />
    </g>
  );
}

/** Cartão de acontecimento com miniatura, igual ao do vídeo. */
function EventCard({
  x,
  y,
  w = 260,
  img,
  time,
  title,
  zone,
  delay,
  hit = false,
  hitDelay = 0,
}: D & {
  x: number;
  y: number;
  w?: number;
  img: string;
  time: string;
  title: string;
  zone: string;
  hit?: boolean;
  hitDelay?: number;
}) {
  return (
    <g className={styles.sIn} style={d(delay)}>
      <rect x={x} y={y} width={w} height="78" rx="10" fill={C.panel} stroke="rgba(88,226,199,.28)" />
      <Art id={`card-${img}-${y}`} src={img} x={x + 8} y={y + 8} w={100} h={62} r={6} />
      <text x={x + 120} y={y + 32} fill={C.mint} fontSize="18" fontWeight="700" fontFamily={MONO}>
        {time}
      </text>
      <text x={x + 120} y={y + 52} fill={C.ink} fontSize="12.5" fontWeight="700" fontFamily={FONT}>
        {title}
      </text>
      <text x={x + 120} y={y + 68} fill={C.ink3} fontSize="10.5" fontFamily={FONT}>
        {zone}
      </text>
      {hit ? (
        <rect
          className={styles.sIn}
          style={d(hitDelay)}
          x={x - 1.5}
          y={y - 1.5}
          width={w + 3}
          height="81"
          rx="11"
          fill="none"
          stroke={C.mint}
          strokeWidth="2.5"
        />
      ) : null}
    </g>
  );
}

/* ========================================================================== */

/** Herói: a loja em 3D, a câmera com IA e os acontecimentos virando cartões. */
export function SceneHero() {
  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Loja vista em 3D com a câmera do MonitorIA: cada acontecimento vira um cartão com horário, e uma pergunta em português encontra o momento exato.">
      <defs>
        <filter id="hero-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <linearGradient id="hero-cone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.mint} stopOpacity=".32" />
          <stop offset="1" stopColor={C.mint} stopOpacity="0" />
        </linearGradient>
      </defs>

      <image href={`${ART}/hero-store.webp`} x="0" y="0" width="800" height="500" preserveAspectRatio="xMidYMid slice" />

      {/* olho da câmera, sempre atento */}
      <circle className={styles.sPulse} cx="216.3" cy="130.9" r="13" fill={C.mint} opacity=".55" filter="url(#hero-soft)" />

      {/* cone de visão até o cliente que espera */}
      <path className={styles.sIn} style={d(1.4)} d="M216 131 L312 258 L382 244 Z" fill="url(#hero-cone)" />

      {/* anel de espera */}
      <ellipse className={styles.sRing} cx="345.3" cy="249.2" rx="26" ry="13.7" fill="none" stroke={C.amber} strokeWidth="2" />
      <ellipse className={styles.sRing} style={d(1)} cx="345.3" cy="249.2" rx="26" ry="13.7" fill="none" stroke={C.amber} strokeWidth="2" />

      {/* detecção */}
      <g className={styles.sLock} style={d(2.1)}>
        <Bracket x0={322} y0={172} x1={370} y1={256} />
      </g>
      <g className={styles.sIn} style={d(2.5)}>
        <rect x="286" y="146" width="138" height="20" rx="5" fill={C.mint} />
        <text x="295" y="160" fill="#03120e" fontSize="10.5" fontWeight="800" fontFamily={FONT}>
          14:22 Cliente aguardando
        </text>
      </g>
      <path
        className={styles.sIn}
        style={d(3.2)}
        d="M370 214 C 440 214, 460 300, 516 300"
        fill="none"
        stroke={C.mint}
        strokeWidth="1.4"
        strokeDasharray="4 5"
        opacity=".7"
      />

      {/* pergunta */}
      <g className={styles.sIn} style={d(0.2)}>
        <rect x="520" y="28" width="260" height="40" rx="20" fill={C.panel} stroke={C.line} />
        <circle cx="542" cy="48" r="5.5" fill="none" stroke={C.ink3} strokeWidth="1.6" />
        <line x1="546" y1="52" x2="550" y2="56" stroke={C.ink3} strokeWidth="1.6" strokeLinecap="round" />
        <text x="560" y="52.5" fill={C.ink} fontSize="12.5" fontFamily={FONT}>
          teve cliente esperando hoje?
        </text>
        <rect className={styles.sWipe} style={d(0.5)} transform="scale(0 1)" x="558" y="36" width="200" height="24" fill={C.panel} />
      </g>

      {/* acontecimentos */}
      <EventCard x={520} y={86} img="ev-0803" time="08:03" title="Abertura detectada" zone="Porta de entrada" delay={1.0} />
      <EventCard x={520} y={174} img="ev-1240" time="12:40" title="Movimento no balcão" zone="Balcão" delay={1.5} />
      <EventCard
        x={520}
        y={262}
        img="ev-1422"
        time="14:22"
        title="Cliente aguardando"
        zone="Salão"
        delay={2.8}
        hit
        hitDelay={3.6}
      />

      {/* resposta */}
      <g className={styles.sIn} style={d(4.0)}>
        <rect x="520" y="356" width="260" height="84" rx="10" fill="#0d2a26" stroke="rgba(88,226,199,.35)" />
        <text x="536" y="378" fill={C.mint} fontSize="9.5" fontWeight="700" fontFamily={FONT} letterSpacing="0.18em">
          RESPOSTA
        </text>
        <text x="536" y="408" fill={C.ink} fontSize="24" fontWeight="700" fontFamily={MONO} letterSpacing="-0.02em">
          14:22
        </text>
        <text x="614" y="398" fill={C.ink2} fontSize="11.5" fontFamily={FONT}>
          Um cliente aguardou
        </text>
        <text x="614" y="414" fill={C.ink2} fontSize="11.5" fontFamily={FONT}>
          4 minutos até ser atendido.
        </text>
        <text x="536" y="430" fill={C.ink3} fontSize="10" fontFamily={FONT}>
          1 acontecimento encontrado
        </text>
      </g>

      <Line x={520} y={470} size={11} fill={C.ink3} mono delay={4.6}>
        Histórico disponível: 365 dias
      </Line>
    </svg>
  );
}

/** Etapa 1: o programa da loja instalado no Windows. */
export function SceneAgentInstall() {
  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Janela do programa do MonitorIA no Windows, com instalação concluída, status conectado, versão e identificação.">
      <Frame title="Programa MonitorIA" right="v1.0.0" />

      <rect x="120" y="86" width="560" height="330" rx="10" fill={C.panel} stroke={C.line} />

      {/* selo de concluído */}
      <g className={styles.sIn} style={d(1.4)}>
        <circle cx="400" cy="162" r="34" fill="rgba(88,226,199,.1)" stroke={C.mint} strokeWidth="2" />
        <path
          d="M385 162 l11 11 l19 -22"
          fill="none"
          stroke={C.mint}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <Line x={400} y={228} size={22} fill={C.ink} weight={700} anchor="middle" delay={1.8}>
        Programa conectado
      </Line>
      <Line x={400} y={254} size={13} fill={C.ink2} anchor="middle" delay={2.0}>
        O serviço inicia junto com o sistema. Nada mais a fazer aqui.
      </Line>

      {/* barra de progresso */}
      <rect x="184" y="286" width="432" height="6" rx="3" fill="#16273b" />
      <rect className={styles.sGrow} x="184" y="286" width="432" height="6" rx="3" fill={C.mint} />

      {/* dados */}
      {[
        ["Status", "Conectado", C.mint],
        ["Versão", "1.0.0", C.ink],
        ["Identificação", "ag_7f3c9b21", C.ink],
        ["Sistema", "Windows 11", C.ink],
      ].map(([k, v, color], i) => (
        <g key={k} className={styles.sIn} style={d(2.4 + i * 0.18)}>
          <line x1="184" y1={320 + i * 24} x2="616" y2={320 + i * 24} stroke={C.line} />
          <text x="184" y={338 + i * 24} fill={C.ink3} fontSize="12" fontFamily={FONT}>
            {k}
          </text>
          <text x="616" y={338 + i * 24} fill={color} fontSize="12" fontFamily={MONO} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Etapa 2: câmeras encontradas sozinhas na rede, já com imagem. */
export function SceneCameraDiscovery() {
  const cams: Array<[string, string, string, string]> = [
    ["Entrada principal", "DIRETA", C.mint, "cam-entrada"],
    ["Caixa 1", "DIRETA", C.mint, "cam-caixa"],
    ["Corredor", "DVR", C.blue, "cam-corredor"],
    ["Estoque", "APP", C.amber, "cam-estoque"],
  ];
  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Tela de descoberta do MonitorIA encontrando quatro câmeras automaticamente, já com a imagem de cada uma, sem digitar endereço.">
      <Frame title="Descoberta de câmeras" right="Rede local" />
      <Line x={28} y={82} size={19} fill={C.ink} weight={700} delay={0.2}>
        Procurando câmeras na rede
      </Line>
      <Line x={28} y={106} size={13} fill={C.ink2} delay={0.4}>
        Testamos cada forma de conexão do seu equipamento, uma por uma.
      </Line>

      {/* faixa de varredura */}
      <rect className={styles.sScan} x="28" y="126" width="744" height="44" rx="6" fill="rgba(88,226,199,.14)" />

      {cams.map(([name, proto, color, img], i) => {
        const x = 28 + (i % 2) * 384;
        const y = 128 + Math.floor(i / 2) * 124;
        return (
          <g key={name} className={styles.sIn} style={d(1.2 + i * 0.7)}>
            <rect x={x} y={y} width="360" height="112" rx="8" fill={C.panel} stroke={C.line} />
            <Art id={`disc-${img}`} src={img} x={x + 8} y={y + 8} w={154} h={96} r={6} />
            <circle className={styles.sPulse} cx={x + 20} cy={y + 20} r="3.5" fill="#ff4d5a" />
            <text x={x + 176} y={y + 34} fill={C.ink} fontSize="14" fontWeight="700" fontFamily={FONT}>
              {name}
            </text>
            <rect x={x + 176} y={y + 48} width="52" height="18" rx="3" fill="rgba(148,172,200,.1)" />
            <text
              x={x + 202}
              y={y + 61}
              fill={color}
              fontSize="9.5"
              fontWeight="700"
              fontFamily={FONT}
              textAnchor="middle"
              letterSpacing="0.1em"
            >
              {proto}
            </text>
            <circle cx={x + 181} cy={y + 88} r="3.5" fill={C.mint} />
            <text x={x + 191} y={y + 92} fill={C.mint} fontSize="11.5" fontFamily={FONT}>
              Online
            </text>
          </g>
        );
      })}

      <Line x={28} y={402} size={13} fill={C.ink2} delay={4.4}>
        4 câmeras encontradas. Nenhum endereço digitado à mão.
      </Line>
      <g className={styles.sIn} style={d(4.7)}>
        <rect x="28" y="420" width="196" height="42" rx="6" fill={C.mint} />
        <text x="126" y="446" fill="#03120e" fontSize="14" fontWeight="700" fontFamily={FONT} textAnchor="middle">
          Ativar as 4 câmeras
        </text>
      </g>
    </svg>
  );
}

/** Etapa 3: a câmera vê, detecta e o momento vira anotação com horário. */
export function SceneEventCapture() {
  const fields: Array<[string, string, boolean]> = [
    ["Horário", "12:40:18", true],
    ["Zona", "Balcão", false],
    ["Pessoas", "2", true],
    ["Veículos", "0", true],
    ["Duração", "3 min", false],
  ];
  // caixa da pessoa detectada, na escala da imagem (392 x 245)
  const bx0 = 100, by0 = 128, bx1 = 152, by1 = 185;
  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="A câmera detecta um cliente no balcão e o acontecimento é registrado: imagem do momento, horário, zona, pessoas, veículos e descrição.">
      <Frame title="Acontecimento · Balcão" right="12:40:18" />
      <Art id="evc-pov" src="pov-balcao" x={28} y={62} w={392} h={245} />
      <g clipPath="url(#evc-pov)">
        <rect className={styles.sSweep} x="28" y="22" width="392" height="40" fill="url(#evc-sweep)" />
      </g>
      <defs>
        <linearGradient id="evc-sweep" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={C.mint} stopOpacity="0" />
          <stop offset="1" stopColor={C.mint} stopOpacity=".28" />
        </linearGradient>
      </defs>
      <circle className={styles.sPulse} cx="44" cy="80" r="4" fill="#ff4d5a" />
      <text x="54" y="84" fill={C.ink} fontSize="10.5" fontWeight="700" fontFamily={MONO}>
        CAM 03
      </text>

      <g className={styles.sLock} style={d(1.6)}>
        <Bracket x0={bx0} y0={by0} x1={bx1} y1={by1} len={9} />
      </g>
      <g className={styles.sIn} style={d(2.0)}>
        <rect x={bx0} y={by0 - 20} width="58" height="16" rx="4" fill={C.mint} />
        <text x={bx0 + 6} y={by0 - 8.5} fill="#03120e" fontSize="9" fontWeight="800" fontFamily={FONT} letterSpacing="0.08em">
          PESSOA
        </text>
      </g>
      <g className={styles.sIn} style={d(2.6)}>
        <rect x="40" y="280" width="92" height="18" rx="3" fill="rgba(7,17,31,.8)" />
        <text x="48" y="293" fill={C.mint} fontSize="10" fontFamily={MONO} letterSpacing="0.08em">
          PICO 12:40:18
        </text>
      </g>

      {/* painel de anotação */}
      <rect x="440" y="62" width="332" height="245" rx="8" fill={C.panel} stroke={C.line} />
      <Line x={460} y={88} size={10} fill={C.ink3} weight={700} delay={2.4}>
        REGISTRO AUTOMÁTICO
      </Line>
      {fields.map(([k, v, mono], i) => (
        <g key={k} className={styles.sIn} style={d(2.9 + i * 0.28)}>
          <line x1="460" y1={104 + i * 40} x2="752" y2={104 + i * 40} stroke={C.line} />
          <text x="460" y={126 + i * 40} fill={C.ink3} fontSize="11.5" fontFamily={FONT}>
            {k}
          </text>
          <text
            x="752"
            y={126 + i * 40}
            fill={i === 0 ? C.mint : C.ink}
            fontSize={i === 0 ? 15 : 12.5}
            fontWeight={i === 0 ? 700 : 400}
            fontFamily={mono ? MONO : FONT}
            textAnchor="end"
          >
            {v}
          </text>
        </g>
      ))}

      {/* o cartão que fica guardado */}
      <g className={styles.sIn} style={d(4.4)}>
        <rect x="28" y="326" width="744" height="84" rx="10" fill={C.panelDeep} stroke="rgba(88,226,199,.3)" />
        <Art id="evc-thumb" src="ev-1240" x={40} y={338} w={96} h={60} r={6} />
        <text x="152" y="356" fill={C.mint} fontSize="16" fontWeight="700" fontFamily={MONO}>
          12:40
        </text>
        <text x="206" y="356" fill={C.ink3} fontSize="10" fontWeight="700" fontFamily={FONT} letterSpacing="0.18em">
          DESCRIÇÃO
        </text>
        <text x="152" y="386" fill={C.ink} fontSize="15" fontFamily={FONT}>
          Um cliente é atendido no balcão e o funcionário registra a venda.
        </text>
      </g>
      <Line x={28} y={444} size={11.5} fill={C.ink3} delay={4.9}>
        Parado, nada é registrado. O vídeo contínuo permanece no seu DVR.
      </Line>
      <Line x={772} y={444} size={11.5} fill={C.ink3} mono anchor="end" delay={4.9}>
        guardado por 365 dias
      </Line>
    </svg>
  );
}

/** Etapa 4: pergunta em português, resposta com horário e evidência. */
export function SceneSearchAnswer() {
  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Pergunta escrita em português e resposta do MonitorIA com o horário exato e as imagens usadas como evidência.">
      <Frame title="Assistente" right="90 perguntas no mês" />
      {/* pergunta */}
      <g className={styles.sIn} style={d(0.3)}>
        <rect x="372" y="66" width="400" height="48" rx="24" fill="#25324d" />
        <text x="396" y="95" fill={C.ink} fontSize="14.5" fontFamily={FONT}>
          teve cliente esperando hoje?
        </text>
        <rect className={styles.sWipe} style={d(0.6)} transform="scale(0 1)" x="394" y="76" width="360" height="30" fill="#25324d" />
      </g>
      {/* digitando */}
      <g className={styles.sIn} style={d(1.9)}>
        <circle className={styles.sPulse} cx="44" cy="134" r="3.5" fill={C.mint} />
        <circle className={styles.sPulse} style={{ animationDelay: "0.3s" }} cx="56" cy="134" r="3.5" fill={C.mint} />
        <circle className={styles.sPulse} style={{ animationDelay: "0.6s" }} cx="68" cy="134" r="3.5" fill={C.mint} />
      </g>
      {/* resposta */}
      <g className={styles.sIn} style={d(2.9)}>
        <rect x="28" y="148" width="744" height="150" rx="12" fill="#0d2a26" stroke="rgba(88,226,199,.35)" />
        <text x="52" y="178" fill={C.mint} fontSize="10" fontWeight="700" fontFamily={FONT} letterSpacing="0.18em">
          MONITORIA
        </text>
        <text x="52" y="222" fill={C.ink} fontSize="40" fontWeight="700" fontFamily={MONO} letterSpacing="-0.03em">
          14:22:05
        </text>
        <text x="52" y="254" fill={C.ink2} fontSize="14.5" fontFamily={FONT}>
          Sim. Um cliente aguardou 4 minutos no salão.
        </text>
        <text x="52" y="278" fill={C.ink3} fontSize="12" fontFamily={FONT}>
          Câmera Corredor · hoje
        </text>
        <Art id="sa-main" src="ev-1422" x={556} y={164} w={200} h={118} r={8} />
        <g className={styles.sLock} style={d(3.5)}>
          <Bracket x0={575} y0={205} x1={608} y1={262} len={7} />
        </g>
      </g>
      {/* evidência */}
      <Line x={28} y={332} size={10} fill={C.ink3} weight={700} delay={4.0}>
        EVIDÊNCIA USADA
      </Line>
      <g className={styles.sIn} style={d(4.3)}>
        <Art id="sa-ev1" src="ev-1422" x={28} y={344} w={210} h={116} />
        <rect x="38" y="434" width="52" height="16" rx="3" fill="rgba(7,17,31,.8)" />
        <text x="45" y="446" fill={C.mint} fontSize="10" fontFamily={MONO}>14:22</text>
      </g>
      <g className={styles.sIn} style={d(4.5)}>
        <Art id="sa-ev2" src="ev-1426" x={252} y={344} w={210} h={116} />
        <rect x="262" y="434" width="52" height="16" rx="3" fill="rgba(7,17,31,.8)" />
        <text x="269" y="446" fill={C.mint} fontSize="10" fontFamily={MONO}>14:26</text>
      </g>
      <g className={styles.sIn} style={d(4.8)}>
        <rect x="480" y="344" width="292" height="116" rx="8" fill={C.panelDeep} stroke={C.line} />
        <text x="500" y="374" fill={C.ink3} fontSize="11" fontFamily={FONT}>
          Filtrar, pesquisar, ver gráfico e exportar
        </text>
        <text x="500" y="400" fill={C.mint} fontSize="18" fontWeight="700" fontFamily={FONT}>
          não gastam pergunta
        </text>
        <text x="500" y="430" fill={C.ink3} fontSize="11" fontFamily={FONT}>
          Só a pergunta respondida entra na conta do mês.
        </text>
      </g>
    </svg>
  );
}
