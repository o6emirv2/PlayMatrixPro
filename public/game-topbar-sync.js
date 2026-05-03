(function(){
  'use strict';
  const DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20viewBox%3D%270%200%20128%20128%27%3E%3Crect%20width%3D%27128%27%20height%3D%27128%27%20rx%3D%2728%27%20fill%3D%27%23111827%27%2F%3E%3Ccircle%20cx%3D%2764%27%20cy%3D%2750%27%20r%3D%2724%27%20fill%3D%27%23f59e0b%27%2F%3E%3Cpath%20d%3D%27M26%20108c8-18%2024-28%2038-28s30%2010%2038%2028%27%20fill%3D%27%23fbbf24%27%2F%3E%3C%2Fsvg%3E';
  function fmt(n){ return Number(n||0).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function pct(profile){ const v=Number(profile?.progression?.accountLevelProgressPct ?? profile?.accountLevelProgressPct ?? 0); return Math.max(0,Math.min(100,Number.isFinite(v)?v:0)); }
  function profileFromPayload(payload){ return payload?.user || payload?.profile || payload?.me || payload || {}; }
  function mountAvatar(profile){
    const avatar = profile.avatar || DEFAULT_AVATAR;
    const frame = Number(profile.selectedFrame || 0) || 0;
    const hosts = ['uiAccountAvatarHost','topbarAvatarShell','myAvatarHost','oppAvatarHost'].map(id=>document.getElementById(id)).filter(Boolean);
    for(const host of hosts){
      if(host.id === 'oppAvatarHost') continue;
      if(window.PMAvatar && typeof window.PMAvatar.mount==='function'){
        window.PMAvatar.mount(host,{ avatarUrl: avatar, level: frame, exactFrameIndex: frame, sizePx: Math.max(38, host.clientWidth || 44), extraClass:'pm-avatar--topbar', sizeTag:'game-topbar', alt:'Hesap avatarı' });
      }
    }
  }
  function apply(payload){
    const p = profileFromPayload(payload);
    if(!p || typeof p !== 'object') return;
    const level = Number(p.accountLevel || p.level || p.progression?.accountLevel || 1) || 1;
    const balance = Number(p.balance ?? p.mc ?? 0) || 0;
    const percent = pct(p);
    const setText=(id,text)=>{ const el=document.getElementById(id); if(el) el.textContent=text; };
    const setMany=(ids,text)=>ids.forEach(id=>setText(id,text));
    setText('uiAccountLevelBadge', String(level));
    setMany(['uiAccountBalance','uiBalance','ui-balance'], fmt(balance));
    setMany(['uiAccountProgressText','uiAccountLevelPct'], `${percent.toFixed(1)}%`);
    setText('headerBalance', Math.floor(balance).toLocaleString('tr-TR'));
    setText('headerRankText', `Hesap Seviyesi ${level}`);
    setText('ddLevel', String(level));
    setText('ddPct', `${percent.toFixed(1)}%`);
    const fillIds=['uiAccountProgressFill','uiAccountLevelBar','topProgressFill','profileProgressFill','ddBar'];
    fillIds.forEach(id=>{ const el=document.getElementById(id); if(el){ el.style.width=`${percent}%`; el.style.setProperty('--pm-progress',`${percent}%`); }});
    mountAvatar(p);
    try{ window.__PM_LAST_ACCOUNT_STATE__ = Object.assign({}, window.__PM_LAST_ACCOUNT_STATE__ || {}, p); }catch(_){ }
  }
  async function refresh(){
    try{
      if(!window.__PM_ONLINE_CORE__?.requestWithAuth) return null;
      const payload=await window.__PM_ONLINE_CORE__.requestWithAuth('/api/me',{method:'GET',timeoutMs:5500,retries:1,allowSessionFallback:true});
      apply(payload);
      return payload;
    }catch(error){
      try{ fetch((window.__PLAYMATRIX_API_URL__ || '') + '/api/client/error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'game-topbar-sync',message:error.message,path:location.pathname})}); }catch(_){ }
      return null;
    }
  }
  window.__PM_GAME_ACCOUNT_SYNC__ = { apply, refresh, notifyMutation(payload){ apply(payload); if(payload?.user || payload?.balance != null){ const current=window.__PM_LAST_ACCOUNT_STATE__||{}; apply({...current, balance: payload.balance ?? current.balance}); } } };
  window.addEventListener('pm:online-core-ready', refresh);
  setTimeout(refresh, 1200);
})();
