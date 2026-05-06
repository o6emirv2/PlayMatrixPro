window.__PLAYMATRIX_ROUTE_NORMALIZER_DISABLED__ = true;
    import { initPlayMatrixOnlineCore } from "../../../pm-online-core.js";

const __PM_CRASH_CLIENT_REPORTER__ = (() => {
  const EXPECTED_FLOW = new Set(['CASHOUT_NOT_AVAILABLE','CASHOUT_TOO_LATE','BET_ALREADY_LOST','BET_REFUNDED','REFUND_IN_PROGRESS','AUTO_CASHOUT_MISSED']);
  const seen = new Map();
  function apiBase(){ try { return window.__PLAYMATRIX_API_URL__ || window.__PM_RUNTIME?.apiBase || window.location.origin; } catch (_) { return window.location.origin; } }
  function shouldReport(scope, payload = {}) {
    const message = String(payload.message || payload.error || '').trim();
    const upper = message.toUpperCase();
    if (EXPECTED_FLOW.has(upper)) return false;
    const source = String(payload.source || '').toLowerCase();
    if (source && !source.includes('/games/crash') && !source.includes('crash-app') && !source.includes('/api/crash') && !source.includes('playmatrix-runtime') && !source.includes('playmatrix-api') && !source.includes('avatar-frame') && !source.includes('game-topbar')) return false;
    const key = `${scope}:${upper}:${source}:${payload.line || ''}`;
    const last = seen.get(key) || 0;
    if (Date.now() - last < 10 * 60 * 1000) return false;
    seen.set(key, Date.now());
    return true;
  }
  function report(scope, payload = {}) {
    try {
      if (!shouldReport(scope, payload)) return;
      const body = { game:'crash', scope:String(scope||'frontend'), type:'crash-client', message:String(payload.message || payload.error || scope || 'Crash istemci olayı').slice(0,500), path:location.pathname, source:payload.source || 'public/js/games/crash/crash-app.js', line:payload.line || null, stack:String(payload.stack || '').slice(0,1200), at:Date.now() };
      fetch(`${apiBase()}/api/client/error`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), keepalive:true }).catch(()=>null);
    } catch (_) {}
  }
  window.addEventListener('error', (event) => report('window.error', { message:event.message, source:event.filename, line:event.lineno, stack:event.error?.stack }), true);
  window.addEventListener('unhandledrejection', (event) => report('promise.rejection', { message:event.reason?.message || String(event.reason || ''), source:event.reason?.source || '', stack:event.reason?.stack }), true);
  return { report };
})();

    const core = await initPlayMatrixOnlineCore();
    const auth = core.auth;
    const onAuthStateChanged = core.onAuthStateChanged;
    const getIdToken = core.getIdToken;
    const signOut = core.signOut;
    window.__PM_RUNTIME = window.__PM_RUNTIME || {};
    window.__PM_RUNTIME.auth = auth;
    window.__PM_RUNTIME.signOut = signOut;
    window.__PM_RUNTIME.getIdToken = async (forceRefresh = false) => core.getIdToken(forceRefresh);
    const API_URL = core.getApiBaseSync();
    window.__PM_RUNTIME.apiBase = API_URL;
    window.__PLAYMATRIX_API_URL__ = API_URL;
    const getApiBase = () => core.getApiBaseSync();
    async function ensureApiBaseReady() { return core.ensureApiBaseReady(); }
    async function ensureSocketClientReady() { return core.ensureSocketClientReady(); }
    
const INLINE_DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%20role%3D%27img%27%20aria-label%3D%27PlayMatrix%20Avatar%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27pmg%27%20x1%3D%270%27%20x2%3D%271%27%20y1%3D%270%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%25%27%20stop-color%3D%27%23111827%27%2F%3E%3Cstop%20offset%3D%27100%25%27%20stop-color%3D%27%231f2937%27%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27url%28%23pmg%29%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%20fill-opacity%3D%27.94%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%20fill-opacity%3D%27.92%27%2F%3E%3Ctext%20x%3D%2764%27%20y%3D%27118%27%20text-anchor%3D%27middle%27%20font-family%3D%27Inter%2CArial%2Csans-serif%27%20font-size%3D%2716%27%20font-weight%3D%27700%27%20fill%3D%27%23f9fafb%27%3EPM%3C%2Ftext%3E%3C%2Fsvg%3E';
    const DEFAULT_AVATAR = window.PMAvatar?.FALLBACK_AVATAR || INLINE_DEFAULT_AVATAR;
    const CRASH_MIN_BET = 1;
    const CRASH_MAX_BET = 1000000;
    const CRASH_MIN_AUTO_CASHOUT = 2;
    const CRASH_MAX_AUTO_CASHOUT = 100;

    function installCrashFrameFallbacks() {
      document.addEventListener('error', (event) => {
        const img = event.target;
        if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
        if (img.dataset.fallbackTried === '1') { img.hidden = true; return; }
        img.dataset.fallbackTried = '1';
        img.src = img.dataset.fallback;
      }, true);
    }
    installCrashFrameFallbacks();

    function safeFloat(num) { return parseFloat((Number(num) || 0).toFixed(2)); }
    function safeMoney(num) { return Math.max(0, safeFloat(num)); }
    function clampBetAmount(value) {
        const normalized = String(value ?? '').trim().replace(',', '.');
        const numeric = Math.trunc(Number(normalized) || 0);
        return Math.max(CRASH_MIN_BET, Math.min(CRASH_MAX_BET, numeric));
    }
    function parseAutoCashoutValue(value) {
        const normalized = String(value ?? '').trim().replace(',', '.');
        if (!normalized) return NaN;
        const numeric = Number(normalized);
        return Number.isFinite(numeric) ? numeric : NaN;
    }
    function clampAutoCashout(value) {
        const parsed = parseAutoCashoutValue(value);
        if (!Number.isFinite(parsed)) return 0;
        return safeFloat(Math.min(CRASH_MAX_AUTO_CASHOUT, Math.max(CRASH_MIN_AUTO_CASHOUT, parsed)));
    }
    function formatAutoCashoutInput(value) {
        const parsed = parseAutoCashoutValue(value);
        if (!Number.isFinite(parsed) || parsed <= 0) return '';
        return clampAutoCashout(parsed).toFixed(2);
    }
    function pickNumber(...values) {
        for (const value of values) {
            const number = Number(value);
            if (Number.isFinite(number)) return number;
        }
        return null;
    }
    function pickProfile(payload) {
        if (!payload || typeof payload !== 'object') return {};
        if (payload.user && typeof payload.user === 'object') return payload.user;
        if (payload.profile && typeof payload.profile === 'object') return payload.profile;
        return payload;
    }
    function extractBalance(payload) {
        const profile = pickProfile(payload);
        const value = pickNumber(payload?.balance, payload?.mcBalance, payload?.wallet?.balance, profile?.balance, profile?.mcBalance, profile?.wallet?.balance);
        return value === null ? null : safeMoney(value);
    }
    function getPlayerAccountLevel(player = {}) {
        const rawLevel = Number(player?.accountLevel ?? player?.progression?.accountLevel ?? player?.level ?? 1);
        if (Number.isFinite(rawLevel) && rawLevel > 0) {
            return Math.max(1, Math.min(100, Math.floor(rawLevel)));
        }
        return 1;
    }

    function getPlayerAccountProgressPct(player = {}) {
        const rawProgress = Number(player?.progression?.accountLevelProgressPct ?? player?.accountLevelProgressPct ?? 0);
        if (!Number.isFinite(rawProgress)) return 0;
        return Math.max(0, Math.min(100, rawProgress));
    }

    function resolveFrameIndex(rawLevel) {
        if (window.PMAvatar && typeof window.PMAvatar.getFrameAssetIndex === 'function') {
            return window.PMAvatar.getFrameAssetIndex(rawLevel);
        }
        const lvl = Math.max(0, Math.min(100, Math.floor(Number(rawLevel) || 0)));
        if (lvl <= 0) return 0;
        if (lvl <= 15) return 1;
        if (lvl <= 30) return 2;
        if (lvl <= 40) return 3;
        if (lvl <= 50) return 4;
        if (lvl <= 60) return 5;
        if (lvl <= 80) return 6;
        if (lvl <= 85) return 7;
        if (lvl <= 90) return 8;
        return Math.min(18, Math.max(9, lvl - 82));
    }

    function getCrashFrameLevel(player) {
        const raw = Math.trunc(Number(player?.selectedFrame ?? player?.frame ?? 0) || 0);
        return Math.max(0, Math.min(100, raw));
    }

    function getCrashFrameIndex(player) {
        return resolveFrameIndex(getCrashFrameLevel(player));
    }

    function renderCrashAvatar(player, avatarUrl) {
        const frameLevel = getCrashFrameLevel(player);
        const frameIndex = resolveFrameIndex(frameLevel);
        const avatarHtml = window.PMAvatar && typeof window.PMAvatar.buildHTML === 'function'
          ? window.PMAvatar.buildHTML({
              avatarUrl: avatarUrl || DEFAULT_AVATAR,
              level: frameLevel,
              exactFrameIndex: null,
              sizePx: 40,
              extraClass: 't-avatar-core',
              imageClass: 't-avatar',
              wrapperClass: 'pm-avatar',
              alt: 'avatar'
            })
          : (() => {
              const frameHtml = frameIndex > 0
                ? `<img src="/public/assets/frames/frame-${frameIndex}.png" class="t-frame frame-${frameIndex}" alt="" aria-hidden="true" data-fallback="/public/assets/frames/frame-${frameIndex}.png">`
                : '';
              return `<img src="${escapeHTML(avatarUrl || DEFAULT_AVATAR)}" class="t-avatar" alt="avatar">${frameHtml}`;
            })();
        return `<div class="t-avatar-wrap${frameIndex > 0 ? ' has-frame' : ''}">${avatarHtml}</div>`;
    }

    function syncAutoMode(box, enabled) {
        const autoBet = document.getElementById(`chkAutoBet${box}`);
        const autoBtn = document.getElementById(`btnAutoMode${box}`);
        const betBox = autoBtn ? autoBtn.closest('.bet-box') : null;
        if (autoBet) autoBet.checked = !!enabled;
        if (autoBtn) autoBtn.classList.toggle('active', !!enabled);
        if (betBox) betBox.classList.toggle('auto-linked', !!enabled);
        updateButtons();
        if (enabled && sPhase === 'COUNTDOWN') checkAutoBets();
    }

