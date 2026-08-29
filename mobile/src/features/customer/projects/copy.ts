import type { MoneyAmount, OperationalPhase, ProjectSegment } from './model';

export const CUSTOMER_PROJECT_SOURCE_LOCALE = 'en-ZA' as const;

const MESSAGES = Object.freeze({
  'common.back': 'Back',
  'common.cancel': 'Cancel request',
  'common.retry': 'Try again',
  'common.refresh': 'Refresh',
  'common.close': 'Close',
  'common.viewDetails': 'View details',
  'common.continue': 'Continue',
  'offline.title': 'You’re offline',
  'offline.body': 'Saved details remain available. Reconnect before making a change.',
  'loading.projects': 'Loading Projects',
  'loading.quoteRequests': 'Loading quote requests',
  'loading.project': 'Loading Project',
  'loading.matching': 'Loading matching progress',
  'error.projectsTitle': 'Projects could not be loaded',
  'error.projectsBody': 'No Project state was changed. Check your connection and try again.',
  'error.quoteRequestsTitle': 'Quote requests could not be loaded',
  'error.quoteRequestsBody': 'No request was changed. Check your connection and try again.',
  'error.projectTitle': 'Project could not be loaded',
  'error.projectBody': 'No Project state was changed. Check your connection and try again.',
  'projects.title': 'Projects',
  'projects.active': 'Active',
  'projects.upcoming': 'Upcoming',
  'projects.past': 'Past',
  'projects.emptyActiveTitle': 'No active Projects',
  'projects.emptyActiveBody': 'Work in progress will appear here.',
  'projects.emptyUpcomingTitle': 'Nothing upcoming',
  'projects.emptyUpcomingBody': 'Confirmed future work will appear here.',
  'projects.emptyPastTitle': 'No past Projects',
  'projects.emptyPastBody': 'Completed and closed work will appear here.',
  'projects.workerPending': 'Worker not confirmed yet',
  'projects.payment': 'Payment: {status}',
  'projects.reschedule': 'Reschedule',
  'projects.cancel': 'Cancel Project',
  'projects.receipt': 'View receipt',
  'projects.rate': 'Rate this Project',
  'projects.rebook': 'Book again',
  'quoteRequests.entryTitle': 'Open quote requests',
  'quoteRequests.entryBody': 'Return to jobs that are waiting for Worker quotes.',
  'quoteRequests.title': 'Quote requests',
  'quoteRequests.eyebrow': 'Grounded matching',
  'quoteRequests.heroTitle': 'Pick up where you left off',
  'quoteRequests.heroBody': 'Every open request stays available here until you choose a quote, cancel it or it closes.',
  'quoteRequests.privacy': 'Only the service, broad area and schedule are shown in this list. Your exact address and access notes stay private.',
  'quoteRequests.emptyTitle': 'No open quote requests',
  'quoteRequests.emptyBody': 'Requests waiting for Worker quotes will appear here.',
  'quoteRequests.open': 'Waiting for quotes',
  'quoteRequests.receiving': 'Quotes arriving',
  'quoteRequests.area': 'Broad area',
  'quoteRequests.schedule': 'Scheduled',
  'quoteRequests.closes': 'Quotes close',
  'quoteRequests.action': 'View matching',
  'matching.cancelHint': 'Closes this request using its current server version.',
  'matching.elapsed': 'Elapsed {duration}',
  'matching.confirmRate': 'Confirm Worker and rate',
  'matching.sendRequest': 'Send request',
  'matching.chooseWorker': 'Choose this Worker',
  'matching.acceptQuote': 'Accept this quote',
  'matching.bookDiagnostic': 'Request diagnostic visit',
  'matching.requestTruth': 'A sent request is not a confirmed Worker.',
  'matching.reservableTruth': 'This catalogue slot is reservable and can confirm immediately.',
  'matching.quoteTruth': 'Accepting one complete quote closes the others.',
  'matching.diagnosticTruth': 'The diagnostic fee covers the visit and stated deliverable. Later work requires a separate acceptance.',
  'worker.new': 'New on TOGT',
  'worker.reviews': '{rating} from {count} reviews',
  'worker.completed': '{count} completed jobs',
  'worker.whyMatch': 'Why this match',
  'worker.evidence': 'Verification evidence',
  'worker.price': 'Price',
  'worker.area': 'Service area',
  'worker.availability': 'Availability',
  'worker.profileTitle': 'Worker profile',
  'worker.about': 'About this Worker',
  'worker.portfolioUnavailable': 'Portfolio evidence is not available for this service.',
  'worker.request': 'Request this Worker',
  'worker.requestUnavailable': 'Direct request unavailable',
  'worker.unavailable': 'This service is not currently available from this Worker.',
  'worker.noActiveServices': 'This Worker has no active eligible services right now. Browse the current catalogue to keep going.',
  'worker.seeAlternatives': 'See alternatives',
  'hub.title': 'Project Hub',
  'hub.currentState': 'Current state',
  'hub.timeline': 'Project timeline',
  'hub.worker': 'Worker',
  'hub.schedule': 'Schedule',
  'hub.address': 'Job address',
  'hub.scope': 'Agreed scope',
  'hub.money': 'Price and payment',
  'hub.chat': 'Chat',
  'hub.contact': 'Contact',
  'hub.share': 'Share safe status',
  'hub.safety': 'Safety and help',
  'hub.safetyBody': 'Emergency call, supported escalation and support remain available.',
  'hub.unknownTitle': 'Project state needs review',
  'hub.unknownBody': 'This server state is not recognised by this app. Details are read-only; support remains available.',
  'travel.lastUpdated': 'Location captured {timestamp}',
  'privacy.title': 'Location and contact privacy',
  'scope.title': 'Confirm the on-site scope',
  'scope.included': 'Included work',
  'scope.excluded': 'Excluded work',
  'scope.materials': 'Materials responsibility',
  'scope.timeRate': 'Time and rate',
  'scope.totalCap': 'Total or approval cap',
  'scope.workerConfirmed': 'Worker confirmation',
  'scope.customerConfirmed': 'Customer confirmation',
  'scope.confirmed': 'Confirmed',
  'scope.waiting': 'Waiting',
  'scope.confirm': 'Confirm this scope',
  'scope.declineRevision': 'Decline revision',
  'scope.pinTitle': 'Start PIN',
  'scope.pinPrivate': 'Keep this PIN private until you are ready for the Worker to start.',
  'scope.pinHidden': 'The server issues the PIN only after both parties confirm the same scope.',
  'work.title': 'Work in progress',
  'work.elapsed': 'Elapsed {duration}',
  'work.estimate': 'Running estimate',
  'change.title': 'Change orders',
  'change.existing': 'Existing agreement',
  'change.addition': 'Requested addition',
  'change.addedTime': 'Added time',
  'change.materials': 'Materials',
  'change.currentTotal': 'Current total',
  'change.additional': 'Additional amount',
  'change.revised': 'Revised total',
  'change.approve': 'Approve change',
  'change.decline': 'Decline change',
  'change.pending': 'Your approval is required before this addition can begin.',
  'completion.title': 'Review completion',
  'completion.requested': 'The Worker has requested completion.',
  'completion.scope': 'Completed scope',
  'completion.evidence': 'Completion evidence',
  'completion.amount': 'Final amount',
  'completion.confirm': 'Confirm complete',
  'completion.issue': 'Report an issue',
  'completion.awaiting': 'Completion has not been requested yet.',
  'completion.disputed': 'An issue is open. Completion and payment remain separate server states.',
  'payment.title': 'Payment and receipt',
  'payment.finalAmount': 'Final amount',
  'payment.method': 'Payment method',
  'payment.checkout': 'Open secure checkout',
  'payment.retry': 'Try checkout again',
  'payment.reconciled': 'Last reconciled {timestamp}',
  'payment.assurance': 'Payment assurance',
  'payment.assuranceSecured': '{kind} secured for {amount}',
  'payment.assuranceNone': 'No funding assurance is claimed.',
  'payment.noPayoutClaim': 'Customer payment status does not claim that Worker payout is complete.',
  'receipt.title': 'Receipt',
  'receipt.reference': 'Receipt {reference}',
  'receipt.support': 'Support reference: {reference}',
  'rating.title': 'Rate your experience',
  'rating.selection': '{value} out of 5 selected',
  'rating.submit': 'Submit rating',
  'rating.private': 'Ratings publish double-blind after both parties submit or the rating window closes.',
  'rating.reason': 'What stood out?',
  'retention.favourite': 'Favourite Worker',
  'retention.rebook': 'Book again',
  'retention.manage': 'Favourite, block or book again',
  'chat.title': 'Project chat',
  'chat.context': 'Messages and immutable Project events stay together.',
  'chat.failed': 'Message not sent',
  'chat.retry': 'Retry message',
  'chat.closed': 'Chat is read-only under the retention policy.',
  'chat.blocked': 'Messaging is unavailable because this relationship is blocked. Project history remains visible, and support remains available.',
  'chat.masked': 'Contact details remain masked for this Project phase.',
} as const);

