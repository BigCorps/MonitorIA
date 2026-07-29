export type MonitoringActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialMonitoringActionState: MonitoringActionState = {
  status: "idle",
  message: "",
};
