// ─── Auth Helper: Direct Discord & Kick OAuth2 + JWT ─────────────────────────
// Inject responsive navbar button & points badge styles globally
const style = document.createElement("style");
style.textContent = `
  .verify-btn, .btn-ghost, .btn-primary, .reward-card-btn, .mock-login-submit, .btn-copy-promo, .nav-btn-auth, .mobile-auth-btn {
    cursor: pointer !important;
  }
  .nav-btn-auth {
    background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%) !important;
    border: 1px solid rgba(168, 85, 247, 0.45) !important;
    color: #ffffff !important;
    font-family: var(--font-ui, 'Rajdhani', sans-serif);
    font-size: 0.78rem !important;
    font-weight: 800 !important;
    letter-spacing: 0.08em !important;
    text-transform: uppercase !important;
    padding: 0 14px !important;
    border-radius: 8px !important;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    height: 32px !important;
    box-sizing: border-box !important;
    outline: none !important;
    text-decoration: none !important;
    white-space: nowrap !important;
    box-shadow: 0 4px 14px rgba(109, 40, 217, 0.35) !important;
    margin-left: 6px !important;
  }
  .nav-btn-auth:hover {
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%) !important;
    border-color: rgba(192, 132, 252, 0.7) !important;
    box-shadow: 0 0 16px rgba(168, 85, 247, 0.55), 0 4px 12px rgba(0, 0, 0, 0.4) !important;
    transform: translateY(-1px) !important;
  }

  /* Compact Uniform Kick Live/Offline Badge */
  .kick-live-badge {
    height: 32px !important;
    padding: 0 12px !important;
    border-radius: 8px !important;
    font-family: var(--font-ui, 'Rajdhani', sans-serif) !important;
    font-size: 0.76rem !important;
    font-weight: 800 !important;
    letter-spacing: 0.08em !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    box-sizing: border-box !important;
    text-decoration: none !important;
    white-space: nowrap !important;
    transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
    border: 1px solid rgba(239, 68, 68, 0.45) !important;
    background: linear-gradient(135deg, rgba(153, 27, 27, 0.35) 0%, rgba(185, 28, 28, 0.55) 100%) !important;
    color: #fecaca !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
  }
  .kick-live-badge:hover {
    transform: translateY(-1px) !important;
    border-color: rgba(239, 68, 68, 0.7) !important;
    box-shadow: 0 0 14px rgba(239, 68, 68, 0.4) !important;
  }
  .kick-live-badge.is-live {
    color: #6ee7b7 !important;
    border-color: rgba(52, 211, 153, 0.6) !important;
    background: linear-gradient(135deg, rgba(5, 150, 105, 0.4) 0%, rgba(16, 185, 129, 0.6) 100%) !important;
    box-shadow: 0 0 14px rgba(16, 185, 129, 0.4) !important;
  }
  .kick-live-badge .status-dot {
    width: 7px !important;
    height: 7px !important;
    border-radius: 50% !important;
    background: #ef4444 !important;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.8) !important;
    display: inline-block !important;
  }
  .kick-live-badge.is-live .status-dot {
    background: #00ff66 !important;
    box-shadow: 0 0 6px rgba(0, 255, 102, 0.9) !important;
  }
  .mobile-auth-btn {
    display: block !important;
    margin: 12px 16px !important;
    padding: 12px !important;
    background: linear-gradient(90deg, #8800ff, #5500aa) !important;
    text-align: center !important;
    border-radius: 6px !important;
    color: #ffffff !important;
    font-family: var(--font-ui, 'Rajdhani', sans-serif);
    font-size: 0.95rem !important;
    font-weight: 800 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
    border: none !important;
    width: calc(100% - 32px) !important;
    box-sizing: border-box !important;
    text-decoration: none !important;
  }
  .mobile-auth-btn:hover {
    background: linear-gradient(90deg, #9933ff, #7700cc) !important;
    box-shadow: 0 0 15px rgba(136, 0, 255, 0.45) !important;
  }

  /* Responsive Points Wallet Pill */
  .nav-points-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 12px;
    background: rgba(255, 215, 0, 0.08);
    border: 1px solid rgba(255, 215, 0, 0.35);
    border-radius: 20px;
    color: #ffd700;
    font-family: var(--font-ui, 'Rajdhani', sans-serif);
    font-size: 0.85rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.15);
    text-decoration: none;
    transition: all 0.25s ease;
    white-space: nowrap;
  }
  .nav-points-pill:hover {
    background: rgba(255, 215, 0, 0.16);
    border-color: #ffd700;
    box-shadow: 0 0 20px rgba(255, 215, 0, 0.35);
    transform: translateY(-1px);
  }
  .nav-user-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 12px;
    background: rgba(136, 0, 255, 0.12);
    border: 1px solid rgba(136, 0, 255, 0.3);
    border-radius: 20px;
    color: #ffffff;
    font-family: var(--font-ui, 'Rajdhani', sans-serif);
    font-size: 0.82rem;
    font-weight: 700;
    white-space: nowrap;
  }
  .nav-user-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    object-fit: cover;
  }

  /* Robust Global Navigation Bar Stability */
  #nav {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    height: 64px !important;
    box-sizing: border-box !important;
    position: fixed !important;
  }
  .nav-logo {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    flex-shrink: 0 !important;
    text-decoration: none !important;
    margin-right: 36px !important;
  }
  .nav-links {
    display: flex !important;
    align-items: center !important;
    gap: 12px !important;
    margin: 0 !important;
    padding: 0 !important;
    list-style: none !important;
    flex-shrink: 0 !important;
  }
  .nav-right {
    display: flex !important;
    align-items: center !important;
    gap: 14px !important;
    flex-shrink: 0 !important;
    margin-left: auto !important;
  }

  /* Futuristic Active Tab Indicator / Completion Bar */
  #nav-active-tracker {
    position: absolute;
    bottom: 0;
    height: 3px;
    background: linear-gradient(90deg, #be4dff 0%, #00ffe5 100%);
    box-shadow: 0 0 12px rgba(190, 77, 255, 0.8), 0 0 20px rgba(0, 255, 229, 0.5);
    border-radius: 3px 3px 0 0;
    transition: left 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
    pointer-events: none;
    z-index: 101;
    opacity: 0;
  }

  /* Responsive Fixes: 1100px threshold for desktop links fitting cleanly */
  #hamburger {
    flex-shrink: 0 !important;
  }
  @media (max-width: 1100px) {
    .nav-logo {
      margin-right: 20px !important;
    }
    .nav-links a {
      padding: 6px 12px !important;
      font-size: 0.78rem !important;
    }
    .nav-links {
      gap: 6px !important;
    }
  }
  @media (max-width: 960px) {
    #nav {
      padding: 0 16px !important;
    }
    .nav-logo {
      margin-right: 0 !important;
    }
    .nav-links {
      display: none !important;
    }
    #nav-active-tracker {
      display: none !important;
    }
    .nav-user-pill, .kick-live-badge, .kick-live-badge-nav, .nav-btn-auth {
      display: none !important;
    }
    .nav-points-pill {
      padding: 0 10px !important;
      font-size: 0.82rem !important;
      height: 32px !important;
    }
    #hamburger {
      display: flex !important;
      flex-shrink: 0 !important;
    }
  }

  /* Mobile Navigation Drawer Profile Card */
  .mobile-drawer-profile {
    margin: 16px;
    padding: 16px;
    background: rgba(14, 10, 32, 0.85);
    border: 1px solid rgba(157, 0, 255, 0.3);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .mobile-profile-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .mobile-profile-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 2px solid var(--purple-400, #be4dff);
  }
  .mobile-profile-info {
    display: flex;
    flex-direction: column;
  }
  .mobile-profile-name {
    font-family: var(--font-display, 'Orbitron', sans-serif);
    font-size: 0.95rem;
    font-weight: 800;
    color: #ffffff;
  }
  .mobile-profile-sub {
    font-family: var(--font-ui, 'Rajdhani', sans-serif);
    font-size: 0.78rem;
    color: #a49bc2;
  }
  .mobile-balance-box {
    background: rgba(255, 215, 0, 0.08);
    border: 1px solid rgba(255, 215, 0, 0.3);
    border-radius: 8px;
    padding: 10px 14px;
    text-align: center;
  }
  .mobile-balance-title {
    font-family: var(--font-ui, 'Rajdhani', sans-serif);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.15em;
    color: #ffd700;
    text-transform: uppercase;
  }
  .mobile-balance-amount {
    font-family: var(--font-display, 'Orbitron', sans-serif);
    font-size: 1.25rem;
    font-weight: 900;
    color: #ffffff;
    margin: 4px 0;
  }
  .mobile-balance-sub {
    font-family: var(--font-ui, 'Rajdhani', sans-serif);
    font-size: 0.75rem;
    color: #a49bc2;
  }
`;
document.head.appendChild(style);

