/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Big D Kick Live Stream Floating Movable Widget (Refined & Polished UI)
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  if (document.getElementById('bigd-kick-floating-widget')) return;

  const KICK_CHANNEL = 'bigdgamestv';
  const KICK_URL = `https://kick.com/${KICK_CHANNEL}`;
  const STORAGE_KEY_POS = 'bigd_kick_widget_pos_v3';
  const STORAGE_KEY_MIN = 'bigd_kick_widget_minimized';
  const STATUS_POLL_INTERVAL = 30000;

  let isLive = false;
  let isDragging = false;
  let hasMoved = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let isMinimized = localStorage.getItem(STORAGE_KEY_MIN) === 'true';

  // ─── 1. Inject High-End Gaming UI Styles ───────────────────────────────────
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    /* Floating Kick Widget Main Container */
    #bigd-kick-floating-widget {
      position: fixed;
      z-index: 99999;
      width: 280px;
      background: linear-gradient(180deg, #120924 0%, #0a0515 100%);
      border: 1px solid rgba(157, 0, 255, 0.4);
      border-radius: 16px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), 0 0 25px rgba(136, 0, 255, 0.2);
      font-family: var(--font-ui, 'Rajdhani', -apple-system, BlinkMacSystemFont, sans-serif);
      color: #ffffff;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      transition: border-color 0.3s ease, box-shadow 0.3s ease, transform 0.15s ease;
      cursor: default;
      overflow: hidden;
      box-sizing: border-box;
    }

    #bigd-kick-floating-widget.is-dragging {
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.95), 0 0 35px rgba(190, 77, 255, 0.45);
      border-color: rgba(190, 77, 255, 0.8);
      transform: scale(1.02);
    }

    #bigd-kick-floating-widget.is-live-mode {
      border-color: rgba(0, 231, 1, 0.55);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85), 0 0 30px rgba(0, 231, 1, 0.25);
    }

    /* Widget Header (Drag Handle) */
    .bkw-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      cursor: grab;
    }

    .bkw-header:active {
      cursor: grabbing;
    }

    .bkw-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    /* Status Badge */
    .bkw-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 9px;
      border-radius: 20px;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      line-height: 1;
    }

    .bkw-status-pill.offline {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #928baf;
    }

    .bkw-status-pill.live {
      background: rgba(0, 231, 1, 0.15);
      border: 1px solid rgba(0, 231, 1, 0.6);
      color: #00e701;
      box-shadow: 0 0 12px rgba(0, 231, 1, 0.35);
    }

    .bkw-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #736d8a;
    }

    .bkw-status-pill.live .bkw-dot {
      background: #00e701;
      box-shadow: 0 0 8px #00e701;
      animation: bkw-pulse 1.4s infinite ease-in-out;
    }

    @keyframes bkw-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.4); opacity: 0.5; }
    }

    /* Channel Handle */
    .bkw-channel-link {
      font-family: var(--font-display, 'Orbitron', sans-serif);
      font-size: 0.76rem;
      font-weight: 700;
      color: #ffffff;
      text-decoration: none;
      letter-spacing: 0.02em;
      transition: color 0.2s;
    }

    .bkw-channel-link:hover {
      color: #00e701;
    }

    /* Header Minimize / Toggle Button */
    .bkw-btn-min {
      width: 28px;
      height: 28px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1rem;
      font-weight: 900;
      line-height: 1;
      transition: all 0.2s ease;
      padding: 0;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      flex-shrink: 0;
    }

    .bkw-btn-min:hover, .bkw-btn-min:active {
      background: rgba(168, 85, 247, 0.35);
      border-color: rgba(168, 85, 247, 0.8);
      color: #ffffff;
      transform: scale(1.08);
    }

    /* Widget Body */
    .bkw-body {
      padding: 14px 16px 16px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    /* TV Avatar Container */
    .bkw-avatar-wrap {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(157, 0, 255, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      margin-bottom: 10px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4), inset 0 0 12px rgba(157, 0, 255, 0.15);
      position: relative;
    }

    #bigd-kick-floating-widget.is-live-mode .bkw-avatar-wrap {
      border-color: rgba(0, 231, 1, 0.45);
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4), inset 0 0 15px rgba(0, 231, 1, 0.2);
    }

    /* Text Block */
    .bkw-text-box {
      margin-bottom: 12px;
      width: 100%;
    }

    .bkw-text-main {
      font-family: var(--font-display, 'Orbitron', sans-serif);
      font-size: 0.82rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.02em;
      margin-bottom: 2px;
      white-space: nowrap;
    }

    .bkw-text-sub {
      font-family: var(--font-ui, 'Rajdhani', sans-serif);
      font-size: 0.74rem;
      font-weight: 600;
      color: #8c84a8;
      letter-spacing: 0.02em;
      line-height: 1.25;
    }

    /* Action CTA Button */
    .bkw-cta-btn {
      width: 100%;
      height: 36px;
      box-sizing: border-box;
      border-radius: 8px;
      font-family: var(--font-ui, 'Rajdhani', sans-serif);
      font-size: 0.84rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* Offline Button Style: Kick Green Glass Outline */
    .bkw-cta-btn.btn-offline {
      background: rgba(0, 231, 1, 0.06);
      border: 1px solid rgba(0, 231, 1, 0.45);
      color: #00e701;
      box-shadow: 0 0 14px rgba(0, 231, 1, 0.12);
    }

    .bkw-cta-btn.btn-offline:hover, .bkw-cta-btn.btn-offline:active {
      background: rgba(0, 231, 1, 0.18);
      border-color: #00e701;
      box-shadow: 0 0 20px rgba(0, 231, 1, 0.35);
      color: #ffffff;
    }

    .bkw-cta-btn.btn-offline svg {
      color: #00e701;
      transition: transform 0.2s ease;
    }

    /* Live Button Style: Solid Glowing Kick Green */
    .bkw-cta-btn.btn-live {
      background: linear-gradient(90deg, #00e701, #00b801);
      color: #051405;
      font-weight: 900;
      border: 1px solid #77ff77;
      box-shadow: 0 0 22px rgba(0, 231, 1, 0.5);
      animation: bkw-live-glow 2s infinite ease-in-out;
    }

    .bkw-cta-btn.btn-live:hover, .bkw-cta-btn.btn-live:active {
      background: linear-gradient(90deg, #1aff1a, #00d901);
      box-shadow: 0 0 30px rgba(0, 231, 1, 0.8);
      color: #000000;
    }

    @keyframes bkw-live-glow {
      0%, 100% { box-shadow: 0 0 16px rgba(0, 231, 1, 0.4); }
      50% { box-shadow: 0 0 26px rgba(0, 231, 1, 0.75); }
    }

    /* Minimized Compact Mode */
    #bigd-kick-floating-widget.is-minimized {
      width: auto !important;
      border-radius: 20px;
    }

    #bigd-kick-floating-widget.is-minimized .bkw-body {
      display: none !important;
    }

    #bigd-kick-floating-widget.is-minimized .bkw-header {
      padding: 6px 10px;
      border-bottom: none;
      gap: 8px;
    }

    /* Mobile Phones (Compact & Perfectly Scaled) */
    @media (max-width: 600px) {
      #bigd-kick-floating-widget {
        width: 210px;
        border-radius: 12px;
      }
      .bkw-header {
        padding: 8px 10px;
      }
      .bkw-channel-link {
        font-size: 0.68rem;
      }
      .bkw-status-pill {
        padding: 3px 6px;
        font-size: 0.62rem;
      }
      .bkw-btn-min {
        width: 26px;
        height: 26px;
        font-size: 0.95rem;
      }
      .bkw-body {
        padding: 10px 12px 12px 12px;
      }
      .bkw-avatar-wrap {
        width: 36px;
        height: 36px;
        font-size: 1.25rem;
        margin-bottom: 6px;
      }
      .bkw-text-box {
        margin-bottom: 8px;
      }
      .bkw-text-main {
        font-size: 0.72rem;
      }
      .bkw-text-sub {
        font-size: 0.66rem;
      }
      .bkw-cta-btn {
        height: 30px;
        font-size: 0.74rem;
        border-radius: 6px;
      }
    }
  `;
  document.head.appendChild(styleEl);

  // ─── 2. Build Clean Widget DOM ─────────────────────────────────────────────
  const widget = document.createElement('div');
  widget.id = 'bigd-kick-floating-widget';
  if (isMinimized) widget.classList.add('is-minimized');

  widget.innerHTML = `
    <div class="bkw-header" id="bigd-kick-widget-header">
      <div class="bkw-header-left">
        <div class="bkw-status-pill offline" id="bkw-status-pill">
          <span class="bkw-dot"></span>
          <span id="bkw-status-text">OFFLINE</span>
        </div>
        <a href="${KICK_URL}" target="_blank" rel="noopener" class="bkw-channel-link" id="bkw-channel-header-link">kick.com/${KICK_CHANNEL}</a>
      </div>
      <div class="bkw-header-right">
        <button class="bkw-btn-min" id="bkw-btn-min" title="Minimize / Expand" aria-label="Minimize / Expand">
          ${isMinimized ? '+' : '−'}
        </button>
      </div>
    </div>
    <div class="bkw-body" id="bkw-body">
      <div class="bkw-avatar-wrap">
        <span id="bkw-icon-box">📺</span>
      </div>
      <div class="bkw-text-box">
        <div class="bkw-text-main" id="bkw-text-main">Big D is currently offline</div>
        <div class="bkw-text-sub" id="bkw-text-sub">Catch latest streams & replays on Kick</div>
      </div>
      <a href="${KICK_URL}" target="_blank" rel="noopener" class="bkw-cta-btn btn-offline" id="bkw-cta-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
        </svg>
        <span id="bkw-cta-text">VISIT CHANNEL</span>
      </a>
    </div>
  `;

  document.body.appendChild(widget);

  // ─── 3. Positioning & Viewport Clamping ─────────────────────────────────────
  function clampPosition(left, top) {
    const rect = widget.getBoundingClientRect();
    const width = rect.width || 280;
    const height = rect.height || 180;
    const margin = 12;

    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - height - margin);

    const clampedLeft = Math.min(Math.max(margin, left), maxLeft);
    const clampedTop = Math.min(Math.max(margin, top), maxTop);

    return { left: clampedLeft, top: clampedTop };
  }

  function applyPosition(left, top) {
    const clamped = clampPosition(left, top);
    widget.style.left = `${clamped.left}px`;
    widget.style.top = `${clamped.top}px`;
    widget.style.right = 'auto';
    widget.style.bottom = 'auto';
  }

  function savePosition() {
    const rect = widget.getBoundingClientRect();
    try {
      localStorage.setItem(STORAGE_KEY_POS, JSON.stringify({ left: rect.left, top: rect.top }));
    } catch (e) {}
  }

  function loadInitialPosition() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_POS);
      if (saved) {
        const { left, top } = JSON.parse(saved);
        if (typeof left === 'number' && typeof top === 'number') {
          applyPosition(left, top);
          return;
        }
      }
    } catch (e) {}

    // Default position: Bottom-Right
    const defaultLeft = window.innerWidth - 300;
    const defaultTop = window.innerHeight - 220;
    applyPosition(defaultLeft, defaultTop);
  }

  setTimeout(loadInitialPosition, 50);
  window.addEventListener('resize', () => {
    const rect = widget.getBoundingClientRect();
    applyPosition(rect.left, rect.top);
  });

  // ─── 4. Natural Drag & Drop Interaction ─────────────────────────────────────
  const header = document.getElementById('bigd-kick-widget-header');
  const minBtn = document.getElementById('bkw-btn-min');

  function toggleMinimize(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    isMinimized = !isMinimized;
    widget.classList.toggle('is-minimized', isMinimized);
    minBtn.textContent = isMinimized ? '+' : '−';
    try {
      localStorage.setItem(STORAGE_KEY_MIN, String(isMinimized));
    } catch (err) {}
    const rect = widget.getBoundingClientRect();
    applyPosition(rect.left, rect.top);
  }

  minBtn.addEventListener('click', toggleMinimize);
  minBtn.addEventListener('touchend', toggleMinimize);

  function onPointerDown(e) {
    if (e.target.closest('#bkw-btn-min') || e.target.closest('button') || e.target.closest('a')) return;

    isDragging = true;
    hasMoved = false;
    startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

    const rect = widget.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;

    widget.classList.add('is-dragging');

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
  }

  function onPointerMove(e) {
    if (!isDragging) return;

    const currentX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
    const currentY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);

    if (currentX === undefined || currentY === undefined) return;

    const deltaX = currentX - startX;
    const deltaY = currentY - startY;

    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      hasMoved = true;
    }

    if (e.cancelable) e.preventDefault();

    applyPosition(initialLeft + deltaX, initialTop + deltaY);
  }

  function onPointerUp() {
    if (!isDragging) return;
    isDragging = false;
    widget.classList.remove('is-dragging');
    savePosition();

    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('touchmove', onPointerMove);
    window.removeEventListener('touchend', onPointerUp);
  }

  header.addEventListener('pointerdown', onPointerDown);
  header.addEventListener('touchstart', onPointerDown, { passive: true });

  // ─── 5. Update UI for Live vs Offline ───────────────────────────────────────
  function updateWidgetUI(liveState) {
    isLive = Boolean(liveState);

    const pill = document.getElementById('bkw-status-pill');
    const statusText = document.getElementById('bkw-status-text');
    const iconBox = document.getElementById('bkw-icon-box');
    const textMain = document.getElementById('bkw-text-main');
    const textSub = document.getElementById('bkw-text-sub');
    const ctaBtn = document.getElementById('bkw-cta-btn');
    const ctaText = document.getElementById('bkw-cta-text');

    if (!pill || !ctaBtn) return;

    if (isLive) {
      widget.classList.add('is-live-mode');
      pill.className = 'bkw-status-pill live';
      statusText.textContent = 'LIVE';
      iconBox.textContent = '🔥';
      textMain.textContent = 'Big D is LIVE Now!';
      textSub.textContent = 'Streaming live on Kick — Tune in!';
      ctaBtn.className = 'bkw-cta-btn btn-live';
      ctaText.textContent = 'WATCH BIG D LIVE';
    } else {
      widget.classList.remove('is-live-mode');
      pill.className = 'bkw-status-pill offline';
      statusText.textContent = 'OFFLINE';
      iconBox.textContent = '📺';
      textMain.textContent = 'Big D is currently offline';
      textSub.textContent = 'Catch latest streams & replays on Kick';
      ctaBtn.className = 'bkw-cta-btn btn-offline';
      ctaText.textContent = 'VISIT CHANNEL';
    }
  }

  // ─── 6. Fetch & Poll Live Status ───────────────────────────────────────────
  async function checkKickLive() {
    try {
      const res = await fetch('/api/kick-live', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        updateWidgetUI(Boolean(data && data.live));
      } else {
        updateWidgetUI(false);
      }
    } catch (e) {
      updateWidgetUI(false);
    }
  }

  checkKickLive();
  setInterval(checkKickLive, STATUS_POLL_INTERVAL);

})();
