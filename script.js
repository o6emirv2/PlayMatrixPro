(() => {
  'use strict';

  const AUTH_KEY = 'pm-home-auth-state';
  const $ = (id) => document.getElementById(id);

  function dispatchHomeAction(action, detail = {}) {
    window.dispatchEvent(new CustomEvent('playmatrix:home-action', {
      detail: { action, ...detail }
    }));
  }

  function dispatchAuthAction(action) {
    window.dispatchEvent(new CustomEvent('playmatrix:home-auth-action', {
      detail: { action }
    }));
    dispatchHomeAction(action);
  }

  function getStoredAuthState() {
    try {
      const value = window.localStorage.getItem(AUTH_KEY);
      return value === 'authenticated' ? 'authenticated' : 'guest';
    } catch (_) {
      return document.body.dataset.authState === 'authenticated' ? 'authenticated' : 'guest';
    }
  }

  function setAuthState(nextState) {
    const state = nextState === 'authenticated' || nextState === 'user' || nextState === true ? 'authenticated' : 'guest';
    document.body.dataset.authState = state;
    try { window.localStorage.setItem(AUTH_KEY, state); } catch (_) {}

    document.querySelectorAll('.pm-bottomBar__item').forEach((item) => {
      const label = state === 'authenticated' ? item.dataset.userLabel : item.dataset.guestLabel;
      const labelNode = item.querySelector('.pm-bottomBar__text');
      if (label && labelNode) labelNode.textContent = label;
    });
  }

  function installHeaderActions() {
    $('pmLoginButton')?.addEventListener('click', () => dispatchAuthAction('login'));
    $('pmRegisterButton')?.addEventListener('click', () => dispatchAuthAction('register'));
  }

  function installHeroSlider() {
    const viewport = $('pmHeroViewport');
    const track = $('pmHeroTrack');
    const slides = Array.from(document.querySelectorAll('.pm-heroSlide'));
    const dots = Array.from(document.querySelectorAll('.pm-hero__dot'));
    if (!viewport || !track || slides.length === 0 || dots.length === 0) return;

    const total = slides.length;
    let current = 0;
    let autoplay = 0;
    let startX = 0;
    let deltaX = 0;
    let dragging = false;

    const render = () => {
      track.style.transform = `translate3d(-${current * 100}%,0,0)`;
      slides.forEach((slide, index) => {
        const active = index === current;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
      });
      dots.forEach((dot, index) => {
        const active = index === current;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-selected', String(active));
      });
    };

    const goTo = (index) => {
      current = (index + total) % total;
      render();
    };
    const next = () => goTo(current + 1);
    const prev = () => goTo(current - 1);
    const stop = () => {
      if (autoplay) window.clearInterval(autoplay);
      autoplay = 0;
    };
    const start = () => {
      stop();
      autoplay = window.setInterval(next, 5000);
    };

    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => {
        goTo(index);
        start();
      });
    });

    const begin = (clientX) => {
      dragging = true;
      startX = clientX;
      deltaX = 0;
      stop();
    };
    const move = (clientX) => {
      if (!dragging) return;
      deltaX = clientX - startX;
    };
    const end = () => {
      if (!dragging) return;
      if (Math.abs(deltaX) > 42) deltaX < 0 ? next() : prev();
      dragging = false;
      startX = 0;
      deltaX = 0;
      start();
    };

    viewport.addEventListener('touchstart', (event) => begin(event.touches[0].clientX), { passive: true });
    viewport.addEventListener('touchmove', (event) => move(event.touches[0].clientX), { passive: true });
    viewport.addEventListener('touchend', end, { passive: true });
    viewport.addEventListener('touchcancel', end, { passive: true });
    viewport.addEventListener('mousedown', (event) => begin(event.clientX));
    window.addEventListener('mousemove', (event) => move(event.clientX));
    window.addEventListener('mouseup', end);
    viewport.addEventListener('mouseenter', stop);
    viewport.addEventListener('mouseleave', start);

    window.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight') {
        next();
        start();
      }
      if (event.key === 'ArrowLeft') {
        prev();
        start();
      }
    });

    render();
    start();
  }

  function installBottomBar() {
    const bar = $('pmBottomBar');
    if (!bar) return;

    bar.addEventListener('click', (event) => {
      const item = event.target.closest('.pm-bottomBar__item');
      if (!item) return;

      const state = document.body.dataset.authState === 'authenticated' ? 'authenticated' : 'guest';
      const target = state === 'authenticated' ? item.dataset.userTarget : item.dataset.guestTarget;

      bar.querySelectorAll('.pm-bottomBar__item').forEach((node) => {
        const active = node === item;
        node.classList.toggle('is-active', active);
        if (active) node.setAttribute('aria-current', 'page');
        else node.removeAttribute('aria-current');
      });

      if (target === 'login') {
        dispatchAuthAction('login');
        return;
      }
      if (target === 'register') {
        dispatchAuthAction('register');
        return;
      }
      if (target === 'support') {
        window.location.href = 'mailto:playmatrixdestek@gmail.com?subject=PlayMatrix%20Destek%20Talebi';
        return;
      }
      if (target === 'menu') {
        dispatchHomeAction('menu');
        return;
      }
      if (target && target.startsWith('#')) {
        const section = document.querySelector(target);
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else dispatchHomeAction('navigate', { target });
      }
    });
  }

  function installPublicApi() {
    window.PlayMatrixHome = Object.assign(window.PlayMatrixHome || {}, {
      setAuthState,
      getAuthState: () => document.body.dataset.authState || 'guest'
    });
    window.addEventListener('playmatrix:set-auth-state', (event) => setAuthState(event.detail?.state));
  }

  function boot() {
    setAuthState(getStoredAuthState());
    installHeaderActions();
    installHeroSlider();
    installBottomBar();
    installPublicApi();
    document.body.dataset.boot = 'ready';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
