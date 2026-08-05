import styles from "./landing.module.css";

/**
 * Cenas do produto desenhadas em SVG e animadas em CSS.
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

/** Miniatura da cena de câmera, reaproveitada em três cenas. */
function CameraTile({
  x,
  y,
  w,
  h,
  zone = true,
  night = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  zone?: boolean;
  night?: boolean;
}) {
  const id = `tile-${x}-${y}`;
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <rect x={x} y={y} width={w} height={h} rx="6" />
        </clipPath>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor={night ? "#12261f" : "#1d3547"} />
          <stop offset="1" stopColor={night ? "#07130f" : "#0b1c2d"} />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={y} width={w} height={h} fill={`url(#${id}-g)`} />
        {/* piso em perspectiva */}
        <path
          d={`M${x} ${y + h * 0.62} L${x + w * 0.72} ${y + h * 0.34} L${x + w} ${y + h} L${x} ${y + h} Z`}
          fill={night ? "#0d1f19" : "#132a3c"}
        />
        {/* prateleira */}
        <rect x={x + w * 0.06} y={y + h * 0.18} width={w * 0.26} height={h * 0.3} rx="2" fill="#16304a" />
        {/* balcão */}
        <rect x={x + w * 0.6} y={y + h * 0.5} width={w * 0.32} height={h * 0.22} rx="2" fill="#16304a" />
        {/* figura */}
        <g className={styles.sIn} style={d(1.6)}>
          <circle cx={x + w * 0.44} cy={y + h * 0.48} r={h * 0.055} fill="#8fa6bd" />
          <rect
            x={x + w * 0.44 - h * 0.05}
            y={y + h * 0.54}
            width={h * 0.1}
            height={h * 0.19}
            rx={h * 0.04}
            fill="#8fa6bd"
          />
        </g>
        {zone ? (
          <g className={styles.sIn} style={d(2.2)}>
            <rect
              x={x + w * 0.34}
              y={y + h * 0.4}
              width={w * 0.24}
              height={h * 0.44}
              fill="rgba(88,226,199,.08)"
              stroke={C.mint}
              strokeWidth="1.5"
            />
            <rect x={x + w * 0.34} y={y + h * 0.4 - 15} width="58" height="14" fill={C.mint} />
            <text
              x={x + w * 0.34 + 5}
              y={y + h * 0.4 - 4.5}
              fill="#04140f"
              fontSize="8"
              fontWeight="800"
              fontFamily={FONT}
              letterSpacing="0.12em"
            >
              ENTRADA
            </text>
          </g>
        ) : null}
      </g>
      <rect x={x} y={y} width={w} height={h} rx="6" fill="none" stroke={C.line} />
    </g>
  );
}

/* ========================================================================== */

/** Herói: pergunta em português, lista filtra, resposta com horário. */
export function SceneHero() {
  const rows = [
    { t: "09:18:42", txt: "Pessoa retira objeto do balcão", tag: "Entrada", hit: true },
    { t: "11:02:07", txt: "Veículo estaciona em frente", tag: "Calçada", hit: false },
    { t: "14:36:55", txt: "Duas pessoas na área do caixa", tag: "Caixa", hit: false },
  ];

  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Painel do MonitorIA: uma pergunta digitada em português filtra a lista de acontecimentos e revela o horário exato.">
      <Frame title="Acontecimentos · Entrada principal" right="28 JUL 2026" />

      {/* campo de busca */}
      <rect x="28" y="62" width="744" height="44" rx="6" fill={C.panel} stroke={C.line} />
      <circle cx="52" cy="84" r="6" fill="none" stroke={C.ink3} strokeWidth="1.6" />
      <line x1="56.5" y1="88.5" x2="61" y2="93" stroke={C.ink3} strokeWidth="1.6" strokeLinecap="round" />
      <text x="70" y="89" fill={C.ink} fontSize="14" fontFamily={FONT}>
        alguém mexeu no balcão hoje de manhã?
      </text>
      <rect
        className={styles.sWipe}
        style={d(0.5)}
        transform="scale(0 1)"
        x="70"
        y="70"
        width="640"
        height="28"
        fill={C.panel}
      />
      <rect className={styles.sCaret} x="330" y="72" width="1.5" height="24" fill={C.mint} />

      {/* resposta */}
      <g className={styles.sIn} style={d(2.6)}>
        <rect x="28" y="122" width="744" height="86" rx="8" fill="#0d2a26" stroke="rgba(88,226,199,.3)" />
        <text x="48" y="150" fill={C.mint} fontSize="10" fontWeight="700" fontFamily={FONT} letterSpacing="0.18em">
          RESPOSTA
        </text>
        <text x="48" y="182" fill={C.ink} fontSize="26" fontWeight="700" fontFamily={MONO} letterSpacing="-0.02em">
          09:18:42
        </text>
        <text x="200" y="182" fill={C.ink2} fontSize="14" fontFamily={FONT}>
          Uma pessoa retirou um objeto do balcão. 1 acontecimento encontrado.
        </text>
      </g>

      {/* lista */}
      <Line x={28} y={244} size={10} fill={C.ink3} weight={700} delay={3.1}>
        3 ACONTECIMENTOS NO DIA
      </Line>

      {rows.map((r, i) => (
        <g key={r.t} className={styles.sIn} style={d(3.4 + i * 0.22)}>
          <rect
            x="28"
            y={258 + i * 62}
            width="744"
            height="52"
            rx="6"
            fill={r.hit ? "#0d2a26" : C.panel}
            stroke={r.hit ? "rgba(88,226,199,.3)" : C.line}
          />
          <rect x="44" y={272 + i * 62} width="42" height="24" rx="3" fill={r.hit ? C.mint : "#1a2c42"} />
          <text
            x="100"
            y={289 + i * 62}
            fill={r.hit ? C.mint : C.ink3}
            fontSize="13"
            fontFamily={MONO}
          >
            {r.t}
          </text>
          <text x="188" y={289 + i * 62} fill={r.hit ? C.ink : C.ink2} fontSize="13.5" fontFamily={FONT}>
            {r.txt}
          </text>
          <text x="756" y={289 + i * 62} fill={C.ink3} fontSize="11" fontFamily={FONT} textAnchor="end">
            {r.tag}
          </text>
        </g>
      ))}

      <Line x={28} y={466} size={11} fill={C.ink3} mono delay={4.4}>
        Histórico disponível: 365 dias
      </Line>
    </svg>
  );
}

