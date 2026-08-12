// =========================================================
// Coup De Coeur — Logique de l'application
// =========================================================

let contacts = [];
let statutHistorique = [];
let adhesions = [];
let currentPeriod = 'week';
let currentDetailContact = null;

const STATUTS = ['Contact entrant', 'Appel découverte programmé', 'Prospect', 'Adhérent', 'Perdu'];

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
  const [contactsRes, historiqueRes, adhesionsRes] = await Promise.all([
    supabaseClient.from('contacts').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('statut_historique').select('*').order('date_changement', { ascending: true }),
    supabaseClient.from('adhesions').select('*'),
  ]);

  if (contactsRes.error) { alert("Erreur de chargement des contacts : " + contactsRes.error.message); return; }
  contacts = contactsRes.data || [];
  statutHistorique = historiqueRes.data || [];
  adhesions = adhesionsRes.data || [];

  renderDashboard();
  renderContactsTable();
}

function getAdhesion(contactId) {
  return adhesions.find(a => a.contact_id === contactId) || null;
}

function getHistoryFor(contactId) {
  return statutHistorique
    .filter(h => h.contact_id === contactId)
    .sort((a, b) => new Date(b.date_changement) - new Date(a.date_changement));
}

// ---------------------------------------------------------
// Navigation
// ---------------------------------------------------------
function switchTab(tab) {
  document.getElementById('tab-dashboard').classList.toggle('active', tab === 'dashboard');
  document.getElementById('tab-contacts').classList.toggle('active', tab === 'contacts');
  document.getElementById('view-dashboard').classList.toggle('hidden', tab !== 'dashboard');
  document.getElementById('view-contacts').classList.toggle('hidden', tab !== 'contacts');
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
    : { day: '2-digit', month: '2-digit' };
  return d.toLocaleDateString('fr-FR', opts);
}
function formatDateTimeFR(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------
function setPeriod(period) {
  currentPeriod = period;
  document.getElementById('period-week').classList.toggle('active', period === 'week');
  document.getElementById('period-month').classList.toggle('active', period === 'month');
  renderDashboard();
}

function computeStats(period) {
  const now = new Date();
  const start = period === 'week' ? startOfWeek(now) : startOfMonth(now);
  const end = period === 'week' ? endOfWeek(now) : endOfMonth(now);

  const nouveaux = contacts.filter(c => inRange(c.created_at, start, end)).length;
  let decouverte = 0, signatures = 0, ca = 0;
  const caComptes = new Set();

  statutHistorique.forEach(h => {
    if (!inRange(h.date_changement, start, end)) return;
    if (h.statut === 'Appel découverte programmé') decouverte++;
    if (h.statut === 'Adhérent') {
      signatures++;
      if (!caComptes.has(h.contact_id)) {
        const adh = getAdhesion(h.contact_id);
        if (adh) ca += Number(adh.montant) || 0;
        caComptes.add(h.contact_id);
      }
    }
  });

  return { nouveaux, decouverte, signatures, ca, start, end };
}

function renderDashboard() {
  const stats = computeStats(currentPeriod);

  document.getElementById('stat-nouveaux').textContent = stats.nouveaux;
  document.getElementById('stat-decouverte').textContent = stats.decouverte;
  document.getElementById('stat-signatures').textContent = stats.signatures;
  document.getElementById('stat-ca').textContent = stats.ca.toLocaleString('fr-FR', { minimumFractionDigits: 0 }) + ' €';

  const label = currentPeriod === 'week'
    ? `Semaine complète : ${formatDateFR(stats.start, true)} — ${formatDateFR(stats.end, true)}`
    : `Mois complet : ${stats.start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
  document.getElementById('dash-period-label').textContent = label;

  const recentEl = document.getElementById('recent-contacts-list');
  const recent = [...contacts].slice(0, 5);
  if (recent.length === 0) {
    recentEl.innerHTML = '<div class="empty-state">Aucun contact pour le moment</div>';
    return;
  }
  recentEl.innerHTML = recent.map(c => `
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
    case 'Perdu': return 'badge-perdu';
    default: return 'badge-entrant';
  }
}
function getAvatarColor(statut) {
  switch (statut) {
    case 'Appel découverte programmé': return '#9C7526';
    case 'Prospect': return '#6B4E71';
    case 'Adhérent': return '#4E7247';
    case 'Perdu': return '#A6433C';
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
// Liste des contacts
// ---------------------------------------------------------
function renderContactsTable() {
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const statutFilter = document.getElementById('filter-statut').value;

  const filtered = contacts.filter(c => {
    const matchSearch = !search ||
      (c.nom || '').toLowerCase().includes(search) ||
      (c.prenom || '').toLowerCase().includes(search) ||
      (c.email || '').toLowerCase().includes(search);
    const matchStatut = !statutFilter || c.statut_actuel === statutFilter;
    return matchSearch && matchStatut;
  });

  const tbody = document.getElementById('contacts-table-body');
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-state">Aucun contact ne correspond à cette recherche</td></tr>`;
  } else {
    tbody.innerHTML = filtered.map(c => {
      const adh = getAdhesion(c.id);
      return `
      <tr onclick="openContactDetail('${c.id}')">
        <td>${formatDateFR(c.created_at)}</td>
        <td>${escapeHtml(c.nom)}</td>
        <td>${escapeHtml(c.prenom)}</td>
        <td>${c.age || '—'}</td>
        <td class="cell-muted">${escapeHtml(c.email || '—')}</td>
        <td>${escapeHtml(c.telephone || '—')}</td>
        <td>${escapeHtml(c.adresse || '—')}</td>
        <td>${escapeHtml(c.code_postal || '—')}</td>
        <td>${escapeHtml(c.ville || '—')}</td>
        <td>${escapeHtml(c.type_contact || '—')}</td>
        <td class="cell-ellipsis cell-muted">${escapeHtml(c.commentaire || '—')}</td>
        <td><span class="badge ${badgeClass(c.statut_actuel)}">${c.statut_actuel}</span></td>
        <td>${adh ? escapeHtml(adh.type_formule || '—') : '<span class="cell-muted">—</span>'}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('contacts-count').textContent =
    `${filtered.length} contact${filtered.length > 1 ? 's' : ''} affiché${filtered.length > 1 ? 's' : ''} sur ${contacts.length}`;
}

// ---------------------------------------------------------
// Formulaire d'ajout d'un contact
// ---------------------------------------------------------
function openContactForm() {
  document.getElementById('form-title').textContent = 'Nouveau contact';
  document.getElementById('form-contact-id').value = '';
  document.getElementById('f-date').value = new Date().toISOString().slice(0, 10);
  ['f-nom', 'f-prenom', 'f-age', 'f-email', 'f-telephone', 'f-adresse', 'f-cp', 'f-ville', 'f-commentaire']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('f-connu-par').selectedIndex = 0;
  document.getElementById('f-type-contact').selectedIndex = 0;
  document.getElementById('modal-contact-form').classList.remove('hidden');
}
function closeContactForm() {
  document.getElementById('modal-contact-form').classList.add('hidden');
}

async function saveContactForm() {
  const nom = document.getElementById('f-nom').value.trim();
  const prenom = document.getElementById('f-prenom').value.trim();
  if (!nom || !prenom) {
    alert('Le nom et le prénom sont obligatoires.');
    return;
  }

  const dateVal = document.getElementById('f-date').value;
  const payload = {
    created_at: dateVal ? new Date(dateVal).toISOString() : new Date().toISOString(),
    nom, prenom,
    age: document.getElementById('f-age').value ? Number(document.getElementById('f-age').value) : null,
    email: document.getElementById('f-email').value.trim() || null,
    telephone: document.getElementById('f-telephone').value.trim() || null,
    adresse: document.getElementById('f-adresse').value.trim() || null,
    code_postal: document.getElementById('f-cp').value.trim() || null,
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
  document.getElementById('modal-contact-detail').classList.remove('hidden');
}

function closeContactDetail() {
  document.getElementById('modal-contact-detail').classList.add('hidden');
  currentDetailContact = null;
}

function field(label, value) {
  return `<div class="detail-field"><div class="label">${label}</div><div class="value">${escapeHtml(value || '—')}</div></div>`;
}

function renderDetailViewFields(c) {
  document.getElementById('detail-view-fields').innerHTML = [
    field('Date', formatDateFR(c.created_at, true)),
    field('Âge', c.age),
    field('Nom', c.nom),
    field('Prénom', c.prenom),
    field('Email', c.email),
    field('Téléphone', c.telephone),
    field('Adresse', c.adresse),
    field('Code postal', c.code_postal),
    field('Ville', c.ville),
    field('Connu par', c.connu_par),
    field('Type de contact', c.type_contact),
    field('Commentaire', c.commentaire),
  ].join('');
}

function renderDetailEditFields(c) {
  document.getElementById('detail-edit-fields').innerHTML = `
    <div class="form-grid grid-2">
      <div class="field"><label>Nom</label><input id="e-nom" value="${escapeHtml(c.nom)}"></div>
      <div class="field"><label>Prénom</label><input id="e-prenom" value="${escapeHtml(c.prenom)}"></div>
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
      <div class="field"><label>Code postal</label><input id="e-cp" value="${escapeHtml(c.code_postal || '')}"></div>
    </div>
    <div class="field" style="margin-bottom:12px;">
      <label>Commentaire</label>
      <textarea id="e-commentaire">${escapeHtml(c.commentaire || '')}</textarea>
    </div>
    <div class="form-actions" style="margin-bottom:8px;">
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
    code_postal: document.getElementById('e-cp').value.trim() || null,
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
  const note = document.getElementById('detail-status-note').value.trim() || null;

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

  if (newStatus !== c.statut_actuel || note) {
    const { error: histError } = await supabaseClient.from('statut_historique').insert({
      contact_id: c.id, statut: newStatus, note,
    });
    if (histError) { alert("Erreur à l'enregistrement du statut : " + histError.message); return; }
  }

  if (newStatus !== c.statut_actuel) {
    const { error: updError } = await supabaseClient.from('contacts').update({ statut_actuel: newStatus }).eq('id', c.id);
    if (updError) { alert("Erreur à la mise à jour du statut : " + updError.message); return; }
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
        ${h.note ? `<span style="margin-left:8px;color:var(--ink-soft);">${escapeHtml(h.note)}</span>` : ''}
      </div>
      <span class="timeline-date">${formatDateTimeFR(h.date_changement)}</span>
    </div>
  `).join('');
}

async function deleteCurrentContact() {
  const c = currentDetailContact;
  if (!confirm(`Supprimer définitivement ${c.prenom} ${c.nom} ainsi que tout son historique ?`)) return;
  const { error } = await supabaseClient.from('contacts').delete().eq('id', c.id);
  if (error) { alert("Erreur à la suppression : " + error.message); return; }
  closeContactDetail();
  await loadAllData();
}
