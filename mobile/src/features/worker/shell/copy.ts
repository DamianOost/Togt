import type { DurationEstimate, TravelEstimate, ZarAmount } from './model';

export const WORKER_SHELL_SOURCE_LOCALE = 'en-ZA' as const;
export const WORKER_SHELL_TIMEZONE = 'Africa/Johannesburg' as const;

export const WORKER_SHELL_COPY_EN_ZA = Object.freeze({
  'common.retry': 'Retry',
  'common.refresh': 'Refresh status',
  'common.notAvailable': 'Not available',
  'common.lastUpdated': 'Last updated {time}',
  'common.offline': 'You’re offline. Live actions are paused until you reconnect.',
  'common.loading': 'Loading the latest information…',
  'common.viewDetails': 'View details',
  'common.unknown': 'Awaiting verified information',
  'today.title': 'Today',
  'today.greeting': 'Good {dayPeriod}, {name}',
  'today.identityVerified': 'Identity verified',
  'today.identityPending': 'Verification in review',
  'today.identityUnverified': 'Verification required',
  'today.identityUnknown': 'Verification status unavailable',
  'today.profilePhoto': '{name} profile photo',
  'today.availabilityTitle': 'Availability',
  'today.online': 'Online',
  'today.onlineBody': 'Your server-confirmed availability is online.',
  'today.onlineReconnect': 'Online — reconnect to receive nearby jobs',
  'today.onlineReconnectBody': 'Your waiting-for-offers heartbeat is stale. Reconnect to restore Fast Match eligibility.',
  'today.onlineIneligible': 'Online — not eligible for Fast Match',
  'today.onlineIneligibleBody': 'Open availability details to see the server-confirmed requirement.',
  'today.offline': 'Offline',
  'today.offlineBody': 'You are not receiving Fast Match offers.',
  'today.availabilityUnknown': 'Availability unavailable',
  'today.availabilityUnknownBody': 'Refresh before changing your availability. No online state has been assumed.',
  'today.switchOnline': 'Go online',
  'today.switchOffline': 'Go offline',
  'today.locationExplanation': 'Location is shared only for eligible nearby offers and during the approved active-job window.',
  'today.nextJob': 'Next job',
  'today.noNextJob': 'No next job is confirmed',
  'today.noNextJobBody': 'Scheduled work will appear here after the server confirms it.',
  'today.weeklyEarnings': 'This week’s net earnings',
  'today.weeklyEarningsBody': 'Uses the same server ledger definition as Earnings.',
  'today.newOffers': 'New offers',
  'today.offerCount': '{count} open',
  'today.activation': 'Set up for success',
  'today.openActivation': 'Continue setup',
  'today.viewOffers': 'View offers',
  'today.loadErrorTitle': 'Today could not refresh',
  'today.loadErrorBody': 'Your last confirmed availability has not been changed.',
  'jobs.title': 'Jobs',
  'jobs.offers': 'Offers',
  'jobs.upcoming': 'Upcoming',
  'jobs.active': 'Active',
  'jobs.history': 'History',
  'jobs.emptyOffers': 'No open offers',
  'jobs.emptyOffersBody': 'New eligible offers will appear here when the server sends them.',
  'jobs.emptyUpcoming': 'No upcoming jobs',
  'jobs.emptyUpcomingBody': 'Confirmed scheduled work will appear here.',
  'jobs.emptyActive': 'No active jobs',
  'jobs.emptyActiveBody': 'Accepted work appears here when its active phase is confirmed.',
  'jobs.emptyHistory': 'No job history yet',
  'jobs.emptyHistoryBody': 'Closed and cancelled work will appear here.',
  'jobs.loadErrorTitle': 'Jobs could not refresh',
  'jobs.loadErrorBody': 'Retry before acting on cached offers.',
  'jobs.instantOffer': 'Fast Match offer',
  'jobs.scheduledRequest': 'Scheduled request',
  'jobs.approximateArea': 'Approximate area',
  'jobs.travel': 'Travel estimate',
  'jobs.schedule': 'Schedule',
  'jobs.now': 'Now',
  'jobs.duration': 'Expected duration',
  'jobs.scope': 'Scope',
  'jobs.attachments': '{count} attachments',
  'jobs.noAttachments': 'No attachments',
  'jobs.customer': 'Customer',
  'jobs.customerEvidence': 'Customer information',
  'jobs.commercial': 'Earnings breakdown',
  'jobs.gross': 'Gross',
  'jobs.platformFee': 'Platform fee',
  'jobs.expectedNet': 'Expected net',
  'jobs.expiresIn': 'Expires in {minutes} min',
  'jobs.expiresSoon': 'Less than a minute remaining',
  'jobs.respondBy': 'Respond by {time}',
  'jobs.windowElapsed': 'The response window may have ended. Refresh for the server result.',
  'jobs.statusUnknown': 'Offer status is unavailable. Refresh before responding.',
  'jobs.staleOffer': 'This cached offer may be out of date. Refresh before responding.',
  'jobs.expiryUnknown': 'The server expiry is unavailable. Refresh before responding.',
  'jobs.offlineAction': 'Reconnect before responding to this offer.',
  'jobs.acceptanceBlocked': 'This offer cannot be accepted right now.',
  'jobs.accepted': 'Accepted',
  'jobs.declined': 'Declined',
  'jobs.expired': 'Expired',
  'jobs.taken': 'Already taken',
  'jobs.withdrawn': 'Withdrawn',
  'jobs.openOffer': 'Open offer',
  'jobs.openJob': 'Open job',
  'job.phase.scheduled': 'Scheduled',
  'job.phase.accepted': 'Accepted',
  'job.phase.enRoute': 'En route',
  'job.phase.arrived': 'Arrived',
  'job.phase.scopeConfirmation': 'Scope confirmation',
  'job.phase.active': 'In progress',
  'job.phase.completionReview': 'Completion review',
  'job.phase.paymentPending': 'Payment pending',
  'job.phase.closed': 'Closed',
  'job.phase.cancelled': 'Cancelled',
  'offer.title': 'Incoming offer',
  'offer.remainingTime': 'Response time',
  'offer.accept': 'Accept offer',
  'offer.decline': 'Decline',
  'offer.dismiss': 'Close offer',
  'offer.refreshHint': 'Refresh to get the authoritative server status.',
  'offer.acceptHint': 'Attempts acceptance with this offer ID. The server decides the result.',
  'offer.declineHint': 'Sends a manual decline only after you choose it.',
  'offer.safeBackHint': 'Closes this view without accepting or declining.',
  'earnings.title': 'Earnings',
  'earnings.jobEarnings': 'Job earnings',
  'earnings.pending': 'Pending earnings',
  'earnings.thisWeek': 'This week’s net',
  'earnings.gross': 'Gross',
  'earnings.fees': 'Platform fees',
  'earnings.net': 'Net earnings',
  'earnings.cash': 'Confirmed cash',
  'earnings.platformPaid': 'Platform paid',
  'earnings.paymentEvidence': 'Payment evidence',
  'earnings.paymentEvidenceBody': 'Completed job value backed by payment records. This is not a Worker-net or payout balance.',
  'earnings.confirmedPaidJobValue': 'Confirmed paid job value',
  'earnings.awaitingPaidEvidence': 'Awaiting paid evidence',
  'earnings.availableBalance': 'Available balance',
  'earnings.nextPayout': 'Next payout',
  'earnings.payoutScheduled': 'Scheduled for {time}',
  'earnings.payoutProcessing': 'Processing',
  'earnings.payoutUnavailable': 'Payout transfers are not available yet. Job earnings and payment status remain visible.',
  'earnings.payoutAwaitingEvidence': 'Payout details are awaiting an authoritative server update.',
  'earnings.ledger': 'Completed-job ledger',
  'earnings.empty': 'No completed-job earnings yet',
  'earnings.emptyBody': 'Completed work will appear after its payment state is recorded.',
  'earnings.loadErrorTitle': 'Earnings could not refresh',
  'earnings.loadErrorBody': 'No totals have been recalculated on this device.',
  'earnings.pendingStatus': 'Payment pending',
  'earnings.platformPaidStatus': 'Paid online',
  'earnings.cashStatus': 'Cash confirmed',
  'earnings.issueStatus': 'Needs attention',
  'earnings.viewReceipt': 'View job or receipt',
  'earnings.support': 'Get payout support',
} as const);