export type CustomerProjectMessageKey = keyof typeof MESSAGES;
export type MessageValues = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

export function customerProjectMessage(
  key: CustomerProjectMessageKey,
  values: MessageValues = {},
): string {
  return MESSAGES[key].replace(PLACEHOLDER, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`Missing customer Project message value: ${name}`);
    return String(value);
  });
}

const ZAR = new Intl.NumberFormat(CUSTOMER_PROJECT_SOURCE_LOCALE, {
  style: 'currency',
  currency: 'ZAR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatProjectMoney(money: MoneyAmount | null): string {
  return money
    && money.currency === 'ZAR'
    && Number.isSafeInteger(money.amountMinor)
    && money.amountMinor >= 0
    ? ZAR.format(money.amountMinor / 100)
    : 'Amount unavailable';
}

export function formatProjectDuration(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds) || totalSeconds < 0) return 'Time unavailable';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function segmentLabel(segment: ProjectSegment): string {
  const keys = {
    active: 'projects.active',
    upcoming: 'projects.upcoming',
    past: 'projects.past',
  } as const;
  return customerProjectMessage(keys[segment]);
}

export function phaseDominantAction(phase: OperationalPhase): string {
  return {
    matching: 'View matching progress',
    assigned: 'Review confirmed Worker',
    scheduled: 'Review details and prepare',
    en_route: 'View travel progress',
    arrived: 'Review on-site scope',
    scope_confirmation: 'Confirm the scope',
    work_active: 'View work progress',
    completion_review: 'Review completion',
    payment_pending: 'Review payment',
    closed: 'View receipt and rating',
    unknown: 'Contact support',
  }[phase];
}
