import styles from "@/src/components/landing/landing.module.css";

const C = {
  bg: "#08090b",
  panel: "#101216",
  panel2: "#15181d",
  line: "#2b2f36",
  ink: "#f6f3e8",
  ink2: "#b8b09b",
  ink3: "#776f5c",
  gold: "#e8c86d",
  gold2: "#b88724",
  gold3: "#7a5310",
  white: "#ffffff",
  good: "#86d4a8",
  warn: "#e7b75a",
};

const FONT = "var(--font-display), sans-serif";
const MONO = "var(--font-mono), ui-monospace, monospace";

const d = (delay: number) => ({ animationDelay: `${delay}s` });

function Line({
  x,
  y,
  children,
  size = 13,
  fill = C.ink2,
  weight = 400,
  delay = 0,
  mono = false,
  anchor = "start",
}: {
  x: number;
  y: number;
  children: string;
  size?: number;
  fill?: string;
  weight?: number;
  delay?: number;
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
    >
      {children}
    </text>
  );
}

function Frame({
  title,
  right,
}: {
  title: string;
  right: string;
}) {
  return (
    <>
      <rect width="800" height="500" fill={C.bg} />
      <rect width="800" height="38" fill="#0c0e11" />
      <line x1="0" y1="38" x2="800" y2="38" stroke={C.line} />
      <circle
        className={styles.sPulse}
        cx="22"
        cy="19"
        r="3.5"
        fill={C.gold}
      />
      <text x="36" y="23" fill={C.ink2} fontSize="12" fontFamily={FONT}>
        {title}
      </text>
      <text
        x="778"
        y="23"
        fill={C.ink3}
        fontSize="11"
        fontFamily={MONO}
        textAnchor="end"
      >
        {right}
      </text>
    </>
  );
}

function CameraTile({
  x,
  y,
  name,
  site,
  status = "operando",
  delay,
  attention = false,
}: {
  x: number;
  y: number;
  name: string;
  site: string;
  status?: string;
  delay: number;
  attention?: boolean;
}) {
  return (
    <g className={styles.sIn} style={d(delay)}>
      <rect
        x={x}
        y={y}
        width="168"
        height="112"
        rx="9"
        fill={C.panel}
        stroke={attention ? C.gold2 : C.line}
      />
      <rect
        x={x + 10}
        y={y + 10}
        width="148"
        height="60"
        rx="6"
        fill={attention ? "#1e1a0e" : "#12171a"}
      />
      <path
        d={`M${x + 18} ${y + 58} L${x + 58} ${y + 28} L${x + 95} ${y + 46} L${x + 150} ${y + 22}`}
        stroke={attention ? C.gold : "#5f6871"}
        strokeWidth="2"
        fill="none"
        opacity=".8"
      />
      <circle
        cx={x + 26}
        cy={y + 22}
        r="3"
        fill={attention ? C.warn : C.good}
      />
      <text
        x={x + 12}
        y={y + 88}
        fill={C.ink}
        fontSize="12"
        fontWeight="700"
        fontFamily={FONT}
      >
        {name}
      </text>
      <text
        x={x + 12}
        y={y + 103}
        fill={C.ink3}
        fontSize="9.5"
        fontFamily={FONT}
      >
        {site} · {status}
      </text>
    </g>
  );
}

