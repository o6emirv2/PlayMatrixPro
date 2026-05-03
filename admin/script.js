(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const view = $('view');
  const tabs = [...document.querySelectorAll('[data-tab]')];
  let activeTab = 'dashboard';
  let lastSummary = null;

  function escapeHtml(value = '') {
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }
  function formatMoney(value) {
    return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(value || 0))} MC`;
  }
  function formatDate(value) {
    if (!value) return '-';
    const num = Number(value);
    const date = Number.isFinite(num) ? new Date(num) : new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('tr-TR');
  }
  async function api(path, options = {}) {
    const base = await window.__PM_API__?.ensureApiBase?.() || window.__PM_API__?.getApiBaseSync?.() || '';
    const token = await window.__PM_RUNTIME?.getIdToken?.().catch(() => '');
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${base}${path}`, { ...options, headers, credentials: 'include', body: options.body == null ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body) });
    const payload = await response.json().catch(() => ({ ok: false, error: 'INVALID_JSON' }));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `HTTP_${response.status}`);
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    return payload;
  }
  async function loadSummary() {
    try {
      lastSummary = await api('/api/admin/summary');
      const m = lastSummary.metrics || {};
      $('metricUsers').textContent = String(m.users || 0);
      $('metricBalance').textContent = formatMoney(m.totalBalance || 0);
      $('metricBanned').textContent = String(m.banned || 0);
      $('metricLogs').textContent = String(m.runtimeLogs || 0);
      $('adminActor').textContent = lastSummary.actor?.email || lastSummary.actor?.uid || 'Admin oturumu aktif';
    } catch (error) {
      $('adminActor').textContent = `Admin bağlantı hatası: ${error.message}`;
    }
  }
  function setView(html) { view.innerHTML = html; }
  function notice(text, cls = 'notice') { return `<div class="${cls}">${escapeHtml(text)}</div>`; }

  async function dashboard() {
    await loadSummary();
    const m = lastSummary?.metrics || {};
    setView(`<h2>Genel Bakış</h2><div class="grid">
      <article class="card"><b>Firebase Admin</b><p>${lastSummary?.firebaseEnabled ? 'Aktif' : 'Yerel smoke test / dev fallback'}</p></article>
      <article class="card"><b>Kullanıcı</b><p>${m.users || 0} kayıt, ${m.banned || 0} banlı kullanıcı.</p></article>
      <article class="card"><b>Ekonomi</b><p>Toplam örneklenen bakiye: ${formatMoney(m.totalBalance || 0)}</p></article>
      <article class="card"><b>Runtime Store</b><pre>${escapeHtml(JSON.stringify(m.runtimeStores || {}, null, 2))}</pre></article>
    </div>${notice('Admin canlı logları Firebase’e yazılmaz; Render in-memory ve console üzerinden izlenir.')}`);
  }

  async function users() {
    setView(`<h2>Kullanıcı Yönetimi</h2><div class="toolbar"><input id="userSearch" placeholder="UID, e-posta veya kullanıcı adı ara"><button id="userSearchBtn" class="primary">Ara</button></div><div id="usersOut">Yükleniyor…</div>`);
    const render = async () => {
      const q = $('userSearch').value || '';
      const payload = await api(`/api/admin/users?search=${encodeURIComponent(q)}&limit=80`);
      const rows = payload.users || [];
      $('usersOut').innerHTML = rows.length ? `<table class="table"><thead><tr><th>Kullanıcı</th><th>Seviye</th><th>Bakiye</th><th>Durum</th><th>Son</th></tr></thead><tbody>${rows.map((u, i) => `<tr><td><div class="avatar-cell"><span class="admin-avatar-host" id="uav_${i}"></span><div><b>${escapeHtml(u.username)}</b><br><small>${escapeHtml(u.email || u.uid)}</small></div></div></td><td>${u.accountLevel}<br><small>${Number(u.accountLevelProgressPct || 0).toFixed(1)}%</small></td><td>${formatMoney(u.balance)}</td><td>${u.banned ? '<span class="pill red">Banlı</span>' : '<span class="pill">Aktif</span>'}</td><td>${formatDate(u.lastSeen)}</td></tr>`).join('')}</tbody></table>` : notice('Kullanıcı bulunamadı.');
      rows.forEach((u, i) => window.PMAvatar?.mount?.($(`uav_${i}`), { avatarUrl: u.avatar, exactFrameIndex: u.selectedFrame, level: u.accountLevel, sizePx: 44, alt: u.username }));
    };
    $('userSearchBtn').onclick = () => render().catch((e) => $('usersOut').innerHTML = notice(e.message, 'error'));
    await render().catch((e) => $('usersOut').innerHTML = notice(e.message, 'error'));
  }

  function economy() {
    setView(`<h2>Bakiye Yönetimi</h2><div class="form-card"><div class="row"><input id="balanceUid" placeholder="Kullanıcı UID"><input id="balanceAmount" type="number" placeholder="Miktar (+/-)"><input id="balanceReason" placeholder="İşlem nedeni"></div><button id="balanceSave" class="success">Atomic Bakiye Güncelle</button><div id="balanceOut"></div></div>`);
    $('balanceSave').onclick = async () => {
      $('balanceOut').innerHTML = 'İşleniyor…';
      try { const r = await api('/api/admin/users/balance', { method: 'POST', body: { uid: $('balanceUid').value, amount: Number($('balanceAmount').value), reason: $('balanceReason').value || 'admin' } }); $('balanceOut').innerHTML = notice(`Bakiye güncellendi: ${formatMoney(r.amount)}`, 'ok'); await loadSummary(); }
      catch (e) { $('balanceOut').innerHTML = notice(e.message, 'error'); }
    };
  }

  function ban() {
    setView(`<h2>Ban Yönetimi</h2><div class="form-card"><div class="row"><input id="banUid" placeholder="Kullanıcı UID"><input id="banReason" placeholder="Ban / kaldırma nedeni"><select id="banState"><option value="true">Banla</option><option value="false">Banı Kaldır</option></select></div><button id="banSave" class="danger">Durumu Kaydet</button><div id="banOut"></div></div>`);
    $('banSave').onclick = async () => { try { const r = await api('/api/admin/users/ban', { method: 'POST', body: { uid: $('banUid').value, reason: $('banReason').value, banned: $('banState').value === 'true' } }); $('banOut').innerHTML = notice(`Durum kaydedildi: ${r.banned ? 'banlı' : 'aktif'}`, 'ok'); await loadSummary(); } catch (e) { $('banOut').innerHTML = notice(e.message, 'error'); } };
  }

  async function payments() {
    setView('<h2>Ödeme Yönetimi</h2><div id="paymentsOut">Yükleniyor…</div>');
    const p = await api('/api/admin/payments');
    $('paymentsOut').innerHTML = (p.payments || []).length ? `<pre>${escapeHtml(JSON.stringify(p.payments, null, 2))}</pre>` : notice('Ödeme kaydı bulunamadı. Firestore payments koleksiyonu boş veya erişilemedi.');
  }

  async function promo() {
    setView(`<h2>Promo Yönetimi</h2><div class="form-card"><div class="row"><input id="promoCode" placeholder="Kod"><input id="promoAmount" type="number" placeholder="MC Miktarı"><input id="promoClaims" type="number" placeholder="Maks. kullanım"></div><button id="promoSave" class="success">Promo Kaydet</button><div id="promoOut"></div></div><hr><div id="promoList">Yükleniyor…</div>`);
    const load = async () => { const p = await api('/api/admin/promos'); $('promoList').innerHTML = (p.promos || []).length ? `<pre>${escapeHtml(JSON.stringify(p.promos, null, 2))}</pre>` : notice('Aktif promo listesi boş.'); };
    $('promoSave').onclick = async () => { try { await api('/api/admin/promos', { method: 'POST', body: { code: $('promoCode').value, amount: Number($('promoAmount').value), maxClaims: Number($('promoClaims').value || 1) } }); $('promoOut').innerHTML = notice('Promo kaydedildi.', 'ok'); await load(); } catch (e) { $('promoOut').innerHTML = notice(e.message, 'error'); } };
    await load();
  }

  async function logs() {
    setView('<h2>Canlı Log Yönetimi</h2><div class="toolbar"><button id="loadLogs" class="primary">Canlı Logları Getir</button></div><pre id="logsOut">Render in-memory logları burada gösterilir.</pre>');
    $('loadLogs').onclick = async () => { try { const p = await api('/api/admin/runtime-logs'); $('logsOut').textContent = JSON.stringify(p.logs || [], null, 2); } catch (e) { $('logsOut').textContent = e.message; } };
    $('loadLogs').click();
  }

  function email() {
    setView(`<h2>E-posta Güncelle</h2><div class="form-card"><p>Firebase Auth ve Firestore email alanı birlikte güncellenir; desync bırakılmaz.</p><div class="row"><input id="emailUid" placeholder="Kullanıcı UID"><input id="emailNew" placeholder="Yeni e-posta"></div><button id="emailSave" class="success">E-postayı Senkron Güncelle</button><div id="emailOut"></div></div>`);
    $('emailSave').onclick = async () => { try { const r = await api('/api/admin/users/email', { method: 'POST', body: { uid: $('emailUid').value, email: $('emailNew').value } }); $('emailOut').innerHTML = notice(`Senkron güncellendi. Auth: ${r.authUpdated ? 'evet' : 'devre dışı'}, Firestore: ${r.firestoreUpdated ? 'evet' : 'devre dışı'}`, 'ok'); } catch (e) { $('emailOut').innerHTML = notice(e.message, 'error'); } };
  }

  function notifications() {
    setView(`<h2>Bildirim Yönetimi</h2><div class="form-card"><div class="row"><input id="ntTitle" placeholder="Başlık"><input id="ntAudience" placeholder="Hedef kitle" value="all"></div><textarea id="ntMessage" placeholder="Mesaj"></textarea><button id="ntSend" class="primary">Runtime Bildirim Gönder</button><div id="ntOut"></div></div>`);
    $('ntSend').onclick = async () => { try { const r = await api('/api/admin/notifications/send', { method: 'POST', body: { title: $('ntTitle').value, message: $('ntMessage').value, audience: $('ntAudience').value } }); $('ntOut').innerHTML = notice(`Bildirim işlendi: ${r.notification.id}`, 'ok'); } catch (e) { $('ntOut').innerHTML = notice(e.message, 'error'); } };
  }

  async function games() {
    setView('<h2>Oyun İzleme</h2><div id="gamesOut">Yükleniyor…</div>');
    const p = await api('/api/admin/games');
    $('gamesOut').innerHTML = `<div class="grid">${(p.games || []).map(g => `<article class="card"><b>${escapeHtml(g.title)}</b><p>${escapeHtml(g.backend)}</p><span class="pill">${escapeHtml(g.status)}</span><p>${escapeHtml(g.data)}</p></article>`).join('')}</div>`;
  }

  function cleanup() {
    setView(`<h2>Firestore Temizlik</h2><div class="form-card"><p>İlk çalıştırma her zaman dry-run olmalıdır. Kritik finansal/audit/veri alanları korunur.</p><button id="dryRun" class="primary">Dry Run Raporu Al</button><button id="realRun" class="danger">Kontrollü Temizlik Çalıştır</button><pre id="cleanupOut"></pre></div>`);
    $('dryRun').onclick = async () => { const r = await api('/api/admin/cleanup/firestore', { method: 'POST', body: { dryRun: true } }); $('cleanupOut').textContent = JSON.stringify(r, null, 2); };
    $('realRun').onclick = async () => { if (!confirm('Dry-run raporunu inceledin mi? Gerçek temizlik çalıştırılsın mı?')) return; const r = await api('/api/admin/cleanup/firestore', { method: 'POST', body: { dryRun: false } }); $('cleanupOut').textContent = JSON.stringify(r, null, 2); };
  }

  async function show(tab) {
    activeTab = tab;
    tabs.forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
    try {
      if (tab === 'dashboard') return dashboard();
      if (tab === 'users') return users();
      if (tab === 'economy') return economy();
      if (tab === 'ban') return ban();
      if (tab === 'payments') return payments();
      if (tab === 'promo') return promo();
      if (tab === 'logs') return logs();
      if (tab === 'email') return email();
      if (tab === 'notifications') return notifications();
      if (tab === 'games') return games();
      if (tab === 'cleanup') return cleanup();
    } catch (error) {
      setView(`<h2>Bağlantı Hatası</h2>${notice(error.message || 'Admin isteği başarısız.', 'error')}`);
    }
  }

  tabs.forEach((button) => button.addEventListener('click', () => show(button.dataset.tab)));
  $('refreshBtn').addEventListener('click', () => show(activeTab));
  show('dashboard');
})();
