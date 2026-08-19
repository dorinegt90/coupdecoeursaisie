// =========================================================
// Coup de cœur — Logique de l'application
// =========================================================

let contacts = [];
let statutHistorique = [];
let adhesions = [];
let suiviHistorique = [];
let periodMode = 'week'; // 'week' | 'month' | 'custom'
let periodOffset = 0;
let customStart = null;
let customEnd = null;
let currentDetailContact = null;
let editingSuiviId = null;
let dashboardFilter = null; // null | 'nouveaux' | 'decouverte' | 'signatures' | 'ca'

const FILTER_LABELS = {
  nouveaux: 'Nouveaux contacts', decouverte: 'Appels découverte',
  signatures: 'Signatures', ca: "Chiffre d'affaires",
};

let contactsSort = { field: 'date_maj', dir: 'desc' };
let adherentsSort = { field: 'date_maj', dir: 'desc' };

const STATUTS = ['Contact entrant', 'Appel découverte programmé', 'Prospect', 'Adhérent', 'Non qualifié'];

// ---------------------------------------------------------
// Popups déplaçables : glisser depuis l'en-tête
// ---------------------------------------------------------
function initDraggableModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    const box = overlay.querySelector('.modal-box');
    const header = overlay.querySelector('.modal-header');
    if (!box || !header) return;
    let dragging = false, offsetX = 0, offsetY = 0;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      const rect = box.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      box.style.position = 'fixed';
      box.style.margin = '0';
      box.style.left = rect.left + 'px';
      box.style.top = rect.top + 'px';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      box.style.left = Math.max(0, e.clientX - offsetX) + 'px';
      box.style.top = Math.max(0, e.clientY - offsetY) + 'px';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.userSelect = '';
    });
  });
}
document.addEventListener('DOMContentLoaded', initDraggableModals);

function resetModalPosition(overlayId) {
  const overlay = document.getElementById(overlayId);
  const box = overlay ? overlay.querySelector('.modal-box') : null;
  if (box) { box.style.position = ''; box.style.left = ''; box.style.top = ''; box.style.margin = ''; }
}

// ---------------------------------------------------------
// Authentification
// ---------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    showApp();
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  loadAllData();
  checkBackupReminder();
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = "Connexion impossible : email ou mot de passe incorrect.";
    errorEl.classList.remove('hidden');
    return;
  }
  showApp();
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
  showLogin();
}

// ---------------------------------------------------------
// Chargement des données
// ---------------------------------------------------------
async function loadAllData() {
  const [contactsRes, historiqueRes, adhesionsRes, suiviRes] = await Promise.all([
    supabaseClient.from('contacts').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('statut_historique').select('*').order('date_changement', { ascending: true }),
    supabaseClient.from('adhesions').select('*'),
    supabaseClient.from('suivi_historique').select('*').order('date_commentaire', { ascending: true }),
  ]);

  if (contactsRes.error) { alert("Erreur de chargement des contacts : " + contactsRes.error.message); return; }
  contacts = contactsRes.data || [];
  statutHistorique = historiqueRes.data || [];
  adhesions = adhesionsRes.data || [];
  suiviHistorique = suiviRes.data || [];

  renderDashboard();
  renderContactsTable();
  renderAdherentsTable();
}

function getAdhesion(contactId) {
  return adhesions.find(a => a.contact_id === contactId) || null;
}

function getHistoryFor(contactId) {
  return statutHistorique
    .filter(h => h.contact_id === contactId)
    .sort((a, b) => new Date(b.date_changement) - new Date(a.date_changement));
}

function getLastHistoryDate(contactId) {
  const h = getHistoryFor(contactId);
  if (h.length > 0) return h[0].date_changement;
  const c = contacts.find(x => x.id === contactId);
  return c ? c.created_at : null;
}

function getSuiviFor(contactId) {
  return suiviHistorique
    .filter(s => s.contact_id === contactId)
    .sort((a, b) => new Date(a.date_commentaire) - new Date(b.date_commentaire));
}

function formatDateShort(dateStr) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');
}

// Le dernier commentaire "utile" pour un contact, en comparant la source
// changement de statut et le suivi adhérent, pour toujours afficher le plus récent.
function getLatestComment(contactId) {
  const candidates = [];
  const c = contacts.find(x => x.id === contactId);
  if (c && c.commentaire) {
    const h = getHistoryFor(contactId).find(h => h.commentaire === c.commentaire);
    candidates.push({ date: h ? h.date_changement : c.created_at, text: c.commentaire });
  }
  const suivi = getSuiviFor(contactId);
  if (suivi.length > 0) {
    const last = suivi[suivi.length - 1];
    candidates.push({ date: last.date_commentaire, text: last.commentaire });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => new Date(b.date) - new Date(a.date));
  return candidates[0].text;
}

