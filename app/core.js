/**
 * Peak Flow Plumbing â€” Lead Follow-Up Core Logic
 * Bazzio Systems AI Automation Demo
 *
 * Port of: missed_call_recovery.ps1
 * No external APIs. All data in memory (localStorage in browser, module state in tests).
 */

'use strict';

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SMS_TEMPLATES = [
  "Hi {NAME}, this is {BUSINESS}. Sorry we missed your call! We would love to help. Reply here or call us back at any time - we are available today.",
  "Hey {NAME}! {BUSINESS} here. We saw your missed call and wanted to reach out. What plumbing issue can we help you solve?",
  "Hi {NAME}, it is the team at {BUSINESS}. We missed you - but we are ready to help. Burst pipe, blocked drain, or something else? Just reply and we will get you sorted.",
  "Hello {NAME}! {BUSINESS} missed your call. Plumbing emergencies do not wait - neither do we. Reply to this message and we will call you right back.",
  "Hi {NAME}, {BUSINESS} here. We tried to catch your call. Whether it is a dripping tap or a full emergency, reply and we will prioritize your job today."
];

const VALID_STATUSES = ["new", "contacted", "quoted", "won", "lost", "no_response"];

// Status weight used in urgency score (0â€“100)
const STATUS_WEIGHTS = {
  new: 80,
  no_response: 90,
  contacted: 40,
  quoted: 20,
  won: 0,
  lost: 0
};

// Fixed anchor for demo data so urgency is deterministic regardless of clock
const DEMO_ANCHOR_ISO = "2026-10-20T10:00:00.000Z";

const STORAGE_KEY = "peakflow_leads";
const SETTINGS_KEY = "peakflow_settings";

// â”€â”€ Utility helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Simple deterministic string hash (djb2-style, always positive).
 * Matches the PS1 logic: pick template by abs(hashCode) % 5.
 */
function stringHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0; // convert to 32-bit int
  }
  return Math.abs(hash);
}

/**
 * Generate a lead ID. Uses a counter + random suffix for uniqueness.
 */
let _idCounter = 0;
function generateLeadId() {
  _idCounter++;
  const rnd = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `LEAD-${ts}-${rnd}`;
}

/**
 * Select and personalise an SMS template.
 * Template selection is deterministic from the caller's name.
 */
function generateSMS(name, businessName) {
  const biz = businessName || "Peak Flow Plumbing";
  const idx = stringHash(name) % SMS_TEMPLATES.length;
  return SMS_TEMPLATES[idx]
    .replace(/\{NAME\}/g, name)
    .replace(/\{BUSINESS\}/g, biz);
}

/**
 * Calculate urgency score 0â€“100.
 * Ported from Urgency-Score in the PS1 prototype.
 *
 * @param {object} lead  - lead record
 * @param {Date}   now   - current time (injectable for deterministic tests)
 */
function urgencyScore(lead, now) {
  now = now || new Date();
  const sw = (STATUS_WEIGHTS[lead.status] !== undefined) ? STATUS_WEIGHTS[lead.status] : 50;
  const ageHours = (now - new Date(lead.timestamp)) / 3_600_000;
  const ageScore = Math.min(ageHours * 2, 40);
  return Math.round(sw * 0.6 + ageScore * 0.4);
}

/**
 * Group a scored lead array into three lanes.
 * Returns { needsAttention, inProgress, closed }
 */
function groupLeads(leads) {
  const needsAttention = leads.filter(l => l.status === "new" || l.status === "no_response");
  const inProgress     = leads.filter(l => l.status === "contacted" || l.status === "quoted");
  const closed         = leads.filter(l => l.status === "won" || l.status === "lost");
  return { needsAttention, inProgress, closed };
}

// â”€â”€ Storage adapter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Abstracted so tests can inject an in-memory store.

const _defaultStore = (() => {
  // Browser: localStorage. Test environment: module-level Map.
  const isNode = typeof window === 'undefined';
  const _map = {};
  return {
    get(key)        { return isNode ? (_map[key] || null) : localStorage.getItem(key); },
    set(key, value) { isNode ? (_map[key] = value) : localStorage.setItem(key, value); },
    remove(key)     { isNode ? (delete _map[key]) : localStorage.removeItem(key); },
    clear()         { if (isNode) { Object.keys(_map).forEach(k => delete _map[k]); } else { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(SETTINGS_KEY); } }
  };
})();

