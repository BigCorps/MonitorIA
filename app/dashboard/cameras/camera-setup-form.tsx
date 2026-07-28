"use client";

import { useActionState } from "react";
import type { SiteSummary } from "@/src/lib/dashboard-data";
import { createCameraAction, initialCameraActionState } from "./actions";
import { PairingResult } from "./pairing-result";

type Props = {
  sites: SiteSummary[];
};

const planOptions = [
  {
    value: "basic",
    name: "Básico",
    interval: "Consolidação em até 60 segundos",
    description: "Menos detalhes enviados, mantendo observação local frequente.",
  },
  {
    value: "standard",
    name: "Padrão",
    interval: "Consolidação em até 10 segundos",
    description: "Equilíbrio entre precisão temporal, custo e riqueza dos eventos.",
  },
  {
    value: "intensive",
    name: "Intensivo",
    interval: "Consolidação em até 1 segundo",
    description: "Maior precisão para áreas com eventos rápidos ou críticos.",
  },
];

export function CameraSetupForm({ sites }: Props) {
  const [state, formAction, pending] = useActionState(createCameraAction, initialCameraActionState);

  if (state.status === "success") {
    return <PairingResult state={state} />;
  }

  return (
    <form action={formAction} className="camera-setup-form">
      {state.status === "error" ? <div className="form-alert error">{state.message}</div> : null}

      <div className="camera-form-grid">
        <label>
          <span>Nome da câmera</span>
          <input name="name" placeholder="Ex.: Entrada da loja" minLength={2} maxLength={160} required />
        </label>

        <label>
          <span>Local</span>
          <select name="site_id" required defaultValue={sites[0]?.id ?? ""}>
            {sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}
          </select>
        </label>
      </div>

      <label>
        <span>Descrição opcional</span>
        <textarea
          name="description"
          maxLength={500}
          placeholder="Ex.: Câmera interna voltada para a porta principal e o balcão."
        />
      </label>

      <fieldset className="plan-selector">
        <legend>Precisão do plano</legend>
        <div>
          {planOptions.map((plan) => (
            <label key={plan.value}>
              <input type="radio" name="plan" value={plan.value} defaultChecked={plan.value === "standard"} />
              <span>
                <strong>{plan.name}</strong>
                <small>{plan.interval}</small>
                <em>{plan.description}</em>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label>
        <span>O que essa câmera deve acompanhar?</span>
        <textarea
          name="monitoring_goals"
          rows={6}
          placeholder={[
            "Registrar entrada e saída de pessoas",
            "Identificar veículos e suas cores",
            "Sugerir placas quando estiverem visíveis",
            "Detectar retirada de objetos do balcão",
          ].join("\n")}
        />
        <small className="field-help">Digite um objetivo por linha. A IA poderá aprimorar isso depois do primeiro frame.</small>
      </label>

      <div className="camera-security-note">
        <strong>A URL RTSP não será informada aqui.</strong>
        <p>O endereço, usuário e senha da câmera ficarão somente no computador onde o MonitorIA Agent será instalado.</p>
      </div>

      <button className="auth-submit" type="submit" disabled={pending}>
        {pending ? "Criando câmera..." : "Criar câmera e gerar código"}
      </button>
    </form>
  );
}
