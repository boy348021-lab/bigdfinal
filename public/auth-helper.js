// ─── Auth Helper: Direct Discord & Kick OAuth2 + JWT ─────────────────────────
// Inject hand-pointer and auth navbar button styles globally
const style = document.createElement("style");
style.textContent = `
  .verify-btn, .btn-ghost, .btn-primary, .reward-card-btn, .mock-login-submit, .btn-copy-promo, .nav-btn-auth, .mobile-auth-btn {
    cursor: pointer !important;
  }
  .nav-btn-auth {
    background: linear-gradient(90deg, #8800ff, #5500aa) !important;
    border: 1px solid rgba(136, 0, 255, 0.2) !important;
    color: #ffffff !important;
    font-family: inherit;
    font-size: 0.85rem !important;
    font-weight: 700 !important;
    letter-spacing: 0.08em !important;
    text-transform: uppercase !important;
    padding: 8px 16px !important;
    border-radius: 4px !important;
    transition: all 0.25s !important;
    display: inline-flex !important;
    align-items: center !important;
    height: fit-content !important;
    border: none !important;
    outline: none !important;
  }
  .nav-btn-auth:hover {
    background: linear-gradient(90deg, #9933ff, #7700cc) !important;
    box-shadow: 0 0 15px rgba(136, 0, 255, 0.45) !important;
  }
  .mobile-auth-btn {
    display: block !important;
    margin: 16px 24px !important;
    padding: 12px !important;
    background: linear-gradient(90deg, #8800ff, #5500aa) !important;
    text-align: center !important;
    border-radius: 4px !important;
    color: #ffffff !important;
    font-family: inherit;
    font-size: 0.95rem !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
    border: none !important;
    width: calc(100% - 48px) !important;
    box-sizing: border-box !important;
    text-decoration: none !important;
  }
  .mobile-auth-btn:hover {
    background: linear-gradient(90deg, #9933ff, #7700cc) !important;
    box-shadow: 0 0 15px rgba(136, 0, 255, 0.45) !important;
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
    // Clean the token from URL without reloading
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
    if (token) {
      const res = await fetch('/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        window.authUser = data;
      } else {
        clearAuthToken();
        window.authUser = null;
      }
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

// ─── Auto-bind navbar auth buttons ───────────────────────────────────────────
onAuthReady((user) => {
  const desktopBtn = document.getElementById('nav-auth-btn');
  const mobileBtn = document.getElementById('mobile-nav-auth-btn');
  const isLoggedIn = !!user;
  
  [desktopBtn, mobileBtn].forEach(btn => {
    if (!btn) return;
    if (isLoggedIn) {
      btn.textContent = 'Logout';
      btn.onclick = (e) => {
        e.preventDefault();
        logoutUser();
      };
    } else {
      btn.textContent = 'Login';
      btn.onclick = (e) => {
        e.preventDefault();
        loginWithDiscord();
      };
    }
  });
});

// Start auth boot
bootAuth();
