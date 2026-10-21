(function () {
/**
 * Peak Flow Plumbing â€” Dashboard App
 * Bazzio Systems AI Automation Demo â€” Phase 2
 *
 * Self-contained: no external APIs, no CDN, no network assets.
 * All demo data is fixed/fictional. Reads logic from ../app/core.js.
 *
 * Phase 2 scope: render-only dashboard (metrics, 3 lanes, lead cards).
 * Status buttons, modals, notes, search are Phase 3+.
 */

'use strict';

/* â”€â”€ Dependency check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

(function () {
  if (typeof window.LeadFollowUp === 'undefined') {
    document.getElementById('board').innerHTML =
      '<p style="color:red;padding:16px">Error: core.js failed to load.</p>';
    throw new Error('LeadFollowUp not found â€” core.js must load before app.js');
  }
})();

const {
  LeadStore: DashboardLeadStore,
  groupLeads,
  dashboardUrgencyScore,
  DEMO_ANCHOR_ISO
} = window.LeadFollowUp;

/* â”€â”€ Fixed "now" â€” deterministic view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const DASHBOARD_NOW = new Date(DEMO_ANCHOR_ISO); // 2026-10-20T10:00:00.000Z

/* â”€â”€ Initialise store with demo data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const store = new DashboardLeadStore(); // uses localStorage
if (store.getAll().length === 0) {
  store.loadDemo('Peak Flow Plumbing');
}

/* â”€â”€ Score and group â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const scoredLeads  = store.getScoredLeads(DASHBOARD_NOW);
const groups       = groupLeads(scoredLeads);

/* â”€â”€ Compute metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function computeMetrics(all) {
  const openStatuses = ['new', 'contacted', 'quoted', 'no_response'];
  const openLeads    = all.filter(l => openStatuses.includes(l.status));
  const booked       = all.filter(l => l.status === 'won').length;

  // Average wait = mean hours between fixed DEMO_ANCHOR_ISO and each open lead's timestamp
  let avgResponseHrs = 0;
  if (openLeads.length > 0) {
    const totalHrs = openLeads.reduce((sum, l) => {
      const hrs = (DASHBOARD_NOW - new Date(l.timestamp)) / 3_600_000;
      return sum + hrs;
    }, 0);
    avgResponseHrs = totalHrs / openLeads.length;
  }

  return {
    openCount:    openLeads.length,
    avgHrs:       Math.round(avgResponseHrs * 10) / 10, // 1 dp
    bookedCount:  booked
  };
}

const metrics = computeMetrics(scoredLeads);

/* â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function urgencyClass(score) {
  if (score >= 55) return 'urgency-high';
  if (score >= 30) return 'urgency-med';
  return 'urgency-low';
}

function statusLabel(status) {
  const MAP = {
    new:         'New',
    contacted:   'Contacted',
    quoted:      'Quoted',
    no_response: 'No Response',
    won:         'Booked',
    lost:        'Lost'
  };
  return MAP[status] || status;
}

function formatRelativeTime(isoString) {
  const diffMs  = DASHBOARD_NOW - new Date(isoString);
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 60)  return diffMin + 'm ago';
  const diffHrs = Math.round(diffMin / 60);
  if (diffHrs < 24)  return diffHrs + 'h ago';
  const diffDays = Math.round(diffHrs / 24);
  return diffDays + 'd ago';
}

/**
 * Truncate SMS draft to a readable preview.
 */
function smsPreview(sms, maxLen) {
  maxLen = maxLen || 90;
  if (!sms) return '';
  if (sms.length <= maxLen) return sms;
  return sms.slice(0, maxLen).trimEnd() + "...";
}

/* â”€â”€ Render: metrics row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function renderMetrics() {
  const avgLabel = metrics.avgHrs === 1
    ? '1.0 hr avg wait'
    : metrics.avgHrs + ' hrs avg wait';

  document.getElementById('metric-open').textContent    = metrics.openCount;
  document.getElementById('metric-avg-hrs').textContent = metrics.avgHrs.toFixed(1);
  document.getElementById('metric-booked').textContent  = metrics.bookedCount;
  document.getElementById('metric-avg-label').textContent =
    'Avg ' + metrics.avgHrs.toFixed(1) + ' hrs';
}

/* â”€â”€ Render: single lead card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function renderCard(lead) {
  const urgScore = lead.urgency !== undefined ? lead.urgency : dashboardUrgencyScore(lead, DASHBOARD_NOW);
  const uClass   = urgencyClass(urgScore);

  const article = document.createElement('article');
  article.className = 'lead-card';
  article.setAttribute('data-lead-id', lead.id);
  article.setAttribute('data-urgency', urgScore);
  article.setAttribute('data-status', lead.status);

  article.innerHTML = `
    <div class="card-header">
      <span class="lead-name">${escHtml(lead.name)}</span>
      <span class="urgency-pill ${uClass}" title="Urgency score ${urgScore}/100">${urgScore}</span>
    </div>
    <div class="card-meta">
      <span class="lead-phone">${escHtml(lead.phone)}</span>
      <span class="lead-time">${formatRelativeTime(lead.timestamp)}</span>
    </div>
    <span class="status-badge status-${escHtml(lead.status)}">${statusLabel(lead.status)}</span>
    ${lead.sms_draft
      ? `<p class="sms-preview" title="${escHtml(lead.sms_draft)}">${escHtml(smsPreview(lead.sms_draft))}</p>`
      : ''}
  `;
  // Display follow-up reminders on lead cards.
  if (lead.follow_up_date) {
    const today = new Date();
    const todayKey =
      today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    const reminder = document.createElement('div');
    reminder.style.marginTop = '12px';
    reminder.style.padding = '9px 12px';
    reminder.style.borderRadius = '8px';
    reminder.style.fontSize = '13px';
    reminder.style.fontWeight = '600';

    let label;
    let background;
    let color;

    if (lead.follow_up_date < todayKey) {
      label = 'OVERDUE';
      background = '#fee2e2';
      color = '#991b1b';
    } else if (lead.follow_up_date === todayKey) {
      label = 'DUE TODAY';
      background = '#fef3c7';
      color = '#92400e';
    } else {
      label = 'UPCOMING';
      background = '#dcfce7';
      color = '#166534';
    }

    const dateParts = lead.follow_up_date.split('-');
    const displayDate =
      dateParts[1] + '/' + dateParts[2] + '/' + dateParts[0];

    reminder.textContent = label + ' - Follow up ' + displayDate;
    reminder.style.background = background;
    reminder.style.color = color;

    article.appendChild(reminder);
  }
  return article;
}

/* â”€â”€ Render: a lane â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

let activeFollowUpFilter = 'all';

function matchesFollowUpFilter(lead) {
  if (activeFollowUpFilter === 'all') return true;

  const date = lead.follow_up_date;
  if (!date) return false;

  const now = new Date();
  const today =
    now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  if (activeFollowUpFilter === 'overdue') {
    return date < today;
  }

  if (activeFollowUpFilter === 'today') {
    return date === today;
  }

  if (activeFollowUpFilter === 'upcoming') {
    return date > today;
  }

  return true;
}
function renderLane(containerId, leads) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';

  if (leads.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No leads here';
    container.appendChild(empty);
    return;
  }

  // Leads already sorted by urgency descending from getScoredLeads
  for (const lead of leads.filter(matchesFollowUpFilter)) {
    container.appendChild(renderCard(lead));
  }
}

/* â”€â”€ Render: lane counts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function renderFollowUpSummary() {
  const leads = store.getAll();
  const now = new Date();

  const today =
    now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;

  leads.forEach(function(lead) {
    const date = lead.follow_up_date;
    if (!date) return;

    if (date < today) {
      overdue++;
    } else if (date === today) {
      dueToday++;
    } else {
      upcoming++;
    }
  });

  const overdueEl = document.getElementById('followup-overdue');
  const todayEl = document.getElementById('followup-today');
  const upcomingEl = document.getElementById('followup-upcoming');

  if (overdueEl) overdueEl.textContent = overdue;
  if (todayEl) todayEl.textContent = dueToday;
  if (upcomingEl) upcomingEl.textContent = upcoming;
}
function renderCounts() {
  document.getElementById('count-attention').textContent = groups.needsAttention.length;
  document.getElementById('count-progress').textContent  = groups.inProgress.length;
  document.getElementById('count-closed').textContent    = groups.closed.length;
}

/* â”€â”€ Render: timestamp label â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function renderAnchorLabel() {
  const el = document.getElementById('anchor-label');
  if (!el) return;
  // Format as readable local date/time string for the demo anchor
  const d = DASHBOARD_NOW;
  const formatted =
    d.toISOString().replace('T', ' ').replace('.000Z', '') + ' UTC';
  el.textContent = 'Snapshot: ' + formatted;
}

/* â”€â”€ Security: minimal HTML escape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function escHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function updateFollowUpFilterUI() {
  const labels = {
    all: 'Showing all leads',
    overdue: 'Showing overdue follow-ups',
    today: 'Showing follow-ups due today',
    upcoming: 'Showing upcoming follow-ups'
  };

  const label = document.getElementById('active-filter-label');
  if (label) {
    label.textContent = labels[activeFollowUpFilter] || labels.all;
  }

  ['overdue', 'today', 'upcoming'].forEach(function(type) {
    const element = document.getElementById('followup-' + type);
    const card = element && element.closest('.metric-card');
    if (!card) return;

    card.style.outline =
      activeFollowUpFilter === type ? '3px solid #2563eb' : '';
  });
}

function showAllFollowUpLeads() {
  activeFollowUpFilter = 'all';
  updateFollowUpFilterUI();

  renderLane('lane-attention-cards', groups.needsAttention);
  renderLane('lane-progress-cards', groups.inProgress);
  renderLane('lane-closed-cards', groups.closed);
}
function setupFollowUpFilters() {
  const showAllButton = document.getElementById('show-all-leads');
  if (showAllButton) {
    showAllButton.addEventListener('click', showAllFollowUpLeads);
  }
  const filters = [
    ['followup-overdue', 'overdue'],
    ['followup-today', 'today'],
    ['followup-upcoming', 'upcoming']
  ];

  filters.forEach(function(item) {
    const countElement = document.getElementById(item[0]);
    if (!countElement) return;

    const card = countElement.closest('.metric-card');
    if (!card) return;

    card.style.cursor = 'pointer';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    function activateFilter() {
      activeFollowUpFilter =
        activeFollowUpFilter === item[1] ? 'all' : item[1];
      updateFollowUpFilterUI();

      filters.forEach(function(other) {
        const element = document.getElementById(other[0]);
        const otherCard = element && element.closest('.metric-card');
        if (!otherCard) return;

        otherCard.style.outline =
          activeFollowUpFilter === other[1]
            ? '3px solid #2563eb'
            : '';
      });

      renderLane('lane-attention-cards', groups.needsAttention);
      renderLane('lane-progress-cards', groups.inProgress);
      renderLane('lane-closed-cards', groups.closed);
    }

    card.addEventListener('click', activateFilter);

    card.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activateFilter();
      }
    });
  });
}
function renderFollowUpPriorityQueue() {
  const list = document.getElementById('followup-priority-list');
  const count = document.getElementById('priority-count');
  if (!list || !count) return;

  const now = new Date();
  const today =
    now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');

  const leads = store.getAll()
    .filter(lead => lead.follow_up_date)
    .sort((a, b) =>
      a.follow_up_date.localeCompare(b.follow_up_date)
    );

  count.textContent = leads.length + ' scheduled';
  list.replaceChildren();

  if (leads.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No follow-ups scheduled yet.';
    empty.style.color = '#64748b';
    list.appendChild(empty);
    return;
  }

  leads.forEach(function(lead) {
    const date = lead.follow_up_date;

    const status = date < today
      ? 'OVERDUE'
      : date === today
        ? 'DUE TODAY'
        : 'UPCOMING';

    const color = date < today
      ? '#991b1b'
      : date === today
        ? '#92400e'
        : '#166534';

    const item = document.createElement('div');
    item.style.padding = '14px';
    item.style.marginBottom = '10px';
    item.style.border = '1px solid #e2e8f0';
      item.dataset.priority = status === 'OVERDUE' ? 'overdue' : status === 'DUE TODAY' ? 'today' : 'upcoming';
    item.style.borderRadius = '10px';

    const name = document.createElement('strong');
    name.textContent = lead.name || 'Unknown customer';

    const details = document.createElement('div');
    details.textContent =
      (lead.phone || 'No phone') + ' | Follow up: ' + date;
    details.style.marginTop = '6px';
    details.style.fontSize = '13px';
    details.style.color = '#64748b';

    const badge = document.createElement('div');
    badge.textContent = status;
    badge.style.color = color;
    badge.style.fontWeight = '700';
    badge.style.fontSize = '12px';
    badge.style.marginTop = '8px';

    item.style.cursor = 'pointer';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', 'Open details for ' + lead.name);

    function openPriorityLead() {
      const card = Array.from(document.querySelectorAll('.lead-card'))
        .find(function(element) {
          return element.getAttribute('data-lead-id') === String(lead.id);
        });

      if (card) card.click();
    }

    item.addEventListener('click', openPriorityLead);

    item.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPriorityLead();
      }
    });

    const completeButton = document.createElement('button');
    completeButton.type = 'button';
    completeButton.textContent = 'Mark Complete';
    completeButton.style.marginTop = '12px';
    completeButton.style.padding = '9px 14px';
    completeButton.style.background = '#166534';
    completeButton.style.color = '#ffffff';
    completeButton.style.border = 'none';
    completeButton.style.borderRadius = '7px';
    completeButton.style.fontWeight = '600';
    completeButton.style.cursor = 'pointer';

    completeButton.addEventListener('click', function(event) {
      event.stopPropagation();

      if (!confirm('Mark this follow-up as completed?')) return;

      try {
        const updated = new window.LeadFollowUp.LeadStore()
          .completeFollowUp(lead.id);

        if (!updated) {
          alert('Could not complete this follow-up.');
          return;
        }

        window.location.reload();
      } catch (err) {
        console.error('Follow-up completion failed:', err);
        alert('Unable to complete follow-up.');
      }
    });

    item.append(name, details, badge, completeButton);
    list.appendChild(item);
  });
}

function boot() {
  const resetButton = document.getElementById('reset-demo-btn');
  if (resetButton) {
    resetButton.addEventListener('click', function() {
      if (!window.confirm('Reset all demo customers? This will erase saved notes, statuses, reminders, and follow-up history.')) return;
      store.loadDemo('Peak Flow Plumbing');
      window.location.reload();
    });
  }
  renderMetrics();
  renderCounts();
  renderFollowUpSummary();
  renderFollowUpPriorityQueue();
  setupFollowUpFilters();
  renderLane('lane-attention-cards', groups.needsAttention);
  renderLane('lane-progress-cards',  groups.inProgress);
  renderLane('lane-closed-cards',    groups.closed);
  renderAnchorLabel();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* â”€â”€ Exports (for dashboard tests) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeMetrics,
    urgencyClass,
    statusLabel,
    formatRelativeTime,
    smsPreview,
    escHtml,
    DASHBOARD_NOW,
    scoredLeads,
    groups,
    metrics
  };
}




})();



// Lead details popup — demo only
document.addEventListener('click', function(event) {
    const card = event.target.closest('.lead-card');
    if (!card) return;

    const leadId = card.getAttribute('data-lead-id');
    const lead = new window.LeadFollowUp.LeadStore()
        .getAll()
        .find(item => item.id === leadId);

    if (!lead) return;

    const existing = document.getElementById('lead-detail-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'lead-detail-overlay';
    overlay.className = 'lead-detail-overlay';

    const panel = document.createElement('div');
    panel.className = 'lead-detail-panel';

  // Keep the popup within the browser window.
  panel.style.maxHeight = 'calc(100vh - 48px)';
  panel.style.overflowY = 'auto';
  panel.style.overscrollBehavior = 'contain';
  panel.style.boxSizing = 'border-box';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Lead details');

    const title = document.createElement('h2');
    title.textContent = lead.name;

    const phone = document.createElement('p');
    phone.textContent = 'Phone: ' + lead.phone;

    const status = document.createElement('p');
    status.textContent = 'Status: ' + lead.status;

    const urgency = document.createElement('p');
    urgency.textContent = 'Urgency score: ' + card.getAttribute('data-urgency') + '/100';

    const smsHeading = document.createElement('h3');
    smsHeading.textContent = 'SMS Draft';

    const sms = document.createElement('p');
    sms.className = 'lead-detail-sms';
    sms.textContent = lead.sms_draft || 'No SMS draft available.';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'lead-detail-close';
    close.textContent = 'Close';
    close.addEventListener('click', () => overlay.remove());

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'lead-detail-close';
    copy.textContent = 'Copy SMS';
    copy.disabled = !lead.sms_draft;
    copy.addEventListener('click', async function() {
        try {
            await navigator.clipboard.writeText(lead.sms_draft);
            copy.textContent = 'Copied!';
        } catch (err) {
            copy.textContent = 'Copy unavailable';
            console.error('Clipboard copy failed:', err);
        }
    });

    const statusHeading = document.createElement('h3');
    statusHeading.textContent = 'Update Lead Status';

    const statusSelect = document.createElement('select');
    statusSelect.className = 'lead-status-select';

    const statusOptions = [
        ['new', 'New'],
        ['contacted', 'Contacted'],
        ['quoted', 'Quoted'],
        ['won', 'Booked'],
        ['lost', 'Lost'],
        ['no_response', 'No Response']
    ];

    statusOptions.forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        statusSelect.appendChild(option);
    });

    statusSelect.value = lead.status;

    const saveStatus = document.createElement('button');
    saveStatus.type = 'button';
    saveStatus.className = 'lead-detail-close';
    saveStatus.textContent = 'Save Status';

    saveStatus.addEventListener('click', function() {
        try {
            const updated = new window.LeadFollowUp.LeadStore()
                .updateStatus(lead.id, statusSelect.value);

            if (!updated) {
                saveStatus.textContent = 'Lead not found';
                return;
            }

            overlay.remove();
            window.location.reload();
        } catch (err) {
            console.error('Status update failed:', err);
            saveStatus.textContent = 'Update failed';
        }
    });

    const notesHeading = document.createElement('h3');
  notesHeading.textContent = 'Customer Notes';

  const notesInput = document.createElement('textarea');
  notesInput.className = 'lead-notes-input';
  notesInput.value = lead.notes || '';
  notesInput.placeholder = 'Add customer details, follow-up reminders, or conversation notes...';
  notesInput.rows = 4;
  notesInput.style.width = '100%';
  notesInput.style.boxSizing = 'border-box';
  notesInput.style.padding = '12px';
  notesInput.style.border = '1px solid #cbd5e1';
  notesInput.style.borderRadius = '8px';
  notesInput.style.font = 'inherit';
  notesInput.style.resize = 'vertical';

  const saveNotes = document.createElement('button');
  saveNotes.type = 'button';
  saveNotes.className = 'lead-detail-close';
  saveNotes.textContent = 'Save Notes';

  saveNotes.addEventListener('click', function() {
    try {
      const updated = new window.LeadFollowUp.LeadStore()
        .updateNotes(lead.id, notesInput.value);

      if (!updated) {
        saveNotes.textContent = 'Lead not found';
        return;
      }

      saveNotes.textContent = 'Notes Saved!';
    } catch (err) {
      console.error('Notes save failed:', err);
      saveNotes.textContent = 'Save failed';
    }
  });

  const reminderHeading = document.createElement('h3');
  reminderHeading.textContent = 'Follow-Up Reminder';

  const reminderInput = document.createElement('input');
  reminderInput.type = 'date';
  reminderInput.className = 'lead-reminder-input';
  reminderInput.value = lead.follow_up_date || '';
  reminderInput.style.width = '100%';
  reminderInput.style.boxSizing = 'border-box';
  reminderInput.style.padding = '12px';
  reminderInput.style.border = '1px solid #cbd5e1';
  reminderInput.style.borderRadius = '8px';
  reminderInput.style.font = 'inherit';

  const saveReminder = document.createElement('button');
  saveReminder.type = 'button';
  saveReminder.className = 'lead-detail-close';
  saveReminder.textContent = 'Save Reminder';

  saveReminder.addEventListener('click', function() {
    try {
      const updated = new window.LeadFollowUp.LeadStore()
        .updateFollowUp(lead.id, reminderInput.value);

      if (!updated) {
        saveReminder.textContent = 'Lead not found';
        return;
      }

      saveReminder.textContent = 'Reminder Saved!';

      // Refresh the dashboard after the popup closes.
      overlay.remove();
      window.location.reload();
    } catch (err) {
      console.error('Reminder save failed:', err);
      saveReminder.textContent = 'Save failed';
    }
  });
  const historyHeading = document.createElement('h3');
    historyHeading.textContent = 'Follow-Up History';
    const historyList = document.createElement('div');
    const history = Array.isArray(lead.follow_up_history) ? lead.follow_up_history : [];
    historyList.style.marginBottom = '16px';
    if (history.length === 0) {
      historyList.textContent = 'No completed follow-ups yet.';
    } else {
      history.slice().reverse().forEach(entry => {
        const row = document.createElement('div');
        row.style.padding = '10px';
        row.style.marginBottom = '8px';
        row.style.background = '#f1f5f9';
        row.style.borderRadius = '8px';
        const scheduled = document.createElement('div');
        scheduled.textContent = 'Scheduled: ' + entry.scheduled_date;
        const completed = document.createElement('div');
        completed.textContent = 'Completed: ' + new Date(entry.completed_at).toLocaleString();
        row.append(scheduled, completed);
        historyList.appendChild(row);
      });
    }

    // Notes controls are included in the main panel below.

  panel.append(title, phone, status, urgency, smsHeading, sms, copy,
        statusHeading, statusSelect, saveStatus, notesHeading, notesInput, saveNotes, reminderHeading, reminderInput, saveReminder, historyHeading, historyList, close);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
    });
});





