export type WorkerShellCopyKey = keyof typeof WORKER_SHELL_COPY_EN_ZA;
export type WorkerShellCopyParams = Readonly<Record<string, string | number>>;
export type WorkerShellTranslator = (
  key: WorkerShellCopyKey,
  params?: WorkerShellCopyParams,
) => string;

function interpolate(template: string, params: WorkerShellCopyParams): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, key: string) => (
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : placeholder
  ));
}

export function createWorkerShellTranslator(
  overrides: Partial<Record<WorkerShellCopyKey, string>> = {},
): WorkerShellTranslator {
  return (key, params = {}) => interpolate(
    overrides[key] ?? WORKER_SHELL_COPY_EN_ZA[key],
    params,
  );
}

export const translateWorkerShell = createWorkerShellTranslator();

export function formatZarEnZa(amount: ZarAmount): string {
  if (amount.currency !== 'ZAR' || !Number.isSafeInteger(amount.amountMinor) || amount.amountMinor < 0) {
    return translateWorkerShell('common.notAvailable');
  }
  return new Intl.NumberFormat(WORKER_SHELL_SOURCE_LOCALE, {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: amount.amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount.amountMinor / 100);
}

export function formatDateTimeEnZa(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return translateWorkerShell('common.notAvailable');
  return new Intl.DateTimeFormat(WORKER_SHELL_SOURCE_LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: WORKER_SHELL_TIMEZONE,
  }).format(new Date(timestamp));
}

export function formatTimeEnZa(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return translateWorkerShell('common.notAvailable');
  return new Intl.DateTimeFormat(WORKER_SHELL_SOURCE_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: WORKER_SHELL_TIMEZONE,
  }).format(new Date(timestamp));
}

export function formatDurationEstimate(value: DurationEstimate): string {
  if (
    !Number.isSafeInteger(value.minimumMinutes)
    || !Number.isSafeInteger(value.maximumMinutes)
    || value.minimumMinutes <= 0
    || value.maximumMinutes < value.minimumMinutes
  ) {
    return translateWorkerShell('common.notAvailable');
  }
  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = minutes / 60;
    return Number.isInteger(hours) ? `${hours} hr` : `${hours.toFixed(1)} hr`;
  };
  return value.minimumMinutes === value.maximumMinutes
    ? formatMinutes(value.minimumMinutes)
    : `${formatMinutes(value.minimumMinutes)}–${formatMinutes(value.maximumMinutes)}`;
}

export function formatTravelEstimate(value: TravelEstimate): string {
  if (
    !Number.isFinite(value.distanceMetres)
    || value.distanceMetres < 0
    || !Number.isSafeInteger(value.durationMinutes)
    || value.durationMinutes < 0
  ) {
    return translateWorkerShell('common.notAvailable');
  }
  const distance = value.distanceMetres < 1000
    ? `${Math.round(value.distanceMetres)} m`
    : `${(value.distanceMetres / 1000).toFixed(1)} km`;
  return `${distance} · ${value.durationMinutes} min`;
}

export function dayPeriodForHour(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}