/** Etapa 1: Agent instalado no Windows da loja. */
export function SceneAgentInstall() {
  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Janela do Agent do MonitorIA no Windows, com instalação concluída, status conectado, versão e identificador.">
      <Frame title="MonitorIA Agent" right="v1.0.0" />

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
        Agent conectado
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
        ["Agent ID", "ag_7f3c9b21", C.ink],
        ["Sistema", "Windows 11 x64", C.ink],
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

/** Etapa 2: descoberta automática das câmeras. */
export function SceneCameraDiscovery() {
  const cams = [
    ["Entrada principal", "ONVIF", C.mint],
    ["Caixa 1", "ONVIF", C.mint],
    ["Estoque", "DVR", C.blue],
    ["Calçada", "RTSP", C.amber],
  ];

  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Tela de descoberta do MonitorIA encontrando quatro câmeras automaticamente, sem digitar endereço.">
      <Frame title="Descoberta de câmeras" right="Rede local" />

      <Line x={28} y={82} size={19} fill={C.ink} weight={700} delay={0.2}>
        Procurando câmeras na rede
      </Line>
      <Line x={28} y={106} size={13} fill={C.ink2} delay={0.4}>
        ONVIF, depois DVR e NVR, depois endereços RTSP conhecidos.
      </Line>

      <rect x="28" y="128" width="744" height="240" rx="8" fill={C.panelDeep} stroke={C.line} />

      {/* faixa de varredura */}
      <rect className={styles.sScan} x="29" y="132" width="742" height="34" fill="rgba(88,226,199,.14)" />

      {cams.map(([name, proto, color], i) => (
        <g key={name} className={styles.sIn} style={d(1.2 + i * 0.7)}>
          <rect x="44" y={146 + i * 54} width="712" height="42" rx="6" fill={C.panel} stroke={C.line} />
          <rect x="60" y={158 + i * 54} width="26" height="18" rx="3" fill="#1a2c42" />
          <circle cx="73" cy={167 + i * 54} r="4" fill={color} />
          <text x="102" y={172 + i * 54} fill={C.ink} fontSize="13.5" fontFamily={FONT}>
            {name}
          </text>
          <rect x="600" y={158 + i * 54} width="52" height="18" rx="3" fill="rgba(148,172,200,.1)" />
          <text
            x="626"
            y={171 + i * 54}
            fill={color}
            fontSize="9.5"
            fontWeight="700"
            fontFamily={FONT}
            textAnchor="middle"
            letterSpacing="0.1em"
          >
            {proto}
          </text>
          <text x="740" y={172 + i * 54} fill={C.mint} fontSize="11" fontFamily={FONT} textAnchor="end">
            Online
          </text>
        </g>
      ))}

      <Line x={28} y={402} size={13} fill={C.ink2} delay={4.4}>
        4 câmeras encontradas. Nenhum endereço digitado à mão.
      </Line>

      <g className={styles.sIn} style={d(4.7)}>
        <rect x="28" y="420" width="196" height="42" rx="6" fill={C.mint} />
        <text
          x="126"
          y="446"
          fill="#03120e"
          fontSize="14"
          fontWeight="700"
          fontFamily={FONT}
          textAnchor="middle"
        >
          Parear as 4 câmeras
        </text>
      </g>
    </svg>
  );
}

