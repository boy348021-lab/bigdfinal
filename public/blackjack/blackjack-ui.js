/* ============================================================
   BLACKJACK CASINO UI CONTROLLER & INTERACTIVE COMPONENT
   ============================================================ */

(function () {
  let activeHand = null;          // Holds the final authoritative snapshot
  let currentBet = 10;
  let expectedSequenceNumber = 1;
  let eventQueue = [];
  let isAnimating = false;
  let processedEventIds = new Set();
  let loadingMessage = "";

  function initBlackjackUI(containerId = 'blackjack-app') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="bj-container">
        <!-- Left Sidebar Controls -->
        <div class="bj-sidebar">
          <div class="bj-mode-tabs">
            <button class="bj-mode-btn active" id="bj-mode-std" style="width:100%;">Standard Mode</button>
          </div>

          <div class="bj-bet-box">
            <div class="bj-bet-header">
              <span>Bet Amount</span>
              <span>Balance: <span class="bj-balance-val" id="bj-balance-display">0</span> Coins</span>
            </div>
            <div class="bj-input-row">
              <span class="bj-currency-symbol">🪙</span>
              <input type="number" id="bj-bet-input" class="bj-bet-input" value="10" min="1" step="1"/>
              <div class="bj-multiplier-btns">
                <button class="bj-mult-btn" id="bj-btn-half">½</button>
                <button class="bj-mult-btn" id="bj-btn-double">2x</button>
              </div>
            </div>
            
            <!-- Casino Chips Selector -->
            <div class="bj-chips-selector">
              <button class="bj-chip-btn bj-chip-1" onclick="addBetChip(1)">+1</button>
              <button class="bj-chip-btn bj-chip-5" onclick="addBetChip(5)">+5</button>
              <button class="bj-chip-btn bj-chip-25" onclick="addBetChip(25)">+25</button>
              <button class="bj-chip-btn bj-chip-100" onclick="addBetChip(100)">+100</button>
              <button class="bj-chip-btn bj-chip-500" onclick="addBetChip(500)">+500</button>
            </div>
          </div>

          <!-- Action Grid -->
          <div class="bj-actions-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <button class="bj-action-btn" id="bj-btn-hit" disabled style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:#fff; font-weight:700; cursor:pointer;">
              <span>Hit</span>
              <span style="font-size:1.1rem; margin-top:4px;">📥</span>
            </button>
            <button class="bj-action-btn" id="bj-btn-stand" disabled style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:#fff; font-weight:700; cursor:pointer;">
              <span>Stand</span>
              <span style="font-size:1.1rem; margin-top:4px;">✋</span>
            </button>
            <button class="bj-action-btn" id="bj-btn-double-down" disabled style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:#fff; font-weight:700; cursor:pointer;">
              <span>Double</span>
              <span style="font-size:1.1rem; margin-top:4px;">⚡</span>
            </button>
            <button class="bj-action-btn" id="bj-btn-split" disabled style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.05); color:#fff; font-weight:700; cursor:pointer;">
              <span>Split</span>
              <span style="font-size:1.1rem; margin-top:4px;">🔀</span>
            </button>
          </div>

          <button class="bj-main-btn" id="bj-btn-main" style="width:100%; padding:14px; border-radius:8px; background:linear-gradient(90deg, #8800ff, #5500aa); color:#fff; font-weight:800; text-transform:uppercase; font-size:1rem; border:none; cursor:pointer; box-shadow:0 4px 15px rgba(136,0,255,0.3);">Deal Hand</button>
        </div>

        <!-- Main Felt Table -->
        <div class="bj-table" style="position:relative; flex:1; display:flex; flex-direction:column; justify-content:space-between; padding:40px 20px; background:radial-gradient(circle at 50% 50%, #17122e 0%, #060412 100%);">
          <div class="bj-ribbons">
            <div class="bj-ribbon-text">BLACKJACK PAYS 3 TO 2</div>
            <div class="bj-ribbon-text">INSURANCE PAYS 2 TO 1</div>
          </div>

          <!-- Dealer Hand Area -->
          <div class="bj-hand-area">
            <div style="font-size:0.8rem; font-weight:800; color:#a09bbd; letter-spacing:0.1em; text-transform:uppercase;">Dealer</div>
            <div class="bj-score-badge" id="bj-dealer-score">?</div>
            <div class="bj-cards-row" id="bj-dealer-cards">
              <!-- Cards rendered dynamically -->
            </div>
          </div>

          <!-- Loading / Status Box -->
          <div id="bj-status-indicator" style="text-align:center; color:#ffd700; font-family:var(--font-display); font-size:1.1rem; font-weight:800; min-height:24px; text-shadow:0 0 10px rgba(255,215,0,0.3);"></div>

          <!-- Result Overlay -->
          <div class="bj-result-overlay" id="bj-result-overlay">
            <div class="bj-result-title" id="bj-result-title">YOU WIN</div>
            <div class="bj-result-payout" id="bj-result-payout">+20 BigD Coins</div>
          </div>

          <!-- Insurance Overlay -->
          <div class="bj-result-overlay" id="bj-insurance-overlay" style="display:none; flex-direction:column; justify-content:center; align-items:center; background:rgba(6, 4, 18, 0.95); z-index:10;">
            <div style="font-family:var(--font-display); font-size:1.6rem; color:#ffd700; margin-bottom:10px; text-shadow:0 0 10px rgba(255,215,0,0.5);">INSURANCE OFFERED</div>
            <p id="bj-insurance-cost-text" style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:20px; max-width:320px; text-align:center; line-height:1.4;"></p>
            <div style="display:flex; gap:16px;">
              <button id="bj-btn-ins-yes" style="padding:12px 24px; font-weight:800; text-transform:uppercase; background:#00e676; color:#000; border-radius:8px; cursor:pointer; font-family:var(--font-ui); font-size:1rem; min-width:120px; border:none; transition:transform 0.2s;">Buy Yes</button>
              <button id="bj-btn-ins-no" style="padding:12px 24px; font-weight:800; text-transform:uppercase; background:#ff3b30; color:#fff; border-radius:8px; cursor:pointer; font-family:var(--font-ui); font-size:1rem; min-width:120px; border:none; transition:transform 0.2s;">Decline No</button>
            </div>
          </div>

          <!-- Player Hand Area -->
          <div class="bj-hand-area">
            <div style="font-size:0.8rem; font-weight:800; color:#a09bbd; letter-spacing:0.1em; text-transform:uppercase;">Your Hand</div>
            <div class="bj-cards-row" id="bj-player-cards">
              <!-- Cards rendered dynamically -->
            </div>
            <div class="bj-score-badge" id="bj-player-score">0</div>
          </div>
        </div>
      </div>
    `;

    bindEvents();
    syncBalance();
    restoreActiveGame();
    loadHistoryAndStats();
  }

  function bindEvents() {
    const betInput = document.getElementById('bj-bet-input');
    const btnHalf = document.getElementById('bj-btn-half');
    const btnDouble = document.getElementById('bj-btn-double');
    const btnMain = document.getElementById('bj-btn-main');
    const btnHit = document.getElementById('bj-btn-hit');
    const btnStand = document.getElementById('bj-btn-stand');
    const btnDoubleDown = document.getElementById('bj-btn-double-down');
    const btnSplit = document.getElementById('bj-btn-split');

    if (btnHalf) btnHalf.onclick = () => { betInput.value = Math.max(1, Math.floor(parseInt(betInput.value || 10, 10) / 2)); };
    if (btnDouble) btnDouble.onclick = () => { betInput.value = Math.max(1, parseInt(betInput.value || 10, 10) * 2); };

    if (btnMain) btnMain.onclick = startDeal;
    if (btnHit) btnHit.onclick = () => performAction('hit');
    if (btnStand) btnStand.onclick = () => performAction('stand');
    if (btnDoubleDown) btnDoubleDown.onclick = () => performAction('double');
    if (btnSplit) btnSplit.onclick = () => performAction('split');

    const btnInsYes = document.getElementById('bj-btn-ins-yes');
    const btnInsNo = document.getElementById('bj-btn-ins-no');
    if (btnInsYes) btnInsYes.addEventListener('click', () => buyOrDeclineInsurance(true));
    if (btnInsNo) btnInsNo.addEventListener('click', () => buyOrDeclineInsurance(false));
  }

  window.addBetChip = function(amt) {
    const betInput = document.getElementById('bj-bet-input');
    if (betInput) {
      playSound('chip');
      const current = parseInt(betInput.value || 0, 10);
      betInput.value = current + amt;
    }
  };

  function generateActionId() {
    return 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  function getGuestId() {
    let id = localStorage.getItem('bj_guest_id');
    if (!id) {
      id = 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('bj_guest_id', id);
    }
    return id;
  }

  function getFetchHeaders() {
    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
    const headers = {
      'Content-Type': 'application/json',
      'X-Guest-ID': getGuestId()
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  function isUserLoggedIn() {
    return !!(window.authUser && window.authUser.loggedIn) || !!(typeof getAuthToken === 'function' && getAuthToken());
  }

  async function syncBalance() {
    const balanceEl = document.getElementById('bj-balance-display');
    const navPill = document.querySelector('.nav-points-pill span');
    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;

    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/auth/me', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data && data.loggedIn) {
          window.authUser = data;
          const pts = (data.points || 0).toLocaleString();
          if (balanceEl) balanceEl.textContent = pts;
          if (navPill) navPill.textContent = pts;
          return;
        }
      }
    } catch (e) {
      console.warn("syncBalance auth check error:", e);
    }

    let guestBalance = Number(localStorage.getItem('bj_guest_balance'));
    if (isNaN(guestBalance) || guestBalance === null || localStorage.getItem('bj_guest_balance') === null) {
      guestBalance = 10000;
      localStorage.setItem('bj_guest_balance', guestBalance);
    }
    if (balanceEl) balanceEl.textContent = `${Number(guestBalance).toLocaleString()} (Guest)`;
  }

  function playSound(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'deal') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'chip') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'win') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'loss') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (e) {}
  }

  // ─── EVENT ANIMATION & QUEUEING ENGINE ─────────────────────────

  function queueEvents(events) {
    for (const evt of events) {
      if (evt.sequenceNumber < expectedSequenceNumber) {
        // Skip duplicate sequence numbers
        continue;
      }
      if (processedEventIds.has(evt.eventId)) {
        // Skip processed IDs
        continue;
      }
      // Check if event already in queue
      if (!eventQueue.find(e => e.eventId === evt.eventId)) {
        eventQueue.push(evt);
      }
    }
    // Ensure strict sequence ordering
    eventQueue.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    processNextEvent();
  }

  async function processNextEvent() {
    if (isAnimating) return;
    if (eventQueue.length === 0) {
      isAnimating = false;
      renderCurrentUIState();
      return;
    }

    const nextEvent = eventQueue[0];
    if (nextEvent.sequenceNumber !== expectedSequenceNumber) {
      console.log(`Gap in event sequence: expected ${expectedSequenceNumber}, got ${nextEvent.sequenceNumber}. Awaiting...`);
      return;
    }

    // Dequeue
    eventQueue.shift();
    isAnimating = true;
    processedEventIds.add(nextEvent.eventId);

    try {
      await animateEvent(nextEvent);
      expectedSequenceNumber++;
    } catch (err) {
      console.error("Error during event animation:", err);
    } finally {
      isAnimating = false;
      processNextEvent();
    }
  }

  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  async function animateEvent(evt) {
    const statusEl = document.getElementById('bj-status-indicator');
    const type = evt.eventType;
    const payload = evt.payload || {};

    switch (type) {
      case 'ROUND_CREATED':
        clearBoardVisuals();
        setStatusText("");
        await delay(300);
        break;

      case 'BET_ACCEPTED':
        setStatusText("");
        playSound('chip');
        await delay(400);
        break;

      case 'DEALING_STARTED':
        setStatusText("DEALING CARDS...");
        await delay(300);
        break;

      case 'DEAL_PLAYER_CARD': {
        const row = document.getElementById('bj-player-cards');
        if (row) row.innerHTML += renderCardMarkup(payload.card);
        playSound('deal');
        setStatusText("");
        await delay(500);
        break;
      }

      case 'DEAL_DEALER_VISIBLE_CARD': {
        const row = document.getElementById('bj-dealer-cards');
        if (row) row.innerHTML += renderCardMarkup(payload.card);
        playSound('deal');
        setStatusText("");
        await delay(500);
        break;
      }

      case 'DEAL_DEALER_HIDDEN_CARD': {
        const row = document.getElementById('bj-dealer-cards');
        if (row) row.innerHTML += `<div class="bj-card bj-card-back" id="bj-dealer-hole-card"></div>`;
        playSound('deal');
        setStatusText("");
        await delay(500);
        break;
      }

      case 'INITIAL_DEAL_COMPLETE':
        setStatusText("");
        await delay(300);
        break;

      case 'CHECK_BLACKJACK':
        setStatusText("");
        await delay(400);
        break;

      case 'PLAYER_TURN_STARTED':
        setStatusText("YOUR TURN");
        await delay(350);
        break;

      case 'PLAYER_ACTION':
        setStatusText("");
        await delay(300);
        break;

      case 'PLAYER_CARD_DEALT': {
        const row = document.getElementById('bj-player-cards');
        if (row) row.innerHTML += renderCardMarkup(payload.card);
        playSound('deal');
        setStatusText("");
        await delay(500);
        break;
      }

      case 'PLAYER_STAND':
        setStatusText("");
        await delay(400);
        break;

      case 'DOUBLE_REQUESTED':
        setStatusText("");
        await delay(200);
        break;

      case 'DOUBLE_CONFIRMED':
        setStatusText("");
        playSound('chip');
        await delay(300);
        break;

      case 'ONE_CARD_DEALT': {
        const row = document.getElementById('bj-player-cards');
        if (row) row.innerHTML += renderCardMarkup(payload.card);
        playSound('deal');
        setStatusText("");
        await delay(500);
        break;
      }

      case 'HAND_COMPLETED':
        setStatusText("");
        await delay(300);
        break;

      case 'DEALER_TURN_STARTED':
        setStatusText("DEALER'S TURN");
        await delay(400);
        break;

      case 'DEALER_REVEAL_HIDDEN_CARD': {
        const row = document.getElementById('bj-dealer-cards');
        if (row && payload.dealerCards) {
          row.innerHTML = payload.dealerCards.map(c => renderCardMarkup(c)).join('');
        }
        playSound('chip');
        setStatusText("");
        await delay(600);
        break;
      }

      case 'DEALER_CARD_DEALT': {
        const row = document.getElementById('bj-dealer-cards');
        if (row) row.innerHTML += renderCardMarkup(payload.card);
        playSound('deal');
        setStatusText("");
        await delay(500);
        break;
      }

      case 'EVALUATE_DEALER_HAND':
        setStatusText("");
        await delay(300);
        break;

      case 'DEALER_TURN_COMPLETED':
        setStatusText("");
        await delay(300);
        break;

      case 'RESULT_CALCULATED':
        setStatusText("");
        await delay(400);
        break;

      case 'PAYOUT_PROCESSED':
        setStatusText("");
        await delay(300);
        break;

      case 'ROUND_COMPLETED':
        setStatusText("");
        await delay(200);
        break;
        
      default:
        console.log("Unhandled event animation type:", type);
    }
  }

  function setStatusText(txt) {
    const el = document.getElementById('bj-status-indicator');
    if (el) el.textContent = txt;
  }

  function clearBoardVisuals() {
    const dealerCardsEl = document.getElementById('bj-dealer-cards');
    const playerCardsEl = document.getElementById('bj-player-cards');
    const dealerScoreEl = document.getElementById('bj-dealer-score');
    const playerScoreEl = document.getElementById('bj-player-score');
    const overlay = document.getElementById('bj-result-overlay');
    const insOverlay = document.getElementById('bj-insurance-overlay');

    if (overlay) overlay.classList.remove('show');
    if (insOverlay) {
      insOverlay.style.display = 'none';
      insOverlay.classList.remove('show');
    }
    if (dealerCardsEl) dealerCardsEl.innerHTML = '';
    if (playerCardsEl) playerCardsEl.innerHTML = '';
    if (dealerScoreEl) { dealerScoreEl.textContent = '?'; dealerScoreEl.className = 'bj-score-badge'; }
    if (playerScoreEl) { playerScoreEl.textContent = '0'; playerScoreEl.className = 'bj-score-badge'; }
  }

  function renderCardMarkup(card) {
    if (!card || card.visibility === 'face_down') {
      return `<div class="bj-card bj-card-back"></div>`;
    }
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    const colorClass = isRed ? 'red' : 'black';
    
    // Map suits to shapes
    const suitSymbol = {
      spades: '♠',
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣'
    }[card.suit] || '';

    return `
      <div class="bj-card ${colorClass}">
        <div class="bj-card-top">
          <span class="bj-card-value">${card.rank}</span>
          <span class="bj-card-suit-small">${suitSymbol}</span>
        </div>
        <span class="bj-card-suit-center" style="font-size:2rem; align-self:center; margin-top:2px;">${suitSymbol}</span>
      </div>
    `;
  }

  // ─── authoritative rendering after animation sequence completes ───

  function renderCurrentUIState() {
    if (!activeHand) return;

    // sync points headers & balance displays
    syncBalance();

    const overlay = document.getElementById('bj-result-overlay');
    if (overlay && !activeHand.isEnded) overlay.classList.remove('show');

    // 1. Render dealer cards
    const dealerCardsEl = document.getElementById('bj-dealer-cards');
    const dealerScoreEl = document.getElementById('bj-dealer-score');
    if (dealerCardsEl) {
      dealerCardsEl.innerHTML = activeHand.dealerCards.map(c => renderCardMarkup(c)).join('');
    }
    if (dealerScoreEl) {
      dealerScoreEl.textContent = activeHand.dealerScore;
      dealerScoreEl.className = 'bj-score-badge' + (activeHand.dealerIsBust ? ' bust' : '');
    }

    // 2. Render player hands (handles splits)
    const playerCardsEl = document.getElementById('bj-player-cards');
    const playerScoreEl = document.getElementById('bj-player-score');

    if (activeHand.isSplit) {
      if (playerCardsEl) {
        playerCardsEl.innerHTML = `
          <div style="display:flex; gap:20px; justify-content:center; align-items:flex-start; margin:10px 0; width:100%; flex-wrap:wrap;">
            ${activeHand.playerHands.map((h, i) => {
              const isActive = activeHand.activeHandIndex === i && !activeHand.isEnded;
              return `
                <div style="display:flex; flex-direction:column; align-items:center; border:${isActive ? '2px solid #00e676' : '1px solid rgba(255,255,255,0.1)'}; padding:12px; border-radius:10px; background:rgba(0,0,0,0.3); box-shadow:${isActive ? '0 0 15px rgba(0,230,118,0.25)' : 'none'}; min-width:140px;">
                  <div style="font-size:0.75rem; font-weight:800; color:${isActive ? '#00e676' : '#a09bbd'}; margin-bottom:6px; text-transform:uppercase;">
                    Hand ${i + 1} ${isActive ? '● Active' : ''}
                  </div>
                  <div style="display:flex; gap:6px;">
                    ${h.cards.map(c => renderCardMarkup(c)).join('')}
                  </div>
                  <div class="bj-score-badge ${h.isBust ? 'bust' : ''}" style="margin-top:8px;">${h.score}</div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
      if (playerScoreEl) playerScoreEl.style.display = 'none';
    } else {
      const primaryHand = activeHand.playerHands[0];
      if (primaryHand && playerCardsEl) {
        playerCardsEl.innerHTML = primaryHand.cards.map(c => renderCardMarkup(c)).join('');
      }
      if (primaryHand && playerScoreEl) {
        playerScoreEl.style.display = 'block';
        playerScoreEl.textContent = primaryHand.score;
        playerScoreEl.className = 'bj-score-badge' + (primaryHand.isBust ? ' bust' : primaryHand.isBlackjack ? ' win' : '');
      }
    }

    // 3. Update Action Buttons
    const btnHit = document.getElementById('bj-btn-hit');
    const btnStand = document.getElementById('bj-btn-stand');
    const btnDoubleDown = document.getElementById('bj-btn-double-down');
    const btnSplit = document.getElementById('bj-btn-split');
    const btnMain = document.getElementById('bj-btn-main');

    if (btnHit) btnHit.disabled = !activeHand.canHit;
    if (btnStand) btnStand.disabled = !activeHand.canStand;
    if (btnDoubleDown) btnDoubleDown.disabled = !activeHand.canDouble;
    if (btnSplit) btnSplit.disabled = !activeHand.canSplit;

    if (btnMain) {
      btnMain.textContent = activeHand.isEnded ? 'Deal Hand' : 'Game In Progress';
      btnMain.disabled = !activeHand.isEnded;
    }

    // 3.5 Check if insurance is offered
    const insOverlay = document.getElementById('bj-insurance-overlay');
    if (insOverlay) {
      if (activeHand.insuranceOffered && !activeHand.insuranceTaken && activeHand.insuranceBet === 0 && !activeHand.isEnded) {
        insOverlay.style.display = 'flex';
        insOverlay.classList.add('show');
        const costText = document.getElementById('bj-insurance-cost-text');
        if (costText) {
          costText.textContent = `Dealer shows Ace. Buy insurance for ${activeHand.insuranceCost} coins? (Pays 2:1 if dealer has Blackjack)`;
        }
      } else {
        insOverlay.style.display = 'none';
        insOverlay.classList.remove('show');
      }
    }

    // 4. Handle End of Round overlay
    if (activeHand.isEnded) {
      if (!isUserLoggedIn() && (!window.guestPayoutHandledForGame || window.guestPayoutHandledForGame !== activeHand.gameId)) {
        let guestBalance = Number(localStorage.getItem('bj_guest_balance'));
        if (isNaN(guestBalance) || guestBalance === null || localStorage.getItem('bj_guest_balance') === null) {
          guestBalance = 10000;
          localStorage.setItem('bj_guest_balance', guestBalance);
        }
        guestBalance += activeHand.totalPayout;
        localStorage.setItem('bj_guest_balance', guestBalance);
        syncBalance();
        window.guestPayoutHandledForGame = activeHand.gameId;
      }
      displayRoundOutcome();
      loadHistoryAndStats();
    }
  }

  function displayRoundOutcome() {
    const overlay = document.getElementById('bj-result-overlay');
    const titleEl = document.getElementById('bj-result-title');
    const payoutEl = document.getElementById('bj-result-payout');
    if (!overlay || !titleEl || !payoutEl) return;

    const outcomes = activeHand.playerHands.map(h => h.outcome);
    let titleText = 'DEALER WINS';
    let titleClass = 'bj-result-title loss';
    
    // Exact Points result strings: Show BET, profit, return explicitly
    let profitDetailsText = `Bet: ${activeHand.initialBet} | Return: ${activeHand.totalPayout}`;

    if (outcomes.includes('PLAYER_BLACKJACK')) {
      titleText = 'BLACKJACK!';
      titleClass = 'bj-result-title win';
      playSound('win');
    } else if (outcomes.includes('PLAYER_WIN')) {
      titleText = 'YOU WIN!';
      titleClass = 'bj-result-title win';
      playSound('win');
    } else if (outcomes.includes('PUSH')) {
      titleText = 'PUSH (TIE)';
      titleClass = 'bj-result-title push';
      playSound('deal');
    } else {
      playSound('loss');
    }

    titleEl.textContent = titleText;
    titleEl.className = titleClass;

    const profitVal = activeHand.totalProfit;
    const profitSign = profitVal >= 0 ? `+${profitVal}` : `${profitVal}`;
    payoutEl.textContent = `Outcome: ${profitSign} Coins (${profitDetailsText})`;

    overlay.classList.add('show');
  }

  // ─── BACKEND API DISPATCH CALLS ──────────────────────────────

  async function startDeal() {
    const betInput = document.getElementById('bj-bet-input');
    const betVal = parseInt(betInput.value || 0, 10);

    if (isNaN(betVal) || betVal < 0) {
      alert("Please enter a valid bet amount.");
      return;
    }

    if (!isUserLoggedIn()) {
      let guestBalance = Number(localStorage.getItem('bj_guest_balance'));
      if (isNaN(guestBalance) || guestBalance === null || localStorage.getItem('bj_guest_balance') === null) {
        guestBalance = 10000;
        localStorage.setItem('bj_guest_balance', guestBalance);
      }
      if (guestBalance < betVal) {
        alert("Insufficient guest balance.");
        return;
      }
      guestBalance -= betVal;
      localStorage.setItem('bj_guest_balance', guestBalance);
      syncBalance();
    }

    setButtonsDisabled(true);
    setStatusText("PROCESSING BET...");

    try {
      const actionId = generateActionId();
      const headers = getFetchHeaders();

      const res = await fetch('/api/casino/blackjack/deal', {
        method: 'POST',
        headers,
        body: JSON.stringify({ bet: betVal, actionId })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Deal failed.");
        setStatusText("ERROR");
        syncBalance();
        renderCurrentUIState();
        return;
      }

      currentBet = betVal;
      activeHand = data.handState;
      expectedSequenceNumber = 1;
      eventQueue = [];
      processedEventIds.clear();
      isAnimating = false;

      // Update balance immediately from server response
      if (data.new_balance !== undefined && data.new_balance !== null) {
        const balanceEl = document.getElementById('bj-balance-display');
        if (balanceEl) balanceEl.textContent = Number(data.new_balance).toLocaleString();
      }

      // Queue the deal event stream
      queueEvents(activeHand.events || []);
    } catch (err) {
      console.error("Deal error:", err);
      alert("Server error starting game.");
      setStatusText("ERROR");
      setButtonsDisabled(false);
    }
  }

  async function performAction(actionName) {
    if (!activeHand || activeHand.isEnded) return;

    if (!isUserLoggedIn()) {
      let guestBalance = Number(localStorage.getItem('bj_guest_balance'));
      if (isNaN(guestBalance) || guestBalance === null || localStorage.getItem('bj_guest_balance') === null) {
        guestBalance = 10000;
        localStorage.setItem('bj_guest_balance', guestBalance);
      }
      if (actionName === 'double' || actionName === 'split') {
        guestBalance -= currentBet;
      } else if (actionName === 'buyInsurance') {
        guestBalance -= Math.floor(currentBet / 2);
      }
      localStorage.setItem('bj_guest_balance', guestBalance);
      syncBalance();
    }

    setButtonsDisabled(true);
    setStatusText("PROCESSING...");

    try {
      const actionId = generateActionId();
      const headers = getFetchHeaders();

      const res = await fetch('/api/casino/blackjack/action', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: actionName.toUpperCase(), actionId })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Action failed.");
        setStatusText("ERROR");
        setButtonsDisabled(false);
        renderCurrentUIState();
        return;
      }

      activeHand = data.handState;

      // Update balance immediately from server response
      if (data.new_balance !== undefined && data.new_balance !== null) {
        const balanceEl = document.getElementById('bj-balance-display');
        if (balanceEl) balanceEl.textContent = Number(data.new_balance).toLocaleString();
      }

      queueEvents(activeHand.events || []);
    } catch (err) {
      console.error("Action error:", err);
      setStatusText("ERROR");
      setButtonsDisabled(false);
      renderCurrentUIState();
    }
  }

  async function buyOrDeclineInsurance(buyInsurance) {
    if (!activeHand || activeHand.isEnded) return;

    if (buyInsurance && !isUserLoggedIn()) {
      let guestBalance = Number(localStorage.getItem('bj_guest_balance'));
      if (isNaN(guestBalance) || guestBalance === null || localStorage.getItem('bj_guest_balance') === null) {
        guestBalance = 10000;
        localStorage.setItem('bj_guest_balance', guestBalance);
      }
      if (guestBalance < activeHand.insuranceCost) {
        alert("Insufficient guest balance for insurance.");
        return;
      }
      guestBalance -= activeHand.insuranceCost;
      localStorage.setItem('bj_guest_balance', guestBalance);
      syncBalance();
    }

    setButtonsDisabled(true);
    setStatusText("PROCESSING INSURANCE...");

    try {
      const actionId = generateActionId();
      const headers = getFetchHeaders();

      const res = await fetch('/api/casino/blackjack/insurance', {
        method: 'POST',
        headers,
        body: JSON.stringify({ buyInsurance, actionId })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Insurance action failed.");
        setStatusText("ERROR");
        setButtonsDisabled(false);
        renderCurrentUIState();
        return;
      }

      activeHand = data.handState;

      // Update balance immediately from server response
      if (data.new_balance !== undefined && data.new_balance !== null) {
        const balanceEl = document.getElementById('bj-balance-display');
        if (balanceEl) balanceEl.textContent = Number(data.new_balance).toLocaleString();
      }

      queueEvents(activeHand.events || []);
    } catch (err) {
      console.error("Insurance error:", err);
      setStatusText("ERROR");
      setButtonsDisabled(false);
      renderCurrentUIState();
    }
  }

  function setButtonsDisabled(disabled) {
    const btnHit = document.getElementById('bj-btn-hit');
    const btnStand = document.getElementById('bj-btn-stand');
    const btnDoubleDown = document.getElementById('bj-btn-double-down');
    const btnSplit = document.getElementById('bj-btn-split');
    const btnMain = document.getElementById('bj-btn-main');

    if (btnHit) btnHit.disabled = disabled;
    if (btnStand) btnStand.disabled = disabled;
    if (btnDoubleDown) btnDoubleDown.disabled = disabled;
    if (btnSplit) btnSplit.disabled = disabled;
    if (btnMain) btnMain.disabled = disabled;
  }

  // ─── RECONNECTION & RESTORATION ────────────────────────────────

  async function restoreActiveGame() {
    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;

    setStatusText("RECONNECTING...");
    try {
      const headers = getFetchHeaders();

      const res = await fetch('/api/casino/blackjack/state', {
        headers
      });
      if (res.ok) {
        const data = await res.json();
        if (data.active && data.snapshot) {
          activeHand = data.snapshot;
          expectedSequenceNumber = 1;
          eventQueue = [];
          processedEventIds.clear();

          // Instantly fast-forward events list to sync UI
          const events = activeHand.events || [];
          for (const evt of events) {
            await animateEvent(evt);
            expectedSequenceNumber++;
            processedEventIds.add(evt.eventId);
          }
          renderCurrentUIState();
        }
      }
    } catch (e) {
      console.error("Reconnection failed:", e);
    }
    setStatusText("");
  }

  async function loadHistoryAndStats() {
    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;

    try {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/casino/blackjack/history', {
        headers
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok) return;

      const { stats, history } = data;
      
      const statsGrid = document.getElementById('bj-stats-grid');
      if (statsGrid) {
        statsGrid.innerHTML = `
          <div style="background:rgba(255,255,255,0.05); padding:16px; border-radius:12px; text-align:center;">
            <div style="font-size:0.8rem; color:var(--text-secondary); text-transform:uppercase;">Games Played</div>
            <div style="font-size:1.5rem; font-weight:bold; color:#fff;">${stats.gamesPlayed}</div>
          </div>
          <div style="background:rgba(255,255,255,0.05); padding:16px; border-radius:12px; text-align:center;">
            <div style="font-size:0.8rem; color:var(--text-secondary); text-transform:uppercase;">Win / Loss / Push</div>
            <div style="font-size:1.2rem; font-weight:bold; color:#fff;">
              <span style="color:#00e676">${stats.wins}</span> / 
              <span style="color:#ff3b30">${stats.losses}</span> / 
              <span style="color:#a09bbd">${stats.pushes}</span>
            </div>
          </div>
          <div style="background:rgba(255,255,255,0.05); padding:16px; border-radius:12px; text-align:center;">
            <div style="font-size:0.8rem; color:var(--text-secondary); text-transform:uppercase;">Total Wagered</div>
            <div style="font-size:1.5rem; font-weight:bold; color:#ffd700;">${stats.totalWagered}</div>
          </div>
          <div style="background:rgba(255,255,255,0.05); padding:16px; border-radius:12px; text-align:center;">
            <div style="font-size:0.8rem; color:var(--text-secondary); text-transform:uppercase;">Net Profit</div>
            <div style="font-size:1.5rem; font-weight:bold; color:${stats.netPoints >= 0 ? '#00e676' : '#ff3b30'};">
              ${stats.netPoints > 0 ? '+' : ''}${stats.netPoints}
            </div>
          </div>
        `;
      }

      const rowsEl = document.getElementById('bj-history-rows');
      if (rowsEl) {
        rowsEl.innerHTML = history.map(g => {
          const isWin = g.net > 0;
          const isLoss = g.net < 0;
          const color = isWin ? '#00e676' : isLoss ? '#ff3b30' : '#a09bbd';
          const outcomeText = isWin ? 'WIN' : isLoss ? 'LOSS' : 'PUSH';
          const sign = isWin ? '+' : '';
          const dateStr = new Date(g.date).toLocaleString();
          
          return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.2s;">
              <td style="padding:12px 8px; color:var(--text-secondary);">${dateStr}</td>
              <td style="padding:12px 8px;">${g.bet}</td>
              <td style="padding:12px 8px;">${g.payout}</td>
              <td style="padding:12px 8px; font-weight:bold; color:${color};">${sign}${g.net}</td>
              <td style="padding:12px 8px; font-weight:bold; color:${color};">${outcomeText}</td>
            </tr>
          `;
        }).join('');
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  }


  // Auto-init on DOM load if element exists
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initBlackjackUI());
  } else {
    initBlackjackUI();
  }

  window.initBlackjackUI = initBlackjackUI;
})();
