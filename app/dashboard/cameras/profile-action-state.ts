export type CameraProfileActionState = {
  status: "idle" | "success" | "error";
  message: string;
  profileId?: string;
};

export const initialCameraProfileActionState: CameraProfileActionState = {
  status: "idle",
  message: "",
};
