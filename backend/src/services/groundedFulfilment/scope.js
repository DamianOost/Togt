const LEGACY_MATERIALS_RESPONSIBILITY = 'Materials responsibility was not separately recorded in this accepted agreement.';

const RESOLVED_MATERIALS_CODES = new Set(['customer', 'worker']);
const LEGACY_NORMALIZABLE_SOURCES = new Set(['accepted_agreement', 'approved_change_order']);

function nonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalScopeSnapshot(value, source) {
  if (!LEGACY_NORMALIZABLE_SOURCES.has(source)
      || !value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const rawItems = value.items;
  if (!Array.isArray(rawItems) || rawItems.length < 1) return value;
  const convertible = rawItems.every((item) => nonEmptyText(item) || (
    item && typeof item === 'object' && !Array.isArray(item)
      && Object.keys(item).length === 1
      && nonEmptyText(item.label)
  ));
  if (!convertible) return value;
  const items = rawItems.map((item) => (
    typeof item === 'string' ? item.trim() : item.label.trim()
  ));
  if (value.materialsResponsibility != null
      && typeof value.materialsResponsibility !== 'string') return value;
  const materialsResponsibility = nonEmptyText(value.materialsResponsibility)
    ? value.materialsResponsibility.trim()
    : LEGACY_MATERIALS_RESPONSIBILITY;
  return { ...value, items, materialsResponsibility };
}

function scopeMaterialsResolved(scope) {
  if (!scope || scope.status !== 'confirmed') return false;
  const snapshot = scope.scope_snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;

  if (scope.source === 'accepted_agreement') {
    return RESOLVED_MATERIALS_CODES.has(snapshot.materialsResponsibilityCode);
  }

  if (scope.source === 'participant_proposal') {
    return RESOLVED_MATERIALS_CODES.has(snapshot.materialsResponsibilityCode)
      && nonEmptyText(snapshot.materialsResponsibility)
      && scope.customer_confirmed_at != null
      && scope.worker_confirmed_at != null;
  }

  return false;
}

module.exports = {
  LEGACY_MATERIALS_RESPONSIBILITY,
  canonicalScopeSnapshot,
  scopeMaterialsResolved,
};