function setupAutoModeBindings() {
    [1, 2].forEach(box => {
        const autoCash = document.getElementById(`chkAutoCash${box}`);
        const autoBtn = document.getElementById(`btnAutoMode${box}`);
        const autoInput = document.getElementById(`inpAuto${box}`);
        const betInput = document.getElementById(`inpBet${box}`);
        const autoBet = document.getElementById(`chkAutoBet${box}`);
        if (autoBtn) {
            autoBtn.addEventListener('click', () => {
                const nextState = !(autoBet && autoBet.checked);
                syncAutoMode(box, nextState);
            });
        }
        if (autoCash) {
            autoCash.addEventListener('change', () => {
                updateAutoCashoutInputStates();
                updateButtons();
            });
        }
        if (autoInput) {
            const normalizeAuto = () => {
                const formatted = formatAutoCashoutInput(autoInput.value);
                if (formatted) autoInput.value = formatted;
            };
            autoInput.addEventListener('change', normalizeAuto);
            autoInput.addEventListener('blur', normalizeAuto);
            normalizeAuto();
        }
        if (betInput) {
            const normalizeBet = () => {
                betInput.value = clampBetAmount(String(betInput.value).replace(',', '.'));
                updateBetButtonLabel(box);
            };
            betInput.addEventListener('change', normalizeBet);
            betInput.addEventListener('blur', normalizeBet);
        }
        syncAutoMode(box, autoBet ? autoBet.checked : false);
    });
    updateAutoCashoutInputStates();
}

const crashNoticeTimers = new Map();
    const crashNoticeIconByType = {
        success: 'fa-circle-check',
        error: 'fa-triangle-exclamation',
        warning: 'fa-circle-exclamation',
        invite: 'fa-gamepad',
        xp: 'fa-star',
        cashout: 'fa-sack-dollar',
        loss: 'fa-burst',
        system: 'fa-circle-info',
        info: 'fa-circle-info'
    };

    function normalizeNoticeType(type = 'info') {
        const raw = String(type || 'info').toLowerCase();
        if (['success','error','warning','invite','xp','cashout','loss','system','info'].includes(raw)) return raw;
        return 'info';
    }

    function renderNoticeInto(el, { type = 'info', title = '', message = '' } = {}, timeout = 4200) {
        if (!el) return;
        const safeType = normalizeNoticeType(type);
        el.replaceChildren();
        const icon = document.createElement('i');
        icon.className = `fa-solid ${crashNoticeIconByType[safeType] || crashNoticeIconByType.info}`;
        const body = document.createElement('span');
        body.textContent = `${title ? `${title}: ` : ''}${message || ''}`.trim();
        el.append(icon, body);
        el.classList.remove('is-success','is-error','is-warning');
        if (['success','cashout','xp','invite'].includes(safeType)) el.classList.add('is-success');
        else if (safeType === 'error' || safeType === 'loss') el.classList.add('is-error');
        else if (safeType === 'warning') el.classList.add('is-warning');
        el.classList.add('show');
        const key = el.id || Math.random().toString(36);
        if (crashNoticeTimers.has(key)) clearTimeout(crashNoticeTimers.get(key));
        if (timeout > 0) {
            crashNoticeTimers.set(key, setTimeout(() => {
                el.classList.remove('show');
                if (el.classList.contains('bet-box-notice')) el.replaceChildren();
            }, timeout));
        }
    }

    function showCrashNotice(input = '', opts = {}) {
        const payload = typeof input === 'object' && input !== null ? input : { message: String(input || '') };
        const type = normalizeNoticeType(payload.type || opts.type || 'info');
        const title = payload.title || opts.title || '';
        const message = payload.message || opts.message || '';
        const scope = payload.scope || opts.scope || 'hud';
        const timeout = Number(payload.duration ?? opts.duration ?? 4200);
        const targets = [];
        if (scope === 'box1' || scope === 'bet1') targets.push(document.getElementById('betNotice1'));
        else if (scope === 'box2' || scope === 'bet2') targets.push(document.getElementById('betNotice2'));
        else if (scope === 'all-bets') targets.push(document.getElementById('betNotice1'), document.getElementById('betNotice2'));
        else targets.push(document.getElementById('crashHudNotice'), document.getElementById('inlineNotificationArea'));
        targets.filter(Boolean).forEach((el) => renderNoticeInto(el, { type, title, message }, timeout));
    }

    window.showCrashNotice = showCrashNotice;
    window.showInlineError = (message, opts = {}) => showCrashNotice({ type: opts.type || 'info', title: opts.title || 'Bilgi', message: String(message || ''), scope: opts.scope || 'hud', duration: opts.duration });

    window.showWinStrip = (avatar, user, mult, amt) => {
        elWsAvatar.src = avatar || DEFAULT_AVATAR;
        elWsUser.innerText = user || 'Oyuncu';
        elWsMult.innerText = safeFloat(mult).toFixed(2) + 'x';
        elWsAmt.innerText = '+' + safeFloat(amt).toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2}) + ' MC';
        const el = elWinStrip;
        el.classList.add("show");
        if(window.winStripTimeout) clearTimeout(window.winStripTimeout);
        window.winStripTimeout = setTimeout(() => { el.classList.remove("show"); }, 3500);
    };

    window.openRulesModal = () => {
        const m = elRulesModal;
        if (!m) return;
        m.hidden = false;
        m.setAttribute('aria-hidden', 'false');
        m.style.display = 'flex'; setTimeout(() => m.classList.add('show'), 10);
    };
    window.closeRulesModal = () => {
        const m = elRulesModal;
        if (!m) return;
        m.classList.remove('show');
        m.setAttribute('aria-hidden', 'true');
        setTimeout(() => { m.style.display = 'none'; m.hidden = true; }, 300);
    };

    let audioCtx = null;
    let audioUnlocked = false;
    let serverTimeOffsetMs = 0;
    const nowServer = () => Date.now() + serverTimeOffsetMs;
    const audioMaster = { musicGain: null, sfxGain: null, compressor: null };

    function createAudioContext() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        return new AudioContext({ latencyHint: 'interactive' });
    }

    function ensureAudioGraph() {
        if (!audioCtx) audioCtx = createAudioContext();
        if (!audioCtx) return false;
        if (audioMaster.musicGain) return true;

        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 18;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.22;

        const musicGain = audioCtx.createGain();
        musicGain.gain.value = 0.0;
        const sfxGain = audioCtx.createGain();
        sfxGain.gain.value = 0.72;
        musicGain.connect(compressor);
        sfxGain.connect(compressor);
        compressor.connect(audioCtx.destination);
        audioMaster.musicGain = musicGain;
        audioMaster.sfxGain = sfxGain;
        audioMaster.compressor = compressor;
        return true;
    }

    
    function playEnvelopeOsc({ type='sine', frequency=440, frequencyEnd=null, duration=0.16, gain=0.08, when=audioCtx.currentTime, detune=0 }) {
        if (!audioCtx || !audioUnlocked || !ensureAudioGraph()) return;
        const osc = audioCtx.createOscillator();
        const amp = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(Math.max(1, frequency), when);
        if (frequencyEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, frequencyEnd), when + duration);
        if (detune) osc.detune.setValueAtTime(detune, when);
        amp.gain.setValueAtTime(0.0001, when);
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.008);
        amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
        osc.connect(amp);
        amp.connect(audioMaster.sfxGain);
        osc.start(when);
        osc.stop(when + duration + 0.03);
    }

    function createNoiseBuffer() {
        if (!audioCtx) return null;
        const length = audioCtx.sampleRate * 1.1;
        const buffer = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            const falloff = 1 - (i / length);
            channel[i] = (Math.random() * 2 - 1) * falloff;
        }
        return buffer;
    }
    let noiseBuffer = null;

    function playNoiseBurst({ duration=0.35, gain=0.16, filterType='bandpass', frequency=950, q=1.6, when=null }) {
        if (!audioCtx || !audioUnlocked || !ensureAudioGraph()) return;
        if (!noiseBuffer) noiseBuffer = createNoiseBuffer();
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        const amp = audioCtx.createGain();
        const now = when ?? audioCtx.currentTime;
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        src.connect(filter);
        filter.connect(amp);
        amp.connect(audioMaster.sfxGain);
        src.start(now);
        src.stop(now + duration + 0.03);
    }

    function playFilteredNoiseSweep({ startFreq=1200, endFreq=90, duration=0.5, gain=0.18, when=null }) {
        if (!audioCtx || !audioUnlocked || !ensureAudioGraph()) return;
        if (!noiseBuffer) noiseBuffer = createNoiseBuffer();
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuffer;
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        const now = when ?? audioCtx.currentTime;
        filter.frequency.setValueAtTime(startFreq, now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
        const amp = audioCtx.createGain();
        amp.gain.setValueAtTime(0.0001, now);
        amp.gain.exponentialRampToValueAtTime(gain, now + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        src.connect(filter);
        filter.connect(amp);
        amp.connect(audioMaster.sfxGain);
        src.start(now);
        src.stop(now + duration + 0.03);
    }

function playSfx(name) {
    if (!audioCtx || !audioUnlocked || !ensureAudioGraph()) return;
    const now = audioCtx.currentTime;
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    switch (name) {
        case 'tick':
            playEnvelopeOsc({ type: 'square', frequency: 1740, frequencyEnd: 1380, duration: 0.04, gain: 0.022, when: now });
            playEnvelopeOsc({ type: 'triangle', frequency: 1180, frequencyEnd: 860, duration: 0.055, gain: 0.014, when: now + 0.004 });
            break;
        case 'bet':
            playEnvelopeOsc({ type: 'square', frequency: 180, frequencyEnd: 320, duration: 0.06, gain: 0.03, when: now });
            playEnvelopeOsc({ type: 'triangle', frequency: 320, frequencyEnd: 620, duration: 0.08, gain: 0.022, when: now + 0.016 });
            playEnvelopeOsc({ type: 'sine', frequency: 760, frequencyEnd: 980, duration: 0.07, gain: 0.01, when: now + 0.032 });
            break;
        case 'launch':
            playNoiseBurst({ duration: 0.18, gain: 0.03, filterType: 'highpass', frequency: 1800, q: 0.8, when: now });
            playEnvelopeOsc({ type: 'sawtooth', frequency: 72, frequencyEnd: 240, duration: 0.16, gain: 0.03, when: now });
            playEnvelopeOsc({ type: 'sawtooth', frequency: 180, frequencyEnd: 920, duration: 0.52, gain: 0.05, when: now + 0.03 });
            playEnvelopeOsc({ type: 'triangle', frequency: 120, frequencyEnd: 680, duration: 0.58, gain: 0.036, when: now + 0.02 });
            playEnvelopeOsc({ type: 'sine', frequency: 1040, frequencyEnd: 1620, duration: 0.22, gain: 0.012, when: now + 0.16 });
            break;
        case 'crash':
            playFilteredNoiseSweep({ startFreq: 3200, endFreq: 110, duration: 0.9, gain: 0.16, when: now });
            playNoiseBurst({ duration: 0.48, gain: 0.09, filterType: 'bandpass', frequency: 280, q: 0.85, when: now });
            playEnvelopeOsc({ type: 'sawtooth', frequency: 420, frequencyEnd: 46, duration: 0.72, gain: 0.085, when: now });
            playEnvelopeOsc({ type: 'triangle', frequency: 180, frequencyEnd: 26, duration: 0.78, gain: 0.05, when: now + 0.015 });
            playEnvelopeOsc({ type: 'sine', frequency: 90, frequencyEnd: 18, duration: 0.68, gain: 0.02, when: now + 0.02 });
            break;
        case 'win':
            playEnvelopeOsc({ type: 'triangle', frequency: 600, frequencyEnd: 920, duration: 0.09, gain: 0.028, when: now });
            playEnvelopeOsc({ type: 'triangle', frequency: 920, frequencyEnd: 1320, duration: 0.11, gain: 0.025, when: now + 0.045 });
            playEnvelopeOsc({ type: 'triangle', frequency: 1320, frequencyEnd: 1760, duration: 0.13, gain: 0.022, when: now + 0.095 });
            playEnvelopeOsc({ type: 'sine', frequency: 1760, frequencyEnd: 2280, duration: 0.14, gain: 0.016, when: now + 0.14 });
            break;
    }
}

async function initAndUnlockAudio() {
        if (audioUnlocked) return;
        try {
            if (!audioCtx) audioCtx = createAudioContext();
            if (!audioCtx) return;
            ensureAudioGraph();
            if (audioCtx.state === 'suspended') await audioCtx.resume();
            const buffer = audioCtx.createBuffer(1, 1, 22050);
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            source.start(0);
            audioUnlocked = true;
        } catch(e) {}
    }

    ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'click'].forEach(evt => {
        window.addEventListener(evt, () => { initAndUnlockAudio(); }, { passive: true, once: false });
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            initAndUnlockAudio();
            connectStream().catch(() => {});
        }
    });
    window.addEventListener('focus', () => { connectStream().catch(() => {}); });
    window.addEventListener('pageshow', () => { connectStream().catch(() => {}); });
    window.addEventListener('online', () => { connectStream().catch(() => {}); });

    const elBtnAction1 = document.getElementById('btnAction1');
    const elBtnAction2 = document.getElementById('btnAction2');
    const elBtnEnterGame = document.getElementById('btnEnterGame');
    const elBtnRetryBoot = document.getElementById('btnRetryBoot');
    const elStudioIntro = document.getElementById('studioIntro');
    const elLoaderFill = document.getElementById('loaderFill');
    const elLoaderStatus = document.getElementById('loaderStatus');
    const elRulesModal = document.getElementById('rulesModal');
    const elUiPhase = document.getElementById('uiPhase');
    const elLiveBetCount = document.getElementById('liveBetCount');
    const elLiveCashoutCount = document.getElementById('liveCashoutCount');
    const elUiAccountLevelBar = document.getElementById('uiAccountLevelBar');
    const elUiAccountLevelPct = document.getElementById('uiAccountLevelPct');
    const elUiAccountLevelBadge = document.getElementById('uiAccountLevelBadge');
    const elUiAccountAvatarHost = document.getElementById('uiAccountAvatarHost');
    const elWsAvatar = document.getElementById('wsAvatar');
    const elWsUser = document.getElementById('wsUser');
    const elWsMult = document.getElementById('wsMult');
    const elWsAmt = document.getElementById('wsAmt');
    const elWinStrip = document.getElementById('winStrip');
    const elCrashRuntimeNotice = document.getElementById('crashRuntimeNotice');

    function getSafeWebStorage(name = 'localStorage') {
        try {
            const storage = window[name];
            if (!storage) return null;
            const probeKey = `__pm_storage_probe_${name}`;
            storage.setItem(probeKey, '1');
            storage.removeItem(probeKey);
            return storage;
        } catch (_) { return null; }
    }

    function getSafeStorageList() {
        return [getSafeWebStorage('sessionStorage'), getSafeWebStorage('localStorage')].filter(Boolean);
    }
    let bootPromise = null;
    let bootCompleted = false;
    let bootActionMode = 'retry';

    function renderCrashRuntimeNotice(message = '', tone = 'warning', actionLabel = '', actionHandler = null) {
        if (!elCrashRuntimeNotice) return;
        const text = String(message || '').trim();
        if (!text) { elCrashRuntimeNotice.className = 'crash-runtime-notice'; elCrashRuntimeNotice.replaceChildren(); return; }
        elCrashRuntimeNotice.className = `crash-runtime-notice show ${tone === 'error' ? 'is-error' : tone === 'warning' ? 'is-warning' : ''}`.trim();
        elCrashRuntimeNotice.replaceChildren();
        const noticeText = document.createElement('div');
        noticeText.className = 'crash-runtime-notice__text';
        noticeText.textContent = text;
        elCrashRuntimeNotice.appendChild(noticeText);
        if (actionLabel && typeof actionHandler === 'function') {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'crash-runtime-notice__action';
            btn.textContent = actionLabel;
            btn.addEventListener('click', actionHandler);
            elCrashRuntimeNotice.appendChild(btn);
        }
    }

    function setBootBusyState(isBusy) { if (elBtnEnterGame) elBtnEnterGame.disabled = !!isBusy; if (elBtnRetryBoot) elBtnRetryBoot.disabled = !!isBusy; }

    function setBootProgress(value) {
        const pct = Math.max(0, Math.min(100, Number(value) || 0));
        if (elLoaderFill) elLoaderFill.style.width = pct + '%';
    }

    function setBootStatus(message, tone = 'info') {
        if (!elLoaderStatus) return;
        elLoaderStatus.textContent = message;
        elLoaderStatus.classList.remove('is-error');
        if (tone === 'error') elLoaderStatus.classList.add('is-error');
    }

    function playCrashSfx(name = '') {
    try {
        const key = String(name || '').trim().toLowerCase();
        if (!key) return;
        if (typeof playSfx === 'function') { playSfx(key); return; }
        const audio = window.__PM_CRASH_SFX__ && window.__PM_CRASH_SFX__[key];
        if (audio && typeof audio.play === 'function') {
            audio.currentTime = 0;
            audio.play().catch(() => null);
        }
    } catch (_) {}
}

