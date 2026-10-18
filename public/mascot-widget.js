/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Big D Floating Pixel Mascot — Perimeter Orbit & Scroll-Disappear Widget
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  // Prevent multiple executions on the same page
  if (window.__bigdMascotWidgetInitialized) return;
  window.__bigdMascotWidgetInitialized = true;

  const DISCORD_URL = 'https://discord.gg/aHSVMX4DCr';

  const DAILY_MASCOTS = {
    0: { name: 'Hustler', src: '/bigd-hustler.png', alt: 'Big D — Hustler' },
    1: { name: 'Gamer', src: '/bigd-gamer.png', alt: 'Big D — Gamer' },
    2: { name: 'Office', src: '/bigd-office.png', alt: 'Big D — Office' },
    3: { name: 'Gambler', src: '/bigd-gambler.png', alt: 'Big D — Gambler' },
    4: { name: 'Funky Casual', src: '/bigd-funky.png', alt: 'Big D — Funky Casual' },
    5: { name: 'Westside', src: '/bigd-westside.png', alt: 'Big D — Westside' },
    6: { name: 'Native American', src: '/bigd-native.png', alt: 'Big D — Native American' }
  };

  // 1. Inject Styles matching the floating Kick widget behavior
  if (!document.getElementById('bigd-mascot-style')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'bigd-mascot-style';
    styleEl.textContent = `
      #edge-bot {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        z-index: 99999 !important;
        width: 72px;
        height: 94px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        touch-action: manipulation;
        transition: opacity 0.35s ease;
        opacity: 1;
        pointer-events: auto;
        will-change: transform;
        contain: layout style;
        transform: translate3d(0, 0, 0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }
      #edge-bot.is-scrolled-out {
        opacity: 0 !important;
        pointer-events: none !important;
      }
      /* Aura glow layer behind the mascot so the main moving container is not running dynamic SVG filter rasterization on every frame */
      .bigd-mascot-aura {
        position: absolute;
        inset: 4px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(157, 0, 255, 0.4) 0%, rgba(0, 231, 1, 0.15) 55%, transparent 75%);
        filter: blur(8px);
        pointer-events: none;
        z-index: 0;
        transition: transform 0.25s ease, opacity 0.25s ease;
      }
      #edge-bot:hover .bigd-mascot-aura {
        transform: scale(1.3);
        opacity: 0.9;
      }
      #bigd-mascot-img {
        position: relative;
        z-index: 1;
        width: 68px;
        height: auto;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
        display: block;
        pointer-events: none;
        /* Clean vertical micro-bobbing without angle rotation to prevent visual jitter against linear movement */
        animation: bigd-idle-float 2.2s ease-in-out infinite alternate;
        transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.3, 1);
        will-change: transform;
      }
      @keyframes bigd-idle-float {
        0% { transform: translateY(0px); }
        100% { transform: translateY(-4px); }
      }
      .bigd-speech-bubble {
        position: absolute;
        top: -26px;
        z-index: 2;
        white-space: nowrap;
        background: linear-gradient(90deg, #5865f2, #7983f5);
        border: 1px solid #ffffff;
        color: #ffffff;
        font-family: var(--font-display, 'Orbitron', sans-serif);
        font-size: 0.62rem;
        font-weight: 900;
        letter-spacing: 0.08em;
        padding: 3px 8px;
        border-radius: 6px;
        box-shadow: 0 4px 15px rgba(88, 101, 242, 0.6);
        opacity: 0;
        transform: translateY(6px) scale(0.9);
        transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: none;
      }
      .bigd-speech-bubble::after {
        content: '';
        position: absolute;
        bottom: -4px;
        left: 50%;
        transform: translateX(-50%);
        border-width: 4px 4px 0;
        border-style: solid;
        border-color: #5865f2 transparent;
        display: block;
        width: 0;
      }
      #edge-bot:hover .bigd-speech-bubble {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      @media (max-width: 600px) {
        #edge-bot { width: 58px; height: 78px; }
        #bigd-mascot-img { width: 54px; }
      }
    `;
    document.head.appendChild(styleEl);
  }

  // 2. Initialize Mascot DOM
  function initMascotWidget() {
    let bot = document.getElementById('edge-bot');
    if (!bot) {
      bot = document.createElement('div');
      bot.id = 'edge-bot';
      bot.setAttribute('title', 'Join Big D on Discord!');
      bot.setAttribute('aria-label', 'Big D Mascot — Join Discord');
      bot.innerHTML = `
        <div class="bigd-mascot-aura"></div>
        <div class="bigd-speech-bubble" id="mascot-speech-bubble">JOIN DISCORD!</div>
        <img id="bigd-mascot-img" src="/bigd-gamer.png" alt="Big D Pixel Mascot" draggable="false" />
      `;
      document.body.appendChild(bot);
    } else {
      // Ensure aura exists if bot was already in static HTML
      if (!bot.querySelector('.bigd-mascot-aura')) {
        const aura = document.createElement('div');
        aura.className = 'bigd-mascot-aura';
        bot.insertBefore(aura, bot.firstChild);
      }
    }

    const mascotImg = document.getElementById('bigd-mascot-img');
    const speechBubble = document.getElementById('mascot-speech-bubble') || bot.querySelector('.bigd-speech-bubble');

    // Daily Mascot outfit rotation with URL testing override support
    const urlParams = new URLSearchParams(window.location.search);
    const mascotOverride = urlParams.get('mascot') ? urlParams.get('mascot').toLowerCase() : null;
    const dayOverride = urlParams.get('day') !== null ? parseInt(urlParams.get('day'), 10) : null;

    let currentMascot;
    if (mascotOverride) {
      const map = {
        gamer: DAILY_MASCOTS[1],
        office: DAILY_MASCOTS[2],
        gambler: DAILY_MASCOTS[3],
        funky: DAILY_MASCOTS[4],
        westside: DAILY_MASCOTS[5],
        native: DAILY_MASCOTS[6],
        hustler: DAILY_MASCOTS[0]
      };
      currentMascot = map[mascotOverride] || DAILY_MASCOTS[1];
    } else if (dayOverride !== null && DAILY_MASCOTS[dayOverride]) {
      currentMascot = DAILY_MASCOTS[dayOverride];
    } else {
      const today = new Date().getDay();
      currentMascot = DAILY_MASCOTS[today] || DAILY_MASCOTS[1];
    }

    if (mascotImg) {
      mascotImg.src = currentMascot.src;
      mascotImg.alt = currentMascot.alt;
    }
    if (speechBubble) {
      speechBubble.textContent = `JOIN DISCORD! (${currentMascot.name})`;
    }
    bot.setAttribute('title', `Big D (${currentMascot.name}) — Join Discord!`);

    bot.onclick = () => {
      window.open(DISCORD_URL, '_blank', 'noopener,noreferrer');
    };

    // 3. Ultra-Smooth Hardware-Accelerated Perimeter Orbit Engine
    const SPEED_PX_PER_SEC = 140; // Silky smooth walking speed in px/s
    let distanceTraveled = 0;
    let lastTime = null;

    // Cache layout bounds and refresh on resize or periodically to avoid DOM layout thrashing
    let cachedBounds = null;

    function computeBounds() {
      const margin = 16;
      const botW = 72;
      const botH = 94;

      // Ensure clearance under fixed top navigation bar (64px nav + safety margin)
      const navEl = document.getElementById('nav') || document.querySelector('nav');
      const navHeight = navEl ? navEl.offsetHeight || 64 : 64;
      const topClearance = Math.max(76, navHeight + 20);

      const minX = margin + botW / 2;
      const maxX = Math.max(minX, window.innerWidth - margin - botW / 2);
      const minY = topClearance + botH / 2;
      const maxY = Math.max(minY, window.innerHeight - margin - botH / 2 - 20);

      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);
      const total = 2 * (w + h);

      return { minX, maxX, minY, maxY, w, h, total };
    }

    cachedBounds = computeBounds();
    window.addEventListener('resize', () => {
      cachedBounds = computeBounds();
    }, { passive: true });

    function getPointAtDistance(dist, bounds) {
      const { minX, maxX, minY, maxY, w, h, total } = bounds;
      let d = ((dist % total) + total) % total;

      if (d < w) {
        return { x: minX + d, y: minY, edge: 'top' };
      }
      d -= w;
      if (d < h) {
        return { x: maxX, y: minY + d, edge: 'right' };
      }
      d -= h;
      if (d < w) {
        return { x: maxX - d, y: maxY, edge: 'bottom' };
      }
      d -= h;
      return { x: minX, y: maxY - d, edge: 'left' };
    }

    let lastFacingLeft = false;

    function animateOrbit(currentTime) {
      if (lastTime === null) {
        lastTime = currentTime;
      }
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      distanceTraveled += SPEED_PX_PER_SEC * dt;
      const pos = getPointAtDistance(distanceTraveled, cachedBounds);

      const facingLeft = pos.edge === 'bottom' || pos.edge === 'left';

      // Keep outer bot strictly in pure translation space for maximum compositor efficiency
      const posX = pos.x - 36;
      const posY = pos.y - 47;

      bot.style.transform = `translate3d(${posX.toFixed(1)}px, ${posY.toFixed(1)}px, 0)`;

      // Only flip sprite image on orientation turn
      if (mascotImg && lastFacingLeft !== facingLeft) {
        lastFacingLeft = facingLeft;
        mascotImg.style.transform = facingLeft ? 'scaleX(-1)' : 'scaleX(1)';
      }

      requestAnimationFrame(animateOrbit);
    }

    requestAnimationFrame(animateOrbit);

    // 4. Scroll Disappear Handler (Identical threshold to floating window)
    function handleScrollVisibility() {
      const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      const heroEl = document.getElementById('hero') || document.querySelector('.hero');
      const threshold = heroEl ? (heroEl.offsetTop + heroEl.offsetHeight - 120) : 100;

      if (scrollY > threshold) {
        bot.classList.add('is-scrolled-out');
      } else {
        bot.classList.remove('is-scrolled-out');
      }
    }

    window.addEventListener('scroll', handleScrollVisibility, { passive: true });
    handleScrollVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMascotWidget);
  } else {
    initMascotWidget();
  }
})();