/** Etapa 3: um acontecimento virando anotação com horário. */
export function SceneEventCapture() {
  const fields = [
    ["Horário", "09:18:42", true],
    ["Zona", "Entrada", false],
    ["Pessoas", "1", true],
    ["Veículos", "0", true],
    ["Objetos", "caixa de papelão", false],
  ];

  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Um acontecimento sendo registrado: imagem do momento de pico, horário, zona, pessoas, veículos e descrição.">
      <Frame title="Acontecimento · Entrada principal" right="09:18:42" />

      <CameraTile x={28} y={62} w={392} h={252} />

      <g className={styles.sIn} style={d(2.6)}>
        <rect x="40" y="286" width="86" height="18" rx="3" fill="rgba(7,17,31,.8)" />
        <text x="48" y="299" fill={C.mint} fontSize="10" fontFamily={MONO} letterSpacing="0.08em">
          PICO 09:18:42
        </text>
      </g>

      {/* painel de anotação */}
      <rect x="440" y="62" width="332" height="252" rx="8" fill={C.panel} stroke={C.line} />
      <Line x={460} y={88} size={10} fill={C.ink3} weight={700} delay={2.4}>
        REGISTRO AUTOMÁTICO
      </Line>

      {fields.map(([k, v, mono], i) => (
        <g key={k as string} className={styles.sIn} style={d(2.9 + i * 0.28)}>
          <line x1="460" y1={104 + i * 40} x2="752" y2={104 + i * 40} stroke={C.line} />
          <text x="460" y={126 + i * 40} fill={C.ink3} fontSize="11.5" fontFamily={FONT}>
            {k as string}
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
            {v as string}
          </text>
        </g>
      ))}

      {/* descrição */}
      <g className={styles.sIn} style={d(4.4)}>
        <rect x="28" y="334" width="744" height="76" rx="8" fill={C.panelDeep} stroke={C.line} />
        <text x="48" y="360" fill={C.ink3} fontSize="10" fontWeight="700" fontFamily={FONT} letterSpacing="0.18em">
          DESCRIÇÃO
        </text>
        <text x="48" y="388" fill={C.ink} fontSize="15" fontFamily={FONT}>
          Uma pessoa se aproxima do balcão e retira uma caixa de papelão.
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
      aria-label="Pergunta escrita em português e resposta do MonitorIA com o horário exato e a evidência usada.">
      <Frame title="Assistente" right="90 interações no mês" />

      {/* pergunta */}
      <g className={styles.sIn} style={d(0.3)}>
        <rect x="228" y="66" width="544" height="52" rx="8" fill={C.panel} stroke={C.line} />
        <text x="252" y="97" fill={C.ink} fontSize="14.5" fontFamily={FONT}>
          a que horas o carro branco chegou ontem?
        </text>
        <rect
          className={styles.sWipe}
          style={d(0.6)}
          transform="scale(0 1)"
          x="252"
          y="76"
          width="470"
          height="32"
          fill={C.panel}
        />
      </g>

      {/* resposta */}
      <g className={styles.sIn} style={d(2.9)}>
        <rect x="28" y="140" width="744" height="150" rx="8" fill="#0d2a26" stroke="rgba(88,226,199,.3)" />
        <text x="52" y="170" fill={C.mint} fontSize="10" fontWeight="700" fontFamily={FONT} letterSpacing="0.18em">
          MONITORIA
        </text>
        <text x="52" y="214" fill={C.ink} fontSize="40" fontWeight="700" fontFamily={MONO} letterSpacing="-0.03em">
          17:04:11
        </text>
        <text x="52" y="248" fill={C.ink2} fontSize="14.5" fontFamily={FONT}>
          Um veículo branco parou em frente à calçada e permaneceu 6 minutos.
        </text>
        <text x="52" y="272" fill={C.ink3} fontSize="12" fontFamily={FONT}>
          Câmera Calçada · 27 de julho de 2026
        </text>
      </g>

      {/* evidência */}
      <Line x={28} y={324} size={10} fill={C.ink3} weight={700} delay={4.0}>
        EVIDÊNCIA USADA
      </Line>

      <g className={styles.sIn} style={d(4.3)}>
        <CameraTile x={28} y={336} w={210} h={116} zone={false} />
      </g>
      <g className={styles.sIn} style={d(4.5)}>
        <CameraTile x={252} y={336} w={210} h={116} zone={false} night />
      </g>

      <g className={styles.sIn} style={d(4.8)}>
        <rect x="480" y="336" width="292" height="116" rx="8" fill={C.panelDeep} stroke={C.line} />
        <text x="500" y="366" fill={C.ink3} fontSize="11" fontFamily={FONT}>
          Filtrar, pesquisar, ver gráfico e exportar
        </text>
        <text x="500" y="392" fill={C.mint} fontSize="18" fontWeight="700" fontFamily={FONT}>
          não consomem interação
        </text>
        <text x="500" y="422" fill={C.ink3} fontSize="11" fontFamily={FONT}>
          Só a pergunta respondida desconta da franquia.
        </text>
      </g>
    </svg>
  );
}