// ─── Token Management ────────────────────────────────────────────────────────
function getAuthToken() {
  return localStorage.getItem('bigdtv_token');
}

function setAuthToken(token) {
  localStorage.setItem('bigdtv_token', token);
}

function clearAuthToken() {
  localStorage.removeItem('bigdtv_token');
}

// Check URL for token from OAuth callback
(function captureTokenFromURL() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    setAuthToken(token);
    params.delete('token');
    const cleanSearch = params.toString();
    const newUrl = window.location.pathname + (cleanSearch ? '?' + cleanSearch : '') + window.location.hash;
    history.replaceState({}, '', newUrl);
  }
})();

// ─── Auth State ──────────────────────────────────────────────────────────────
window.authUser = null;    // Synced user profile from /auth/me
window.authLoaded = false;
window.authListeners = [];

async function bootAuth() {
  try {
    const token = getAuthToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch('/auth/me', { headers });

    if (res.ok) {
      const data = await res.json();
      window.authUser = data;
      if (data.token) {
        setAuthToken(data.token);
      }
    } else {
      clearAuthToken();
      window.authUser = null;
    }
    window.authLoaded = true;
    for (const listener of window.authListeners) {
      try { listener(window.authUser); } catch (e) { console.error(e); }
    }
  } catch (err) {
    console.error("Auth boot failed:", err);
    window.authLoaded = true;
    for (const listener of window.authListeners) {
      try { listener(null); } catch (e) { console.error(e); }
    }
  }
}

