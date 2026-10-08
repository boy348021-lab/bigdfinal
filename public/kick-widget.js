/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Big D Kick Live Stream Floating Movable Widget (Refined & Polished UI)
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // Only render on landing / home page (first screen)
  const path = window.location.pathname.toLowerCase();
  const isLandingPage = path === '/' || path === '/index.html' || path.endsWith('/index.html') || path === '';
  if (!isLandingPage) return;

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
      transition: opacity 0.35s ease, transform 0.35s ease, border-color 0.3s ease, box-shadow 0.3s ease;
      cursor: default;
      overflow: hidden;
      box-sizing: border-box;
      opacity: 1;
      pointer-events: auto;
    }

    #bigd-kick-floating-widget.is-scrolled-out {
      opacity: 0 !important;
      pointer-events: none !important;
      transform: translateY(20px) scale(0.92) !important;
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
      width: 100%;
      display: flex;
      flex-direction: column;
    }

    /* Live Player Iframe Container (Exact 16:9 Aspect Ratio) */
    .bkw-iframe-wrap {
      background: #000000;
      width: 100%;
      padding-top: 56.25%;
      position: relative;
      overflow: hidden;
    }

    .bkw-iframe-wrap iframe {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      border: none;
    }

    /* Offline Card Container — Rich Big D Kick Channel Card */
    .bkw-offline-card {
      background: #0d081e;
      position: relative;
      overflow: hidden;
      width: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }

    .bkw-banner-wrap {
      width: 100%;
      height: 72px;
      position: relative;
      background: linear-gradient(135deg, #1f103d 0%, #0d081e 100%);
      overflow: hidden;
    }

    .bkw-banner-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.85;
      display: block;
    }

    .bkw-banner-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(13,8,30,0.95) 100%);
    }

    .bkw-profile-row {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      padding: 0 14px;
      margin-top: -26px;
      position: relative;
      z-index: 2;
    }

    .bkw-avatar-img {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      border: 2px solid #53fc18;
      box-shadow: 0 0 14px rgba(83, 252, 24, 0.45);
      background: #140b28;
      object-fit: cover;
      flex-shrink: 0;
    }

    .bkw-user-meta {
      display: flex;
      flex-direction: column;
      padding-bottom: 2px;
      overflow: hidden;
    }

    .bkw-display-name {
      font-family: var(--font-display, 'Orbitron', sans-serif);
      font-size: 0.95rem;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: 0.03em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .bkw-verified-check {
      color: #53fc18;
      font-size: 0.8rem;
    }

    .bkw-stats-pill-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.72rem;
      color: #a79fc2;
      margin-top: 2px;
    }

    .bkw-followers-stat {
      color: #ffd700;
      font-weight: 700;
    }

    .bkw-bio-text {
      font-family: var(--font-ui, 'Rajdhani', sans-serif);
      font-size: 0.78rem;
      color: #b8b0d4;
      line-height: 1.35;
      padding: 8px 14px 10px;
      margin: 0;
      text-align: left;
    }

    .bkw-footer-action-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      background: rgba(0, 0, 0, 0.25);
    }

    .bkw-category-tag {
      font-size: 0.7rem;
      font-weight: 800;
      color: #00ffe5;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      letter-spacing: 0.04em;
    }

    /* Visit Channel Button */
    .bkw-visit-btn {
      color: #000000;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      background: #53fc18;
      border: 1px solid #53fc18;
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 0.72rem;
      font-weight: 900;
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      box-shadow: 0 0 12px rgba(83, 252, 24, 0.35);
    }

    .bkw-visit-btn:hover, .bkw-visit-btn:active {
      color: #000000;
      background: #66ff33;
      box-shadow: 0 0 20px rgba(83, 252, 24, 0.8);
      transform: translateY(-1px) scale(1.02);
    }

    /* Live Stream Info Strip in Widget */
    .bkw-live-info-strip {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: rgba(0, 0, 0, 0.75);
      border-top: 1px solid rgba(0, 231, 1, 0.3);
      font-size: 0.72rem;
      color: #fff;
    }

    .bkw-live-title-trunc {
      font-weight: 800;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 170px;
    }

    .bkw-live-viewers-tag {
      color: #00e701;
      font-weight: 900;
      display: flex;
      align-items: center;
      gap: 4px;
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
        width: 250px;
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
      .bkw-banner-wrap {
        height: 55px;
      }
      .bkw-avatar-img {
        width: 44px;
        height: 44px;
      }
      .bkw-display-name {
        font-size: 0.82rem;
      }
      .bkw-bio-text {
        font-size: 0.72rem;
        padding: 6px 10px 8px;
      }
      .bkw-footer-action-row {
        padding: 6px 10px 10px;
      }
      .bkw-visit-btn {
        padding: 4px 10px;
        font-size: 0.68rem;
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
      <!-- Injected dynamically based on live status & channel data -->
    </div>
  `;

  document.body.appendChild(widget);

  // ─── 3. Positioning & Viewport Clamping ─────────────────────────────────────
  function clampPosition(left, top) {
    const rect = widget.getBoundingClientRect();
    const width = rect.width || 280;
    const height = rect.height || 220;
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

    // Default position: Bottom-Right with safe clearance
    const defaultLeft = window.innerWidth - 300;
    const defaultTop = window.innerHeight - 250;
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

  // ─── 5. Update UI for Live vs Offline (Full Rich Profile & Sync) ────────────
  let lastDataChecksum = null;

  function updateWidgetUI(data) {
    if (!data) return;
    const isNowLive = Boolean(data.live);
    isLive = isNowLive;

    const pill = document.getElementById('bkw-status-pill');
    const statusText = document.getElementById('bkw-status-text');
    const body = document.getElementById('bkw-body');

    if (!pill || !body) return;

    // Sync all live badges & hero buttons across the entire page
    const heroWatchTag = document.getElementById('watch-live-status-tag');
    const heroWatchBtn = document.getElementById('hero-watch-live-btn') || document.querySelector('.hero-btn-watch-live');
    const navKickBadge = document.getElementById('kick-live-badge');
    const navKickText = document.getElementById('kick-live-text');

    if (navKickBadge) {
      navKickBadge.classList.toggle('is-live', isLive);
      navKickBadge.classList.toggle('is-offline', !isLive);
    }
    if (navKickText) {
      navKickText.textContent = isLive ? 'LIVE' : 'OFFLINE';
    }

    if (heroWatchTag) {
      heroWatchTag.textContent = isLive ? 'LIVE' : 'OFFLINE';
    }
    if (heroWatchBtn) {
      heroWatchBtn.classList.toggle('is-live', isLive);
      heroWatchBtn.classList.toggle('is-offline', !isLive);
    }

    // Default metadata values
    const profilePic = data.profile_pic || 'https://files.kick.com/images/user/51172020/profile_image/conversion/e7e16f19-c72d-4fe3-a289-76d7f58a1873-fullsize.webp';
    const bannerImg = data.banner_image || 'https://files.kick.com/images/channel/50054368/banner_image/8825687f-117a-447c-8a9a-7fd1af07ae2f';
    const username = data.username || 'BigDgamesTV';
    const bio = data.bio || 'Turning Dreams into reality';
    const followers = (data.followers_count || 1328).toLocaleString();
    const category = data.category || 'Slots & Casino';
    const categoryIcon = data.category_icon || '🎰';

    if (isLive) {
      widget.classList.add('is-live-mode');
      pill.className = 'bkw-status-pill live';
      statusText.textContent = 'LIVE';

      const streamInfo = data.stream || {};
      const streamTitle = streamInfo.session_title || 'Big D Live Stream';
      const viewers = streamInfo.viewer_count ? streamInfo.viewer_count.toLocaleString() : null;

      body.innerHTML = `
        <div class="bkw-iframe-wrap">
          <iframe 
            src="https://player.kick.com/${KICK_CHANNEL}?autoplay=1&muted=true" 
            frameborder="0" 
            scrolling="no" 
            allowfullscreen 
            allow="autoplay; fullscreen"
          ></iframe>
        </div>
        <div class="bkw-live-info-strip">
          <div class="bkw-live-title-trunc" title="${streamTitle}">🔴 ${streamTitle}</div>
          <div class="bkw-live-viewers-tag">
            <span>👥</span> ${viewers ? viewers + ' viewers' : 'Streaming now'}
          </div>
        </div>
      `;
    } else {
      widget.classList.remove('is-live-mode');
      pill.className = 'bkw-status-pill offline';
      statusText.textContent = 'OFFLINE';

      body.innerHTML = `
        <div class="bkw-offline-card">
          <div class="bkw-banner-wrap">
            <img src="${bannerImg}" alt="${username} Kick Banner" class="bkw-banner-img" />
            <div class="bkw-banner-overlay"></div>
          </div>
          <div class="bkw-profile-row">
            <img src="${profilePic}" alt="${username}" class="bkw-avatar-img" />
            <div class="bkw-user-meta">
              <div class="bkw-display-name">
                ${username} <span class="bkw-verified-check" title="Verified Creator">✓</span>
              </div>
              <div class="bkw-stats-pill-row">
                <span class="bkw-followers-stat">${followers}</span> followers
              </div>
            </div>
          </div>
          <p class="bkw-bio-text">"${bio}"</p>
          <div class="bkw-footer-action-row">
            <div class="bkw-category-tag">
              <span>${categoryIcon}</span> ${category}
            </div>
            <a href="${KICK_URL}" target="_blank" rel="noopener" class="bkw-visit-btn">
              Watch on Kick ➜
            </a>
          </div>
        </div>
      `;
    }
  }

  // ─── 6. Fetch & Poll Live Status (Multiple Fallbacks) ──────────────────────
  async function checkKickLive() {
    try {
      // 1. Check primary server endpoint with rich metadata
      const res = await fetch('/api/kick-live', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        updateWidgetUI(data);
        return;
      }
    } catch (e) {}

    try {
      // 2. Direct client fallback to Kick public channel endpoint
      const res = await fetch(`https://kick.com/api/v2/channels/${KICK_CHANNEL}`, {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });
      if (res.ok) {
        const d = await res.json();
        const live = Boolean(d && d.livestream !== null && d.livestream !== undefined && d.livestream.is_live !== false);
        updateWidgetUI({
          live,
          username: d.user && d.user.username,
          bio: d.user && d.user.bio,
          profile_pic: d.user && d.user.profile_pic,
          banner_image: d.banner_image && d.banner_image.url,
          followers_count: d.followers_count,
          category: d.recent_categories && d.recent_categories[0] && d.recent_categories[0].name
        });
        return;
      }
    } catch (e) {}

    updateWidgetUI({ live: false });
  }

  // ─── 7. First-Screen-Only Visibility (Hide on Scroll) ──────────────────────
  function handleScrollVisibility() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    const heroEl = document.getElementById('hero') || document.querySelector('.hero');
    const threshold = heroEl ? (heroEl.offsetTop + heroEl.offsetHeight - 120) : (window.innerHeight * 0.85);

    if (scrollY > threshold) {
      widget.classList.add('is-scrolled-out');
    } else {
      widget.classList.remove('is-scrolled-out');
    }
  }

  window.addEventListener('scroll', handleScrollVisibility, { passive: true });
  handleScrollVisibility();

  checkKickLive();
  setInterval(checkKickLive, STATUS_POLL_INTERVAL);

})();