function getLastActivityDate(contactId) {
  const c = contacts.find(x => x.id === contactId);
  let latest = c ? new Date(c.created_at) : new Date(0);
  const h = getHistoryFor(contactId);
  if (h.length > 0) { const d = new Date(h[0].date_changement); if (d > latest) latest = d; }
  const s = getSuiviFor(contactId);
  if (s.length > 0) { const d = new Date(s[s.length - 1].date_commentaire); if (d > latest) latest = d; }
  return latest.toISOString();
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

// ---------------------------------------------------------
// Navigation
// ---------------------------------------------------------
function switchTab(tab) {
  document.getElementById('tab-dashboard').classList.toggle('active', tab === 'dashboard');
  document.getElementById('tab-contacts').classList.toggle('active', tab === 'contacts');
  document.getElementById('tab-adherents').classList.toggle('active', tab === 'adherents');
  document.getElementById('view-dashboard').classList.toggle('hidden', tab !== 'dashboard');
  document.getElementById('view-contacts').classList.toggle('hidden', tab !== 'contacts');
  document.getElementById('view-adherents').classList.toggle('hidden', tab !== 'adherents');
}

// ---------------------------------------------------------
// Dates : semaine (lundi-dimanche) et mois complets
// ---------------------------------------------------------
function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function endOfWeek(d) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
function startOfMonth(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}
function endOfMonth(d) {
  const date = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date;
}
function inRange(dateStr, start, end) {
  const t = new Date(dateStr).getTime();
  return t >= start.getTime() && t <= end.getTime();
}
function formatDateFR(dateStr, withWeekday) {
  const d = new Date(dateStr);
  const opts = withWeekday
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: '2-digit', month: '2-digit', year: '2-digit' };
  return d.toLocaleDateString('fr-FR', opts);
}
function formatDateTimeFR(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------
// Tableau de bord — période (semaine / mois / personnalisé)
// ---------------------------------------------------------
function setPeriodMode(mode) {
  periodMode = mode;
  periodOffset = 0;
  document.getElementById('mode-week').classList.toggle('active', mode === 'week');
  document.getElementById('mode-month').classList.toggle('active', mode === 'month');
  document.getElementById('mode-custom').classList.toggle('active', mode === 'custom');
  document.getElementById('period-custom-fields').classList.toggle('hidden', mode !== 'custom');

  if (mode === 'custom' && !customStart) {
    const now = new Date();
    customStart = startOfWeek(now).toISOString().slice(0, 10);
    customEnd = endOfWeek(now).toISOString().slice(0, 10);
    document.getElementById('custom-start').value = customStart;
    document.getElementById('custom-end').value = customEnd;
  }
  renderDashboard();
}

function shiftPeriod(dir) {
  if (periodMode === 'custom') return;
  periodOffset += dir;
  renderDashboard();
}

function applyCustomPeriod() {
  customStart = document.getElementById('custom-start').value;
  customEnd = document.getElementById('custom-end').value;
  renderDashboard();
}

function applyShortcut(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  customStart = start.toISOString().slice(0, 10);
  customEnd = end.toISOString().slice(0, 10);
  document.getElementById('custom-start').value = customStart;
  document.getElementById('custom-end').value = customEnd;
  renderDashboard();
}

function getPeriodRange() {
  const now = new Date();
  if (periodMode === 'week') {
    const ref = new Date(now);
    ref.setDate(ref.getDate() + periodOffset * 7);
    return { start: startOfWeek(ref), end: endOfWeek(ref) };
  }
  if (periodMode === 'month') {
    const ref = new Date(now);
    ref.setMonth(ref.getMonth() + periodOffset);
    return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }
  const s = customStart ? new Date(customStart + 'T00:00:00') : startOfWeek(now);
  const e = customEnd ? new Date(customEnd + 'T23:59:59') : endOfWeek(now);
  return { start: s, end: e };
}

function computeStats() {
  const { start, end } = getPeriodRange();

  const nouveaux = contacts.filter(c => inRange(c.created_at, start, end)).length;
  const decouverteIds = new Set();
  const signatureIds = new Set();

  statutHistorique.forEach(h => {
    if (!inRange(h.date_changement, start, end)) return;
    if (h.statut === 'Appel découverte programmé') decouverteIds.add(h.contact_id);
    if (h.statut === 'Adhérent') signatureIds.add(h.contact_id);
  });

  let ca = 0;
  signatureIds.forEach(id => {
    const adh = getAdhesion(id);
    if (adh) ca += Number(adh.montant) || 0;
  });

  return { nouveaux, decouverte: decouverteIds.size, signatures: signatureIds.size, ca, start, end };
}

function getDashboardFilterContacts(type, start, end) {
  if (type === 'nouveaux') {
    return contacts.filter(c => inRange(c.created_at, start, end));
  }
  if (type === 'decouverte') {
    const ids = new Set(statutHistorique
      .filter(h => h.statut === 'Appel découverte programmé' && inRange(h.date_changement, start, end))
      .map(h => h.contact_id));
    return contacts.filter(c => ids.has(c.id));
  }
  if (type === 'signatures' || type === 'ca') {
    const ids = new Set(statutHistorique
      .filter(h => h.statut === 'Adhérent' && inRange(h.date_changement, start, end))
      .map(h => h.contact_id));
    return contacts.filter(c => ids.has(c.id));
  }
  return [];
}

function selectDashboardFilter(type) {
  dashboardFilter = dashboardFilter === type ? null : type;
  renderDashboard();
}
function clearDashboardFilter() {
  dashboardFilter = null;
  renderDashboard();
}

function periodLabel(mode, start, end) {
  if (mode === 'week') return `Semaine complète : ${formatDateFR(start, true)} — ${formatDateFR(end, true)}`;
  if (mode === 'month') return `Mois complet : ${start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
  return `Période personnalisée : ${formatDateFR(start, true)} — ${formatDateFR(end, true)}`;
}

function renderDashboard() {
  const stats = computeStats();

  document.getElementById('stat-nouveaux').textContent = stats.nouveaux;
  document.getElementById('stat-decouverte').textContent = stats.decouverte;
  document.getElementById('stat-signatures').textContent = stats.signatures;
  document.getElementById('stat-ca').textContent = stats.ca.toLocaleString('fr-FR', { minimumFractionDigits: 0 }) + ' €';

  const label = periodLabel(periodMode, stats.start, stats.end);
  document.getElementById('dash-period-label').textContent = label;
  document.getElementById('period-arrow-prev').classList.toggle('hidden-arrow', periodMode === 'custom');
  document.getElementById('period-arrow-next').classList.toggle('hidden-arrow', periodMode === 'custom');

  ['nouveaux', 'decouverte', 'signatures', 'ca'].forEach(type => {
    document.getElementById(`stat-card-${type}`).classList.toggle('active-filter', dashboardFilter === type);
  });

  const recentEl = document.getElementById('recent-contacts-list');
  const titleEl = document.getElementById('recent-list-title');
  const clearBtn = document.getElementById('clear-dashboard-filter');

  const periodWord = periodMode === 'week' ? 'cette semaine' : periodMode === 'month' ? 'ce mois' : 'cette période';

  let list;
  if (dashboardFilter) {
    list = getDashboardFilterContacts(dashboardFilter, stats.start, stats.end);
    titleEl.textContent = `${FILTER_LABELS[dashboardFilter]} (${periodWord})`;
    clearBtn.classList.remove('hidden');
  } else if (periodMode === 'custom') {
    list = getDashboardFilterContacts('nouveaux', stats.start, stats.end);
    titleEl.textContent = 'Nouveaux contacts (période personnalisée)';
    clearBtn.classList.add('hidden');
  } else {
    list = [...contacts].slice(0, 5);
    titleEl.textContent = 'Derniers contacts';
    clearBtn.classList.add('hidden');
  }

  if (list.length === 0) {
    recentEl.innerHTML = '<div class="empty-state">Aucun contact ne correspond</div>';
    return;
  }
  recentEl.innerHTML = list.map(c => `
    <div class="recent-row" onclick="openContactDetail('${c.id}')">
      <div class="recent-left">
        <div class="avatar" style="background:${getAvatarColor(c.statut_actuel)}">${initials(c)}</div>
        <div>
          <div class="recent-name">${escapeHtml(c.prenom)} ${escapeHtml(c.nom)}</div>
          <div class="recent-meta">${escapeHtml(c.connu_par || '—')} · ${c.age || '?'} ans · ${formatDateFR(c.created_at, true)}</div>
        </div>
      </div>
      <span class="badge ${badgeClass(c.statut_actuel)}">${c.statut_actuel}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------
// Aides visuelles (couleurs, initiales, échappement HTML)
// ---------------------------------------------------------
function badgeClass(statut) {
  switch (statut) {
    case 'Appel découverte programmé': return 'badge-decouverte';
    case 'Prospect': return 'badge-prospect';
    case 'Adhérent': return 'badge-adherent';
    case 'Non qualifié': return 'badge-nonqualifie';
    default: return 'badge-entrant';
  }
}
function getAvatarColor(statut) {
  switch (statut) {
    case 'Appel découverte programmé': return '#9C7526';
    case 'Prospect': return '#1C87A0';
    case 'Adhérent': return '#C44434';
    case 'Non qualifié': return '#54514D';
    default: return '#8C7A78';
  }
}
function initials(c) {
  return ((c.prenom ? c.prenom[0] : '') + (c.nom ? c.nom[0] : '')).toUpperCase() || '?';
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

// ---------------------------------------------------------
// Tri générique des tableaux
// ---------------------------------------------------------
function sortTable(table, field) {
  const state = table === 'contacts' ? contactsSort : adherentsSort;
  if (state.field === field) {
    state.dir = state.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.field = field;
    state.dir = 'asc';
  }
  if (table === 'contacts') renderContactsTable(); else renderAdherentsTable();
}

function compareRows(a, b, field) {
  if (field === 'age') {
    return (Number(a.age) || 0) - (Number(b.age) || 0);
  }
  if (field === 'created_at' || field === 'date_maj') {
    return new Date(a[field] || 0) - new Date(b[field] || 0);
  }
  const va = (a[field] || '').toString().toLowerCase();
  const vb = (b[field] || '').toString().toLowerCase();
  return va.localeCompare(vb, 'fr');
}

function updateSortArrows(tableId, state) {
  document.querySelectorAll(`#${tableId} thead [data-field]`).forEach(el => {
    if (el.dataset.field === state.field) {
      el.textContent = state.dir === 'asc' ? '▲' : '▼';
    } else {
      el.textContent = '';
    }
  });
}

// ---------------------------------------------------------
// Filtres
// ---------------------------------------------------------
function resetAdvancedFilters() {
  ['filter-ville', 'filter-deptcp', 'filter-age-min', 'filter-age-max'].forEach(id => document.getElementById(id).value = '');
  ['filter-connu-par', 'filter-type-contact', 'filter-statut'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('search-input').value = '';
  renderContactsTable();
}

function getAdvancedFilters() {
  return {
    ville: (document.getElementById('filter-ville').value || '').trim().toLowerCase(),
    deptCp: (document.getElementById('filter-deptcp').value || '').trim().toLowerCase(),
    connuPar: document.getElementById('filter-connu-par').value,
    typeContact: document.getElementById('filter-type-contact').value,
    ageMin: document.getElementById('filter-age-min').value,
    ageMax: document.getElementById('filter-age-max').value,
  };
}

function matchesAdvanced(row, f) {
  if (f.ville && !(row.ville || '').toLowerCase().includes(f.ville)) return false;
  if (f.deptCp && !(row.dept_cp || '').toLowerCase().includes(f.deptCp)) return false;
  if (f.connuPar && row.connu_par !== f.connuPar) return false;
  if (f.typeContact && row.type_contact !== f.typeContact) return false;
  if (f.ageMin && (!row.age || Number(row.age) < Number(f.ageMin))) return false;
  if (f.ageMax && (!row.age || Number(row.age) > Number(f.ageMax))) return false;
  return true;
}

function matchesSearch(row, search) {
  if (!search) return true;
  const hay = [
    row.prenom, row.nom, row.email, row.telephone, row.adresse,
    row.dept_cp, row.ville, row.connu_par, row.type_contact, row.commentaire, row.statut,
  ].join(' ').toLowerCase();
  return hay.includes(search);
}

// ---------------------------------------------------------
// Liste des contacts
// ---------------------------------------------------------
function buildContactRows() {
  return contacts.map(c => {
    const adh = getAdhesion(c.id);
    return {
      id: c.id, created_at: c.created_at, prenom: c.prenom, nom: c.nom, age: c.age,
      email: c.email, telephone: c.telephone, adresse: c.adresse, dept_cp: c.dept_cp, ville: c.ville,
      connu_par: c.connu_par, type_contact: c.type_contact, commentaire: getLatestComment(c.id),
      statut: c.statut_actuel, formule: adh ? adh.type_formule : null,
      date_maj: getLastActivityDate(c.id),
    };
  });
}

function renderContactsTable() {
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const statutFilter = document.getElementById('filter-statut').value;
  const adv = getAdvancedFilters();

  let rows = buildContactRows().filter(r =>
    matchesSearch(r, search) &&
    (!statutFilter || r.statut === statutFilter) &&
    matchesAdvanced(r, adv)
  );

  rows.sort((a, b) => {
    const res = compareRows(a, b, contactsSort.field);
    return contactsSort.dir === 'asc' ? res : -res;
  });

  const tbody = document.getElementById('contacts-table-body');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="14" class="empty-state">Aucun contact ne correspond à cette recherche</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(r => `
      <tr onclick="openContactDetail('${r.id}')">
        <td>${formatDateFR(r.created_at)}</td>
        <td>${escapeHtml(r.prenom)}</td>
        <td>${escapeHtml(r.nom)}</td>
        <td>${r.age || '—'}</td>
        <td class="cell-muted">${escapeHtml(r.email || '—')}</td>
        <td>${escapeHtml(r.telephone || '—')}</td>
        <td>${escapeHtml(r.dept_cp || '—')}</td>
        <td>${escapeHtml(r.ville || '—')}</td>
        <td>${escapeHtml(r.type_contact || '—')}</td>
        <td class="cell-ellipsis cell-muted">${escapeHtml(r.commentaire || '—')}</td>
        <td><span class="badge ${badgeClass(r.statut)}">${r.statut}</span></td>
        <td>${r.formule ? escapeHtml(r.formule) : '<span class="cell-muted">—</span>'}</td>
        <td class="cell-muted">${formatDateTimeFR(r.date_maj)}</td>
        <td><button class="row-action-btn" onclick="event.stopPropagation(); exportBrevoSingle('${r.id}')" title="Exporter ce contact vers Brevo">Brevo</button></td>
      </tr>`
    ).join('');
  }

  document.getElementById('contacts-count').textContent =
    `${rows.length} contact${rows.length > 1 ? 's' : ''} affiché${rows.length > 1 ? 's' : ''} sur ${contacts.length}`;

  updateSortArrows('contacts-table', contactsSort);
}

// ---------------------------------------------------------
// Liste des adhérents
// ---------------------------------------------------------
function buildAdherentRows() {
  return contacts
    .filter(c => c.statut_actuel === 'Adhérent')
    .map(c => {
      const adh = getAdhesion(c.id);
      return {
        id: c.id, statut: c.statut_actuel, prenom: c.prenom, nom: c.nom,
        commentaire: getLatestComment(c.id), date_maj: getLastActivityDate(c.id),
        formule: adh ? adh.type_formule : null,
      };
    });
}

function resetAdherentsFilters() {
  document.getElementById('adherents-search-input').value = '';
  document.getElementById('filter-formule').value = '';
  document.getElementById('filter-maj-depuis').value = '';
  document.getElementById('filter-maj-jusqua').value = '';
  renderAdherentsTable();
}

function renderAdherentsTable() {
  const search = document.getElementById('adherents-search-input').value.trim().toLowerCase();
  const formuleFilter = document.getElementById('filter-formule').value;
  const majDepuis = document.getElementById('filter-maj-depuis').value;
  const majJusqua = document.getElementById('filter-maj-jusqua').value;

  let rows = buildAdherentRows().filter(r => {
    if (search) {
      const hay = [r.prenom, r.nom, r.commentaire].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (formuleFilter && r.formule !== formuleFilter) return false;
    if (majDepuis && new Date(r.date_maj) < new Date(majDepuis + 'T00:00:00')) return false;
    if (majJusqua && new Date(r.date_maj) > new Date(majJusqua + 'T23:59:59')) return false;
    return true;
  });

  rows.sort((a, b) => {
    const res = compareRows(a, b, adherentsSort.field);
    return adherentsSort.dir === 'asc' ? res : -res;
  });

  const tbody = document.getElementById('adherents-table-body');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Aucun adhérent ne correspond</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(r => `
      <tr onclick="openAdherentDetail('${r.id}')">
        <td><span class="badge ${badgeClass(r.statut)}">${r.statut}</span></td>
        <td>${escapeHtml(r.prenom)}</td>
        <td>${escapeHtml(r.nom)}</td>
        <td>${r.formule ? escapeHtml(r.formule) : '<span class="cell-muted">—</span>'}</td>
        <td class="cell-ellipsis cell-muted">${escapeHtml(r.commentaire || '—')}</td>
        <td>${formatDateTimeFR(r.date_maj)}</td>
      </tr>`
    ).join('');
  }

  document.getElementById('adherents-count').textContent =
    `${rows.length} adhérent${rows.length > 1 ? 's' : ''}`;

  updateSortArrows('adherents-table', adherentsSort);
}

// ---------------------------------------------------------
// Formulaire d'ajout d'un contact
// ---------------------------------------------------------
function openContactForm() {
  document.getElementById('form-title').textContent = 'Nouveau contact';
  document.getElementById('form-contact-id').value = '';
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
  ['f-nom', 'f-prenom', 'f-age', 'f-email', 'f-telephone', 'f-adresse', 'f-deptcp', 'f-ville', 'f-commentaire']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-connu-par').selectedIndex = 0;
  document.getElementById('f-type-contact').selectedIndex = 0;
  resetModalPosition('modal-contact-form');
  document.getElementById('modal-contact-form').classList.remove('hidden');
}
function closeContactForm() {
  document.getElementById('modal-contact-form').classList.add('hidden');
}

async function saveContactForm() {
  const nom = document.getElementById('f-nom').value.trim();
  const prenom = document.getElementById('f-prenom').value.trim();

  const dateVal = document.getElementById('f-date').value;
  const payload = {
    created_at: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
    nom, prenom,
    age: document.getElementById('f-age').value ? Number(document.getElementById('f-age').value) : null,
    email: document.getElementById('f-email').value.trim() || null,
    telephone: document.getElementById('f-telephone').value.trim() || null,
    adresse: document.getElementById('f-adresse').value.trim() || null,
    dept_cp: document.getElementById('f-deptcp').value.trim() || null,
    ville: document.getElementById('f-ville').value.trim() || null,
    connu_par: document.getElementById('f-connu-par').value,
    type_contact: document.getElementById('f-type-contact').value,
    commentaire: document.getElementById('f-commentaire').value.trim() || null,
    statut_actuel: 'Contact entrant',
  };

  const { data, error } = await supabaseClient.from('contacts').insert(payload).select().single();
  if (error) { alert("Erreur à l'enregistrement : " + error.message); return; }

  await supabaseClient.from('statut_historique').insert({
    contact_id: data.id, statut: 'Contact entrant', date_changement: payload.created_at,
    commentaire: payload.commentaire,
  });

  closeContactForm();
  await loadAllData();
  switchTab('contacts');
}

// ---------------------------------------------------------
// Fiche détail d'un contact
// ---------------------------------------------------------
function openContactDetail(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  currentDetailContact = c;

  document.getElementById('detail-avatar').textContent = initials(c);
  document.getElementById('detail-avatar').style.background = getAvatarColor(c.statut_actuel);
  document.getElementById('detail-name').textContent = `${c.prenom} ${c.nom}`;
  document.getElementById('detail-current-badge').textContent = c.statut_actuel;
  document.getElementById('detail-current-badge').className = 'badge ' + badgeClass(c.statut_actuel);
  document.getElementById('detail-new-status').value = c.statut_actuel;
  document.getElementById('detail-status-note').value = '';

  renderDetailViewFields(c);
  document.getElementById('detail-view-fields').classList.remove('hidden');
  document.getElementById('detail-edit-fields').classList.add('hidden');
  document.getElementById('detail-edit-btn').textContent = 'Modifier';

  onDetailStatusChange();
  const adh = getAdhesion(c.id);
  if (adh) {
    document.getElementById('detail-formule').value = adh.type_formule || '';
    document.getElementById('detail-montant').value = adh.montant || '';
    document.getElementById('detail-mode-reglement').value = adh.mode_reglement || 'Carte bancaire';
    document.getElementById('detail-nb-fois').value = adh.nombre_fois || 1;
  } else {
    document.getElementById('detail-formule').value = '';
    document.getElementById('detail-montant').value = '';
    document.getElementById('detail-nb-fois').value = 1;
  }

  renderHistory(c.id);
  resetModalPosition('modal-contact-detail');
  document.getElementById('modal-contact-detail').classList.remove('hidden');
}

function closeContactDetail() {
  document.getElementById('modal-contact-detail').classList.add('hidden');
  currentDetailContact = null;
}

function field(label, value) {
  return `<div class="detail-field"><div class="label">${label}</div><div class="value">${escapeHtml(value || '—')}</div></div>`;
}

function fieldEmail(label, value) {
  if (!value) return field(label, value);
  return `<div class="detail-field"><div class="label">${label}</div><div class="value" style="display:flex;align-items:center;gap:6px;"><span id="detail-email-value">${escapeHtml(value)}</span><button class="copy-btn" onclick="copyFieldText('detail-email-value', this)" title="Copier l'email">⧉</button></div></div>`;
}

function copyFieldText(elementId, btnEl) {
  const el = document.getElementById(elementId);
  const text = (el.textContent || '').trim();
  if (!text || text === '—') return;
  navigator.clipboard.writeText(text).then(() => {
    const original = btnEl.textContent;
    btnEl.textContent = '✓';
    btnEl.classList.add('copied');
    setTimeout(() => { btnEl.textContent = original; btnEl.classList.remove('copied'); }, 1200);
  });
}

function renderDetailViewFields(c) {
  document.getElementById('detail-view-fields').innerHTML = [
    field('Date', formatDateFR(c.created_at, true)),
    field('Âge', c.age),
    field('Prénom', c.prenom),
    field('Nom', c.nom),
    fieldEmail('Email', c.email),
    field('Téléphone', c.telephone),
    field('Adresse', c.adresse),
    field('Dept / CP', c.dept_cp),
    field('Ville', c.ville),
    field('Connu par', c.connu_par),
    field('Type de contact', c.type_contact),
    field('Commentaire', getLatestComment(c.id)),
  ].join('');
}

function renderDetailEditFields(c) {
  document.getElementById('detail-edit-fields').innerHTML = `
    <div class="form-grid grid-2">
      <div class="field"><label>Prénom</label><input id="e-prenom" value="${escapeHtml(c.prenom)}"></div>
      <div class="field"><label>Nom</label><input id="e-nom" value="${escapeHtml(c.nom)}"></div>
    </div>
    <div class="form-grid grid-2">
      <div class="field"><label>Âge</label><input type="number" id="e-age" value="${c.age || ''}"></div>
      <div class="field"><label>Email</label><input type="email" id="e-email" value="${escapeHtml(c.email || '')}"></div>
    </div>
    <div class="form-grid grid-2">
      <div class="field"><label>Téléphone</label><input id="e-telephone" value="${escapeHtml(c.telephone || '')}"></div>
      <div class="field"><label>Ville</label><input id="e-ville" value="${escapeHtml(c.ville || '')}"></div>
    </div>
    <div class="form-grid grid-2">
      <div class="field"><label>Adresse</label><input id="e-adresse" value="${escapeHtml(c.adresse || '')}"></div>
      <div class="field"><label>Dept / CP</label><input id="e-deptcp" value="${escapeHtml(c.dept_cp || '')}"></div>
    </div>
    <div class="form-grid grid-2">
      <div class="field">
        <label>Connu par</label>
        <select id="e-connu-par">
          ${['Recherche Google', 'Pub Google', 'Pub Facebook', 'Journal', 'Radio', 'Recommandation', 'Autre']
            .map(o => `<option ${c.connu_par === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>Type de contact</label>
        <select id="e-type-contact">
          ${['Appel découverte', 'Appel entrant', 'Mail', 'Whatsapp', 'SMS', 'Facebook', 'Autre']
            .map(o => `<option ${c.type_contact === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field" style="margin-bottom:12px;">
      <label>Commentaire</label>
      <textarea id="e-commentaire">${escapeHtml(c.commentaire || '')}</textarea>
    </div>
    <div class="form-actions" style="margin-bottom:8px;">
      <button class="btn-secondary" onclick="toggleEditMode()">Annuler</button>
      <button class="btn-primary" onclick="saveEditedFields()">✓ Enregistrer les modifications</button>
    </div>
  `;
}

function toggleEditMode() {
  const editing = !document.getElementById('detail-edit-fields').classList.contains('hidden');
  if (editing) {
    document.getElementById('detail-view-fields').classList.remove('hidden');
    document.getElementById('detail-edit-fields').classList.add('hidden');
    document.getElementById('detail-edit-btn').textContent = 'Modifier';
  } else {
    renderDetailEditFields(currentDetailContact);
    document.getElementById('detail-view-fields').classList.add('hidden');
    document.getElementById('detail-edit-fields').classList.remove('hidden');
    document.getElementById('detail-edit-btn').textContent = 'Annuler la modification';
  }
}

async function saveEditedFields() {
  const c = currentDetailContact;
  const payload = {
    nom: document.getElementById('e-nom').value.trim(),
    prenom: document.getElementById('e-prenom').value.trim(),
    age: document.getElementById('e-age').value ? Number(document.getElementById('e-age').value) : null,
    email: document.getElementById('e-email').value.trim() || null,
    telephone: document.getElementById('e-telephone').value.trim() || null,
    ville: document.getElementById('e-ville').value.trim() || null,
    adresse: document.getElementById('e-adresse').value.trim() || null,
    dept_cp: document.getElementById('e-deptcp').value.trim() || null,
    connu_par: document.getElementById('e-connu-par').value,
    type_contact: document.getElementById('e-type-contact').value,
    commentaire: document.getElementById('e-commentaire').value.trim() || null,
  };
  const { error } = await supabaseClient.from('contacts').update(payload).eq('id', c.id);
  if (error) { alert("Erreur à la modification : " + error.message); return; }
  await loadAllData();
  openContactDetail(c.id);
}

// ---------------------------------------------------------
// Statut & adhésion
// ---------------------------------------------------------
function onDetailStatusChange() {
  const newStatus = document.getElementById('detail-new-status').value;
  document.getElementById('detail-adhesion-fields').classList.toggle('hidden', newStatus !== 'Adhérent');
}

async function saveStatusChange() {
  const c = currentDetailContact;
  const newStatus = document.getElementById('detail-new-status').value;
  const commentaire = document.getElementById('detail-status-note').value.trim() || null;

  if (newStatus === 'Adhérent') {
    const montant = document.getElementById('detail-montant').value;
    if (!montant) {
      alert("Merci de renseigner le montant de l'adhésion.");
      return;
    }
    const adhPayload = {
      contact_id: c.id,
      type_formule: document.getElementById('detail-formule').value.trim() || null,
      montant: Number(montant),
      mode_reglement: document.getElementById('detail-mode-reglement').value,
      nombre_fois: Number(document.getElementById('detail-nb-fois').value) || 1,
      date_adhesion: new Date().toISOString().slice(0, 10),
    };
    const { error: adhError } = await supabaseClient.from('adhesions').upsert(adhPayload, { onConflict: 'contact_id' });
    if (adhError) { alert("Erreur à l'enregistrement de l'adhésion : " + adhError.message); return; }
  }

  if (newStatus !== c.statut_actuel || commentaire) {
    const { error: histError } = await supabaseClient.from('statut_historique').insert({
      contact_id: c.id, statut: newStatus, commentaire,
    });
    if (histError) { alert("Erreur à l'enregistrement du statut : " + histError.message); return; }
  }

  const updatePayload = {};
  if (newStatus !== c.statut_actuel) updatePayload.statut_actuel = newStatus;
  // Le dernier commentaire saisi devient le commentaire affiché dans les listes
  if (commentaire) updatePayload.commentaire = commentaire;

  if (Object.keys(updatePayload).length > 0) {
    const { error: updError } = await supabaseClient.from('contacts').update(updatePayload).eq('id', c.id);
    if (updError) { alert("Erreur à la mise à jour : " + updError.message); return; }
  }

  await loadAllData();
  openContactDetail(c.id);
}

function renderHistory(contactId) {
  const history = getHistoryFor(contactId);
  const el = document.getElementById('detail-history-list');
  if (history.length === 0) {
    el.innerHTML = '<div class="empty-state">Aucun historique</div>';
    return;
  }
  el.innerHTML = history.map(h => `
    <div class="timeline-item">
      <div>
        <span class="badge ${badgeClass(h.statut)}">${h.statut}</span>
        ${h.commentaire ? `<span style="margin-left:8px;color:var(--ink-soft);">${escapeHtml(h.commentaire)}</span>` : ''}
      </div>
      <span class="timeline-date">${formatDateTimeFR(h.date_changement)}</span>
    </div>
  `).join('');
}

// ---------------------------------------------------------
// Popup de suivi d'un adhérent
// ---------------------------------------------------------
function openAdherentDetail(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  currentDetailContact = c;

  document.getElementById('adh-avatar').textContent = initials(c);
  document.getElementById('adh-avatar').style.background = getAvatarColor(c.statut_actuel);
  document.getElementById('adh-name').textContent = `${c.prenom} ${c.nom}`;
  document.getElementById('adh-email').textContent = c.email || '—';
  document.getElementById('adh-age').textContent = c.age || '—';
  document.getElementById('adh-telephone').textContent = c.telephone || '—';
  document.getElementById('adh-new-comment').value = '';

  renderCommentLog(id);
  resetModalPosition('modal-adherent-detail');
  document.getElementById('modal-adherent-detail').classList.remove('hidden');
}

function closeAdherentDetail() {
  document.getElementById('modal-adherent-detail').classList.add('hidden');
  currentDetailContact = null;
}

function renderCommentLog(contactId) {
  const el = document.getElementById('adh-comment-log');
  const entries = getSuiviFor(contactId);

  if (entries.length === 0) {
    el.innerHTML = '<div class="empty-state">Aucun commentaire pour le moment.</div>';
    return;
  }

  el.innerHTML = entries.map(e => {
    if (editingSuiviId === e.id) {
      return `
        <div class="suivi-entry suivi-entry-edit-row">
          <span class="suivi-entry-date">${formatDateShort(e.date_commentaire)}</span>
          <div>
            <textarea id="edit-suivi-${e.id}" oninput="autoGrow(this)">${escapeHtml(e.commentaire)}</textarea>
            <div class="form-actions">
              <button class="btn-secondary" onclick="cancelEditSuivi()">Annuler</button>
              <button class="btn-primary" onclick="saveEditSuivi('${e.id}')">Enregistrer</button>
            </div>
          </div>
        </div>`;
    }
    return `
      <div class="suivi-entry">
        <span class="suivi-entry-date">${formatDateShort(e.date_commentaire)}</span>
        <span class="suivi-entry-text">${escapeHtml(e.commentaire)}</span>
        <span class="suivi-entry-actions">
          <button onclick="startEditSuivi('${e.id}')" title="Modifier">✎</button>
          <button onclick="deleteSuiviEntry('${e.id}')" title="Supprimer">🗑</button>
        </span>
      </div>`;
  }).join('');

  el.scrollTop = el.scrollHeight;
  if (editingSuiviId) {
    const ta = document.getElementById(`edit-suivi-${editingSuiviId}`);
    if (ta) autoGrow(ta);
  }
}

function startEditSuivi(id) {
  editingSuiviId = id;
  renderCommentLog(currentDetailContact.id);
}
function cancelEditSuivi() {
  editingSuiviId = null;
  renderCommentLog(currentDetailContact.id);
}
async function saveEditSuivi(id) {
  const ta = document.getElementById(`edit-suivi-${id}`);
  const text = ta.value.trim();
  if (!text) { alert('Le commentaire ne peut pas être vide.'); return; }
  const { error } = await supabaseClient.from('suivi_historique').update({ commentaire: text }).eq('id', id);
  if (error) { alert("Erreur à la modification : " + error.message); return; }
  editingSuiviId = null;
  await loadAllData();
  openAdherentDetail(currentDetailContact.id);
}
async function deleteSuiviEntry(id) {
  if (!confirm('Supprimer ce commentaire ?')) return;
  const { error } = await supabaseClient.from('suivi_historique').delete().eq('id', id);
  if (error) { alert("Erreur à la suppression : " + error.message); return; }
  await loadAllData();
  openAdherentDetail(currentDetailContact.id);
}

async function saveAdherentComment() {
  const c = currentDetailContact;
  const text = document.getElementById('adh-new-comment').value.trim();
  if (!text) { alert('Merci de saisir un commentaire avant d\'enregistrer.'); return; }

  const { error } = await supabaseClient.from('suivi_historique').insert({
    contact_id: c.id, commentaire: text,
  });
  if (error) { alert("Erreur à l'enregistrement du commentaire : " + error.message); return; }

  await loadAllData();
  openAdherentDetail(c.id);
}

async function deleteCurrentContact() {
  const c = currentDetailContact;
  if (!confirm(`Supprimer définitivement ${c.prenom} ${c.nom} ainsi que tout son historique ?`)) return;
  const { error } = await supabaseClient.from('contacts').delete().eq('id', c.id);
  if (error) { alert("Erreur à la suppression : " + error.message); return; }
  closeContactDetail();
  await loadAllData();
}

// ---------------------------------------------------------
// Export vers Brevo
// ---------------------------------------------------------
function formatPhoneForBrevo(tel) {
  if (!tel) return '';
  let digits = tel.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('0')) return '33' + digits.slice(1);
  return digits;
}

function brevoCsvRow(fields) {
  return fields.map(f => `"${String(f == null ? '' : f).replace(/"/g, '""')}"`).join(',');
}

function exportBrevoSingle(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  if (!c.email || !c.email.trim()) {
    alert("Ce contact n'a pas d'adresse email, impossible de l'exporter vers Brevo.");
    return;
  }
  const header = ['EMAIL', 'FIRSTNAME', 'LASTNAME', 'SMS', 'LANDLINE_NUMBER', 'WHATSAPP', 'INTERESTS'];
  const phone = formatPhoneForBrevo(c.telephone);
  const rows = [
    brevoCsvRow(header),
    brevoCsvRow([c.email.trim(), c.prenom || '', c.nom || '', phone, phone, phone, '[]']),
  ];
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = `${c.prenom || ''}-${c.nom || ''}`.trim().replace(/\s+/g, '-') || 'contact';
  triggerDownload(`brevo-${safeName}-${dateStr}.csv`, rows.join('\n'), 'text/csv');
}

function exportBrevoCSV() {
  const eligible = contacts.filter(c => c.email && c.email.trim());
  if (eligible.length === 0) {
    alert("Aucun contact avec une adresse email à exporter.");
    return;
  }

  const header = ['EMAIL', 'FIRSTNAME', 'LASTNAME', 'SMS', 'LANDLINE_NUMBER', 'WHATSAPP', 'INTERESTS'];
  const rows = [brevoCsvRow(header)];

  eligible.forEach(c => {
    const phone = formatPhoneForBrevo(c.telephone);
    rows.push(brevoCsvRow([c.email.trim(), c.prenom || '', c.nom || '', phone, phone, phone, '[]']));
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  triggerDownload(`export-brevo-coup-de-coeur-${dateStr}.csv`, rows.join('\n'), 'text/csv');
}

// ---------------------------------------------------------
// Sauvegarde : export, dossier persistant, rappel, snooze
// ---------------------------------------------------------
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('coeur-crm-backup', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const r = tx.objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function toCSV(rows) {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
  return lines.join('\n');
}

function triggerDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function writeFile(filename, content, mime, dateStr) {
  try {
    const handle = await idbGet('backupFolderHandle');
    if (handle) {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'prompt') perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const targetDir = dateStr ? await handle.getDirectoryHandle(dateStr, { create: true }) : handle;
        const fileHandle = await targetDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        return;
      }
    }
  } catch (e) {
    console.warn('Écriture dans le dossier choisi impossible, téléchargement classique utilisé.', e);
  }
  triggerDownload(filename, content, mime);
}

async function chooseBackupFolder() {
  if (!window.showDirectoryPicker) {
    alert('Votre navigateur ne permet pas de choisir un dossier fixe. Les sauvegardes utiliseront la fenêtre de téléchargement classique.');
    return;
  }
  try {
    const handle = await window.showDirectoryPicker();
    await idbSet('backupFolderHandle', handle);
    document.getElementById('backup-folder-label').textContent = handle.name;
  } catch (e) { /* annulé par l'utilisateur */ }
}

async function performBackup() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const formats = getSavedFormats();

  if (formats.includes('json')) {
    const payload = JSON.stringify({
      contacts, statut_historique: statutHistorique, adhesions, suivi_historique: suiviHistorique,
    }, null, 2);
    await writeFile(`sauvegarde-coup-de-coeur-${dateStr}.json`, payload, 'application/json', dateStr);
  }
  if (formats.includes('csv')) {
    await writeFile(`contacts-${dateStr}.csv`, toCSV(contacts), 'text/csv', dateStr);
    await writeFile(`statut_historique-${dateStr}.csv`, toCSV(statutHistorique), 'text/csv', dateStr);
    await writeFile(`adhesions-${dateStr}.csv`, toCSV(adhesions), 'text/csv', dateStr);
    await writeFile(`suivi_historique-${dateStr}.csv`, toCSV(suiviHistorique), 'text/csv', dateStr);
  }

  const now = new Date();
  localStorage.setItem('lastBackupDate', now.toISOString());
  const reminderDays = Number(localStorage.getItem('backupReminderDays') || 7);
  const next = new Date(now);
  next.setDate(next.getDate() + reminderDays);
  localStorage.setItem('nextReminderDate', next.toISOString());
  localStorage.removeItem('snoozeUntil');

  updateBackupBadge();
  closeBackupModal();
  alert('Sauvegarde effectuée.');
}

function snoozeBackup() {
  const snoozeDays = Number(localStorage.getItem('backupSnoozeDays') || 1);
  const next = new Date();
  next.setDate(next.getDate() + snoozeDays);
  localStorage.setItem('snoozeUntil', next.toISOString());
  updateBackupBadge();
  closeBackupModal();
}

function isBackupDue() {
  const snoozeUntil = localStorage.getItem('snoozeUntil');
  const nextReminder = localStorage.getItem('nextReminderDate');
  const dueDate = snoozeUntil ? new Date(snoozeUntil) : (nextReminder ? new Date(nextReminder) : null);
  if (!dueDate) return false; // pas de sauvegarde configurée/faite pour l'instant : pas de rappel intempestif
  return new Date() >= dueDate;
}

function updateBackupBadge() {
  document.getElementById('backup-badge-dot').classList.toggle('hidden', !isBackupDue());
}

function checkBackupReminder() {
  // Première utilisation : on amorce le cycle sans notifier tout de suite.
  if (!localStorage.getItem('nextReminderDate') && !localStorage.getItem('lastBackupDate')) {
    const reminderDays = Number(localStorage.getItem('backupReminderDays') || 7);
    const next = new Date();
    next.setDate(next.getDate() + reminderDays);
    localStorage.setItem('nextReminderDate', next.toISOString());
    return;
  }
  updateBackupBadge();
  if (isBackupDue()) openBackupModal();
}

function openBackupModal() {
  const last = localStorage.getItem('lastBackupDate');
  const lastEl = document.getElementById('backup-last-info');
  if (last) {
    const days = Math.floor((new Date() - new Date(last)) / 86400000);
    lastEl.textContent = days === 0 ? "Dernière sauvegarde : aujourd'hui." : `Dernière sauvegarde : il y a ${days} jour${days > 1 ? 's' : ''}.`;
  } else {
    lastEl.textContent = "Aucune sauvegarde n'a encore été faite.";
  }
  const reminderDays = localStorage.getItem('backupReminderDays') || 7;
  document.getElementById('backup-reminder-info').textContent = `Rappel configuré tous les ${reminderDays} jour${reminderDays > 1 ? 's' : ''}.`;
  resetModalPosition('modal-backup');
  document.getElementById('modal-backup').classList.remove('hidden');
}
function closeBackupModal() {
  document.getElementById('modal-backup').classList.add('hidden');
}

function toggleFormat(fmt) {
  const btn = document.getElementById(`format-${fmt}`);
  const other = fmt === 'csv' ? 'json' : 'csv';
  const otherActive = document.getElementById(`format-${other}`).classList.contains('format-active');
  const active = btn.classList.contains('format-active');
  if (active && !otherActive) return; // toujours garder au moins un format sélectionné
  btn.classList.toggle('format-active');
}

function getSelectedFormats() {
  const formats = [];
  if (document.getElementById('format-csv').classList.contains('format-active')) formats.push('csv');
  if (document.getElementById('format-json').classList.contains('format-active')) formats.push('json');
  return formats;
}

function setActiveFormats(formats) {
  document.getElementById('format-csv').classList.toggle('format-active', formats.includes('csv'));
  document.getElementById('format-json').classList.toggle('format-active', formats.includes('json'));
}

function getSavedFormats() {
  try {
    const saved = JSON.parse(localStorage.getItem('backupFormats'));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch (e) { /* ancien format éventuel, on retombe sur le défaut */ }
  return ['csv'];
}

async function openBackupSettings() {
  document.getElementById('settings-reminder-days').value = localStorage.getItem('backupReminderDays') || 7;
  document.getElementById('settings-snooze-days').value = localStorage.getItem('backupSnoozeDays') || 1;
  const formats = getSavedFormats();
  setActiveFormats(formats);

  try {
    const handle = await idbGet('backupFolderHandle');
    document.getElementById('backup-folder-label').textContent = handle ? handle.name : 'Aucun dossier choisi';
  } catch (e) {
    document.getElementById('backup-folder-label').textContent = 'Aucun dossier choisi';
  }

  closeBackupModal();
  resetModalPosition('modal-backup-settings');
  document.getElementById('modal-backup-settings').classList.remove('hidden');
}
function closeBackupSettings() {
  document.getElementById('modal-backup-settings').classList.add('hidden');
}

function saveBackupSettings() {
  const reminderDays = Math.max(1, Number(document.getElementById('settings-reminder-days').value) || 7);
  const snoozeDays = Math.max(1, Number(document.getElementById('settings-snooze-days').value) || 1);
  const formats = getSelectedFormats();

  localStorage.setItem('backupReminderDays', reminderDays);
  localStorage.setItem('backupSnoozeDays', snoozeDays);
  localStorage.setItem('backupFormats', JSON.stringify(formats));

  const last = localStorage.getItem('lastBackupDate');
  const base = last ? new Date(last) : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + reminderDays);
  localStorage.setItem('nextReminderDate', next.toISOString());
  localStorage.removeItem('snoozeUntil');

  updateBackupBadge();
  closeBackupSettings();
}