function onAuthReady(callback) {
  if (window.authLoaded) {
    callback(window.authUser);
  } else {
    window.authListeners.push(callback);
  }
}

// ─── Auth Actions ────────────────────────────────────────────────────────────
function loginWithDiscord() {
  window.location.href = '/auth/discord';
}

function linkWithKick() {
  const token = getAuthToken();
  if (!token) {
    alert("Please log in with Discord first.");
    return;
  }
  window.location.href = `/auth/kick?token=${encodeURIComponent(token)}`;
}

async function logoutUser() {
  try {
    await fetch('/auth/logout', { method: 'POST' });
  } catch (e) {
    console.error('Logout request failed:', e);
  }
  clearAuthToken();
  localStorage.removeItem('verified_degencity_username');
  localStorage.removeItem('verified_yeet_username');
  window.authUser = null;
  window.location.reload();
}

// ─── Update Navbar & Balance Displays Globally ──────────────────────────────
function updateHeaderNavUI(user) {
  const navRight = document.querySelector('#nav .nav-right');
  const desktopBtn = document.getElementById('nav-auth-btn');
  const mobileBtn = document.getElementById('mobile-nav-auth-btn');
  const isLoggedIn = !!user;

  // Clean existing injected nav elements
  const existingPill = document.getElementById('nav-user-points-pill');
  if (existingPill) existingPill.remove();
  const existingUserPill = document.getElementById('nav-user-name-pill');
  if (existingUserPill) existingUserPill.remove();

  if (isLoggedIn && navRight) {
    const pointsVal = (user.points || 0).toLocaleString();
    const augustWagerFormatted = (user.augustWagerUsd || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
    const casinoUser = user.yeetUsername || user.degencityUsername;

    // Inject points pill into top nav bar
    const pointsPill = document.createElement('a');
    pointsPill.id = 'nav-user-points-pill';
    pointsPill.href = '/store.html';
    pointsPill.className = 'nav-points-pill';
    pointsPill.title = `Wagered: $${augustWagerFormatted} ($1 = 10 Coins)`;
    pointsPill.innerHTML = `🪙 <span>${pointsVal}</span>`;
    
    // Inject user name pill for desktop
    const userPill = document.createElement('div');
    userPill.id = 'nav-user-name-pill';
    userPill.className = 'nav-user-pill';
    const avatarSrc = user.avatarUrl || '/logo.png';
    userPill.innerHTML = `<img src="${avatarSrc}" class="nav-user-avatar"/> <span>${user.displayName || 'Player'}</span>`;

    // Insert pills before hamburger icon
    const hamburger = document.getElementById('hamburger');
    if (hamburger) {
      navRight.insertBefore(pointsPill, hamburger);
      navRight.insertBefore(userPill, pointsPill);
    } else {
      navRight.appendChild(userPill);
      navRight.appendChild(pointsPill);
    }

    // Update Mobile Nav Drawer with User Profile Card
    const drawer = document.getElementById('mobile-nav-drawer');
    if (drawer) {
      let drawerProfile = document.getElementById('mobile-drawer-profile-card');
      if (!drawerProfile) {
        drawerProfile = document.createElement('div');
        drawerProfile.id = 'mobile-drawer-profile-card';
        drawerProfile.className = 'mobile-drawer-profile';
        drawer.insertBefore(drawerProfile, drawer.firstChild);
      }
      drawerProfile.innerHTML = `
        <div class="mobile-profile-header">
          <img src="${avatarSrc}" class="mobile-profile-avatar"/>
          <div class="mobile-profile-info">
            <div class="mobile-profile-name">${user.displayName || 'Player'}</div>
            <div class="mobile-profile-sub">${user.kickUsername ? 'Kick: @' + user.kickUsername : (casinoUser ? 'Yeet: ' + casinoUser : 'Account Connected')}</div>
          </div>
        </div>
        <div class="mobile-balance-box">
          <div class="mobile-balance-title">BIGD COINS WALLET</div>
          <div class="mobile-balance-amount">🪙 ${pointsVal}</div>
          <div class="mobile-balance-sub">Wagered: <strong>$${augustWagerFormatted}</strong> ($1 = 10 pts)</div>
        </div>
      `;
    }
  }

  // Update Auth Buttons (Desktop & Mobile)
  [desktopBtn, mobileBtn].forEach(btn => {
    if (!btn) return;
    if (isLoggedIn) {
      btn.textContent = 'Logout';
      btn.onclick = (e) => { e.preventDefault(); logoutUser(); };
    } else {
      btn.textContent = 'Login';
      btn.onclick = (e) => { e.preventDefault(); loginWithDiscord(); };
    }
  });

  // Update store points elements if present
  const coinVal = document.getElementById('coin-value');
  if (coinVal) coinVal.textContent = (user?.points || 0).toLocaleString();
  const storePointsVal = document.getElementById('store-points-val');
  if (storePointsVal) storePointsVal.textContent = (user?.points || 0).toLocaleString();
}

onAuthReady((user) => {
  updateHeaderNavUI(user);
});

// Start auth boot
bootAuth();

// Initialize Big D Floating Kick Widget
(function loadKickWidget() {
  if (document.getElementById('bigd-kick-widget-script')) return;
  const s = document.createElement('script');
  s.id = 'bigd-kick-widget-script';
  s.src = '/kick-widget.js';
  s.defer = true;
  document.body ? document.body.appendChild(s) : document.addEventListener('DOMContentLoaded', () => document.body.appendChild(s));
})();

// ─── Active Nav Tab Indicator / Completion Bar Controller ───────────────────
(function initNavActiveTracker() {
  function setupTracker() {
    const nav = document.getElementById('nav');
    const navLinks = document.querySelector('#nav .nav-links');
    if (!nav || !navLinks) return;

    let tracker = document.getElementById('nav-active-tracker');
    if (!tracker) {
      tracker = document.createElement('div');
      tracker.id = 'nav-active-tracker';
      nav.appendChild(tracker);
    }

    function updateTrackerPosition() {
      // Find active link
      const path = window.location.pathname.toLowerCase();
      let activeLink = navLinks.querySelector('a.active');

      if (!activeLink) {
        const allLinks = Array.from(navLinks.querySelectorAll('a'));
        activeLink = allLinks.find(a => {
          const href = (a.getAttribute('href') || '').toLowerCase();
          if (path.includes('blackjack') && href.includes('blackjack')) return true;
          if (path.includes('verify') && href.includes('verify')) return true;
          if (path.includes('store') && href.includes('store')) return true;
          if (path.includes('account') && href.includes('account')) return true;
          if ((path === '/' || path === '/index.html' || path === '') && (href === '#tabs-section' || href.includes('index.html'))) return true;
          return false;
        });
      }

      if (activeLink && window.innerWidth > 960) {
        const linkRect = activeLink.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        const left = linkRect.left - navRect.left;
        const width = linkRect.width;

        tracker.style.left = `${left}px`;
        tracker.style.width = `${width}px`;
        tracker.style.opacity = '1';
      } else {
        tracker.style.opacity = '0';
      }
    }

    // Attach click listeners to update indicator position when clicking tabs
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        setTimeout(updateTrackerPosition, 50);
      });
    });

    window.addEventListener('resize', updateTrackerPosition);
    window.addEventListener('hashchange', updateTrackerPosition);
    setTimeout(updateTrackerPosition, 80);
    setTimeout(updateTrackerPosition, 400); // Secondary check after font/styles load
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupTracker);
  } else {
    setupTracker();
  }
})();


