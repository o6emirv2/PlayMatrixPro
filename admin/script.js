(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const STORAGE_SESSION = 'pm_session_token';
  const STORAGE_ADMIN_KEY = 'pm_admin_matrix_key';
  const state = { step: 1, ticket: '', busy: false, activeTab: 'dashboard', summary: null, admin: null };

  function escapeHtml(value = '') { return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[ch])); }
  function formatMoney(value) { return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(value || 0))} MC`; }
  function formatDate(value) { const n = Number(value); const d = Number.isFinite(n) ? new Date(n) : new Date(value); return value && !Number.isNaN(d.getTime()) ? d.toLocaleString('tr-TR') : '-'; }
  function readSession(){ try { return sessionStorage.getItem(STORAGE_SESSION) || localStorage.getItem(STORAGE_SESSION) || ''; } catch { return ''; } }
  function writeSession(token){ if(!token) return; try{ sessionStorage.setItem(STORAGE_SESSION, token); localStorage.setItem(STORAGE_SESSION, token); }catch{} }
  function clearSession(){ try{ sessionStorage.removeItem(STORAGE_SESSION); localStorage.removeItem(STORAGE_SESSION); sessionStorage.removeItem(STORAGE_ADMIN_KEY); localStorage.removeItem(STORAGE_ADMIN_KEY); }catch{} }
  function readAdminKey(){ try { return sessionStorage.getItem(STORAGE_ADMIN_KEY) || localStorage.getItem(STORAGE_ADMIN_KEY) || ''; } catch { return ''; } }
  function writeAdminKey(key){ if(!key) return; try{ sessionStorage.setItem(STORAGE_ADMIN_KEY, key); localStorage.setItem(STORAGE_ADMIN_KEY, key); }catch{} }
  function setStatus(id, message = '', tone = '') { const el = $(id); if (!el) return; el.textContent = message; el.dataset.tone = tone || ''; }
  function setBusy(value){ state.busy = !!value; qsa('button,input').forEach(el => { if(el.id !== 'adminEmail' || state.step !== 1) el.disabled = state.busy && el.tagName === 'BUTTON'; }); }
  function activateStep(step){ state.step = step; $('stepProgress')?.setAttribute('data-step', String(step)); qsa('.gate-step').forEach(el => el.classList.toggle('is-active', Number(el.dataset.step) === step)); }
  function notice(text, cls = 'notice') { return `<div class="${cls}">${escapeHtml(text)}</div>`; }
  function showPanel(){ $('gateStage').hidden = true; $('adminApp').hidden = false; document.body.classList.remove('matrix-auth-body'); document.body.classList.add('matrix-dashboard-body'); dashboard().catch(showViewError); }
  function showGate(){ $('adminApp').hidden = true; $('gateStage').hidden = false; document.body.classList.add('matrix-auth-body'); document.body.classList.remove('matrix-dashboard-body'); activateStep(1); }
  function view(html){ $('view').innerHTML = html; }
  function showViewError(error){ view(notice(error.message || 'İşlem başarısız.', 'error')); }

  async function baseUrl(){ return (await window.__PM_API__?.ensureApiBase?.().catch(() => '')) || window.__PM_API__?.getApiBaseSync?.() || ''; }
  async function firebaseToken(){ return window.__PM_RUNTIME?.getIdToken?.(true).catch(() => '') || ''; }
  async function api(path, options = {}) {
    const base = await baseUrl();
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    const token = await firebaseToken();
    const session = readSession();
    const adminKey = readAdminKey();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (session) headers['x-session-token'] = session;
    if (adminKey) headers['x-admin-client-key'] = adminKey;
    if (options.body != null && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${base}${path}`, { ...options, headers, credentials:'include', cache:'no-store', body: options.body == null ? undefined : typeof options.body === 'string' ? options.body : JSON.stringify(options.body) });
    const payload = await response.json().catch(() => ({ ok:false, error:'INVALID_JSON' }));
    if (!response.ok || payload.ok === false) { const err = new Error(payload.error || `HTTP_${response.status}`); err.status = response.status; err.payload = payload; throw err; }
    if (payload.clientKey) writeAdminKey(payload.clientKey);
    if (payload.sessionToken || payload.session?.token) writeSession(payload.sessionToken || payload.session.token);
    return payload;
  }

  async function detectIdentity(){
    setStatus('emailStatus', 'Aktif yönetici oturumu algılanıyor...');
    try {
      const identity = await api('/api/auth/admin/matrix/identity');
      if (identity?.user?.email) $('adminEmail').value = identity.user.email;
      if (identity?.admin) setStatus('emailStatus', 'Yönetici hesabı algılandı. Doğrulama başlatılıyor...', 'ok');
      return identity;
    } catch (error) {
      setStatus('emailStatus', 'Admin e-postasını yazıp Enter ile doğrulayın.', '');
      return null;
    }
  }
  async function verifyEmail(){
    if (state.busy || state.step !== 1) return;
    const email = String($('adminEmail').value || '').trim().toLowerCase();
    if (!email.includes('@')) return setStatus('emailStatus', 'Geçerli yönetici e-postası gerekli.', 'error');
    setBusy(true); setStatus('emailStatus', 'Yönetici e-postası doğrulanıyor...');
    try { const out = await api('/api/auth/admin/matrix/step-email', { method:'POST', body:{ email } }); state.ticket = out.ticket || ''; state.admin = out.admin || null; setStatus('emailStatus', 'Yönetici e-postası doğrulandı.', 'ok'); activateStep(2); $('adminPassword')?.focus(); }
    catch(error){ setStatus('emailStatus', error.message || 'Yönetici e-postası doğrulanamadı.', 'error'); }
    finally{ setBusy(false); }
  }
  async function verifyPassword(){
    if (state.busy || state.step !== 2 || !state.ticket) return;
    const password = $('adminPassword').value || '';
    if (password.length < 2) return;
    setBusy(true); setStatus('passwordStatus', 'İkinci güvenlik katmanı doğrulanıyor...');
    try { const out = await api('/api/auth/admin/matrix/step-password', { method:'POST', body:{ ticket: state.ticket, password } }); state.ticket = out.ticket || ''; setStatus('passwordStatus', 'Şifre doğrulandı.', 'ok'); activateStep(3); $('adminName')?.focus(); }
    catch(error){ setStatus('passwordStatus', error.message || 'Şifre doğrulanamadı.', 'error'); }
    finally{ setBusy(false); }
  }
  async function verifyName(){
    if (state.busy || state.step !== 3 || !state.ticket) return;
    const adminName = $('adminName').value || '';
    if (adminName.trim().length < 2) return;
    setBusy(true); setStatus('nameStatus', 'Son güvenlik katmanı doğrulanıyor...');
    try { const out = await api('/api/auth/admin/matrix/step-name', { method:'POST', body:{ ticket: state.ticket, adminName } }); writeSession(out.sessionToken || out.session?.token || ''); writeAdminKey(out.clientKey || ''); setStatus('nameStatus', 'Güvenli yönetici oturumu başlatıldı.', 'ok'); activateStep(4); setTimeout(showPanel, 450); }
    catch(error){ setStatus('nameStatus', error.message || 'Son doğrulama başarısız oldu.', 'error'); }
    finally{ setBusy(false); }
  }
  async function resumeAdmin(){ try { const out = await api('/api/auth/admin/matrix/status'); state.admin = out.admin || null; showPanel(); return true; } catch { return false; } }

  async function loadSummary(){
    state.summary = await api('/api/admin/summary');
    const m = state.summary.metrics || {};
    $('metricUsers').textContent = String(m.users || 0); $('metricBalance').textContent = formatMoney(m.totalBalance || 0); $('metricBanned').textContent = String(m.banned || 0); $('metricLogs').textContent = String(m.runtimeLogs || 0); $('adminActor').textContent = state.summary.actor?.email || state.summary.actor?.uid || 'Admin oturumu aktif';
  }
  async function dashboard(){ await loadSummary(); const m = state.summary?.metrics || {}; view(`<h2>Genel Bakış</h2><div class="grid"><article class="card"><b>Firebase Admin</b><p>${state.summary?.firebaseEnabled ? 'Aktif' : 'Yerel smoke test / ENV bekleniyor'}</p></article><article class="card"><b>Kullanıcı</b><p>${m.users || 0} kayıt, ${m.banned || 0} banlı kullanıcı.</p></article><article class="card"><b>Ekonomi</b><p>Toplam örneklenen bakiye: ${formatMoney(m.totalBalance || 0)}</p></article><article class="card"><b>Runtime Store</b><pre>${escapeHtml(JSON.stringify(m.runtimeStores || {}, null, 2))}</pre></article></div>${notice('Admin panel eski adımlı doğrulama kapısından geçmeden açılmaz. Runtime loglar Render in-memory/console üzerinde tutulur.')}`); }
  async function users(){ view(`<h2>Kullanıcı Yönetimi</h2><div class="toolbar"><input id="userSearch" placeholder="UID, e-posta veya kullanıcı adı ara"><button id="userSearchBtn" class="primary">Ara</button></div><div id="usersOut">Yükleniyor…</div>`); const render=async()=>{ const q=$('userSearch').value||''; const p=await api(`/api/admin/users?search=${encodeURIComponent(q)}&limit=80`); const rows=p.users||[]; $('usersOut').innerHTML=rows.length?`<table class="table"><thead><tr><th>Kullanıcı</th><th>Seviye</th><th>Bakiye</th><th>Durum</th><th>Son</th></tr></thead><tbody>${rows.map((u,i)=>`<tr><td><div class="avatar-cell"><span class="admin-avatar-host" id="uav_${i}"></span><div><b>${escapeHtml(u.username)}</b><br><small>${escapeHtml(u.email||u.uid)}</small></div></div></td><td>${u.accountLevel}<br><small>${Number(u.accountLevelProgressPct||0).toFixed(1)}%</small></td><td>${formatMoney(u.balance)}</td><td>${u.banned?'<span class="pill red">Banlı</span>':'<span class="pill">Aktif</span>'}</td><td>${formatDate(u.lastSeen)}</td></tr>`).join('')}</tbody></table>`:notice('Kullanıcı bulunamadı.'); rows.forEach((u,i)=>window.PMAvatar?.mount?.($(`uav_${i}`),{avatarUrl:u.avatar,exactFrameIndex:u.selectedFrame,level:u.accountLevel,sizePx:44,alt:u.username})); }; $('userSearchBtn').onclick=()=>render().catch(e=>$('usersOut').innerHTML=notice(e.message,'error')); await render().catch(e=>$('usersOut').innerHTML=notice(e.message,'error')); }
  function economy(){ view(`<h2>Bakiye Yönetimi</h2><div class="form-card"><div class="row"><input id="balanceUid" placeholder="Kullanıcı UID"><input id="balanceAmount" type="number" placeholder="Miktar (+/-)"><input id="balanceReason" placeholder="İşlem nedeni"></div><button id="balanceSave" class="success">Atomic Bakiye Güncelle</button><div id="balanceOut"></div></div>`); $('balanceSave').onclick=async()=>{ try{ const r=await api('/api/admin/users/balance',{method:'POST',body:{uid:$('balanceUid').value,amount:Number($('balanceAmount').value),reason:$('balanceReason').value||'admin'}}); $('balanceOut').innerHTML=notice(`Bakiye güncellendi: ${formatMoney(r.amount)}`,'ok'); await loadSummary(); }catch(e){ $('balanceOut').innerHTML=notice(e.message,'error'); } }; }
  function ban(){ view(`<h2>Ban Yönetimi</h2><div class="form-card"><div class="row"><input id="banUid" placeholder="Kullanıcı UID"><input id="banReason" placeholder="Neden"><select id="banState"><option value="true">Banla</option><option value="false">Banı Kaldır</option></select></div><button id="banSave" class="danger">Durumu Kaydet</button><div id="banOut"></div></div>`); $('banSave').onclick=async()=>{ try{ const r=await api('/api/admin/users/ban',{method:'POST',body:{uid:$('banUid').value,reason:$('banReason').value,banned:$('banState').value==='true'}}); $('banOut').innerHTML=notice(`Durum kaydedildi: ${r.banned?'banlı':'aktif'}`,'ok'); await loadSummary(); }catch(e){ $('banOut').innerHTML=notice(e.message,'error'); } }; }
  async function payments(){ view('<h2>Ödeme Yönetimi</h2><div id="paymentsOut">Yükleniyor…</div>'); const p=await api('/api/admin/payments'); $('paymentsOut').innerHTML=(p.payments||[]).length?`<pre>${escapeHtml(JSON.stringify(p.payments,null,2))}</pre>`:notice('Ödeme kaydı bulunamadı.'); }
  async function promo(){ view(`<h2>Promo Yönetimi</h2><div class="form-card"><div class="row"><input id="promoCode" placeholder="Kod"><input id="promoAmount" type="number" placeholder="MC"><input id="promoClaims" type="number" placeholder="Kullanım limiti" value="1"></div><button id="promoSave" class="primary">Promo Kaydet</button><div id="promoOut"></div></div><h3>Aktif Promolar</h3><div id="promoList">Yükleniyor…</div>`); $('promoSave').onclick=async()=>{ try{ await api('/api/admin/promos',{method:'POST',body:{code:$('promoCode').value,amount:Number($('promoAmount').value),maxClaims:Number($('promoClaims').value)}}); $('promoOut').innerHTML=notice('Promo kaydedildi.','ok'); await promo(); }catch(e){ $('promoOut').innerHTML=notice(e.message,'error'); } }; const p=await api('/api/admin/promos'); $('promoList').innerHTML=(p.promos||[]).length?`<pre>${escapeHtml(JSON.stringify(p.promos,null,2))}</pre>`:notice('Promo kaydı bulunamadı.'); }
  async function logs(){ view('<h2>Canlı Log</h2><div id="logsOut">Yükleniyor…</div>'); const p=await api('/api/admin/runtime-logs'); $('logsOut').innerHTML=(p.logs||[]).length?`<pre>${escapeHtml(JSON.stringify(p.logs.slice(-120).reverse(),null,2))}</pre>`:notice('Runtime log bulunamadı.'); }
  function email(){ view(`<h2>E-posta Güncelle</h2><div class="form-card"><div class="row"><input id="emailUid" placeholder="UID"><input id="emailNew" type="email" placeholder="Yeni e-posta"></div><button id="emailSave" class="primary">Auth + Firestore Güncelle</button><div id="emailOut"></div></div>`); $('emailSave').onclick=async()=>{ try{ const r=await api('/api/admin/users/email',{method:'POST',body:{uid:$('emailUid').value,email:$('emailNew').value}}); $('emailOut').innerHTML=notice(`E-posta senkronlandı: ${escapeHtml(r.emailSynced)}`,'ok'); }catch(e){ $('emailOut').innerHTML=notice(e.message,'error'); } }; }
  async function notifications(){ view(`<h2>Bildirim Yönetimi</h2><div class="form-card"><div class="row"><input id="notTitle" placeholder="Başlık"><input id="notMsg" placeholder="Mesaj"></div><button id="notSend" class="primary">Runtime Bildirim Oluştur</button><div id="notOut"></div></div>`); $('notSend').onclick=async()=>{ try{ await api('/api/admin/notifications/send',{method:'POST',body:{title:$('notTitle').value,message:$('notMsg').value}}); $('notOut').innerHTML=notice('Bildirim runtime cache’e alındı.','ok'); }catch(e){ $('notOut').innerHTML=notice(e.message,'error'); } }; }
  async function games(){ view('<h2>Oyun İzleme</h2><div id="gamesOut">Yükleniyor…</div>'); const p=await api('/api/admin/games'); $('gamesOut').innerHTML=`<table class="table"><thead><tr><th>Oyun</th><th>Durum</th><th>Backend</th><th>Veri</th></tr></thead><tbody>${(p.games||[]).map(g=>`<tr><td>${escapeHtml(g.title)}</td><td><span class="pill">${escapeHtml(g.status)}</span></td><td>${escapeHtml(g.backend)}</td><td>${escapeHtml(g.data)}</td></tr>`).join('')}</tbody></table>`; }
  function cleanup(){ view(`<h2>Firestore Temizlik</h2><div class="form-card"><p>Varsayılan dry-run güvenlidir. Kritik finansal/idempotency/veri alanları silinmez.</p><button id="cleanupRun" class="danger">Dry-run Temizlik Raporu Al</button><div id="cleanupOut"></div></div>`); $('cleanupRun').onclick=async()=>{ try{ const r=await api('/api/admin/cleanup/firestore',{method:'POST',body:{dryRun:true}}); $('cleanupOut').innerHTML=`<pre>${escapeHtml(JSON.stringify(r,null,2))}</pre>`; }catch(e){ $('cleanupOut').innerHTML=notice(e.message,'error'); } }; }
  const handlers = { dashboard, users, economy, ban, payments, promo, logs, email, notifications, games, cleanup };
  function switchTab(tab){ state.activeTab=tab; qsa('[data-tab]').forEach(btn=>btn.classList.toggle('is-active', btn.dataset.tab===tab)); Promise.resolve(handlers[tab]?.()).catch(showViewError); }

  $('adminEmail')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); verifyEmail(); }});
  $('adminEmail')?.addEventListener('change', verifyEmail);
  $('adminPassword')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); verifyPassword(); }});
  $('adminName')?.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); verifyName(); }});
  $('retryEmail')?.addEventListener('click', ()=>{ state.ticket=''; $('adminEmail').value=''; setStatus('emailStatus',''); activateStep(1); detectIdentity(); });
  $('retryPassword')?.addEventListener('click', ()=>{ $('adminPassword').value=''; setStatus('passwordStatus',''); activateStep(2); });
  $('retryName')?.addEventListener('click', ()=>{ $('adminName').value=''; setStatus('nameStatus',''); activateStep(3); });
  $('adminPassword')?.addEventListener('input', ()=>{ if(($('adminPassword').value||'').length>=3) verifyPassword(); });
  $('adminName')?.addEventListener('input', ()=>{ if(($('adminName').value||'').trim().length>=2) verifyName(); });
  $('refreshBtn')?.addEventListener('click', ()=>switchTab(state.activeTab));
  $('adminLogout')?.addEventListener('click', async()=>{ await api('/api/auth/admin/matrix/logout',{method:'POST'}).catch(()=>null); clearSession(); showGate(); });
  qsa('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>switchTab(btn.dataset.tab)));

  (async()=>{ if(await resumeAdmin()) return; showGate(); await detectIdentity(); })();
})();
