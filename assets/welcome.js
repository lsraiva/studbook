// Returning players keep the welcome page, with a direct path to their stable.
try {
  if (localStorage.getItem('hf:studbook:token')) {
    document.querySelectorAll('[data-start],[data-login]').forEach((link) => {
      link.href = '/play';
      link.textContent = 'Continuar meu estábulo ↗';
    });
  }
} catch { /* storage is optional on the public landing page */ }

// The hero, alive: a short silent loop of the same morning (assets/art/hero-loop.*). The
// still stays underneath as the poster, so nothing jumps while it loads, and it is the
// whole picture on phones, with reduced motion, or when the browser asks to save data.
(() => {
  const hero = document.querySelector('.hero');
  if (!hero || !window.matchMedia) return;
  const connection = navigator.connection || {};
  const allowed = matchMedia('(min-width: 621px)').matches
    && !matchMedia('(prefers-reduced-motion: reduce)').matches
    && !connection.saveData
    && !/(^|-)2g$/.test(connection.effectiveType || '');
  if (!allowed) return;
  const video = document.createElement('video');
  video.className = 'hero-video';
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = 'auto';
  video.poster = '/assets/art/hero-wide.webp';
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  for (const [src, type] of [['/assets/art/hero-loop.webm', 'video/webm'], ['/assets/art/hero-loop.mp4', 'video/mp4']]) {
    const source = document.createElement('source');
    source.src = src;
    source.type = type;
    video.append(source);
  }
  video.addEventListener('playing', () => hero.classList.add('has-video'), { once: true });
  hero.prepend(video);
  const play = () => { video.play().catch(() => {}); };
  play();
  // no decoding while nobody can see it
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => (entry.isIntersecting && !document.hidden ? play() : video.pause())).observe(hero);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? video.pause() : play()));
})();
