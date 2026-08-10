"use client";

import { useActionState } from "react";
import type { SiteSummary } from "@/src/lib/dashboard-data";
import { createCameraAction } from "./actions";
import { initialCameraActionState } from "./camera-action-state";
import { PairingResult } from "./pairing-result";

type Props = {
  sites: SiteSummary[];
};

export function CameraSetupForm({ sites }: Props) {
  const [state, formAction, pending] = useActionState(
    createCameraAction,
    initialCameraActionState,
  );

  if (state.status === "success") {
    return <PairingResult state={state} />;
  }

  return (
    <form action={formAction} className="camera-setup-form">
      {state.status === "error" ? (
        <div className="form-alert error">{state.message}</div>
      ) : null}

      <div className="camera-form-grid">
        <label>
          <span>Nome da câmera</span>
          <input
            name="name"
            placeholder="Ex.: Entrada da loja"
            minLength={2}
            maxLength={160}
            required
          />
        </label>

        <label>
          <span>Local</span>
          <select name="site_id" required defaultValue={sites[0]?.id ?? ""}>
            {sites.map((site) => (
              <option value={site.id} key={site.id}>
                {site.name}
              </option>
            ))}
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

      <div className="camera-security-note">
        <strong>O plano será escolhido depois do cadastro.</strong>
        <p>
          Em Planos, você poderá combinar Essencial, Atenta e Detalhada e ver o
          desconto progressivo antes de gerar a cobrança.
        </p>
      </div>

      <label>
        <span>O que essa câmera deve acompanhar?</span>
        <textarea
          name="monitoring_goals"
          rows={6}
          placeholder={[
            "Registrar entrada e saída de pessoas",
            "Identificar veículos e suas cores",
            "Detectar retirada de objetos do balcão",
          ].join("\n")}
        />
        <small className="field-help">
          Digite um objetivo por linha. A IA poderá aprimorar isso depois do
          primeiro frame.
        </small>
      </label>

      <div className="camera-security-note">
        <strong>Os dados de acesso da câmera não serão informados aqui.</strong>
        <p>
          O endereço, o usuário e a senha da câmera ficam guardados no
          computador onde o MonitorIA for instalado. Quando você usa a busca
          pelo painel, a senha é usada apenas para conectar naquele momento e
          é descartada assim que a busca termina.
        </p>
      </div>

      <button className="auth-submit" type="submit" disabled={pending}>
        {pending ? "Criando câmera..." : "Criar câmera e gerar código"}
      </button>
    </form>
  );
}
