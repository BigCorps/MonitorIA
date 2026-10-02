"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  createSitePairingCodeAction,
  getSitePairingOptionsAction,
  type SitePairingOption,
  type SitePairingState,
} from "./site-pairing-actions";
import { FirstRunWaiting } from "./first-run-waiting";
import styles from "./first-run.module.css";

const initial: SitePairingState = { status: "idle" };

export function SitePairingCode() {
  const pathname = usePathname();
  const vipExperience = pathname.startsWith("/vip/");
  const [state, formAction, pending] = useActionState(
    createSitePairingCodeAction,
    initial,
  );
  const [copied, setCopied] = useState(false);
  const [sites, setSites] = useState<SitePairingOption[]>([]);
  const [sitesLoading, setSitesLoading] = useState(vipExperience);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState("");

  useEffect(() => {
    if (!vipExperience) return;

    let active = true;
    void getSitePairingOptionsAction().then((result) => {
      if (!active) return;
      setSitesLoading(false);
      if (result.status === "error") {
        setSitesError(result.message ?? "Não foi possível carregar os Locais.");
        return;
      }
      setSites(result.sites);
      if (result.sites.length === 1) {
        setSelectedSiteId(result.sites[0].id);
      } else if (result.sites.length === 0) {
        setSelectedSiteId("__new__");
      }
    });

    return () => {
      active = false;
    };
  }, [vipExperience]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites],
  );

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      setCopied(false);
    }
  }

  if (state.status === "success" && state.code) {
    return (
      <>
        <div className={styles.pairingCodeBox}>
          <span>SEU CÓDIGO</span>
          <div className={styles.pairingCodeRow}>
            <strong>{state.code}</strong>
            <button
              type="button"
              className={styles.pairingCopy}
              onClick={() => void copy(state.code as string)}
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <p>
            {vipExperience && (state.siteName || selectedSite)
              ? `Digite este código no MonitorIA instalado em ${state.siteName ?? selectedSite?.name}. Este computador ficará responsável pelas câmeras deste Local.`
              : "Digite este código no MonitorIA instalado no computador. Ele vale 15 minutos."}
          </p>
        </div>

        <FirstRunWaiting
          stage={1}
          waitingFor="Esperando o computador se conectar"
          detail="Assim que a conexão terminar, esta página avança sozinha."
        />
      </>
    );
  }

  return (
    <form action={formAction} className={styles.pairingForm}>
      {vipExperience ? (
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          <strong style={{ color: "#263f57", fontSize: 12 }}>
            Onde este computador está instalado?
          </strong>
          <span style={{ color: "#71849a", fontSize: 10, lineHeight: 1.5 }}>
            Cada Local mantém seu próprio computador e suas próprias câmeras.
            Conectar um novo Local não desativa os outros.
          </span>

          {sitesLoading ? (
            <span style={{ color: "#71849a", fontSize: 10 }}>
              Carregando seus Locais…
            </span>
          ) : sitesError ? (
            <div className="form-alert error">{sitesError}</div>
          ) : sites.length === 1 && selectedSiteId !== "__new__" ? (
            <>
              <input type="hidden" name="site_id" value={sites[0].id} />
              <div style={{ padding: 11, border: "1px solid #d8e2ea", borderRadius: 9, color: "#29425a", fontSize: 11 }}>
                <strong>{sites[0].name}</strong>
                <span style={{ display: "block", marginTop: 3, color: "#71849a" }}>
                  Este computador ficará responsável pelas câmeras deste Local.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSiteId("__new__")}
                style={{ border: 0, background: "transparent", color: "#218b75", textAlign: "left", padding: 0, fontWeight: 800, fontSize: 10, cursor: "pointer" }}
              >
                + Criar novo Local
              </button>
            </>
          ) : (
            <>
              <select
                name="site_id"
                value={selectedSiteId}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                required
                style={{ minHeight: 42, border: "1px solid #d8e2ea", borderRadius: 9, padding: "0 10px" }}
              >
                {sites.length ? <option value="">Selecione o Local</option> : null}
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
                <option value="__new__">+ Criar novo Local</option>
              </select>
              {selectedSiteId === "__new__" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 7 }}>
                  <input
                    type="text"
                    name="new_site_name"
                    minLength={2}
                    maxLength={160}
                    required
                    placeholder="Nome do novo Local · Ex.: Posto Norte"
                    style={{ minHeight: 42, border: "1px solid #d8e2ea", borderRadius: 9, padding: "0 10px" }}
                  />
                  <input type="hidden" name="new_site_timezone" value="America/Sao_Paulo" />
                  <span style={{ color: "#71849a", fontSize: 9 }}>
                    O novo Local fica na mesma empresa e terá seu próprio computador e suas próprias câmeras.
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="form-alert error">{state.message}</div>
      ) : null}
      <button
        className="panel-primary-action"
        type="submit"
        disabled={
          pending ||
          (vipExperience && (sitesLoading || !selectedSiteId))
        }
      >
        {pending ? "Gerando..." : "Gerar código de conexão"}
      </button>
    </form>
  );
}
