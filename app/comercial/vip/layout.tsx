import type { ReactNode } from "react";
import Link from "next/link";
import nav from "./commercial-nav.module.css";

export default function VipCommercialLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <nav className={nav.bar} aria-label="Operação comercial MonitorIA VIP">
        <Link href="/comercial/vip" className={nav.brand}>
          MonitorIA <b>VIP</b> · Comercial
        </Link>
        <div>
          <Link href="/comercial/vip">Carteira VIP</Link>
          <Link href="/comercial/vip/nova" className={nav.primary}>
            + Nova apresentação assistida
          </Link>
        </div>
      </nav>
      {children}
    </>
  );
}
