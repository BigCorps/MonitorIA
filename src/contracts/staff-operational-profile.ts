export type StaffProfileStatus = "active" | "paused" | "retired";
export type StaffProfileUpdateMode = "manual" | "reviewed_learning";
export type StaffProfileCandidateStatus =
  | "learning"
  | "pending_review"
  | "approved"
  | "rejected"
  | "expired"
  | "merged";
export type StaffProfileDecision =
  | "matched"
  | "candidate"
  | "review_required"
  | "unknown"
  | "not_staff";
export type StaffProfileReviewStatus =
  | "not_required"
  | "pending"
  | "confirmed"
  | "reassigned"
  | "rejected"
  | "not_staff"
  | "uncertain";
export type StaffProfileProposalStatus =
  | "pending"
  | "applied"
  | "rejected"
  | "expired";

export type ShiftWindow = {
  weekday: number;
  startMinute: number;
  medianMinute: number;
  endMinute: number;
  observations: number;
};

export type StaffOperationalProfile = {
  id: string;
  cameraId: string;
  cameraName: string;
  label: string;
  description: string;
  status: StaffProfileStatus;
  version: number;
  updateMode: StaffProfileUpdateMode;
  minSimilarity: number;
  habitualZoneIds: string[];
  habitualZoneNames: string[];
  habitualActionCodes: string[];
  habitualSessionTypes: string[];
  habitualWeekdays: number[];
  shiftWindows: ShiftWindow[];
  recurringAppearanceSummary: string[];
  observationCount: number;
  distinctDaysCount: number;
  confidence: number;
  lastObservedAt: string | null;
  lastReviewedAt: string | null;
  lockedFields: string[];
  pendingProposalCount: number;
};

export type StaffProfileCandidate = {
  id: string;
  cameraId: string;
  cameraName: string;
  status: StaffProfileCandidateStatus;
  suggestedLabel: string;
  zoneIds: string[];
  zoneNames: string[];
  actionCodes: string[];
  sessionTypes: string[];
  weekdays: number[];
  shiftWindows: ShiftWindow[];
  appearanceSummary: string[];
  observationCount: number;
  distinctDaysCount: number;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string;
  evidenceEventIds: string[];
};

export type StaffProfileMatchDecision = {
  id: string;
  cameraId: string;
  cameraName: string;
  eventId: string;
  eventPersonId: string;
  staffProfileId: string | null;
  staffProfileLabel: string | null;
  candidateId: string | null;
  decision: StaffProfileDecision;
  reviewStatus: StaffProfileReviewStatus;
  appearanceScore: number;
  zoneScore: number;
  actionScore: number;
  scheduleScore: number;
  totalScore: number;
  reasons: string[];
  observedAt: string;
};

export type StaffProfileUpdateProposal = {
  id: string;
  staffProfileId: string;
  staffProfileLabel: string;
  cameraId: string;
  cameraName: string;
  status: StaffProfileProposalStatus;
  proposedZoneIds: string[];
  proposedZoneNames: string[];
  proposedActionCodes: string[];
  proposedSessionTypes: string[];
  proposedWeekdays: number[];
  proposedShiftWindows: ShiftWindow[];
  proposedAppearanceSummary: string[];
  observationCount: number;
  distinctDaysCount: number;
  confidence: number;
  reason: string;
  evidenceEventIds: string[];
  createdAt: string;
  validUntil: string;
};

export type StaffOperationalProfileOverview = {
  profiles: StaffOperationalProfile[];
  candidates: StaffProfileCandidate[];
  decisions: StaffProfileMatchDecision[];
  proposals: StaffProfileUpdateProposal[];
  summary: {
    activeProfiles: number;
    learningProfiles: number;
    pendingCandidates: number;
    pendingDecisions: number;
    pendingProposals: number;
  };
};
