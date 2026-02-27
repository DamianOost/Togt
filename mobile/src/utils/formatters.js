export function formatZAR(amount) {
  if (amount == null) return 'TBD';
  return `R ${parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(dateString) {
  return `${formatDate(dateString)} at ${formatTime(dateString)}`;
}

export function getStatusColor(status) {
  const colors = {
    pending: '#F59E0B',
    accepted: '#3B82F6',
    in_progress: '#8B5CF6',
    completed: '#10B981',
    cancelled: '#EF4444',
  };
  return colors[status] || '#6B7280';
}

export function getStatusLabel(status) {
  const labels = {
    pending: 'Pending',
    accepted: 'Accepted',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
}
