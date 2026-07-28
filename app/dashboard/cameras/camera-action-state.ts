export type CameraActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  cameraId?: string;
  cameraName?: string;
  pairingCode?: string;
  expiresAt?: string;
};

export const initialCameraActionState: CameraActionState = {
  status: "idle",
};
