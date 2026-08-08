// ─── Auth Helper: Direct Discord & Kick OAuth2 + JWT ─────────────────────────
// Inject responsive navbar button & points badge styles globally
const style = document.createElement("style");
style.textContent = `
  .verify-btn, .btn-ghost, .btn-primary, .reward-card-btn, .mock-login-submit, .btn-copy-promo, .nav-btn-auth, .mobile-auth-btn {
    cursor: pointer !important;
  }
  .nav-btn-auth {
    background: linear-gradient(90deg, #8800ff, #5500aa) !important;
    border: 1px solid rgba(136, 0, 255, 0.4) !important;
    color: #ffffff !important;
    font-family: var(--font-ui, 'Rajdhani', sans-serif);
    font-size: 0.82rem !important;
    font-weight: 800 !important;
    letter-spacing: 0.08em !important;
    text-transform: uppercase !important;
    padding: 6px 14px !important;
    border-radius: 6px !important;
    transition: all 0.25s !important;
    display: inline-flex !important;
    align-items: center !important;
    height: 34px !important;
    outline: none !important;
    text-decoration: none !important;
    white-space: nowrap !important;
  }
  .nav-btn-auth:hover {
    background: linear-gradient(90deg, #9933ff, #7700cc) !important;
    box-shadow: 0 0 15px rgba(136, 0, 255, 0.45) !important;
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

  /* Mobile Responsive Fixes: Zero Overlap on Phone Screens */
  @media (max-width: 768px) {
    #nav {
      padding: 0 14px !important;
    }
    .nav-logo {
      font-size: 1.25rem !important;
    }
    .nav-user-pill, .kick-live-badge-nav {
      display: none !important;
    }
    .nav-points-pill {
      padding: 0 9px;
      font-size: 0.8rem;
      height: 30px;
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

    // Inject points pill into top nav bar
    const pointsPill = document.createElement('a');
    pointsPill.id = 'nav-user-points-pill';
    pointsPill.href = '/store.html';
    pointsPill.className = 'nav-points-pill';
    pointsPill.title = `August Wagered: $${augustWagerFormatted} ($1 = 10 Coins)`;
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
            <div class="mobile-profile-sub">${user.kickUsername ? 'Kick: @' + user.kickUsername : (user.degencityUsername ? 'DegenCity: ' + user.degencityUsername : 'Account Connected')}</div>
          </div>
        </div>
        <div class="mobile-balance-box">
          <div class="mobile-balance-title">BIGD COINS WALLET</div>
          <div class="mobile-balance-amount">🪙 ${pointsVal}</div>
          <div class="mobile-balance-sub">August Wagered: <strong>$${augustWagerFormatted}</strong> ($1 = 10 pts)</div>
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

