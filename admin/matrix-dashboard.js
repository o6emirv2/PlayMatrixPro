import { preventUserInterference, initMatrixRain, adminFetch, setSecurityKey, clearSecurityKey, money, formatWhen, resolveAdminUrl } from './matrix-core.js';

preventUserInterference();
initMatrixRain(document.getElementById('matrixCanvas'), { fontSize: 14 });

const INDEX_URL = resolveAdminUrl('./index.html');
const BRAND_LOGO_URL = '/public/assets/images/logo.png';
const root = document.getElementById('adminRoot');
const loader = document.getElementById('adminLoader');

function redirectOut() {
  clearSecurityKey();
  window.location.replace(INDEX_URL);
}

function panelTemplate() {
  return `
    <div class="admin-app">
      <section class="topbar">
        <div class="brand">
          <img src="${BRAND_LOGO_URL}" alt="PlayMatrix" />
          <div>
            <h1>PLAYMATRIX ADMIN KONTROL MERKEZİ</h1>
            <p>Gerçek zamanlı operasyon, ekonomi, güvenlik ve bakım yönetimi aktif.</p>
          </div>
        </div>
        <div class="top-actions">
          <button id="dashboardRefreshBtn" class="ghost" type="button">VERİLERİ YENİLE</button>
          <button id="dashboardLogoutBtn" class="danger" type="button">GÜVENLİ ÇIKIŞ</button>
        </div>
      </section>

      <section class="panel stack">
        <div>
          <h2>DASHBOARD İSTATİSTİKLERİ</h2>
          <p class="lead">Toplam kullanıcı, gün içi MC hareketi, kâr-zarar, açık oda ve moderasyon durumları canlı olarak izlenir.</p>
        </div>
        <div class="summary-strip" id="metricGrid"></div>
      </section>

      <div class="layout-hero">
        <section class="panel stack">
          <div>
            <h2>TOPLU DURUM SIFIRLAMA</h2>
            <p class="lead">Bakiye, seviye, aylık aktiflik, XP, aktiflik puanı ve seçili çerçeve alanlarını kontrollü biçimde sıfırlayın.</p>
          </div>
          <div class="check-grid" id="resetFieldGrid"></div>
          <div class="confirm-box">
            <strong>Yazılı Onay</strong>
            <input id="resetConfirmText" type="text" placeholder="ONAYLIYORUM" />
          </div>
          <div class="action-row"><button id="runResetBtn" class="danger" type="button">SIFIRLAMA İŞLEMİNİ BAŞLAT</button></div>
          <div class="status" id="resetStatus"></div>
        </section>

        <section class="panel stack">
          <div>
            <h2>BAKIM MODU (OYUNLAR)</h2>
            <p class="lead">Bakım modu açık olan oyunlar anasayfadan girişte otomatik olarak bakım sayfasına yönlenir.</p>
          </div>
          <div class="maintenance-grid" id="maintenanceGrid"></div>
          <div class="action-row"><button id="saveMaintenanceBtn" type="button">BAKIM AYARLARINI KAYDET</button></div>
          <div class="status" id="maintenanceStatus"></div>
        </section>
      </div>

      <section class="panel stack crash-control-panel">
        <div>
          <h2>CRASH ÇARPAN / RİSK KONTROLÜ</h2>
          <p class="lead">Crash risk aralıklarını, aktif geri sayım roundunu ve sonraki round çarpan override akışını backend doğrulamasıyla yönetin.</p>
        </div>
        <div class="crash-control-summary" id="crashRiskSummary">Backend verisi bekleniyor.</div>
        <div class="field-grid">
          <div class="field"><label for="nextCrashPointInput">Aktif / Sonraki Round Crash Çarpanı</label><input id="nextCrashPointInput" type="number" min="1.01" max="10000" step="0.01" placeholder="Örn: 2.50" /></div>
          <div class="field"><label for="crashRiskConfirm">Yazılı Onay</label><input id="crashRiskConfirm" type="text" placeholder="ONAYLIYORUM" /></div>
        </div>
        <div class="action-row">
          <button id="setNextCrashPointBtn" type="button">ÇARPANI UYGULA</button>
          <button id="clearNextCrashPointBtn" class="ghost" type="button">ÇARPAN OVERRIDE TEMİZLE</button>
        </div>
        <div class="table-wrap crash-risk-table-wrap"><table class="crash-risk-table"><thead><tr><th>Min</th><th>Max</th><th>Ağırlık</th></tr></thead><tbody id="crashRiskRows"></tbody></table></div>
        <div class="action-row">
          <button id="saveCrashRiskBtn" type="button">RİSK TABLOSUNU KAYDET</button>
          <button id="resetCrashRiskBtn" class="warn" type="button">VARSAYILAN RİSK TABLOSUNA DÖN</button>
        </div>
        <div class="status" id="crashRiskStatus"></div>
      </section>

      <div class="layout-grid-3">
        <section class="panel stack">
          <div>
            <h2>SEÇİLİ KULLANICI KISITLAMA</h2>
            <p class="lead">Kullanıcı adı, e-posta veya UID ile kısıtlama uygulanır.</p>
          </div>
          <div class="field-grid">
            <div class="field"><label for="restrictIdentifier">Kullanıcı adı / e-posta / UID</label><input id="restrictIdentifier" type="text" placeholder="Kullanıcı adı, e-posta veya UID" /></div>
            <div class="field"><label for="restrictDuration">Süre (dakika)</label><input id="restrictDuration" type="number" min="0" step="1" placeholder="Örn: 60 dakika" /></div>
            <div class="field pm-admin-grid-span-all"><label for="restrictReason">Kısıtlama Açıklaması</label><textarea id="restrictReason" placeholder="Kısıtlama gerekçesini yaz"></textarea></div>
          </div>
          <div class="check-grid">
            <label class="check"><input type="radio" name="restrictMode" data-restrict="games_mute" /> <span>Tüm Oyunları Kısıtla</span></label>
            <label class="check"><input type="radio" name="restrictMode" data-restrict="global_chat_mute" /> <span>Global Sohbeti Kısıtla</span></label>
            <label class="check"><input type="radio" name="restrictMode" data-restrict="dm_mute" /> <span>DM Sohbeti Kısıtla</span></label>
            <label class="check"><input type="radio" name="restrictMode" data-restrict="ban" /> <span>Süresiz engel</span></label>
          </div>
          <div class="confirm-box"><strong>Yazılı Onay</strong><input id="restrictConfirm" type="text" placeholder="ONAYLIYORUM" /></div>
          <div class="action-row"><button id="runRestrictBtn" type="button">KISITLAMAYI UYGULA</button></div>
          <div class="status" id="restrictStatus"></div>
        </section>

        <section class="panel stack">
          <div>
            <h2>SEÇİLİ KULLANICI ÖDÜL (MC)</h2>
            <p class="lead">Seçili kullanıcıya MC ve ödül açıklaması gönderilir.</p>
          </div>
          <div class="field-grid">
            <div class="field"><label for="rewardIdentifier">Kullanıcı adı / e-posta / UID</label><input id="rewardIdentifier" type="text" placeholder="Kullanıcı adı, e-posta veya UID" /></div>
            <div class="field"><label for="rewardAmount">MC Miktarı</label><input id="rewardAmount" type="number" min="1" step="1" placeholder="50000" /></div>
            <div class="field pm-admin-grid-span-all"><label for="rewardReason">Ödül Açıklaması</label><textarea id="rewardReason" placeholder="Ödül gerekçesini yaz"></textarea></div>
          </div>
          <div class="confirm-box"><strong>Yazılı Onay</strong><input id="rewardConfirm" type="text" placeholder="ONAYLIYORUM" /></div>
          <div class="action-row"><button id="grantUserRewardBtn" type="button">KULLANICIYA MC EKLE</button></div>
          <div class="status" id="rewardStatus"></div>
        </section>

        <section class="panel stack">
          <div>
            <h2>TÜM KULLANICILARA MC</h2>
            <p class="lead">Toplu MC dağıtımı ve açıklama tüm kullanıcılara aynı anda uygulanır.</p>
          </div>
          <div class="field-grid">
            <div class="field"><label for="rewardAllAmount">MC Miktarı</label><input id="rewardAllAmount" type="number" min="1" step="1" placeholder="1000" /></div>
            <div class="field"><label for="rewardAllReason">Ödül Açıklaması</label><input id="rewardAllReason" type="text" placeholder="Toplu dağıtım açıklaması" /></div>
          </div>
          <div class="confirm-box"><strong>Yazılı Onay</strong><input id="rewardAllConfirm" type="text" placeholder="ONAYLIYORUM" /></div>
          <div class="action-row"><button id="grantAllRewardBtn" class="warn" type="button">TÜM KULLANICILARA MC EKLE</button></div>
          <div class="status" id="rewardAllStatus"></div>
        </section>
      </div>

      <div class="layout-grid-2">
        <section class="panel stack">
          <div>
            <h2>PROMOSYON KODU OLUŞTURMA</h2>
            <p class="lead">Kod süresi, kişi sayısı, promo kodu ve hesap başı tek kullanım kuralı tanımlanır.</p>
          </div>
          <div class="field-grid">
            <div class="field"><label for="promoDuration">Kod Süresi (saat)</label><input id="promoDuration" type="number" min="1" step="1" placeholder="24" /></div>
            <div class="field"><label for="promoLimit">Kod Kişi Sayısı</label><input id="promoLimit" type="number" min="1" step="1" placeholder="100" /></div>
            <div class="field"><label for="promoCode">Promosyon Kodu</label><input id="promoCode" type="text" placeholder="PLAYMATRIX50" /></div>
            <div class="field"><label for="promoPerAccount">Her Hesap 1 Kere</label><select id="promoPerAccount"><option value="true">Evet</option><option value="false">Hayır</option></select></div>
            <div class="field"><label for="promoAmount">MC</label><input id="promoAmount" type="number" min="1" step="1" placeholder="50000" /></div>
            <div class="field"><label for="promoDescription">Açıklama</label><input id="promoDescription" type="text" placeholder="Kampanya açıklaması" /></div>
          </div>
          <div class="action-row"><button id="createPromoBtn" type="button">PROMOSYON KODU OLUŞTUR</button></div>
          <div class="status" id="promoStatus"></div>
          <div class="table-wrap"><table><thead><tr><th>Kod</th><th>MC</th><th>Kalan</th><th>Bitiş</th></tr></thead><tbody id="promoRows"></tbody></table></div>
        </section>

        <section class="panel stack">
          <div>
            <h2>HATA TAKİP MERKEZİ</h2>
            <p class="lead">Ana sayfa, oyunlar ve sosyal merkezdeki bilinen hatalar neden ve çözüm başlıklarıyla listelenir.</p>
          </div>
          <div class="issue-columns">
            <div class="issue-panel"><h3>OYUN = HATA = NEDEN = ÇÖZÜM</h3><div class="issue-list" id="gameIssueList"></div></div>
            <div class="issue-panel"><h3>HATALI ALAN = HATA = NEDEN = ÇÖZÜM</h3><div class="issue-list" id="systemIssueList"></div></div>
          </div>
          <div class="runtime-card-list" id="recentErrorCards"></div><div class="table-wrap runtime-table"><table><thead><tr><th>Zaman</th><th>Kapsam</th><th>Hata</th></tr></thead><tbody id="recentErrorRows"></tbody></table></div>
        </section>
      </div>
    </div>
  `;
}

