import type {
  CameraVisualEntity,
  VisualStateObservation,
} from "@/src/contracts/visual-state";

export function allowedVisualEntityIds(
  entities: CameraVisualEntity[],
): ReadonlySet<string> {
  return new Set(
    entities.map((entity) => entity.id),
  );
}

export function normalizeVisualStateObservations(
  observations: VisualStateObservation[],
  entities: CameraVisualEntity[],
): VisualStateObservation[] {
  const byId = new Map(
    entities.map((entity) => [entity.id, entity]),
  );

  return observations.flatMap((observation) => {
    const entity = byId.get(observation.entityId);
    if (!entity) return [];

    const allowedStates = new Set([
      "unknown",
      ...entity.stateDefinitions.map(
        (definition) => definition.state,
      ),
    ]);

    if (!allowedStates.has(observation.observedState)) {
      return [];
    }

    if (
      observation.previousVisibleState === "unknown" ||
      (observation.previousVisibleState &&
        !allowedStates.has(
          observation.previousVisibleState,
        ))
    ) {
      return [
        {
          ...observation,
          previousVisibleState: null,
        },
      ];
    }

    return [observation];
  });
}
