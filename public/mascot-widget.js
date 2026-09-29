/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Big D Floating Pixel Mascot — Perimeter Orbit & Scroll-Disappear Widget
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

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
        position: fixed;
        z-index: 99999;
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
        transition: opacity 0.35s ease, transform 0.35s ease, filter 0.25s ease;
        filter: drop-shadow(0 0 14px rgba(157, 0, 255, 0.45)) drop-shadow(0 8px 20px rgba(0, 0, 0, 0.7));
        opacity: 1;
        pointer-events: auto;
      }
      #edge-bot.is-scrolled-out {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: translate(-50%, -50%) scale(0.85) translateY(24px) !important;
      }
      #edge-bot:hover {
        filter: drop-shadow(0 0 22px rgba(190, 77, 255, 0.8)) drop-shadow(0 0 35px rgba(0, 231, 1, 0.4)) drop-shadow(0 10px 25px rgba(0, 0, 0, 0.85));
      }
      #bigd-mascot-img {
        width: 68px;
        height: auto;
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
        display: block;
        pointer-events: none;
        animation: bigd-idle-float 2.6s ease-in-out infinite alternate;
      }
      @keyframes bigd-idle-float {
        0% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-5px) rotate(-1.5deg); }
        100% { transform: translateY(-2px) rotate(1.5deg); }
      }
      .bigd-speech-bubble {
        position: absolute;
        top: -26px;
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
        transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
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
        <div class="bigd-speech-bubble" id="mascot-speech-bubble">JOIN DISCORD!</div>
        <img id="bigd-mascot-img" src="/bigd-gamer.png" alt="Big D Pixel Mascot" draggable="false" />
      `;
      document.body.appendChild(bot);
    }

    const mascotImg = document.getElementById('bigd-mascot-img');
    const speechBubble = document.getElementById('mascot-speech-bubble') || bot.querySelector('.bigd-speech-bubble');

    // Daily Mascot outfit rotation
    const today = new Date().getDay();
    const currentMascot = DAILY_MASCOTS[today] || DAILY_MASCOTS[1];
    if (mascotImg) {
      mascotImg.src = currentMascot.src;
      mascotImg.alt = currentMascot.alt;
    }
    if (speechBubble) {
      speechBubble.textContent = `JOIN DISCORD! (${currentMascot.name})`;
    }

    bot.addEventListener('click', () => {
      window.open(DISCORD_URL, '_blank', 'noopener,noreferrer');
    });

    // 3. Smooth Edge Revolving / Perimeter Orbit Engine
    let t = 0;
    const speed = 0.00035; // Smooth perimeter walking speed

    function getPerimeterPoint(progress) {
      const margin = 16;
      const botW = bot.offsetWidth || 72;
      const botH = bot.offsetHeight || 94;

      const minX = margin + botW / 2;
      const maxX = Math.max(minX, window.innerWidth - margin - botW / 2);
      const minY = margin + botH / 2 + 50; // top offset for nav bar
      const maxY = Math.max(minY, window.innerHeight - margin - botH / 2 - 20);

      const w = maxX - minX;
      const h = maxY - minY;
      const total = 2 * (w + h);

      let d = (progress % 1) * total;

      if (d < w) return { x: minX + d, y: minY, edge: 'top' };
      d -= w;
      if (d < h) return { x: maxX, y: minY + d, edge: 'right' };
      d -= h;
      if (d < w) return { x: maxX - d, y: maxY, edge: 'bottom' };
      d -= h;
      return { x: minX, y: maxY - d, edge: 'left' };
    }

    function animateOrbit() {
      t += speed;
      const pos = getPerimeterPoint(t);

      bot.style.left = `${pos.x}px`;
      bot.style.top = `${pos.y}px`;

      const facingLeft = pos.edge === 'bottom' || pos.edge === 'left';
      
      // Preserve transition for scroll out while allowing instant position animation
      if (!bot.classList.contains('is-scrolled-out')) {
        bot.style.transform = `translate(-50%, -50%) scaleX(${facingLeft ? -1 : 1})`;
      }

      if (speechBubble) {
        speechBubble.style.transform = facingLeft ? 'scaleX(-1)' : 'none';
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
