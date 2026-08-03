"use client";

import { useActionState } from "react";
import { regeneratePairingCodeAction } from "./actions";
import { initialCameraActionState } from "./camera-action-state";
import { PairingResult } from "./pairing-result";

type Props = {
  cameraId: string;
  paired: boolean;
};

export function PairingCodeGenerator({ cameraId, paired }: Props) {
  const [state, formAction, pending] = useActionState(
    regeneratePairingCodeAction,
    initialCameraActionState,
  );

  return (
    <div className="pairing-generator">
      <PairingResult state={state} />

      {state.status !== "success" ? (
        <>
          {state.status === "error" ? (
            <div className="form-alert error">{state.message}</div>
          ) : null}

          <p>
            {paired
              ? "Gerar outro código substituirá o vínculo ativo quando um novo Agent concluir o pareamento."
              : "Gere um código temporário para vincular esta câmera ao computador do estabelecimento."}
          </p>

          <div className="form-alert info">
            Instale o Agent primeiro. Gere este código só quando o
            instalador pedir — ele vale 15 minutos, e o download costuma
            levar mais tempo que isso em conexão de estabelecimento.
          </div>

          <form action={formAction}>
            <input type="hidden" name="camera_id" value={cameraId} />
            <button
              className="panel-primary-action"
              type="submit"
              disabled={pending}
            >
              {pending
                ? "Gerando..."
                : paired
                  ? "Gerar código para novo Agent"
                  : "Gerar código de pareamento"}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
