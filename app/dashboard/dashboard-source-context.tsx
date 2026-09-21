"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  EMPTY_SOURCE_CONTEXT,
  type OrganizationSourceContext,
} from "@/src/lib/source-mode";

const DashboardSourceContext =
  createContext<OrganizationSourceContext>(
    EMPTY_SOURCE_CONTEXT,
  );

export function DashboardSourceProvider({
  value,
  children,
}: {
  value: OrganizationSourceContext;
  children: ReactNode;
}) {
  return (
    <DashboardSourceContext.Provider value={value}>
      {children}
    </DashboardSourceContext.Provider>
  );
}

export function useDashboardSourceContext() {
  return useContext(DashboardSourceContext);
}
