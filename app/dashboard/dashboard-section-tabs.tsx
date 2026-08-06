"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function DashboardSectionTabs({
  group,
  density = "comfortable",
  className = "",
}: Props) {
  const pathname = usePathname();
  const navigation = dashboardNavigationGroups[group];

  return (
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
        {navigation.items.map((item) => {
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
        })}
      </div>
    </nav>
  );
}