export function VipSceneMultiSite() {
  const sites = [
    ["Matriz", "18", "17", "São Paulo"],
    ["CD Norte", "32", "32", "Guarulhos"],
    ["Filial 03", "14", "13", "Campinas"],
  ];

  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Três unidades organizadas no mesmo Projeto VIP, com capacidade, câmeras online e saúde visível.">
      <Frame title="Projeto VIP · estrutura" right="64 câmeras" />
      <Line x={30} y={82} size={19} fill={C.ink} weight={700} delay={0.2}>
        Uma operação, vários locais
      </Line>
      <Line x={30} y={106} size={12.5} delay={0.4}>
        Cada unidade mantém seu contexto — e o Projeto conecta tudo.
      </Line>

      {sites.map(([name,total,online,city], i) => {
        const y = 136 + i * 104;
        const health = Number(online) === Number(total);
        return (
          <g key={name} className={styles.sIn} style={d(1 + i * .7)}>
            <rect x="30" y={y} width="740" height="84" rx="9" fill={C.panel} stroke={C.line} />
            <circle cx="52" cy={y + 24} r="5" fill={health ? C.good : C.gold} />
            <text x="70" y={y + 28} fill={C.ink} fontSize="15" fontWeight="700" fontFamily={FONT}>
              {name}
            </text>
            <text x="70" y={y + 49} fill={C.ink3} fontSize="11" fontFamily={FONT}>{city}</text>
            <text x="500" y={y + 31} fill={C.ink2} fontSize="11" fontFamily={FONT}>
              ONLINE
            </text>
            <text x="500" y={y + 57} fill={health ? C.good : C.gold} fontSize="18" fontWeight="700" fontFamily={MONO}>
              {online}/{total}
            </text>
            <rect x="602" y={y + 25} width="144" height="8" rx="4" fill="#25292e" />
            <rect
              className={styles.sGrow}
              style={d(1.3 + i * .7)}
              x="602"
              y={y + 25}
              width={144 * Number(online) / Number(total)}
              height="8"
              rx="4"
              fill={health ? C.good : C.gold}
            />
            <text x="602" y={y + 57} fill={C.ink3} fontSize="10.5" fontFamily={FONT}>
              saúde operacional
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function VipSceneSearch() {
  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Pesquisa em linguagem natural cruzando câmeras e retornando uma sequência com horários e evidências.">
      <Frame title="Pesquisa IA · Projeto inteiro" right="Motor Máximo 2.0" />

      <g className={styles.sIn} style={d(.3)}>
        <rect x="220" y="64" width="550" height="52" rx="26" fill="#1b1d22" stroke={C.line} />
        <text x="246" y="96" fill={C.ink} fontSize="14.5" fontFamily={FONT}>
          em quais câmeras este veículo apareceu hoje?
        </text>
      </g>

      <g className={styles.sIn} style={d(1.8)}>
        <rect x="30" y="142" width="740" height="104" rx="11" fill="#151207" stroke="#5e4a16" />
        <text x="52" y="168" fill={C.gold} fontSize="10" fontWeight="800" fontFamily={FONT}>RESPOSTA</text>
        <text x="52" y="199" fill={C.ink} fontSize="16" fontWeight="700" fontFamily={FONT}>
          Correspondência provável em 3 câmeras, ao longo de 27 minutos.
        </text>
        <text x="52" y="224" fill={C.ink2} fontSize="12.5" fontFamily={FONT}>
          Entrada Matriz → Pátio → Expedição
        </text>
      </g>

      {[
        ["08:41","Entrada Matriz",80],
        ["08:52","Pátio",300],
        ["09:08","Expedição",520],
      ].map(([time,name,x],i)=>(
        <g key={String(name)} className={styles.sIn} style={d(2.6+i*.55)}>
          <circle cx={Number(x)} cy="316" r="7" fill={C.gold} />
          {i<2 ? <line x1={Number(x)+9} y1="316" x2={Number(x)+205} y2="316" stroke="#5b4a1a" strokeWidth="2" /> : null}
          <text x={Number(x)} y="348" fill={C.gold} fontSize="12" fontFamily={MONO} textAnchor="middle">{time}</text>
          <text x={Number(x)} y="369" fill={C.ink2} fontSize="10.5" fontFamily={FONT} textAnchor="middle">{name}</text>
        </g>
      ))}

      <g className={styles.sIn} style={d(4.4)}>
        <rect x="30" y="406" width="740" height="58" rx="9" fill={C.panel} stroke={C.line} />
        <text x="50" y="432" fill={C.ink3} fontSize="10" fontWeight="700" fontFamily={FONT}>
          EVIDÊNCIAS LIGADAS À RESPOSTA
        </text>
        <text x="50" y="451" fill={C.ink2} fontSize="11.5" fontFamily={FONT}>
          Abra os horários no equipamento original ou continue perguntando sobre a sequência.
        </text>
      </g>
    </svg>
  );
}

export function VipSceneSecurity() {
  const rows = [
    ["CRÍTICO", "Câmera Expedição com imagem congelada", C.gold],
    ["REVISAR", "Movimento fora da rotina · CD Norte", C.warn],
    ["CONTEXTO", "Sequência entre Entrada e Pátio", C.good],
  ];

  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Fila de atenção operacional priorizando saúde de câmera, movimento fora da rotina e continuidade entre ambientes.">
      <Frame title="Centro de atenção" right="3 prioridades" />
      <Line x={30} y={82} size={19} fill={C.ink} weight={700} delay={.2}>
        Menos tela. Mais prioridade.
      </Line>
      <Line x={30} y={108} size={12.5} delay={.4}>
        A equipe entra onde existe decisão, não onde existe apenas vídeo.
      </Line>

      {rows.map(([tag,title,color],i)=> {
        const y=145+i*92;
        return (
          <g key={String(tag)} className={styles.sIn} style={d(1+i*.65)}>
            <rect x="30" y={y} width="740" height="72" rx="9" fill={C.panel} stroke={C.line} />
            <rect x="48" y={y+20} width="82" height="26" rx="5" fill="#19170e" stroke={String(color)} />
            <text x="89" y={y+37} fill={String(color)} fontSize="9.5" fontWeight="800" fontFamily={FONT} textAnchor="middle">
              {tag}
            </text>
            <text x="152" y={y+32} fill={C.ink} fontSize="13.5" fontWeight="700" fontFamily={FONT}>
              {title}
            </text>
            <text x="152" y={y+52} fill={C.ink3} fontSize="10.5" fontFamily={FONT}>
              contexto e evidências prontos para revisão
            </text>
            <circle className={styles.sPulse} cx="742" cy={y+36} r="4" fill={String(color)} />
          </g>
        );
      })}

      <g className={styles.sIn} style={d(3.7)}>
        <rect x="30" y="431" width="740" height="40" rx="8" fill="#13150f" />
        <text x="50" y="456" fill={C.gold} fontSize="11.5" fontFamily={FONT}>
          A prioridade acompanha o Projeto — matriz, filiais e central no mesmo fluxo.
        </text>
      </g>
    </svg>
  );
}

export function VipSceneScience() {
  return (
    <svg className={styles.svgScene} viewBox="0 0 800 500" role="img"
      aria-label="Projeto científico analisando uma gravação local em uma linha do tempo e produzindo acontecimentos pesquisáveis.">
      <Frame title="Projeto científico · gravação local" right="Intensive" />
      <Line x={30} y={82} size={19} fill={C.ink} weight={700} delay={.2}>
        Horas de material viram uma linha do tempo consultável
      </Line>
      <Line x={30} y={108} size={12.5} delay={.4}>
        O arquivo continua sendo seu; o Projeto organiza o que foi observado.
      </Line>

      <g className={styles.sIn} style={d(1)}>
        <rect x="30" y="142" width="740" height="118" rx="10" fill={C.panel} stroke={C.line} />
        <text x="50" y="168" fill={C.ink3} fontSize="10" fontFamily={FONT}>GRAVAÇÃO · experimento-07.mp4</text>
        <line x1="50" y1="211" x2="750" y2="211" stroke="#343840" strokeWidth="4" />
        {[100,265,420,610].map((x,i)=>(
          <g key={x} className={styles.sIn} style={d(1.6+i*.5)}>
            <circle cx={x} cy="211" r="7" fill={i===2?C.gold:C.good} />
            <text x={x} y="239" fill={C.ink3} fontSize="9.5" fontFamily={MONO} textAnchor="middle">
              {["00:08","00:21","00:39","00:57"][i]}
            </text>
          </g>
        ))}
      </g>

      <g className={styles.sIn} style={d(3.2)}>
        <rect x="30" y="286" width="740" height="128" rx="10" fill="#151207" stroke="#5b4815" />
        <text x="50" y="313" fill={C.gold} fontSize="10" fontWeight="800" fontFamily={FONT}>CONSULTA</text>
        <text x="50" y="346" fill={C.ink} fontSize="15" fontWeight="700" fontFamily={FONT}>
          “Em quais períodos houve mudança de estado na área observada?”
        </text>
        <text x="50" y="382" fill={C.ink2} fontSize="12.5" fontFamily={FONT}>
          4 ocorrências encontradas · horários e evidências preservados no contexto do Projeto.
        </text>
      </g>

      <Line x={30} y={455} size={11.5} fill={C.ink3} delay={4.2}>
        O mesmo fluxo atende câmeras ao vivo e arquivos locais.
      </Line>
    </svg>
  );
}