// â”€â”€ Lead Store â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class LeadStore {
  constructor(store) {
    this._store = store || _defaultStore;
  }

  _load() {
    try {
      const raw = this._store.get(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }

  _save(leads) {
    this._store.set(STORAGE_KEY, JSON.stringify(leads));
  }

  getAll() {
    return this._load();
  }

  clear() {
    this._store.clear();
  }

  /**
   * Ingest a missed call.
   * Returns { action: 'created'|'updated', lead }
   * Throws on missing name or phone.
   */
  ingest(name, phone, timestamp, businessName) {
    if (!name || !phone) {
      throw new Error("ingest requires name and phone");
    }
    const ts  = timestamp || new Date().toISOString();
    const biz = businessName || this.getSettings().businessName || "Peak Flow Plumbing";
    const leads = this._load();

    const idx = leads.findIndex(l => l.phone === phone);
    if (idx !== -1) {
      // Duplicate â€” update existing
      leads[idx].last_call  = ts;
      leads[idx].call_count = (leads[idx].call_count || 1) + 1;
      leads[idx].sms_draft  = generateSMS(name, biz);
      leads[idx].updated_at = new Date().toISOString();
      this._save(leads);
      return { action: 'updated', lead: leads[idx] };
    } else {
      const lead = {
        id:         generateLeadId(),
        name:       name,
        phone:      phone,
        timestamp:  ts,
        last_call:  ts,
        call_count: 1,
        status:     "new",
        sms_draft:  generateSMS(name, biz),
        notes:      "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      leads.push(lead);
      this._save(leads);
      return { action: 'created', lead };
    }
  }

  /**
   * Update a lead's status.
   * Returns the updated lead or null if not found.
   */
  updateStatus(id, status) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}. Valid: ${VALID_STATUSES.join(', ')}`);
    }
    const leads = this._load();
    const idx = leads.findIndex(l => l.id === id);
    if (idx === -1) return null;
    leads[idx].status     = status;
    leads[idx].updated_at = new Date().toISOString();
    this._save(leads);
    return leads[idx];
  }

  /**
   * Get scored and sorted leads.
   * @param {Date} now - injectable for deterministic tests
   */
  updateNotes(id, notes) {
    if (typeof notes !== 'string') {
      throw new Error('Notes must be text');
    }

    const leads = this._load();
    const idx = leads.findIndex(l => l.id === id);
    if (idx === -1) return null;

    leads[idx].notes = notes;
    leads[idx].updated_at = new Date().toISOString();
    this._save(leads);
    return leads[idx];
  }

  updateFollowUp(id, followUpDate) {
    if (typeof followUpDate !== 'string') {
      throw new Error('Follow-up date must be text');
    }

    if (followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(followUpDate)) {
      throw new Error('Invalid follow-up date format');
    }

    const leads = this._load();
    const idx = leads.findIndex(l => l.id === id);
    if (idx === -1) return null;

    leads[idx].follow_up_date = followUpDate;
    leads[idx].updated_at = new Date().toISOString();

    this._save(leads);
    return leads[idx];
  }
  completeFollowUp(id) {
    const leads = this._load();
    const idx = leads.findIndex(l => l.id === id);
    if (idx === -1) return null;
    const lead = leads[idx];
    if (!lead.follow_up_date) return null;
    if (!Array.isArray(lead.follow_up_history)) lead.follow_up_history = [];
    lead.follow_up_history.push({ scheduled_date: lead.follow_up_date, completed_at: new Date().toISOString() });
    lead.follow_up_date = '';
    lead.updated_at = new Date().toISOString();
    this._save(leads);
    return lead;
  }

  getScoredLeads(now) {
    const leads = this._load();
    return leads
      .map(l => ({ ...l, urgency: urgencyScore(l, now) }))
      .sort((a, b) => b.urgency - a.urgency);
  }

  /**
   * Get settings (businessName, etc.)
   */
  getSettings() {
    try {
      const raw = this._store.get(SETTINGS_KEY);
      if (!raw) return { businessName: "Peak Flow Plumbing" };
      return JSON.parse(raw);
    } catch (e) {
      return { businessName: "Peak Flow Plumbing" };
    }
  }

  saveSettings(settings) {
    this._store.set(SETTINGS_KEY, JSON.stringify(settings));
  }

  /**
   * Load the 6-lead demo dataset.
   * Uses fixed timestamps relative to DEMO_ANCHOR_ISO for deterministic urgency.
   */
  loadDemo(businessName) {
    this.clear();
    const biz    = businessName || "Peak Flow Plumbing";
    const anchor = new Date(DEMO_ANCHOR_ISO);

    const samples = [
      { name: "Marcus Webb",      phone: "555-0101", offsetHours: -0.5  },
      { name: "Sandra Okafor",    phone: "555-0102", offsetHours: -2    },
      { name: "Tom Delgado",      phone: "555-0103", offsetHours: -5    },
      { name: "Priya Nair",       phone: "555-0104", offsetHours: -18   },
      { name: "Kevin Strickland", phone: "555-0105", offsetHours: -26   },
      { name: "Beth Carrington",  phone: "555-0106", offsetHours: -48   }
    ];

    for (const s of samples) {
      const ts = new Date(anchor.getTime() + s.offsetHours * 3_600_000).toISOString();
      this.ingest(s.name, s.phone, ts, biz);
    }

    // Advance some statuses as in the PS1 demo
    const leads = this._load();
    for (const l of leads) {
      if (l.phone === "555-0103") l.status = "contacted";
      if (l.phone === "555-0104") l.status = "quoted";
      if (l.phone === "555-0105") l.status = "no_response";
      if (l.phone === "555-0106") l.status = "won";
    }
    this._save(leads);
  }
}

// â”€â”€ Exports (works in both browser globals and Node require) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const LeadFollowUp = {
  SMS_TEMPLATES,
  VALID_STATUSES,
  STATUS_WEIGHTS,
  DEMO_ANCHOR_ISO,
  STORAGE_KEY,
  SETTINGS_KEY,
  stringHash,
  generateLeadId,
  generateSMS,
  urgencyScore,
  groupLeads,
  LeadStore
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LeadFollowUp;
} else if (typeof window !== 'undefined') {
  window.LeadFollowUp = LeadFollowUp;
}



