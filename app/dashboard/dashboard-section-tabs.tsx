"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  dashboardNavigationGroups,
  type DashboardNavigationGroupId,
  type DashboardNavigationItem,
} from "./dashboard-navigation";
import styles from "./dashboard-section-tabs.module.css";

type Props = {
  group: DashboardNavigationGroupId;
  density?: "comfortable" | "compact";
  className?: string;
};

function itemIsActive(
  pathname: string,
  item: DashboardNavigationItem,
) {
  const excluded = item.excludePrefixes?.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (excluded) return false;

  if (item.exactPaths?.includes(pathname)) return true;

  return (
    item.activePrefixes?.some((prefix) =>
      pathname.startsWith(prefix),
    ) ?? false
  );
}

type MonitoringNotice = {
  title: string;
  text: string;
  tone?: "active" | "learning" | "neutral";
};

function monitoringNotice(pathname: string): MonitoringNotice | null {
  if (
    pathname === "/dashboard/events" ||
    pathname.startsWith("/dashboard/events?")
  ) {
    return {
      title: "Monitoramento ativo · analisando novos acontecimentos",
      text:
        "Os acontecimentos não aparecem instantaneamente. O MonitorIA acompanha o movimento até ele terminar e depois faz a análise com IA. Normalmente um novo registro aparece em 1 a 3 minutos após o fim do acontecimento; movimentos longos podem levar um pouco mais.",
      tone: "active",
    };
  }

  if (pathname.startsWith("/dashboard/sessions")) {
    return {
      title: "Períodos são formados automaticamente",
      text:
        "O MonitorIA agrupa acontecimentos relacionados em períodos operacionais. No começo pode aparecer zero mesmo com acontecimentos já registrados; os primeiros períodos surgem conforme eventos relacionados começam a formar uma sequência.",
      tone: "learning",
    };
  }

  if (pathname.startsWith("/dashboard/routines")) {
    return {
      title: "Aprendendo a rotina da operação",
      text:
        "Rotinas não são inferidas a partir de poucas horas. O sistema compara dias e horários recorrentes e, por segurança, precisa de pelo menos 5 dias observados antes de considerar um padrão confiável.",
      tone: "learning",
    };
  }

  if (pathname.startsWith("/dashboard/processes")) {
    return {
      title: "Processos são reconstruídos a partir dos períodos",
      text:
        "Atendimentos, entregas, abertura, fechamento e outras sequências são montados a partir dos acontecimentos e períodos já observados. Zero no início significa que ainda não houve uma sequência suficiente para fechar um processo.",
      tone: "learning",
    };
  }

  if (pathname.startsWith("/dashboard/operational-profiles")) {
    return {
      title: "Padrões da operação estão em aprendizado",
      text:
        "O MonitorIA usa acontecimentos já analisados para aprender padrões recorrentes sem reconhecimento facial. Uma sugestão só começa a ganhar forma depois de múltiplas observações em dias diferentes e continua sujeita à revisão humana.",
      tone: "learning",
    };
  }

  if (pathname.startsWith("/dashboard/camera-health")) {
    return {
      title: "Funcionamento é verificado em segundo plano",
      text:
        "A imagem é medida periodicamente para observar luz, nitidez, obstrução, congelamento e mudança de enquadramento. As primeiras medições aparecem após o Agent enviar amostras e o sistema começar a formar uma referência.",
      tone: "active",
    };
  }

  if (pathname.startsWith("/dashboard/operations")) {
    return {
      title: "Zero alertas é um resultado normal",
      text:
        "Esta seção mostra situações que realmente pedem atenção. Se câmera, Agent e operação estiverem normais, o esperado é permanecer em zero; as verificações continuam rodando em segundo plano.",
      tone: "active",
    };
  }

  if (pathname.startsWith("/dashboard/intelligence/cross-camera")) {
    return {
      title: "Entre câmeras precisa de pelo menos duas câmeras",
      text:
        "As passagens aparecem somente quando o mesmo local possui observações compatíveis em câmeras diferentes. Com uma única câmera, zero é o comportamento correto. As hipóteses usam tempo e características visuais, sem reconhecimento facial.",
      tone: "neutral",
    };
  }

  return null;
}

function NavigationLink({
  pathname,
  item,
}: {
  pathname: string;
  item: DashboardNavigationItem;
}) {
  const active = itemIsActive(pathname, item);

  return (
    <Link
      href={item.href}
      key={item.id}
      className={active ? styles.active : undefined}
      aria-current={active ? "page" : undefined}
    >
      {item.label}
    </Link>
  );
}

export function DashboardSectionTabs({
  group,
  density = "comfortable",
  className = "",
}: Props) {
  const pathname = usePathname();
  const navigation = dashboardNavigationGroups[group];
  const notice = group === "monitoring" ? monitoringNotice(pathname) : null;

  const { primaryItems, advancedItems } = useMemo(() => {
    if (group !== "monitoring") {
      return {
        primaryItems: navigation.items,
        advancedItems: [] as DashboardNavigationItem[],
      };
    }

    return {
      primaryItems: navigation.items.filter((item) =>
        ["events", "sessions"].includes(item.id),
      ),
      advancedItems: navigation.items.filter(
        (item) => !["events", "sessions"].includes(item.id),
      ),
    };
  }, [group, navigation.items]);

  const advancedRouteActive = advancedItems.some((item) =>
    itemIsActive(pathname, item),
  );
  const [advancedOpen, setAdvancedOpen] = useState(advancedRouteActive);

  useEffect(() => {
    if (advancedRouteActive) {
      setAdvancedOpen(true);
    }
  }, [advancedRouteActive]);

  return (
    <>
      <nav
        className={[
          styles.tabs,
          density === "compact" ? styles.compact : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label={navigation.label}
        data-dashboard-tabs={group}
      >
        <div className={styles.scroller}>
          {primaryItems.map((item) => (
            <NavigationLink
              key={item.id}
              pathname={pathname}
              item={item}
            />
          ))}

          {group === "monitoring" && advancedItems.length ? (
            <button
              type="button"
              className={[
                styles.advancedButton,
                advancedRouteActive ? styles.active : "",
                advancedOpen ? styles.advancedOpen : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-expanded={advancedOpen}
              aria-controls="monitoring-advanced-tabs"
              onClick={() => setAdvancedOpen((current) => !current)}
            >
              Avançado
              <span aria-hidden="true">{advancedOpen ? "⌃" : "⌄"}</span>
            </button>
          ) : null}
        </div>

        {group === "monitoring" && advancedOpen ? (
          <div
            id="monitoring-advanced-tabs"
            className={styles.advancedRow}
          >
            <div className={styles.advancedScroller}>
              {advancedItems.map((item) => (
                <NavigationLink
                  key={item.id}
                  pathname={pathname}
                  item={item}
                />
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      {notice ? (
        <section
          className={[
            styles.monitoringNotice,
            notice.tone === "learning"
              ? styles.learningNotice
              : notice.tone === "neutral"
                ? styles.neutralNotice
                : styles.activeNotice,
          ].join(" ")}
          aria-live="polite"
        >
          <span className={styles.noticeIndicator} aria-hidden="true">
            <i />
          </span>
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.text}</p>
          </div>
        </section>
      ) : null}
    </>
  );
}
