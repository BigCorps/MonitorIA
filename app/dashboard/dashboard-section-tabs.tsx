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
import { useDashboardSourceContext } from "./dashboard-source-context";
import type { OrganizationSourceMode } from "@/src/lib/source-mode";

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

function monitoringNotice(
  pathname: string,
  mode: OrganizationSourceMode,
): MonitoringNotice | null {
  const recordingOnly = mode === "recordings_only";
  const hybrid = mode === "hybrid";

  if (
    pathname === "/dashboard/events" ||
    pathname.startsWith("/dashboard/events?")
  ) {
    if (recordingOnly) {
      return {
        title: "Resultados das gravações analisadas",
        text:
          "Os acontecimentos desta tela vêm dos arquivos enviados aos seus ambientes. " +
          "Novos registros aparecem quando outra gravação é analisada.",
        tone: "neutral",
      };
    }

    if (hybrid) {
      return {
        title: "Câmeras conectadas e gravações no mesmo histórico",
        text:
          "Acontecimentos das câmeras conectadas e dos arquivos analisados aparecem juntos. " +
          "Use os filtros para consultar uma fonte específica.",
        tone: "active",
      };
    }

    return {
      title: "Monitoramento ativo · analisando novos acontecimentos",
      text:
        "Os acontecimentos não aparecem instantaneamente. O MonitorIA acompanha o movimento " +
        "até ele terminar e depois faz a análise com IA.",
      tone: "active",
    };
  }

  if (pathname.startsWith("/dashboard/sessions")) {
    return {
      title: recordingOnly
        ? "Períodos são formados a partir das gravações analisadas"
        : "Períodos são formados automaticamente",
      text: recordingOnly
        ? "O MonitorIA agrupa acontecimentos relacionados dentro do histórico dos arquivos enviados."
        : "O MonitorIA agrupa acontecimentos relacionados em períodos operacionais conforme novos registros chegam.",
      tone: "learning",
    };
  }

  if (pathname.startsWith("/dashboard/routines")) {
    return {
      title: recordingOnly
        ? "Padrões históricos podem ser aprendidos com suas gravações"
        : "Aprendendo a rotina da operação",
      text: recordingOnly
        ? "Quanto mais dias e horários diferentes você enviar, melhor o MonitorIA consegue reconhecer padrões históricos. Gravações não geram alertas sobre o que está acontecendo agora."
        : "O sistema compara dias e horários recorrentes e precisa de observações suficientes antes de considerar um padrão confiável.",
      tone: "learning",
    };
  }

  if (pathname.startsWith("/dashboard/processes")) {
    return {
      title: recordingOnly
        ? "Processos são reconstruídos a partir dos arquivos analisados"
        : "Processos são reconstruídos a partir dos períodos",
      text:
        "Atendimentos, entregas, abertura, fechamento e outras sequências são montados a partir dos acontecimentos já analisados.",
      tone: "learning",
    };
  }

  if (pathname.startsWith("/dashboard/operational-profiles")) {
    return {
      title: "Padrões da operação são aprendidos a partir do histórico",
      text:
        "O MonitorIA usa acontecimentos analisados para reconhecer padrões recorrentes sem reconhecimento facial.",
      tone: "learning",
    };
  }

  if (pathname.startsWith("/dashboard/camera-health")) {
    return recordingOnly
      ? {
          title: "Funcionamento contínuo é para câmeras conectadas",
          text:
            "Ambientes de gravação não ficam online ou offline. Esta área será usada quando você conectar uma câmera ao MonitorIA.",
          tone: "neutral",
        }
      : {
          title: "Funcionamento das câmeras é verificado continuamente",
          text:
            "O MonitorIA acompanha comunicação, qualidade da imagem e mudanças importantes das câmeras conectadas.",
          tone: "active",
        };
  }

  if (pathname.startsWith("/dashboard/operations")) {
    return recordingOnly
      ? {
          title: "Alertas de conexão só se aplicam a câmeras conectadas",
          text:
            "Acontecimentos encontrados nas gravações ficam no histórico. Esta área também pode mostrar avisos gerais da conta quando necessário.",
          tone: "neutral",
        }
      : {
          title: "Zero alertas é um resultado normal",
          text:
            "Esta seção mostra situações que realmente pedem atenção no monitoramento contínuo e na conta.",
          tone: "active",
        };
  }

  if (pathname.startsWith("/dashboard/intelligence/cross-camera")) {
    return recordingOnly
      ? {
          title: "Entre câmeras é um recurso do monitoramento contínuo",
          text:
            "Arquivos enviados permanecem independentes. Para acompanhar passagens entre câmeras em sequência, conecte as câmeras ao MonitorIA.",
          tone: "neutral",
        }
      : {
          title: "Entre câmeras precisa de pelo menos duas câmeras conectadas",
          text:
            "As passagens aparecem quando o mesmo local possui observações compatíveis em câmeras diferentes.",
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
  const { mode } = useDashboardSourceContext();
  const navigation = dashboardNavigationGroups[group];
  const notice =
    group === "monitoring"
      ? monitoringNotice(pathname, mode)
      : null;

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
      advancedItems: navigation.items
        .filter(
          (item) => !["events", "sessions"].includes(item.id),
        )
        .filter(
          (item) =>
            mode !== "recordings_only" ||
            !["health", "cross-camera"].includes(item.id),
        ),
    };
  }, [group, mode, navigation.items]);

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

      {group === "cameras" && pathname === "/dashboard/installer" ? (
        <section
          className={[styles.monitoringNotice, styles.neutralNotice].join(" ")}
        >
          <span className={styles.noticeIndicator} aria-hidden="true">
            <i />
          </span>
          <div>
            <strong>Já existe um computador instalado?</strong>
            <p>
              Para trocar de PC, reparar uma instalação ou mudar entre 24/7 e
              Microsoft Store, use o assistente de manutenção.{" "}
              <Link
                href="/dashboard/installer/pair"
                style={{ color: "#08745f", fontWeight: 800 }}
              >
                Trocar ou reparar computador →
              </Link>
            </p>
          </div>
        </section>
      ) : null}

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
