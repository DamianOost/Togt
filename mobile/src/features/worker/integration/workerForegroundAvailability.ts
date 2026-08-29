export const WORKER_FOREGROUND_LOCATION_MAX_AGE_MS = 2 * 60 * 1_000;
export const WORKER_FOREGROUND_LOCATION_MAX_FUTURE_SKEW_MS = 30 * 1_000;

export type WorkerForegroundPosition = Readonly<{
  lat: number;
  lng: number;
  capturedAt: number;
}>;

export type WorkerForegroundLocationProblem = Readonly<{
  type:
    | 'worker_foreground_location_permission_denied'
    | 'worker_foreground_location_unavailable'
    | 'worker_foreground_location_stale';
  title: string;
  detail: string;
}>;

export class WorkerForegroundLocationError extends Error {
  readonly problem: WorkerForegroundLocationProblem;

  constructor(problem: WorkerForegroundLocationProblem) {
    super(problem.title);
    this.name = 'WorkerForegroundLocationError';
    this.problem = problem;
  }
}

export function isWorkerForegroundLocationError(error: unknown): error is WorkerForegroundLocationError {
  return error instanceof WorkerForegroundLocationError;
}

function locationError(
  type: WorkerForegroundLocationProblem['type'],
  title: string,
  detail: string,
): WorkerForegroundLocationError {
  return new WorkerForegroundLocationError(Object.freeze({ type, title, detail }));
}

function validateFreshPosition(position: WorkerForegroundPosition, nowMs: number): WorkerForegroundPosition {
  if (!Number.isFinite(position.lat)
      || !Number.isFinite(position.lng)
      || position.lat < -90
      || position.lat > 90
      || position.lng < -180
      || position.lng > 180
      || !Number.isFinite(position.capturedAt)
      || !Number.isFinite(nowMs)) {
    throw locationError(
      'worker_foreground_location_unavailable',
      'Current location is unavailable',
      'The device did not provide a valid foreground position. Availability was not changed.',
    );
  }

  const ageMs = nowMs - position.capturedAt;
  if (ageMs > WORKER_FOREGROUND_LOCATION_MAX_AGE_MS
      || ageMs < -WORKER_FOREGROUND_LOCATION_MAX_FUTURE_SKEW_MS) {
    throw locationError(
      'worker_foreground_location_stale',
      'A fresh location is needed',
      'The device location was stale or had an invalid timestamp. Availability was not changed.',
    );
  }

  return Object.freeze({
    lat: position.lat,
    lng: position.lng,
    capturedAt: position.capturedAt,
  });
}

export async function requestGroundedWorkerOnlineAvailability<T>(dependencies: Readonly<{
  requestForegroundPermission: () => Promise<boolean>;
  getCurrentForegroundPosition: () => Promise<WorkerForegroundPosition>;
  sendLocationHeartbeat: (position: WorkerForegroundPosition) => Promise<void>;
  requestOnline: () => Promise<T>;
  now?: () => number;
}>): Promise<T> {
  let permissionGranted: boolean;
  try {
    permissionGranted = await dependencies.requestForegroundPermission();
  } catch {
    throw locationError(
      'worker_foreground_location_unavailable',
      'Location permission could not be checked',
      'The device could not confirm foreground location permission. Availability was not changed.',
    );
  }

  if (permissionGranted !== true) {
    throw locationError(
      'worker_foreground_location_permission_denied',
      'Foreground location is required',
      'Allow location while using TOGT, then try again. Availability was not changed.',
    );
  }

  let captured: WorkerForegroundPosition;
  try {
    captured = await dependencies.getCurrentForegroundPosition();
  } catch {
    throw locationError(
      'worker_foreground_location_unavailable',
      'Current location is unavailable',
      'The device could not obtain a foreground position. Availability was not changed.',
    );
  }

  const position = validateFreshPosition(captured, dependencies.now?.() ?? Date.now());
  await dependencies.sendLocationHeartbeat(position);
  return dependencies.requestOnline();
}
