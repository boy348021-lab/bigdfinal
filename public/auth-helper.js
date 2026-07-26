let clerkInstance = null;

// Inject hand-pointer styles globally to ensure hover feedback on all buttons
const style = document.createElement("style");
style.textContent = `
  .verify-btn, .btn-ghost, .btn-primary, .reward-card-btn, .mock-login-submit, .btn-copy-promo {
    cursor: pointer !important;
  }
`;
document.head.appendChild(style);

async function initClerk() {
  if (clerkInstance) return clerkInstance;

  // 1. Fetch publishable key from backend
  let publishableKey = "";
  try {
    const res = await fetch("/api/auth/config");
    const config = await res.json();
    publishableKey = config.publishableKey;
  } catch (e) {
    console.warn("Could not fetch Clerk config, running in Mock Mode.");
  }

  if (!publishableKey) {
    console.log("Clerk Publishable Key is empty. Activating Mock Clerk Mode.");
    clerkInstance = new MockClerk();
    await clerkInstance.load();
    return clerkInstance;
  }

  // 2. Load Clerk script dynamically
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@4/dist/clerk.browser.js";
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    const clerk = new window.Clerk(publishableKey);
    await clerk.load();
    clerkInstance = clerk;
    return clerk;
  } catch (err) {
    console.error("Clerk script load failed, falling back to Mock Clerk Mode.");
    clerkInstance = new MockClerk();
    await clerkInstance.load();
    return clerkInstance;
  }
}

class MockClerk {
  constructor() {
    this.user = null;
    this.session = null;
  }
  async load() {
    const savedUser = localStorage.getItem("mock_clerk_user");
    if (savedUser) {
      this.user = JSON.parse(savedUser);
      this.session = {
        getToken: async () => `mock_jwt_${btoa(JSON.stringify(this.user))}`
      };
    }
  }
  openSignIn({ afterSignInUrl } = {}) {
    showMockLoginModal(afterSignInUrl);
  }
  async signOut() {
    this.user = null;
    this.session = null;
    localStorage.removeItem("mock_clerk_user");
  }
}

function showMockLoginModal(afterSignInUrl) {
  const existing = document.getElementById("mock-clerk-modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "mock-clerk-modal";
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(8, 8, 16, 0.85);
    backdrop-filter: blur(12px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.25s ease-out;
  `;

  const styleTag = document.createElement("style");
  styleTag.textContent = `
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  `;
  document.head.appendChild(styleTag);

  const card = document.createElement("div");
  card.style.cssText = `
    background: rgba(17, 17, 42, 0.95);
    border: 1px solid rgba(0, 255, 229, 0.25);
    border-radius: 16px;
    padding: 40px;
    width: 90%;
    max-width: 420px;
    box-shadow: 0 0 40px rgba(0, 255, 229, 0.15), 0 0 100px rgba(136, 0, 255, 0.1);
    text-align: center;
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  card.innerHTML = `
    <h2 style="font-family: 'Orbitron', sans-serif; color: #00ffe5; font-size: 1.8rem; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Mock Clerk Portal</h2>
    <p style="font-family: 'Space Grotesk', sans-serif; color: #a099c0; font-size: 0.95rem; margin-bottom: 28px; line-height: 1.5;">Enter a mock Discord username to simulate authentication on localhost.</p>
    
    <div style="text-align: left; margin-bottom: 24px;">
      <label style="font-family: 'Rajdhani', sans-serif; font-size: 0.8rem; font-weight: 700; color: #5a5480; text-transform: uppercase; letter-spacing: 0.15em; display: block; margin-bottom: 8px;">Discord Username</label>
      <input type="text" id="mock-discord-username" placeholder="e.g. supermustang" style="width: 100%; padding: 12px 16px; border-radius: 4px; border: 1px solid rgba(136, 0, 255, 0.2); background: rgba(8, 8, 16, 0.7); color: #f0e8ff; font-family: 'Space Grotesk', sans-serif; font-size: 1rem; outline: none; box-sizing: border-box;" autocomplete="off"/>
    </div>

    <button id="mock-login-submit" class="mock-login-submit" style="width: 100%; padding: 14px; border-radius: 4px; border: none; background: linear-gradient(90deg, #00ffe5, #00c8b4); color: #080810; font-family: 'Rajdhani', sans-serif; font-size: 1.1rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 0 15px rgba(0, 255, 229, 0.35); display: flex; align-items: center; justify-content: center; gap: 8px;">
      <span>Connect Account</span>
      <span>→</span>
    </button>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const input = document.getElementById("mock-discord-username");
  if (input) input.focus();

  const submitBtn = document.getElementById("mock-login-submit");
  if (submitBtn) {
    submitBtn.onmouseenter = () => {
      submitBtn.style.transform = "translateY(-2px)";
      submitBtn.style.boxShadow = "0 0 25px rgba(0, 255, 229, 0.6)";
      submitBtn.style.background = "linear-gradient(90deg, #33fff0, #00ffe5)";
    };
    submitBtn.onmouseleave = () => {
      submitBtn.style.transform = "translateY(0)";
      submitBtn.style.boxShadow = "0 0 15px rgba(0, 255, 229, 0.35)";
      submitBtn.style.background = "linear-gradient(90deg, #00ffe5, #00c8b4)";
    };

    submitBtn.onclick = async () => {
      const username = input.value.trim();
      if (!username) return alert("Please enter a username");

      const mockUser = {
        id: `user_mock_${Math.random().toString(36).substring(2, 11)}`,
        username: username.toLowerCase(),
        displayName: username,
        email: `${username.toLowerCase()}@mock-user.com`,
        avatarUrl: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(username)}`,
        discordId: `discord_${Math.floor(Math.random() * 1000000000000)}`
      };

      localStorage.setItem("mock_clerk_user", JSON.stringify(mockUser));
      overlay.remove();

      await bootAuth();
      if (afterSignInUrl) {
        window.location.href = afterSignInUrl;
      } else {
        window.location.reload();
      }
    };
  }

  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };
}

async function getClerkToken() {
  const clerk = await initClerk();
  if (clerk && clerk.session) {
    return await clerk.session.getToken();
  }
  return null;
}

async function syncClerkUser() {
  const token = await getClerkToken();
  if (!token) return null;

  try {
    const res = await fetch("/auth/sync", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    if (res.ok) {
      const data = await res.json();
      return data.user;
    }
  } catch (err) {
    console.error("Error syncing Clerk user with Supabase:", err);
  }
  return null;
}

window.clerkUser = null;
window.clerkLoaded = false;
window.clerkAuthListeners = [];

async function bootAuth() {
  try {
    const clerk = await initClerk();
    if (clerk && clerk.user) {
      window.clerkUser = await syncClerkUser();
    }
    window.clerkLoaded = true;
    
    for (const listener of window.clerkAuthListeners) {
      try { listener(clerk); } catch (e) { console.error(e); }
    }
  } catch (err) {
    console.error("Auth boot failed:", err);
    window.clerkLoaded = true;
  }
}

function onClerkAuth(callback) {
  if (window.clerkLoaded) {
    callback(clerkInstance);
  } else {
    window.clerkAuthListeners.push(callback);
  }
}

async function loginWithDiscord() {
  const clerk = await initClerk();
  if (clerk) {
    clerk.openSignIn({
      afterSignInUrl: window.location.href,
      afterSignUpUrl: window.location.href,
    });
  }
}

async function logoutClerk() {
  const clerk = await initClerk();
  if (clerk) {
    await clerk.signOut();
    await fetch("/auth/logout", { method: "POST" });
    window.location.reload();
  }
}

bootAuth();
