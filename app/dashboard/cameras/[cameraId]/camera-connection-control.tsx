"use client";

import { useFormStatus } from "react-dom";
import { setCameraConnectionAction } from "../actions";

function ToggleButton({
  enabled,
}: {
  enabled: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        minHeight: "38px",
        border: enabled
          ? "1px solid #e4b9c1"
          : "1px solid #a9dec9",
        borderRadius: "9px",
        background: enabled ? "#fff8f9" : "#effaf5",
        color: enabled ? "#96394a" : "#126d4e",
        padding: "0 13px",
        fontSize: "11px",
        fontWeight: 850,
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending
        ? "Atualizando..."
        : enabled
          ? "Desconectar câmera"
          : "Reconectar câmera"}
    </button>
  );
}

export function CameraConnectionControl({
  cameraId,
  cameraName,
  paired,
  enabled,
  canManage,
}: {
  cameraId: string;
  cameraName: string;
  paired: boolean;
  enabled: boolean;
  canManage: boolean;
}) {
  if (!paired) {
    return (
      <p
        style={{
          margin: "14px 0 0",
          color: "#718096",
          fontSize: "11px",
          lineHeight: 1.55,
        }}
      >
        Esta câmera ainda não está conectada a um computador.
      </p>
    );
  }

  return (
    <div
      style={{
        marginTop: "16px",
        paddingTop: "15px",
        borderTop: "1px solid #e4e9ef",
        display: "grid",
        gap: "10px",
      }}
    >
      <div>
        <strong
          style={{
            display: "block",
            color: "#2e435a",
            fontSize: "11px",
          }}
        >
          {enabled
            ? "Monitoramento desta câmera está habilitado"
            : "Esta câmera está desconectada"}
        </strong>
        <p
          style={{
            margin: "5px 0 0",
            color: "#718096",
            fontSize: "10px",
            lineHeight: 1.55,
          }}
        >
          {enabled
            ? "Use a desconexão se a imagem estiver ruim, indisponível ou se você não quiser mais coletar acontecimentos desta câmera."
            : "A configuração local foi preservada. Reconecte quando quiser voltar a monitorar."}
        </p>
      </div>

      {canManage ? (
        <form
          action={setCameraConnectionAction}
          onSubmit={(event) => {
            if (
              enabled &&
              !window.confirm(
                `Desconectar “${cameraName}”? O MonitorIA deixará de coletar novos acontecimentos desta câmera, mas o cadastro e o histórico serão preservados.`,
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input
            type="hidden"
            name="camera_id"
            value={cameraId}
          />
          <input
            type="hidden"
            name="enabled"
            value={enabled ? "0" : "1"}
          />
          <ToggleButton enabled={enabled} />
        </form>
      ) : null}

      <small
        style={{
          color: "#8795a6",
          fontSize: "9px",
          lineHeight: 1.5,
        }}
      >
        Desconectar a câmera interrompe a coleta, mas não cancela
        automaticamente uma assinatura ativa.
      </small>
    </div>
  );
}