window.playCrashSfx = window.playCrashSfx || playCrashSfx;

function setBootActions({ showEnter = false, showRetry = false, enterLabel = 'CRASH OYNA', actionMode = 'continue' } = {}) {
        bootActionMode = actionMode;
        if (elBtnEnterGame) {
            elBtnEnterGame.textContent = enterLabel;
            elBtnEnterGame.style.display = showEnter ? 'inline-flex' : 'none';
        }
        if (elBtnRetryBoot) elBtnRetryBoot.style.display = showRetry ? 'inline-flex' : 'none';
    }

    function dismissIntro() {
        if (!elStudioIntro) return;
        elStudioIntro.style.opacity = '0';
        setTimeout(() => { elStudioIntro.style.display = 'none'; }, 320);
    }

    function withTimeout(promise, ms, code = 'TIMEOUT') {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { const err = new Error(code); err.code = code; reject(err); }, ms);
            Promise.resolve(promise).then((value) => { clearTimeout(timer); resolve(value); }).catch((error) => { clearTimeout(timer); reject(error); });
        });
    }

    function waitForAuthReady(timeoutMs = 15000) {
        return core.waitForAuthReady(timeoutMs);
    }

    function renderCrashTopbarAvatar(profile = {}) {
        if (!elUiAccountAvatarHost) return;
        const avatarUrl = profile.avatar || profile.photoURL || profile.avatarUrl || DEFAULT_AVATAR;
        const safeAvatar = escapeHTML((window.PMAvatar?.safeAvatarUrl ? window.PMAvatar.safeAvatarUrl(avatarUrl) : avatarUrl) || DEFAULT_AVATAR);
        const signature = JSON.stringify({ avatar: safeAvatar });
        if (elUiAccountAvatarHost.dataset.pmAvatarSig === signature && elUiAccountAvatarHost.childElementCount) return;
        elUiAccountAvatarHost.dataset.pmAvatarSig = signature;
        elUiAccountAvatarHost.innerHTML = `<img class="pm-game-topbar-avatar-only" src="${safeAvatar}" alt="Avatar" loading="lazy" decoding="async" draggable="false">`;
    }

    function applyCrashProgression(profile = {}, { animate = false } = {}) {
        const accountLevel = getPlayerAccountLevel(profile);
        const accountProgress = getPlayerAccountProgressPct(profile);
        if (elUiAccountLevelBar) {
            elUiAccountLevelBar.style.width = accountProgress + '%';
            if (animate) {
                elUiAccountLevelBar.classList.add('xp-pulse');
                setTimeout(() => elUiAccountLevelBar?.classList.remove('xp-pulse'), 900);
            }
        }
        if (elUiAccountLevelPct) elUiAccountLevelPct.innerText = `${accountProgress.toFixed(1)}%`;
        if (elUiAccountLevelBadge) elUiAccountLevelBadge.innerText = accountLevel;
    }

    function applyCrashProfilePayload(payload) {
        if (!payload?.ok) throw new Error(payload?.error || 'PROFILE_LOAD_FAILED');
        lastProfilePayload = payload;
        const profile = pickProfile(payload);
        const balance = extractBalance(payload);
        if (balance !== null) {
            currentBalance = balance;
            balanceReady = true;
        }
        if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        if(profile && Object.keys(profile).length) {
            userInfo.avatar = profile.avatar || profile.photoURL || profile.avatarUrl || '';
            userInfo.username = profile.username || profile.displayName || profile.fullName || 'Sen';
            renderCrashTopbarAvatar(profile);
            applyCrashProgression(profile, { animate: false });
            const badgeWrap = document.querySelector('.level-badge-wrap');
            if (badgeWrap) badgeWrap.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
            const statFill = document.querySelector('.stat-bar-fill');
            if (statFill) statFill.style.background = '';
        }
        updateButtons();
        return payload;
    }

    async function fetchBootProfile() {
        const payload = await api('/api/crash/profile');
        return applyCrashProfilePayload(payload);
    }

    async function waitForSocketReady(sock, timeoutMs = 6500) {
        return core.waitForSocketReady(sock, timeoutMs);
    }

    async function bootCrashApp(force = false) {
        if (bootCompleted && !force) return true;
        if (bootPromise) return bootPromise;
        bootPromise = (async () => {
            setBootBusyState(true);
            renderCrashRuntimeNotice('');
            setBootProgress(8);
            setBootStatus('Oturum doğrulanıyor...');
            setBootActions({ showEnter: false, showRetry: false });
            const user = await waitForAuthReady(15000);
            uid = user.uid;
            setBootProgress(26);
            setBootStatus('Profil ve bakiye hazırlanıyor...');
            await withTimeout(fetchBootProfile(), 7000, 'PROFILE_TIMEOUT').catch((error) => {
                balanceReady = false;
                renderCrashRuntimeNotice('Profil/bakiye verisi alınamadı. Bakiye doğrulanana kadar bahis butonları kapalı kalacak.', 'warning', 'Tekrar Dene', () => fetchBootProfile().catch(() => null));
                return null;
            });
            setBootProgress(42);
            setBootStatus('Ses katmanı hazırlanıyor...');
            await withTimeout(initAndUnlockAudio(), 2500, 'AUDIO_TIMEOUT').catch(() => null);
            setBootProgress(65);
            setBootStatus('Canlı akış bağlanıyor...');
            let streamReady = false;
            try {
                await withTimeout(connectStream(), 2500, 'SOCKET_INIT_TIMEOUT');
                await waitForSocketReady(socket, 3500);
                streamReady = true;
            } catch (_) {
                streamReady = false;
            }
            bootCompleted = true;
            setBootProgress(100);
            setBootStatus(streamReady ? 'Canlı akış hazır. Oyun açılıyor...' : 'Ekran hazırlanıyor. Canlı akış arka planda yeniden denenecek.', streamReady ? 'info' : 'warning');
            setBootActions({ showEnter: true, showRetry: !streamReady, enterLabel: 'CRASH OYNA', actionMode: 'continue' });
            if (!streamReady) {
                renderCrashRuntimeNotice('Canlı akış şu an hazır değil. Ekran açılacak; bağlantı arka planda tekrar denenecek.', 'warning', 'Tekrar Dene', () => connectStream().catch(() => null));
                scheduleCrashReconnect(250);
            }
            await startApp(!streamReady);
            dismissIntro();
            return true;
        })().catch((error) => {
            const code = error?.code || error?.message || 'BOOT_ERROR';
            if (['AUTH_TIMEOUT','NO_USER','FIREBASE_UNAVAILABLE','PUBLIC_RUNTIME_CONFIG_UNAVAILABLE','PUBLIC_FIREBASE_CONFIG_MISSING','FIREBASE_IMPORT_FAILED','FIREBASE_SDK_TIMEOUT'].includes(code)) {
                setBootProgress(18);
                setBootStatus('Oturum doğrulanamadı. Önce giriş yapıp tekrar deneyin.', 'error');
                setBootActions({ showEnter: true, showRetry: true, enterLabel: 'ANASAYFAYA DÖN', actionMode: 'home' });
            } else {
                setBootProgress(48);
                setBootStatus('Canlı akış kurulamadı. Tekrar deneyin.', 'error');
                renderCrashRuntimeNotice('Canlı akış hazır değil. Tekrar deneyerek bağlantıyı yeniden başlatabilirsiniz.', 'error', 'Tekrar Dene', () => bootCrashApp(true).catch(() => null));
                setBootActions({ showEnter: false, showRetry: true, actionMode: 'retry' });
            }
            bootCompleted = false;
            throw error;
        }).finally(() => { setBootBusyState(false); bootPromise = null; });
        return bootPromise;
    }

    elBtnEnterGame.addEventListener('click', async () => {
        if (bootActionMode === 'home') { window.location.href = '/'; return; }
        if (!bootCompleted) { bootCrashApp(true).catch(() => null); return; }
        dismissIntro();
        startApp(true).catch(() => null);
    });

    elBtnRetryBoot?.addEventListener('click', () => { bootCrashApp(true).catch(() => null); });

    let socket = null;
    let uid = null;
    let currentBalance = 0;
    let balanceReady = false;
    let balanceRefreshTimer = null;
    let canvasFrameId = 0;
    let canvasLoopActive = false;
    let lastProfilePayload = null;
    let sPhase = 'COUNTDOWN';
    let sMult = 1.00;
    let currentRoundId = null;
    let previousRoundId = null;
    let autoBetPlacedForRound = { box1: null, box2: null };
    let myBets = { box1: null, box2: null };
    let isProcessing = { box1: false, box2: false };
    let lastTick = -1;
    let lastRenderedTableData = '';
    let localTargetTime = 0;
    let localStartTime = 0;
    let crashCountdownEnd = 0;
    let pendingPhaseAfterCrash = null;
    let pendingCountdownStartTime = 0;
    let userInfo = { avatar: '', username: 'Sen' };
    let lastServerMult = 1.00;
    let lastServerMultAt = 0;
    let lastServerTickAt = 0;
    const seenOutcomeNotices = new Set();

    const elUiMultiplier = document.getElementById('uiMultiplier');
    const elLiveTableBody = document.getElementById('liveTableBody');
    const elHistory = document.getElementById('uiHistory');
    const elHudSpeed = document.getElementById('hudSpeed');
    const elBgSpeedLayer = document.getElementById('bgSpeedLayer');
    const elHudPhase = document.getElementById('hudPhase');
    const elUiBalance = document.getElementById('uiBalance');
    const elCrashCanvas = document.getElementById('crashCanvas');

    let lastDisplayedMultStr = '';
    let lastDisplayedCountdownStr = '';
    let lastSpeedPct = -1;
    let lastHistoryHtml = '';

    function escapeHTML(str) {
        if (!str) return '';
        return String(str).replace(/[&<>'"]/g, match => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match] || match));
    }

    function formatCompactMc(value, includeUnit = true) {
        const num = Number(value) || 0;
        const abs = Math.abs(num);
        const units = [
            { limit: 1e12, suffix: 'T' },
            { limit: 1e9, suffix: 'B' },
            { limit: 1e6, suffix: 'M' },
            { limit: 1e3, suffix: 'K' }
        ];
        let text = '';
        const picked = units.find(unit => abs >= unit.limit);
        if (picked) {
            const shortVal = num / picked.limit;
            text = `${shortVal >= 100 ? shortVal.toFixed(0) : shortVal >= 10 ? shortVal.toFixed(1) : shortVal.toFixed(2)}${picked.suffix}`;
        } else {
            text = num.toLocaleString('tr-TR', { minimumFractionDigits: abs >= 100 ? 0 : 2, maximumFractionDigits: abs >= 100 ? 0 : 2 });
        }
        return includeUnit ? `${text} MC` : text;
    }

    let crashReconnectTimer = null;
    let crashConnectPromise = null;
    let crashStreamReady = false;
    let pmRealtimeSocket = null;
    let pmRealtimeBootPromise = null;
    const PM_REALTIME_PAGE_KEY = 'crash';
    const pmRealtimeMeta = { friendCounts: { incoming: 0, accepted: 0, outgoing: 0 } };

    function getBoxKey(box) { return `box${Number(box) === 2 ? 2 : 1}`; }
    function getBetInput(box) { return document.getElementById(`inpBet${Number(box) === 2 ? 2 : 1}`); }
    function getAutoInput(box) { return document.getElementById(`inpAuto${Number(box) === 2 ? 2 : 1}`); }
    function getAutoCashInput(box) { return document.getElementById(`chkAutoCash${Number(box) === 2 ? 2 : 1}`); }
    function getAutoBetInput(box) { return document.getElementById(`chkAutoBet${Number(box) === 2 ? 2 : 1}`); }
    function getActionButton(box) { return document.getElementById(`btnAction${Number(box) === 2 ? 2 : 1}`); }
    function getStatusEl(box) { return document.getElementById(`boxStatus${Number(box) === 2 ? 2 : 1}`); }

    function setButtonMode(button, mode) {
        if (!button) return;
        button.classList.toggle('btn-cashout', mode === 'cashout');
        button.classList.toggle('btn-success', mode === 'success');
        button.classList.toggle('btn-lost', mode === 'lost');
        button.classList.toggle('btn-bet', !['cashout','success','lost'].includes(mode));
    }

    function setBoxStatus(box, text, state = '') {
        const el = getStatusEl(box);
        if (!el) return;
        el.textContent = text;
        el.dataset.state = state;
    }

    function updateBetButtonLabel(box) {
        const btn = getActionButton(box);
        const input = getBetInput(box);
        if (!btn || !input) return;
        const amount = clampBetAmount(String(input.value || '0').replace(',', '.'));
        const span = btn.querySelector('span');
        if (span) span.textContent = formatCompactMc(amount);
        else btn.textContent = `MC KULLAN ${formatCompactMc(amount)}`;
    }

    function syncBetButtonAmounts() {
        [1, 2].forEach((box) => updateBetButtonLabel(box));
    }

    function updateAutoCashoutInputStates() {
        [1, 2].forEach((box) => {
            const checkbox = getAutoCashInput(box);
            const input = getAutoInput(box);
            if (!input) return;
            const enabled = !!checkbox?.checked;
            input.disabled = !enabled;
            input.closest('.auto-input-shell')?.classList.toggle('disabled', !enabled);
        });
    }

    function normalizeLocalBetForBox(box, data = {}) {
        const amount = Number(data.bet ?? data.amount ?? 0) || 0;
        return {
            uid: data.uid || uid,
            username: data.username || userInfo.username || 'Sen',
            avatar: data.avatar || userInfo.avatar || DEFAULT_AVATAR,
            selectedFrame: data.selectedFrame ?? data.frame ?? 0,
            betId: data.betId || '',
            box,
            roundId: String(data.roundId || currentRoundId || ''),
            bet: amount,
            amount,
            autoCashout: Number(data.autoCashout || 0) || 0,
            autoCashoutEnabled: !!data.autoCashoutEnabled,
            cashed: !!data.cashed,
            lost: !!data.lost,
            refunded: !!data.refunded,
            cashingOut: !!data.cashingOut,
            settlementPending: !!data.settlementPending,
            xpAwarded: Number(data.xpAwarded ?? data.xpResult?.xpAwarded ?? 0) || 0,
            xpResult: data.xpResult || null,
            win: Number(data.win || 0) || 0,
            cashoutMult: Number(data.cashoutMult || 0) || 0
        };
    }

    function getServerMultiplier(data = {}) {
        return pickNumber(data.currentMult, data.multiplier, data.crashPoint);
    }

    function getServerCountdownUntil(data = {}) {
        return pickNumber(data.startTime, data.countdownUntil, data.countdownEndsAt);
    }

    function normalizeServerBet(raw = {}) {
        const box = Number(raw.box) === 2 ? 2 : 1;
        return normalizeLocalBetForBox(box, {
            ...raw,
            uid: raw.uid || (raw.isMine ? uid : raw.playerKey),
            username: raw.isMine ? (userInfo.username || 'Sen') : (raw.username || 'Oyuncu'),
            avatar: raw.isMine ? (userInfo.avatar || raw.avatar || DEFAULT_AVATAR) : (raw.avatar || DEFAULT_AVATAR),
            win: raw.win ?? raw.winAmount ?? 0,
            amount: raw.amount ?? raw.bet ?? 0,
            bet: raw.bet ?? raw.amount ?? 0,
            roundId: raw.roundId || currentRoundId
        });
    }

    async function restoreActiveBets() {
        try {
            const payload = await api('/api/crash/resume');
            if (!payload?.ok) return;
            if (payload.roundId) currentRoundId = String(payload.roundId);
            if (payload.phase) sPhase = String(payload.phase || '').toUpperCase();
            const mult = getServerMultiplier(payload);
            if (Number.isFinite(mult)) sMult = safeFloat(mult);
            const countdownUntil = getServerCountdownUntil(payload);
            if (Number.isFinite(countdownUntil)) crashCountdownEnd = Number(countdownUntil);
            const balance = extractBalance(payload);
            if (balance !== null) {
                currentBalance = balance;
                balanceReady = true;
                if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
            }
            const bets = Array.isArray(payload.myBets) ? payload.myBets : (Array.isArray(payload.bets) ? payload.bets : []);
            bets.forEach((bet) => {
                const box = Number(bet.box) === 2 ? 2 : 1;
                myBets[getBoxKey(box)] = normalizeServerBet({ ...bet, isMine: true });
            });
            handleServerData(payload);
            updateButtons();
            updateHud();
        } catch (_) {}
    }

    function currentCashoutEstimate(bet) {
        if (!bet) return 0;
        const mult = sPhase === 'FLYING' ? Math.max(1, Number(sMult) || 1) : 1;
        return safeFloat((Number(bet.bet ?? bet.amount) || 0) * mult);
    }

    function updateButtons() {
        [1, 2].forEach((box) => {
            const boxKey = getBoxKey(box);
            const btn = getActionButton(box);
            const bet = myBets[boxKey];
            if (!btn) return;
            const amount = clampBetAmount(getBetInput(box)?.value || 0);
            const amountLabel = formatCompactMc(amount);
            const insufficientBalance = balanceReady && amount > currentBalance;
            btn.disabled = false;
            btn.classList.toggle('is-processing', !!isProcessing[boxKey]);
            btn.classList.toggle('is-insufficient', !!insufficientBalance);
            if (isProcessing[boxKey]) {
                setButtonMode(btn, bet && !bet.cashed && sPhase === 'FLYING' ? 'cashout' : 'bet');
                btn.innerHTML = `İŞLENİYOR <span>Lütfen bekle</span>`;
                btn.disabled = true;
                setBoxStatus(box, 'İşlemde', 'processing');
                return;
            }
            if (bet && String(bet.roundId || '') === String(currentRoundId || '') && bet.cashed) {
                setButtonMode(btn, 'success');
                const mult = Number(bet.cashoutMult || 0) || 0;
                const xp = Number(bet.xpAwarded ?? bet.xpResult?.xpAwarded ?? 0) || 0;
                btn.innerHTML = `ÇIKIŞ ALINDI <span>${mult > 0 ? mult.toFixed(2) + 'x' : ''}${xp > 0 ? ` • +${xp} XP` : ''}</span>`;
                btn.disabled = true;
                setBoxStatus(box, bet.settlementPending ? 'Bakiye işleniyor' : 'Çıkış alındı', bet.settlementPending ? 'processing' : 'ready');
                return;
            }
            if (bet && String(bet.roundId || '') === String(currentRoundId || '') && bet.lost) {
                setButtonMode(btn, 'lost');
                const xp = Number(bet.xpAwarded ?? bet.xpResult?.xpAwarded ?? 0) || 0;
                btn.innerHTML = `KAYBETTİ <span>${xp > 0 ? `+${xp} XP` : 'Tur kapandı'}</span>`;
                btn.disabled = true;
                setBoxStatus(box, 'Tur kaybedildi', 'closed');
                return;
            }

            if (bet && !bet.cashed && !bet.refunded && String(bet.roundId || '') === String(currentRoundId || '')) {
                if (sPhase === 'FLYING') {
                    setButtonMode(btn, 'cashout');
                    btn.innerHTML = `ÇIKIŞ AL <span>${formatCompactMc(currentCashoutEstimate(bet))}</span>`;
                    setBoxStatus(box, `${safeFloat(sMult).toFixed(2)}x aktif`, 'flying');
                } else if (sPhase === 'COUNTDOWN') {
                    setButtonMode(btn, 'bet');
                    btn.innerHTML = `TURA KATILDIN <span>${formatCompactMc(bet.bet ?? bet.amount)}</span>`;
                    btn.disabled = true;
                    setBoxStatus(box, 'Tur bekleniyor', 'locked');
                } else {
                    setButtonMode(btn, 'bet');
                    btn.innerHTML = `SONUÇ BEKLENİYOR <span>${formatCompactMc(bet.bet ?? bet.amount)}</span>`;
                    btn.disabled = true;
                    setBoxStatus(box, 'Tur kapandı', 'closed');
                }
                return;
            }

            setButtonMode(btn, 'bet');
            btn.innerHTML = `MC KULLAN <span>${amountLabel}</span>`;

            if (!balanceReady) {
                btn.disabled = true;
                setBoxStatus(box, 'Bakiye doğrulanıyor', 'waiting');
                return;
            }

            if (insufficientBalance) {
                btn.disabled = true;
                setBoxStatus(box, 'Bakiye yetersiz', 'closed');
                return;
            }

            if (sPhase !== 'COUNTDOWN') {
                btn.disabled = true;
                setBoxStatus(box, sPhase === 'FLYING' ? 'Tur başladı' : 'Bekleniyor', 'waiting');
                return;
            }

            setBoxStatus(box, 'Hazır', 'ready');
        });
    }

    function bindQuickButtons() {
        document.querySelectorAll('.chip-btn,.step-btn').forEach((btn) => {
            if (btn.__pmCrashBound) return;
            btn.__pmCrashBound = true;
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const input = targetId ? document.getElementById(targetId) : null;
                if (!input) return;
                const current = clampBetAmount(String(input.value || '0').replace(',', '.'));
                let next = current;
                switch (btn.dataset.op) {
                    case 'minus10': next = Math.max(1, current - 10); break;
                    case 'plus1': next = current + 1; break;
                    case 'plus10': next = current + 10; break;
                    case 'plus100': next = current + 100; break;
                    case 'double': next = current * 2; break;
                    case 'half': next = Math.max(1, current / 2); break;
                    case 'max': next = currentBalance >= CRASH_MIN_BET ? Math.max(CRASH_MIN_BET, Math.min(CRASH_MAX_BET, Math.trunc(currentBalance))) : CRASH_MIN_BET; break;
                    default: next = current;
                }
                input.value = clampBetAmount(next);
                syncBetButtonAmounts();
                updateButtons();
            });
        });

        [1, 2].forEach((box) => {
            const btn = getActionButton(box);
            if (!btn || btn.__pmCrashActionBound) return;
            btn.__pmCrashActionBound = true;
            btn.addEventListener('click', () => handleBetAction(box));
        });
    }

    async function handleBetAction(box) {
        const boxKey = getBoxKey(box);
        if (isProcessing[boxKey]) return;
        const activeBet = myBets[boxKey];
        try {
            isProcessing[boxKey] = true;
            updateButtons();
            if (activeBet && !activeBet.cashed && sPhase === 'FLYING') await cashOut(box);
            else await placeBet(box);
        } catch (error) {
            showCrashNotice({ type: 'error', title: 'İşlem başarısız', message: error?.message || 'İşlem tamamlanamadı.', scope: `box${box}` });
        } finally {
            isProcessing[boxKey] = false;
            updateButtons();
        }
    }

    async function placeBet(box, silent = false) {
        if (sPhase !== 'COUNTDOWN') throw new Error('Katılım penceresi kapalı.');
        const boxKey = getBoxKey(box);
        if (myBets[boxKey] && String(myBets[boxKey].roundId || '') === String(currentRoundId || '')) return;
        const amount = clampBetAmount(getBetInput(box)?.value || 0);
        if (!balanceReady) throw new Error('Bakiye doğrulanmadan bahis alınamaz.');
        if (amount > currentBalance) throw new Error('Bakiye yetersiz.');
        const autoCashEnabled = !!getAutoCashInput(box)?.checked;
        const autoCashout = autoCashEnabled ? clampAutoCashout(getAutoInput(box)?.value || 0) : 0;
        const payload = await api('/api/crash/bet', 'POST', { box, amount, autoCashout });
        if (!payload?.ok) throw new Error(payload?.error || 'Bahis alınamadı.');
        if (payload.roundId) currentRoundId = String(payload.roundId);
        myBets[boxKey] = normalizeServerBet({ ...(payload.bet || {}), isMine: true, box, roundId: payload.roundId || currentRoundId, amount, autoCashout, autoCashoutEnabled: autoCashEnabled });
        const balance = extractBalance(payload);
        if (balance !== null) currentBalance = balance;
        try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.({ ...payload, balance: currentBalance }); } catch (_) {}
        if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        if (!silent) showCrashNotice({ type: 'success', title: 'Bahis alındı', message: `${formatCompactMc(amount)} tura işlendi.`, scope: `box${box}` });
        if (typeof pmRtEmitCrashBetPresence === 'function') pmRtEmitCrashBetPresence(amount);
        updateButtons();
    }

    function applyCrashProgressionFromPayload(payload = {}, { animate = true } = {}) {
        const progression = payload?.progression || payload?.xpResult?.progression || payload?.resultSummary?.xpResult?.progression;
        if (!progression || typeof progression !== 'object') return;
        applyCrashProgression({ progression, accountLevel: progression.accountLevel ?? progression.level, accountLevelProgressPct: progression.accountLevelProgressPct ?? progression.progressPercent }, { animate });
    }

    function showCrashResultSummary(summary, { box = 0 } = {}) {
        if (!summary || typeof summary !== 'object') return;
        const xp = summary.xpResult || null;
        const message = summary.message || 'Tur sonucu işlendi.';
        showCrashNotice({ type: summary.type === 'loss' ? 'loss' : 'cashout', title: summary.type === 'loss' ? 'Tur sonucu' : 'Kazanç', message, scope: box ? `box${box}` : 'hud', duration: 5200 });
        if (xp?.xpAwarded > 0) {
            showCrashNotice({ type: 'xp', title: 'XP', message: `+${xp.xpAwarded} XP hesabına işlendi.`, scope: 'hud', duration: 5200 });
        } else if (xp?.reason === 'MANUAL_CASHOUT_BELOW_1_50_NO_XP') {
            showCrashNotice({ type: 'warning', title: 'XP verilmedi', message: 'Manuel çıkışta XP için minimum 1.50x gerekir.', scope: 'hud', duration: 5600 });
        }
    }

    async function cashOut(box) {
        const boxKey = getBoxKey(box);
        const bet = myBets[boxKey];
        if (!bet || bet.cashed) return;
        showCrashNotice({ type: 'system', title: 'Çıkış', message: 'Bozdurma isteği sunucuya gönderildi.', scope: `box${box}`, duration: 2200 });
        const payload = await api('/api/crash/cashout', 'POST', { box });
        if (!payload?.ok) throw new Error(payload?.error || 'Çıkış alınamadı.');
        const serverBet = payload.bet ? normalizeServerBet({ ...payload.bet, isMine: true }) : null;
        const targetBet = serverBet || bet;
        targetBet.cashed = true;
        targetBet.win = Number(payload.winAmount ?? targetBet.win ?? 0) || 0;
        targetBet.cashoutMult = Number(payload.cashoutMult ?? targetBet.cashoutMult ?? sMult) || sMult;
        myBets[boxKey] = targetBet;
        const balance = extractBalance(payload);
        if (balance !== null) currentBalance = balance;
        try { window.__PM_GAME_ACCOUNT_SYNC__?.notifyMutation?.({ ...payload, balance: currentBalance, winAmount: targetBet.win, cashoutMult: targetBet.cashoutMult }); } catch (_) {}
        if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        window.showWinStrip?.(userInfo.avatar || DEFAULT_AVATAR, userInfo.username || 'Sen', targetBet.cashoutMult, targetBet.win);
        applyCrashProgressionFromPayload(payload, { animate: true });
        showCrashResultSummary(payload.resultSummary, { box });
        playCrashSfx('win');
        updateButtons();
    }

    async function checkAutoBets() {
        if (sPhase !== 'COUNTDOWN' || !currentRoundId || !uid) return;
        for (const box of [1, 2]) {
            const boxKey = getBoxKey(box);
            const autoBet = getAutoBetInput(box);
            if (!autoBet?.checked) continue;
            if (autoBetPlacedForRound[boxKey] === currentRoundId) continue;
            if (myBets[boxKey] && String(myBets[boxKey].roundId || '') === String(currentRoundId)) continue;
            autoBetPlacedForRound[boxKey] = currentRoundId;
            placeBet(box, true).catch((error) => {
                autoBetPlacedForRound[boxKey] = null;
                showCrashNotice({ type: 'error', title: 'Otomatik bahis', message: error?.message || 'Otomatik bahis alınamadı.', scope: `box${box}` });
            });
        }
    }

    function historyMultiplier(item) {
        if (item && typeof item === 'object') return pickNumber(item.multiplier, item.currentMult, item.crashPoint) ?? 0;
        return Number(item) || 0;
    }

    function renderHistory(history = []) {
        if (!elHistory) return;
        const normalized = (Array.isArray(history) ? history : []).slice(0, 20).map(historyMultiplier).filter((value) => Number.isFinite(value) && value > 0);
        const html = normalized.map((mult) => {
            const cls = mult < 2 ? 'hist-red' : mult >= 10 ? 'hist-gold' : 'hist-green';
            return `<span class="hist-pill ${cls}">${safeFloat(mult).toFixed(2)}x</span>`;
        }).join('');
        if (html !== lastHistoryHtml) {
            elHistory.innerHTML = html;
            lastHistoryHtml = html;
        }
    }

    function syncMyBetsFromActivePlayers(activePlayers = []) {
        if (!Array.isArray(activePlayers) || !uid) return;
        const seen = new Set();
        activePlayers.forEach((player) => {
            if (!player?.isMine) return;
            const box = Number(player.box || (String(player.betId || '').endsWith('_2') ? 2 : 1)) === 2 ? 2 : 1;
            const boxKey = getBoxKey(box);
            seen.add(boxKey);
            myBets[boxKey] = normalizeServerBet({ ...player, isMine: true, roundId: player.roundId || currentRoundId });
        });
        if (sPhase === 'COUNTDOWN') {
            [1, 2].forEach((box) => {
                const boxKey = getBoxKey(box);
                if (!seen.has(boxKey) && myBets[boxKey]?.roundId !== currentRoundId) myBets[boxKey] = null;
            });
        }
    }

    function maybeShowOutcomeNotice(player = {}) {
        if (!player?.isMine) return;
        const box = Number(player.box) === 2 ? 2 : 1;
        const keyBase = `${player.roundId || currentRoundId}:${box}`;
        const xp = player.xpResult || null;
        if (player.cashed) {
            const key = `${keyBase}:cashed:${player.cashoutMult || 0}:${xp?.xpAwarded || 0}`;
            if (seenOutcomeNotices.has(key)) return;
            seenOutcomeNotices.add(key);
            const mult = Number(player.cashoutMult || 0) || 0;
            const win = Number(player.win ?? player.winAmount ?? 0) || 0;
            const xpText = xp?.xpAwarded > 0 ? ` • +${xp.xpAwarded} XP` : (xp?.reason === 'MANUAL_CASHOUT_BELOW_1_50_NO_XP' ? ' • XP için minimum 1.50x gerekir' : '');
            showCrashNotice({ type: 'cashout', title: 'Çıkış alındı', message: `${mult.toFixed(2)}x • +${formatCompactMc(win)}${xpText}`, scope: `box${box}`, duration: 5600 });
            if (xp?.progression) applyCrashProgressionFromPayload({ xpResult: xp }, { animate: true });
            return;
        }
        if (player.lost) {
            const key = `${keyBase}:lost:${xp?.xpAwarded || 0}`;
            if (seenOutcomeNotices.has(key)) return;
            seenOutcomeNotices.add(key);
            const xpText = xp?.xpAwarded > 0 ? ` +${xp.xpAwarded} XP işlendi.` : ' XP oluşmadı.';
            showCrashNotice({ type: 'loss', title: 'Tur patladı', message: `Bahis kaybedildi.${xpText}`, scope: `box${box}`, duration: 5600 });
            if (xp?.progression) applyCrashProgressionFromPayload({ xpResult: xp }, { animate: true });
        }
    }

    function renderLiveTable(activePlayers = []) {
        if (!elLiveTableBody) return;
        const rows = (Array.isArray(activePlayers) ? activePlayers : [])
            .slice()
            .sort((a, b) => (Number(b.win || b.winAmount || 0) - Number(a.win || a.winAmount || 0)) || (Number(b.bet || b.amount || 0) - Number(a.bet || a.amount || 0)))
            .slice(0, 80);
        const signature = JSON.stringify(rows.map((p) => [p.playerKey, p.isMine, p.username, p.bet ?? p.amount, p.cashed, p.cashoutMult, p.win ?? p.winAmount]));
        if (signature === lastRenderedTableData) return;
        lastRenderedTableData = signature;
        if (elLiveBetCount) elLiveBetCount.innerHTML = `<i class="fa-solid fa-user"></i>${rows.length} oyuncu`;
        if (elLiveCashoutCount) elLiveCashoutCount.innerHTML = `<i class="fa-solid fa-user"></i>${rows.filter((p) => p.cashed).length} çıkış aldı`;
        const fragment = document.createDocumentFragment();
        const makeCell = (className, text) => {
            const node = document.createElement('div');
            node.className = className;
            node.textContent = text;
            return node;
        };
        if (!rows.length) {
            const empty = document.createElement('div');
            empty.className = 'table-row';
            const user = document.createElement('div');
            user.className = 't-user';
            const meta = document.createElement('div');
            meta.className = 't-meta';
            meta.append(makeCell('t-name', 'Tur bekleniyor'), makeCell('t-tier', 'Henüz bahis yok'));
            user.appendChild(meta);
            empty.append(user, makeCell('t-bet', '-'), makeCell('t-mult', '-'), makeCell('t-win', '-'));
            fragment.appendChild(empty);
        } else {
            rows.forEach((player) => {
                const amount = Number(player.bet ?? player.amount ?? 0) || 0;
                const mult = Number(player.cashoutMult || 0) || 0;
                const win = Number(player.win ?? player.winAmount ?? 0) || 0;
                const name = player.isMine ? (userInfo.username || 'Sen') : (player.username || 'Oyuncu');
                const row = document.createElement('div');
                row.className = `table-row ${player.cashed ? 'row-cashed' : ''}`.trim();
                const user = document.createElement('div');
                user.className = 't-user';
                const avatarHost = document.createElement('div');
                avatarHost.innerHTML = renderCrashAvatar(player, player.avatar || DEFAULT_AVATAR);
                const meta = document.createElement('div');
                meta.className = 't-meta';
                meta.append(makeCell('t-name', name), makeCell('t-tier', player.isMine ? 'SEN' : 'OYUNCU'));
                user.append(avatarHost.firstElementChild || document.createTextNode(''), meta);
                row.append(
                    user,
                    makeCell('t-bet', formatCompactMc(amount)),
                    makeCell('t-mult', mult > 0 ? `${safeFloat(mult).toFixed(2)}x` : '-'),
                    makeCell('t-win', win > 0 ? '+' + formatCompactMc(win) : '-')
                );
                fragment.appendChild(row);
            });
        }
        elLiveTableBody.replaceChildren(fragment);
    }

    function updateHud() {
        const phaseMap = { COUNTDOWN: 'GERİ SAYIM', FLYING: 'UÇUŞTA', CRASHED: 'PATLADI' };
        const phaseText = phaseMap[sPhase] || 'BAĞLANILIYOR';
        if (elUiPhase) elUiPhase.textContent = phaseText;
        if (elHudPhase) elHudPhase.textContent = phaseText;
        if (elUiMultiplier) {
            elUiMultiplier.classList.toggle('val-flying', sPhase === 'FLYING');
            elUiMultiplier.classList.toggle('val-crashed', sPhase === 'CRASHED');
            elUiMultiplier.classList.toggle('val-countdown', sPhase === 'COUNTDOWN');
        }
        if (sPhase === 'COUNTDOWN') {
            const remaining = Math.max(0, Math.ceil((crashCountdownEnd - nowServer()) / 1000));
            const text = remaining > 0 ? `${remaining}` : '0';
            if (text !== lastDisplayedCountdownStr) {
                if (elUiMultiplier) elUiMultiplier.textContent = text;
                lastDisplayedCountdownStr = text;
                lastDisplayedMultStr = '';
            }
        } else {
            const text = `${safeFloat(sMult).toFixed(2)}x`;
            if (text !== lastDisplayedMultStr) {
                if (elUiMultiplier) elUiMultiplier.textContent = text;
                lastDisplayedMultStr = text;
                lastDisplayedCountdownStr = '';
            }
        }
        const speedPct = Math.max(0, Math.min(100, Math.round((Math.max(1, Number(sMult) || 1) - 1) * 18)));
        if (speedPct !== lastSpeedPct) {
            if (elHudSpeed) elHudSpeed.textContent = `${speedPct}%`;
            if (elBgSpeedLayer) elBgSpeedLayer.style.opacity = String(Math.min(0.85, speedPct / 100));
            lastSpeedPct = speedPct;
        }
        updateButtons();
    }

    function drawCrashCanvas() {
        if (!elCrashCanvas) return;
        const rect = elCrashCanvas.getBoundingClientRect();
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const width = Math.max(1, Math.floor(rect.width * dpr));
        const height = Math.max(1, Math.floor(rect.height * dpr));
        if (elCrashCanvas.width !== width || elCrashCanvas.height !== height) {
            elCrashCanvas.width = width;
            elCrashCanvas.height = height;
        }
        const ctx = elCrashCanvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.scale(dpr, dpr);
        const w = rect.width;
        const h = rect.height;
        ctx.globalAlpha = 0.28;
        ctx.strokeStyle = 'rgba(255,255,255,.14)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= w; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = 0; y <= h; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        const progress = sPhase === 'COUNTDOWN' ? 0 : Math.max(0.08, Math.min(1, Math.log(Math.max(1, sMult)) / Math.log(120)));
        const startX = Math.max(24, w * 0.08);
        const baseY = Math.max(40, h * 0.78);
        const endX = startX + (w * 0.78 * progress);
        const endY = baseY - (h * 0.55 * Math.pow(progress, 0.82));
        const gradient = ctx.createLinearGradient(startX, baseY, endX, endY);
        gradient.addColorStop(0, 'rgba(255,191,87,.18)');
        gradient.addColorStop(1, sPhase === 'CRASHED' ? 'rgba(255,80,80,.95)' : 'rgba(255,183,75,.95)');
        ctx.globalAlpha = 1;
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(startX, baseY);
        ctx.quadraticCurveTo(startX + (endX - startX) * 0.48, baseY - h * 0.08 - h * 0.20 * progress, endX, endY);
        ctx.stroke();
        ctx.fillStyle = sPhase === 'CRASHED' ? 'rgba(255,80,80,.95)' : 'rgba(255,198,83,.95)';
        ctx.beginPath();
        ctx.arc(endX, endY, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function startCanvasLoop() {
        if (canvasLoopActive) return;
        canvasLoopActive = true;
        const loop = () => {
            if (!canvasLoopActive) return;
            if (document.visibilityState === 'visible') drawCrashCanvas();
            canvasFrameId = window.requestAnimationFrame(loop);
        };
        canvasFrameId = window.requestAnimationFrame(loop);
    }

    function stopCanvasLoop() {
        canvasLoopActive = false;
        if (canvasFrameId) {
            window.cancelAnimationFrame(canvasFrameId);
            canvasFrameId = 0;
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            startCanvasLoop();
            drawCrashCanvas();
        }
    });

    startCanvasLoop();

    function handleRoundBoundary(nextRoundId) {
        const next = String(nextRoundId || '');
        if (!next || next === String(currentRoundId || '')) return;
        previousRoundId = currentRoundId;
        currentRoundId = next;
        myBets = { box1: null, box2: null };
        autoBetPlacedForRound = { box1: null, box2: null };
    }

    function getActivePlayersFromPayload(data = {}) {
        if (Array.isArray(data.activePlayers)) return data.activePlayers;
        if (Array.isArray(data.activeBets)) return data.activeBets;
        return [];
    }

    function handleServerData(data = {}) {
        if (Number.isFinite(Number(data.serverNow))) serverTimeOffsetMs = Number(data.serverNow) - Date.now();
        if (data.roundId) handleRoundBoundary(data.roundId);
        if (data.phase) {
            const oldPhase = sPhase;
            sPhase = String(data.phase || '').toUpperCase();
            if (oldPhase !== sPhase) {
                if (sPhase === 'FLYING') playCrashSfx('launch');
                if (sPhase === 'CRASHED') playCrashSfx('crash');
            }
        }
        const mult = getServerMultiplier(data);
        if (Number.isFinite(mult)) sMult = safeFloat(mult);
        const countdownUntil = getServerCountdownUntil(data);
        if (Number.isFinite(countdownUntil)) {
            localStartTime = Number(countdownUntil);
            if (sPhase === 'COUNTDOWN') crashCountdownEnd = Number(countdownUntil);
        }
        if (Array.isArray(data.history)) renderHistory(data.history);
        const activePlayers = getActivePlayersFromPayload(data);
        if (activePlayers.length || Array.isArray(data.activePlayers) || Array.isArray(data.activeBets)) {
            syncMyBetsFromActivePlayers(activePlayers);
            activePlayers.forEach(maybeShowOutcomeNotice);
            renderLiveTable(activePlayers);
        }
        updateHud();
        if (sPhase === 'COUNTDOWN') checkAutoBets();
    }

    function handleTick(data = {}) {
        if (Number.isFinite(Number(data.serverNow))) serverTimeOffsetMs = Number(data.serverNow) - Date.now();
        if (data.roundId) handleRoundBoundary(data.roundId);
        if (data.phase) sPhase = String(data.phase || '').toUpperCase();
        const mult = getServerMultiplier(data);
        if (Number.isFinite(mult)) {
            sMult = safeFloat(mult);
            lastServerMult = sMult;
            lastServerMultAt = Date.now();
            lastServerTickAt = Number(data.serverNow || nowServer());
        }
        const countdownUntil = getServerCountdownUntil(data);
        if (Number.isFinite(countdownUntil)) {
            localStartTime = Number(countdownUntil);
            if (sPhase === 'COUNTDOWN') crashCountdownEnd = Number(countdownUntil);
        }
        updateHud();
        if (sPhase === 'COUNTDOWN') checkAutoBets();
    }

    function pmRtNormalizeGameKey(value = '') {
        const raw = String(value || '').trim().toLowerCase();
        if (raw.includes('sat') || raw.includes('chess')) return 'chess';
        if (raw.includes('pist')) return 'pisti';
        if (raw.includes('crash')) return 'crash';
        return '';
    }

    function pmRtGameHref(gameKey = '', roomId = '') {
        const safeRoomId = encodeURIComponent(String(roomId || '').trim());
        if (gameKey === 'chess') return `/games/chess?room=${safeRoomId}`;
        if (gameKey === 'pisti') return `/games/pisti?room=${safeRoomId}`;
        return '/games/crash';
    }

    function pmRtSetPendingJoin(gameKey = '', roomId = '') {
        try { sessionStorage.setItem('pm_pending_join', JSON.stringify({ gameKey, roomId, ts: Date.now() })); } catch (_) {}
    }

    function pmRtEscape(value = '') { return escapeHTML(value); }

    function pmRtToast(title = '', message = '', tone = 'info') {
        const text = `${message || ''}`.trim();
        if (title || text) showCrashNotice({ type: tone === 'error' ? 'error' : tone === 'success' ? 'invite' : 'info', title, message: text, scope: 'hud', duration: 4600 });
        return { tone };
    }

    function pmRtEnsureShell() {
        let modal = document.getElementById('pmRealtimeInviteModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'pmRealtimeInviteModal';
            modal.className = 'pmg-rt-modal';
            modal.innerHTML = '<div class="pmg-rt-card"></div>';
            document.body.appendChild(modal);
        }
        return { modal, card: modal.querySelector('.pmg-rt-card') || modal };
    }

    function pmRtCloseModal() {
        const modal = document.getElementById('pmRealtimeInviteModal');
        modal?.classList.remove('show');
    }

    function pmRtPrompt({ title = 'Onay', message = '', confirmText = 'Tamam', cancelText = 'Vazgeç' } = {}) {
        return Promise.resolve(window.confirm(`${title}\n\n${message}\n\n${confirmText} / ${cancelText}`));
    }

    function updateBal() {
        return fetchBootProfile().catch(() => {
            balanceReady = false;
            updateButtons();
            return null;
        });
    }

    function startBalanceRefreshLoop() {
        if (balanceRefreshTimer) return;
        balanceRefreshTimer = setInterval(() => {
            if (document.visibilityState === 'visible' && auth.currentUser) updateBal();
        }, 12000);
    }


function scheduleCrashReconnect(delayMs = 1200) {
    clearTimeout(crashReconnectTimer);
    crashReconnectTimer = setTimeout(() => {
        connectStream().catch(() => null);
    }, delayMs);
}

async function connectStream() {
    if (crashConnectPromise) return crashConnectPromise;
    crashConnectPromise = (async () => {
        if (socket && socket.connected) {
            try { socket.emit('crash:subscribe'); } catch (_) {}
            return socket;
        }
        socket = await core.createAuthedSocket(socket, { transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 8, timeout: 6000 });

        if (!socket.__pmCrashStreamBound) {
            socket.__pmCrashStreamBound = true;
            socket.on('crash:update', (d) => {
                crashStreamReady = true;
                renderCrashRuntimeNotice('');
                if (d.type === 'TICK') handleTick(d); else handleServerData(d);
            });

            socket.on('connect', () => {
                crashStreamReady = true;
                try { socket.emit('crash:subscribe'); } catch (_) {}
                renderCrashRuntimeNotice('');
            });

            socket.on('connect_error', () => {
                crashStreamReady = false;
                renderCrashRuntimeNotice('Canlı akış şu an kurulamıyor. Socket.IO otomatik olarak yeniden bağlanacak.', 'warning', 'Tekrar Dene', () => connectStream().catch(() => null));
            });

            socket.on('disconnect', () => {
                crashStreamReady = false;
                renderCrashRuntimeNotice('Canlı akış bağlantısı geçici olarak koptu. Socket.IO otomatik olarak yeniden bağlanıyor.', 'warning', 'Tekrar Dene', () => connectStream().catch(() => null));
            });
        }

        try { socket.emit('crash:subscribe'); } catch (_) {}
        return socket;
    })().finally(() => {
        crashConnectPromise = null;
    });

    return crashConnectPromise;
}

let crashUiStarted = false;

async function startApp(skipConnect = false) {
    if (!auth.currentUser) throw new Error('NO_USER');
    uid = auth.currentUser.uid;
    startBalanceRefreshLoop();
    updateBal();
    if (!crashUiStarted) {
        bindQuickButtons();
        syncBetButtonAmounts();
        setupAutoModeBindings();
        crashUiStarted = true;
    }
    updateAutoCashoutInputStates();
    await restoreActiveBets().catch(() => null);
    updateHud();
    if (!skipConnect) {
        scheduleCrashReconnect(100);
    }
}

async function api(endpoint, method='GET', body=null, attempt = 0) {
    return core.requestWithAuth(endpoint, { method, body, timeoutMs: 8000, retries: attempt === 0 ? 1 : 0 });
}


async function pmRtLoadSocketScript() {
    await ensureSocketClientReady();
    return window.io;
}

async function pmRtRequest(endpoint, method = 'GET', body = null) {
    let payload = null;

    if (typeof api === 'function') {
        payload = await api(endpoint, method, body);
    } else {
        throw new Error('REQUEST_HELPER_UNAVAILABLE');
    }

    if (payload?.ok === false) {
        const error = new Error(payload?.error || 'İstek işlenemedi.');
        error.code = payload?.code || 'REQUEST_FAILED';
        throw error;
    }

    return payload;
}

async function pmRtRefreshFriendCounts(silent = true) {
    if (!auth.currentUser) return;
    try {
        const payload = await pmRtRequest('/api/friends/list');
        const counts = payload?.counts || {};
        const nextIncoming = Number(counts.incoming || 0);
        if (!silent && nextIncoming > Number(pmRealtimeMeta.friendCounts.incoming || 0)) {
            pmRtToast('Yeni arkadaşlık isteği', 'Sosyal merkezde bekleyen yeni bir istek oluştu.', 'info', { iconClass: 'fa-user-plus' });
        }
        pmRealtimeMeta.friendCounts = {
            incoming: nextIncoming,
            accepted: Number(counts.accepted || 0),
            outgoing: Number(counts.outgoing || 0)
        };
    } catch (_) {}
}

async function pmRtMaybeConfirmExit() {
    if (PM_REALTIME_PAGE_KEY !== 'crash') return true;
    try {
        const payload = await pmRtRequest('/api/crash/active-bets');
        const activeBets = Array.isArray(payload?.bets) ? payload.bets : [];
        if (!payload?.hasActiveBet && !activeBets.length) return true;
        return await pmRtPrompt({
            title: 'Aktif Crash Bahsi',
            message: 'Davet kabul edilirse aktif Crash bahsin backend tarafından iade edilir ve turdan güvenli şekilde çıkarılırsın.',
            confirmText: 'İade Et ve Geç',
            cancelText: 'Kal',
            iconClass: 'fa-bolt'
        });
    } catch (_) {
        return true;
    }
}

async function pmRtBeforeRedirect() {
    if (PM_REALTIME_PAGE_KEY !== 'crash') return true;
    try {
        const payload = await pmRtRequest('/api/crash/refund-active', 'POST', {});
        const balance = extractBalance(payload);
        if (balance !== null) {
            currentBalance = balance;
            balanceReady = true;
            if (elUiBalance) elUiBalance.innerText = currentBalance.toLocaleString('tr-TR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        }
        myBets = { box1: null, box2: null };
        updateButtons();
        if (Number(payload?.refunded || 0) > 0) showCrashNotice({ type: 'success', title: 'İade', message: `Crash bahsin iade edildi: ${formatCompactMc(payload.refunded)}`, scope: 'hud' });
    } catch (error) {
        showCrashNotice({ type: 'error', title: 'İade hatası', message: error?.message || 'Crash bahsi iade edilirken hata oluştu.', scope: 'hud' });
        throw error;
    }
    return true;
}

async function pmRtHandleInviteResponse(data, response) {
    try {
        if (!data?.inviteId) return;
        const gameKey = pmRtNormalizeGameKey(data.gameKey);
        const roomId = String(data.roomId || '').trim();
        if (!gameKey || !roomId) throw new Error('Davet verisi eksik.');

        if (response === 'accepted') {
            const canContinue = await pmRtMaybeConfirmExit();
            if (!canContinue) return;
            await pmRtBeforeRedirect();
            const joinEndpoint = gameKey === 'pisti' ? '/api/pisti-online/join' : '/api/chess/join';
            await pmRtRequest(joinEndpoint, 'POST', { roomId });
        }

        if (pmRealtimeSocket) {
            pmRealtimeSocket.emit('game:invite_response', {
                inviteId: data.inviteId,
                hostUid: data.hostUid,
                roomId,
                gameKey,
                response
            });
        }

        pmRtCloseModal();

        if (response === 'accepted') {
            pmRtSetPendingJoin(gameKey, roomId);
            pmRtToast('Oyuna geçiliyor', `${data.hostName || 'Arkadaşın'} ile ${gameKey === 'pisti' ? 'Pişti' : 'Satranç'} masasına bağlanıyorsun.`, 'success', { iconClass: 'fa-arrow-right' });
            window.setTimeout(() => window.location.replace(pmRtGameHref(gameKey, roomId)), 220);
        } else {
            pmRtToast('Davet kapatıldı', `${data.hostName || 'Arkadaşın'} için gönderilen davet reddedildi.`, 'info', { iconClass: 'fa-xmark' });
        }
    } catch (error) {
        pmRtToast('Davet başarısız', error?.message || 'Odaya katılım sağlanamadı.', 'error');
    }
}

function pmRtShowInviteModal(payload) {
    if (!payload?.inviteId) return;
    const { modal, card } = pmRtEnsureShell();
    card.innerHTML = `
        <div class="pmg-rt-badge"><i class="fa-solid fa-gamepad"></i></div>
        <h3>Canlı Oyun Daveti</h3>
        <p><strong>${pmRtEscape(payload.hostName || 'Arkadaşın')}</strong> seni <strong>${pmRtEscape(payload.gameName || 'oyuna')}</strong> çağırıyor. Kabul edersen lobiye uğramadan doğrudan oyun masasına geçeceksin.</p>
        <div class="pmg-rt-actions">
            <button class="pmg-rt-btn" type="button" data-action="decline">Reddet</button>
            <button class="pmg-rt-btn primary" type="button" data-action="accept">Kabul Et</button>
        </div>
    `;
    card.querySelector('[data-action="decline"]').addEventListener('click', () => pmRtHandleInviteResponse(payload, 'declined'), { passive: true });
    card.querySelector('[data-action="accept"]').addEventListener('click', () => pmRtHandleInviteResponse(payload, 'accepted'), { passive: true });
    modal.classList.add('show');
}

function pmRtEmitCrashBetPresence(amount) {
    if (typeof pmRealtimeSocket !== 'undefined' && pmRealtimeSocket && pmRealtimeSocket.connected) {
        pmRealtimeSocket.emit('social:set_presence', {
            status: 'IN_GAME',
            activity: `Crash Oynuyor (${Number(amount || 0).toLocaleString('tr-TR')} MC)`
        });
    }
}

async function pmRtHandleInviteAcceptedRedirect(payload) {
    try {
        const gameKey = pmRtNormalizeGameKey(payload?.gameKey);
        const roomId = String(payload?.roomId || '').trim();
        if (!gameKey || !roomId) return;
        if (payload?.hostUid && auth.currentUser?.uid && String(payload.hostUid) !== String(auth.currentUser.uid)) return;
        await pmRtBeforeRedirect();
        pmRtSetPendingJoin(gameKey, roomId);
        pmRtToast('Oyuna geçiliyor', `${payload?.guestName || 'Arkadaşın'} ile ${gameKey === 'pisti' ? 'Pişti' : 'Satranç'} masasına bağlanıyorsun.`, 'success', { iconClass: 'fa-arrow-right' });
        window.setTimeout(() => window.location.replace(pmRtGameHref(gameKey, roomId)), 220);
    } catch (error) {
        pmRtToast('Davet yönlendirme hatası', error?.message || 'Oyun odası açılamadı.', 'error');
    }
}

function pmRtBindSocketEvents(sock) {
    if (!sock || sock.__pmRealtimeBound) return sock;
    sock.__pmRealtimeBound = true;
    pmRealtimeSocket = sock;

    sock.on('chat:direct_receive', (payload) => {
        pmRtToast(payload?.username || 'Yeni özel mesaj', payload?.message || 'Bir özel mesaj aldın.', 'info', { iconClass: 'fa-envelope' });
    });

    sock.on('friends:updated', () => {
        pmRtRefreshFriendCounts(true).catch(() => null);
    });

    sock.on('friends:request_received', () => {
        pmRtToast('Arkadaşlık isteği', 'Yeni bir arkadaşlık isteği geldi.', 'info', { iconClass: 'fa-user-plus' });
        pmRtRefreshFriendCounts(true).catch(() => null);
    });

    sock.on('friends:request_result', (payload) => {
        pmRtToast(
            'Arkadaşlık güncellendi',
            payload?.accepted ? 'Gönderdiğin istek kabul edildi.' : 'Gönderdiğin istek reddedildi.',
            payload?.accepted ? 'success' : 'info',
            { iconClass: payload?.accepted ? 'fa-user-check' : 'fa-user-xmark' }
        );
        pmRtRefreshFriendCounts(true).catch(() => null);
    });

    sock.on('friends:request_auto_accepted', () => {
        pmRtToast('Arkadaş eklendi', 'Karşılıklı istek bulundu ve arkadaşlık anında kuruldu.', 'success', { iconClass: 'fa-user-group' });
        pmRtRefreshFriendCounts(true).catch(() => null);
    });

    sock.on('game:invite_receive', (payload) => {
        pmRtToast('Oyun daveti', `${payload?.hostName || 'Arkadaşın'} seni ${payload?.gameName || 'oyuna'} çağırıyor.`, 'info', { iconClass: 'fa-gamepad', duration: 4200 });
        pmRtShowInviteModal(payload);
    });

    sock.on('game:invite_error', (payload) => {
        pmRtToast('Davet hatası', payload?.message || 'Davet işlenemedi.', 'error');
    });

    sock.on('game:invite_success', (payload) => {
        pmRtHandleInviteAcceptedRedirect(payload).catch(() => null);
    });

    sock.on('game:invite_response', (payload) => {
        const accepted = payload?.response === 'accepted';
        const guestName = payload?.guestName || 'Arkadaşın';
        pmRtToast(
            accepted ? 'Davet kabul edildi' : 'Davet reddedildi',
            accepted ? `${guestName} daveti kabul etti.` : `${guestName} daveti şu an kabul etmedi.`,
            accepted ? 'success' : 'info',
            { iconClass: accepted ? 'fa-circle-check' : 'fa-circle-minus' }
        );
        if (accepted) pmRtHandleInviteAcceptedRedirect(payload).catch(() => null);
    });

    sock.on('connect_error', (error) => {
        if (error?.message === 'xhr poll error') return;
        pmRtToast('Canlı bağlantı', 'Bildirim hattı geçici olarak yeniden bağlanıyor.', 'info', { iconClass: 'fa-wifi', duration: 2600 });
    });

    const setMyPresence = () => {
        sock.emit('social:set_presence', { status: 'IN_GAME', activity: 'Crash Oynuyor' });
    };

    if (sock.connected) {
        setMyPresence();
    }
    sock.on('connect', setMyPresence);

    return sock;
}

async function initPlayMatrixRealtime() {
    if (!auth.currentUser) {
        disposePlayMatrixRealtime();
        return null;
    }
    if (pmRealtimeBootPromise) return pmRealtimeBootPromise;

    pmRealtimeBootPromise = (async () => {
        pmRtEnsureShell();
        await pmRtRefreshFriendCounts(true);
        await pmRtLoadSocketScript();
        const sock = await core.createAuthedSocket(null, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 8,
            timeout: 6000,
            extraOptions: { reconnectionDelay: 1000, reconnectionDelayMax: 5000 }
        });
        return pmRtBindSocketEvents(sock);
    })();

    try {
        return await pmRealtimeBootPromise;
    } catch (error) {
        pmRealtimeBootPromise = null;
        throw error;
    }
}

function disposePlayMatrixRealtime() {
    pmRtCloseModal();
    if (balanceRefreshTimer) { clearInterval(balanceRefreshTimer); balanceRefreshTimer = null; }
    if (socket) { try { socket.emit('crash:unsubscribe'); } catch (_) {} }
    if (pmRealtimeSocket) {
        try { pmRealtimeSocket.close(); } catch (_) {}
    }
    pmRealtimeSocket = null;
    pmRealtimeBootPromise = null;
}

window.addEventListener('beforeunload', () => {
    stopCanvasLoop();
    if (balanceRefreshTimer) { clearInterval(balanceRefreshTimer); balanceRefreshTimer = null; }
    if (socket) { try { socket.emit('crash:unsubscribe'); } catch (_) {} }
    if (pmRealtimeSocket) {
        try { pmRealtimeSocket.close(); } catch (_) {}
    }
});


onAuthStateChanged(u => {
    if(!u) {
        disposePlayMatrixRealtime();
        bootCompleted = false;
        setBootProgress(10);
        setBootStatus('Oturum doğrulanıyor...');
        setBootActions({ showEnter: false, showRetry: false });
        return;
    }
    initPlayMatrixRealtime().catch(() => null);
    if (!bootCompleted && !bootPromise) bootCrashApp(false).catch(() => null);
});

window.addEventListener('load', () => {
    setBootProgress(4);
    setBootStatus('Kaynaklar hazırlanıyor...');
    setBootActions({ showEnter: false, showRetry: false });
    setTimeout(() => { if (!bootCompleted && !bootPromise) bootCrashApp(false).catch(() => null); }, 150);
});