function setStatus(id, text, kind = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '';
  el.className = `status${kind ? ` ${kind}` : ''}`;
}

function textNode(value = '') {
  return document.createTextNode(String(value ?? ''));
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

function replaceWithChildren(target, children = []) {
  if (!target) return;
  const fragment = document.createDocumentFragment();
  children.forEach((child) => fragment.appendChild(child));
  target.replaceChildren(fragment);
}

function buildMetricCard(label, value, tone = '') {
  const card = el('article', `summary-pill ${tone}`.trim());
  card.append(el('span', 'label', label), el('div', 'value', value));
  return card;
}

function buildResetOption(value, label) {
  const wrapper = el('label', 'check');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = value;
  wrapper.append(input, textNode(' '), el('span', '', label));
  return wrapper;
}

function buildMaintenanceButton(key, label, enabled) {
  const button = el('button', `maintenance-toggle ${enabled ? 'is-on' : ''}`.trim());
  button.type = 'button';
  button.dataset.maintenance = key;
  const body = document.createElement('div');
  body.append(el('strong', '', label), el('span', '', enabled ? 'Bakımda' : 'Korumada'));
  button.append(body, el('span', 'switch'));
  return button;
}

function buildCell(text, attrs = {}) {
  const cell = document.createElement('td');
  Object.entries(attrs).forEach(([key, value]) => cell.setAttribute(key, String(value)));
  cell.textContent = String(text ?? '');
  return cell;
}

function buildRow(cells = []) {
  const row = document.createElement('tr');
  cells.forEach((cell) => row.appendChild(cell));
  return row;
}

function renderTableRows(target, rows, emptyText, colspan) {
  if (!Array.isArray(rows) || !rows.length) {
    replaceWithChildren(target, [buildRow([buildCell(emptyText, { colspan })])]);
    return;
  }
  replaceWithChildren(target, rows);
}

function inferIssueSolution(item = {}) {
  const scope = String(item.scope || item.event || item.category || '').toLowerCase();
  const message = String(item.message || item.error?.message || item.error || item.reason || '').toLowerCase();
  const source = String(item.source || item.path || item.endpoint || '').toLowerCase();
  if (scope.includes('player_stats') || message.includes('oturum bulunamadı')) return 'Oturum hazır olmadan çalışan AnaSayfa özel veri isteği auth-gate durumuna alınmalı.';
  if (scope.includes('auth') || message.includes('http_405')) return 'Auth bootstrap method, cache ve API base eşleşmesi kontrol edilmeli.';
  if (message.includes('network-request-failed') || message.includes('failed to fetch')) return 'Firebase/API ağ erişimi, mobil bağlantı ve production origin ayarları kontrol edilmeli.';
  if (source.includes('crash') || scope.includes('crash')) return 'Crash backend state, admin risk kontrolü ve client API cevabı birlikte doğrulanmalı.';
  if (source.includes('chess') || source.includes('satranc') || scope.includes('chess')) return 'Satranç socket ACK, stateVersion ve backend hamle doğrulaması birlikte kontrol edilmeli.';
  if (source.includes('legacy-home') || source.includes('script.js') || scope.includes('home')) return 'AnaSayfa legacy runtime ve ilgili widget auth/session sırası kontrol edilmeli.';
  return 'İlgili kaynak dosya ve backend route gerçek hata detayıyla kontrol edilmeli.';
}

function buildIssueCard(item = {}) {
  const card = el('div', 'issue');
  const area = item.area || item.game || item.scope || 'Alan';
  const errorText = item.error || item.title || item.message || 'Hata';
  const reasonText = item.reason || item.body || item.path || (item.status ? `HTTP ${item.status}` : '—');
  const solutionText = item.solution || inferIssueSolution(item);
  const reason = document.createElement('div');
  reason.className = 'issue-reason';
  reason.textContent = `Neden: ${reasonText}`;
  const solution = document.createElement('div');
  solution.className = 'issue-solution';
  solution.textContent = `Çözüm: ${solutionText}`;
  const detail = item.path || item.source || item.endpoint || '';
  if (detail) card.append(el('span', 'meta', area), el('strong', '', errorText), el('small', 'meta', detail), reason, solution);
  else card.append(el('span', 'meta', area), el('strong', '', errorText), reason, solution);
  return card;
}

function renderIssueList(target, items = []) {
  const cards = Array.isArray(items) ? items.map(buildIssueCard) : [];
  replaceWithChildren(target, cards.length ? cards : [el('div', 'issue', 'Kayıt yok.')]);
}


function formatMultiplier(value = 0) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(2)}x` : 'Yok';
}

function parseDecimalInput(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function normalizeRiskRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    min: parseDecimalInput(row?.min || 0),
    max: parseDecimalInput(row?.max || 0),
    weight: parseDecimalInput(row?.weight || 0)
  })).filter((row) => Number.isFinite(row.min) && Number.isFinite(row.max) && Number.isFinite(row.weight));
}

function buildRiskRow(row = {}, index = 0) {
  const tr = document.createElement('tr');
  tr.dataset.riskIndex = String(index);
  ['min', 'max', 'weight'].forEach((key) => {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.step = key === 'weight' ? '0.1' : '0.01';
    input.min = key === 'min' ? '1.01' : key === 'max' ? '1.01' : '0.1';
    if (key === 'max') input.max = '10000';
    input.value = String(row[key] ?? '');
    input.dataset.riskField = key;
    input.setAttribute('aria-label', `Crash risk ${key}`);
    td.appendChild(input);
    tr.appendChild(td);
  });
  return tr;
}

function renderCrashRiskPanel(payload = {}) {
  const rows = normalizeRiskRows(payload.riskTable || payload.risk || []);
  const riskRowsEl = document.getElementById('crashRiskRows');
  renderTableRows(riskRowsEl, rows.map(buildRiskRow), 'Risk tablosu bulunamadı.', 3);
  const summary = document.getElementById('crashRiskSummary');
  if (summary) {
    const appliesTo = payload.overrideAppliesTo === 'current_countdown_round'
      ? 'Aktif geri sayım roundu değiştirilebilir'
      : 'Yeni round üretiminde geçerli';
    const activePoint = payload.currentRoundCrashPoint ? ` · Aktif crash: ${formatMultiplier(payload.currentRoundCrashPoint)}` : '';
    const locked = payload.activeRoundLocked ? ' · Aktif round kilitli' : '';
    summary.textContent = `Durum: ${payload.phase || '—'} · Round: ${payload.roundId || '—'} · Anlık: ${formatMultiplier(payload.multiplier)}${activePoint} · Bekleyen override: ${formatMultiplier(payload.nextCrashPointOverride)} · ${appliesTo}${locked}`;
  }
  const nextInput = document.getElementById('nextCrashPointInput');
  if (nextInput && Number(payload.nextCrashPointOverride || 0) > 0) nextInput.value = Number(payload.nextCrashPointOverride).toFixed(2);
}

async function loadCrashRiskPanel() {
  try {
    const payload = await adminFetch('/api/crash/admin/risk-table');
    renderCrashRiskPanel(payload || {});
    setStatus('crashRiskStatus', 'Crash risk kontrol verisi yüklendi.', 'ok');
    return payload;
  } catch (error) {
    setStatus('crashRiskStatus', error.message || 'Crash risk kontrol verisi alınamadı.', 'error');
    return null;
  }
}

function collectCrashRiskRows() {
  return Array.from(document.querySelectorAll('#crashRiskRows tr')).map((row) => {
    const out = {};
    row.querySelectorAll('input[data-risk-field]').forEach((input) => { out[input.dataset.riskField] = parseDecimalInput(input.value || 0); });
    return out;
  }).filter((row) => Number.isFinite(row.min) && Number.isFinite(row.max) && Number.isFinite(row.weight));
}

function requireCrashRiskConfirm() {
  const confirmText = document.getElementById('crashRiskConfirm')?.value.trim().toUpperCase();
  if (confirmText !== 'ONAYLIYORUM') throw new Error('Crash kontrol işlemi için yazılı onay gerekli.');
}

function renderRecentErrorCards(target, items = []) {
  const rows = Array.isArray(items) ? items : [];
  if (!target) return;
  if (!rows.length) {
    replaceWithChildren(target, [el('div', 'runtime-card', 'Kritik hata kaydı yok.')]);
    return;
  }
  replaceWithChildren(target, rows.map((item) => {
    const card = el('article', 'runtime-card');
    card.append(
      el('span', 'runtime-card-time', formatWhen(item.createdAt || item.timestamp)),
      el('strong', '', item.scope || item.event || 'system'),
      el('p', '', item.message || item.error?.message || item.reason || '—')
    );
    return card;
  }));
}

async function autoBootstrapAdminSession() {
  const bridge = window.PM_ADMIN_AUTH;
  if (!bridge?.waitForReady || !bridge?.getFreshToken) return false;
  try {
    await bridge.waitForReady();
    const token = await bridge.getFreshToken(false).catch(() => '');
    if (!token) return false;
    await adminFetch('/api/auth/admin/bootstrap', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function ensureAccess() {
  try {
    const out = await adminFetch('/api/auth/admin/matrix/status');
    if (out?.clientKey) setSecurityKey(out.clientKey);
    return { ok: !!out?.authenticated, admin: out?.admin || null, error: '' };
  } catch (error) {
    const recovered = await autoBootstrapAdminSession();
    if (recovered) {
      try {
        const out = await adminFetch('/api/auth/admin/matrix/status');
        if (out?.clientKey) setSecurityKey(out.clientKey);
        return { ok: !!out?.authenticated, admin: out?.admin || null, error: '' };
      } catch (retryError) {
        return { ok: false, admin: null, error: retryError?.message || 'Yönetici oturumu doğrulanamadı.' };
      }
    }
    return { ok: false, admin: null, error: error?.message || 'Yönetici oturumu doğrulanamadı.' };
  }
}

async function loadDashboard() {
  const [dashboard, promos, issues] = await Promise.all([
    adminFetch('/api/admin/matrix/dashboard'),
    adminFetch('/api/admin/matrix/promos').catch(() => ({ items: [] })),
    adminFetch('/api/admin/matrix/issues').catch(() => ({ games: [], systems: [], recentErrors: [] }))
  ]);
  const metrics = dashboard.metrics || {};
  replaceWithChildren(document.getElementById('metricGrid'), [
    buildMetricCard('Toplam Kullanıcı Sayısı', money(metrics.userCount)),
    buildMetricCard('Gün İçi Toplam MC Harcama', money(metrics.dailyMcSpend)),
    buildMetricCard('Toplam Zarar', money(metrics.totalLoss), 'negative'),
    buildMetricCard('Toplam Kâr', money(metrics.totalProfit), 'positive'),
    buildMetricCard('Açık Oda Sayısı', money(metrics.openRoomCount)),
    buildMetricCard('Silinen Hesap Sayısı', money(metrics.deletedCount)),
    buildMetricCard('Muted Kullanıcı Sayısı', money(metrics.mutedCount))
  ]);

  const resetLabels = [
    ['balance', 'Bakiye'], ['accountLevel', 'Seviye'], ['monthlyActiveScore', 'Aylık Aktiflik'],
    ['accountXp', 'XP'], ['activityScore', 'Aktiflik Puanı'], ['selectedFrame', 'Seçili Çerçeve']
  ];
  replaceWithChildren(document.getElementById('resetFieldGrid'), resetLabels.map(([value, label]) => buildResetOption(value, label)));

  const maintenance = dashboard.maintenance || {};
  replaceWithChildren(document.getElementById('maintenanceGrid'), [
    ['classic', 'KLASİK OYUNLAR']
  ].map(([key, label]) => buildMaintenanceButton(key, label, !!maintenance[key])));

  renderTableRows(document.getElementById('promoRows'), (promos.items || []).map((item) => buildRow([
    buildCell(item.code || item.id || '—'),
    buildCell(money(item.amount)),
    buildCell(money(item.limitLeft)),
    buildCell(formatWhen(item.expiresAt))
  ])), 'Promo kod bulunmuyor.', 4);
  const recentErrors = issues.recentErrors || [];
  const derivedSystemIssues = Array.isArray(issues.systems) && issues.systems.length
    ? issues.systems
    : recentErrors.slice(0, 6).map((item) => ({
        area: item.area || item.source || 'Runtime',
        error: item.message || item.error?.message || item.reason || 'Runtime hata kaydı',
        reason: item.scope || item.event || item.category || 'runtime',
        solution: inferIssueSolution(item),
        source: item.source || item.path || item.endpoint || ''
      }));
  renderIssueList(document.getElementById('gameIssueList'), issues.games || []);
  renderIssueList(document.getElementById('systemIssueList'), derivedSystemIssues);
  renderRecentErrorCards(document.getElementById('recentErrorCards'), recentErrors);
  renderTableRows(document.getElementById('recentErrorRows'), recentErrors.map((item) => buildRow([
    buildCell(formatWhen(item.createdAt || item.timestamp)),
    buildCell(item.scope || item.event || 'system'),
    buildCell(item.message || item.error?.message || item.reason || '—')
  ])), 'Kritik hata kaydı yok.', 3);
  await loadCrashRiskPanel();
}

function getCheckedResetFields() {
  return Array.from(document.querySelectorAll('#resetFieldGrid input:checked')).map((el) => el.value);
}

function currentMaintenanceState() {
  const out = { classic: false };
  document.querySelectorAll('[data-maintenance]').forEach((el) => { out[el.dataset.maintenance] = el.classList.contains('is-on'); });
  return out;
}

function selectedRestrictionAction() {
  return document.querySelector('input[name="restrictMode"]:checked')?.dataset.restrict || '';
}

async function handleAction(action) {
  try {
    if (action === 'logout') {
      await adminFetch('/api/auth/admin/matrix/logout', { method: 'POST' }).catch(() => null);
      return redirectOut();
    }
    if (action === 'refresh') {
      await loadDashboard();
      return;
    }
    if (action === 'reset') {
      const confirmText = document.getElementById('resetConfirmText')?.value.trim().toUpperCase();
      const fields = getCheckedResetFields();
      if (confirmText !== 'ONAYLIYORUM') throw new Error('Yazılı onay gerekli.');
      if (!fields.length) throw new Error('Sıfırlanacak alan seçin.');
      await adminFetch('/api/admin/matrix/reset-nuclear', { method: 'POST', body: JSON.stringify({ fields, confirmText }) });
      setStatus('resetStatus', 'Toplu sıfırlama tamamlandı.', 'ok');
      return loadDashboard();
    }
    if (action === 'save-maintenance') {
      await adminFetch('/api/admin/matrix/maintenance', { method: 'PATCH', body: JSON.stringify(currentMaintenanceState()) });
      setStatus('maintenanceStatus', 'Bakım modu ayarları kaydedildi.', 'ok');
      return;
    }
    if (action.startsWith('restrict:')) {
      const mode = action.split(':')[1];
      const identifier = document.getElementById('restrictIdentifier')?.value.trim();
      const durationMinutes = Number(document.getElementById('restrictDuration')?.value || 0);
      const reason = document.getElementById('restrictReason')?.value.trim();
      const confirmText = document.getElementById('restrictConfirm')?.value.trim().toUpperCase();
      if (!identifier) throw new Error('Hedef kullanıcı gerekli.');
      if (confirmText !== 'ONAYLIYORUM') throw new Error('Yazılı onay gerekli.');
      await adminFetch('/api/admin/matrix/restrict-user', { method: 'POST', body: JSON.stringify({ identifier, action: mode, durationMinutes, reason, confirmText }) });
      setStatus('restrictStatus', 'Kısıtlama uygulandı.', 'ok');
      return;
    }
    if (action === 'reward-user') {
      const identifier = document.getElementById('rewardIdentifier')?.value.trim();
      const amount = Number(document.getElementById('rewardAmount')?.value || 0);
      const reason = document.getElementById('rewardReason')?.value.trim();
      const confirmText = document.getElementById('rewardConfirm')?.value.trim().toUpperCase();
      if (!identifier) throw new Error('Hedef kullanıcı gerekli.');
      if (amount <= 0) throw new Error('Geçerli MC miktarı gerekli.');
      if (!reason) throw new Error('Ödül açıklaması gerekli.');
      if (confirmText !== 'ONAYLIYORUM') throw new Error('Yazılı onay gerekli.');
      await adminFetch('/api/admin/matrix/reward-user', { method: 'POST', body: JSON.stringify({ identifier, amount, reason, confirmText }) });
      setStatus('rewardStatus', 'Kullanıcıya ödül gönderildi.', 'ok');
      return loadDashboard();
    }
    if (action === 'reward-all') {
      const amount = Number(document.getElementById('rewardAllAmount')?.value || 0);
      const reason = document.getElementById('rewardAllReason')?.value.trim();
      const confirmText = document.getElementById('rewardAllConfirm')?.value.trim().toUpperCase();
      if (amount <= 0) throw new Error('Geçerli MC miktarı gerekli.');
      if (!reason) throw new Error('Ödül açıklaması gerekli.');
      if (confirmText !== 'ONAYLIYORUM') throw new Error('Yazılı onay gerekli.');
      await adminFetch('/api/admin/matrix/reward-all', { method: 'POST', body: JSON.stringify({ amount, reason, confirmText }) });
      setStatus('rewardAllStatus', 'Tüm kullanıcılara ödül gönderildi.', 'ok');
      return loadDashboard();
    }
    if (action === 'promo-create') {
      const code = document.getElementById('promoCode')?.value.trim();
      const amount = Number(document.getElementById('promoAmount')?.value || 0);
      const durationHours = Number(document.getElementById('promoDuration')?.value || 0);
      const usageLimit = Number(document.getElementById('promoLimit')?.value || 0);
      const onePerAccount = String(document.getElementById('promoPerAccount')?.value || 'true') === 'true';
      const description = document.getElementById('promoDescription')?.value.trim();
      if (!code) throw new Error('Promo kodu gerekli.');
      if (amount <= 0) throw new Error('Geçerli MC miktarı gerekli.');
      if (durationHours <= 0) throw new Error('Kod süresi gerekli.');
      if (usageLimit <= 0) throw new Error('Kod kişi sayısı gerekli.');
      await adminFetch('/api/admin/matrix/promo-codes', { method: 'POST', body: JSON.stringify({ code, amount, durationHours, usageLimit, onePerAccount, description }) });
      setStatus('promoStatus', 'Promosyon kodu oluşturuldu.', 'ok');
      return loadDashboard();
    }
    if (action === 'crash-risk-save') {
      requireCrashRiskConfirm();
      const rows = collectCrashRiskRows();
      if (!rows.length) throw new Error('Risk tablosu boş olamaz.');
      const payload = await adminFetch('/api/crash/admin/risk-table', { method: 'POST', body: JSON.stringify({ rows }) });
      renderCrashRiskPanel(payload || {});
      setStatus('crashRiskStatus', 'Crash risk tablosu kaydedildi.', 'ok');
      return;
    }
    if (action === 'crash-risk-reset') {
      requireCrashRiskConfirm();
      const payload = await adminFetch('/api/crash/admin/risk-table', { method: 'POST', body: JSON.stringify({ resetDefault: true }) });
      renderCrashRiskPanel(payload || {});
      setStatus('crashRiskStatus', payload.overrideCleared ? 'Varsayılan Crash risk tablosu yüklendi ve bekleyen override temizlendi.' : 'Varsayılan Crash risk tablosu yüklendi.', 'ok');
      return;
    }
    if (action === 'crash-next-set') {
      requireCrashRiskConfirm();
      const multiplier = parseDecimalInput(document.getElementById('nextCrashPointInput')?.value || 0);
      if (!Number.isFinite(multiplier) || multiplier < 1.01 || multiplier > 10000) throw new Error('Sonraki çarpan 1.01 ile 10000 arasında olmalı.');
      const payload = await adminFetch('/api/crash/admin/next-crash-point', { method: 'POST', body: JSON.stringify({ multiplier }) });
      setStatus('crashRiskStatus', payload.appliedTo === 'current_countdown_round' ? `Aktif geri sayım roundu ${formatMultiplier(payload.selectedMultiplier)} olarak ayarlandı.` : `Sonraki oluşturulacak round ${formatMultiplier(payload.selectedMultiplier || payload.nextCrashPointOverride)} olarak ayarlandı.`, 'ok');
      await loadCrashRiskPanel();
      return;
    }
    if (action === 'crash-next-clear') {
      requireCrashRiskConfirm();
      await adminFetch('/api/crash/admin/next-crash-point', { method: 'DELETE' });
      const nextInput = document.getElementById('nextCrashPointInput');
      if (nextInput) nextInput.value = '';
      setStatus('crashRiskStatus', 'Crash çarpan override temizlendi; aktif geri sayım varsa risk tablosundan yeni çarpan seçildi.', 'ok');
      await loadCrashRiskPanel();
      return;
    }
  } catch (error) {
    const map = {
      reset: 'resetStatus', 'save-maintenance': 'maintenanceStatus', 'reward-user': 'rewardStatus', 'reward-all': 'rewardAllStatus', 'promo-create': 'promoStatus', 'crash-risk-save': 'crashRiskStatus', 'crash-risk-reset': 'crashRiskStatus', 'crash-next-set': 'crashRiskStatus', 'crash-next-clear': 'crashRiskStatus'
    };
    const statusId = map[action] || (action.startsWith('restrict:') ? 'restrictStatus' : 'maintenanceStatus');
    setStatus(statusId, error.message || 'İşlem başarısız.', 'error');
  }
}

root.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.id === 'dashboardRefreshBtn') return handleAction('refresh');
  if (button.id === 'dashboardLogoutBtn') return handleAction('logout');
  if (button.id === 'runResetBtn') return handleAction('reset');
  if (button.id === 'saveMaintenanceBtn') return handleAction('save-maintenance');
  if (button.id === 'grantUserRewardBtn') return handleAction('reward-user');
  if (button.id === 'grantAllRewardBtn') return handleAction('reward-all');
  if (button.id === 'createPromoBtn') return handleAction('promo-create');
  if (button.id === 'saveCrashRiskBtn') return handleAction('crash-risk-save');
  if (button.id === 'resetCrashRiskBtn') return handleAction('crash-risk-reset');
  if (button.id === 'setNextCrashPointBtn') return handleAction('crash-next-set');
  if (button.id === 'clearNextCrashPointBtn') return handleAction('crash-next-clear');
  if (button.id === 'runRestrictBtn') {
    const mode = selectedRestrictionAction();
    if (!mode) return setStatus('restrictStatus', 'Kısıtlama türü seçin.', 'error');
    return handleAction(`restrict:${mode}`);
  }
  if (button.dataset.maintenance) return button.classList.toggle('is-on');
});

(async () => {
  const access = await ensureAccess();
  if (!access.ok) {
    const title = loader?.querySelector('.loader-lines span');
    const sub = loader?.querySelector('.loader-lines strong');
    const hint = loader?.querySelector('.loader-lines b');
    if (title) title.textContent = 'YÖNETİCİ OTURUMU DOĞRULANAMADI';
    if (sub) sub.textContent = access.error || 'Yetki doğrulaması başarısız oldu.';
    if (hint) hint.textContent = 'Giriş ekranına yönlendiriliyorsunuz';
    window.setTimeout(() => redirectOut(), 900);
    return;
  }
  loader.classList.add('loader-hidden');
  const panelDoc = new DOMParser().parseFromString(panelTemplate(), 'text/html');
  root.replaceChildren(panelDoc.body.firstElementChild);
  await loadDashboard();
})();
