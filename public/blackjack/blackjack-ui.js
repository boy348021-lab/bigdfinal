/* ============================================================
   BLACKJACK CASINO UI CONTROLLER & INTERACTIVE COMPONENT
   ============================================================ */

(function () {
  let engine = null;
  let currentBet = 10;
  let activeHand = null;
  let isGameActive = false;

  function initBlackjackUI(containerId = 'blackjack-app') {
    const container = document.getElementById(containerId);
    if (!container) return;

    engine = new window.BlackjackEngine(6);

    container.innerHTML = `
      <div class="bj-container">
        <!-- Left Sidebar Controls -->
        <div class="bj-sidebar">
          <div class="bj-mode-tabs">
            <button class="bj-mode-btn active" id="bj-mode-std" style="width:100%;">Standard</button>
          </div>

          <div class="bj-bet-box">
            <div class="bj-bet-header">
              <span>Bet Amount</span>
              <span>Balance: <span class="bj-balance-val" id="bj-balance-display">0</span> Coins</span>
            </div>
            <div class="bj-input-row">
              <span class="bj-currency-symbol">🪙</span>
              <input type="number" id="bj-bet-input" class="bj-bet-input" value="0" min="0" step="1"/>
              <div class="bj-multiplier-btns">
                <button class="bj-mult-btn" id="bj-btn-half">½</button>
                <button class="bj-mult-btn" id="bj-btn-double">2x</button>
              </div>
            </div>
            
            <!-- Casino Chips Selector -->
            <div class="bj-chips-selector">
              <button class="bj-chip-btn bj-chip-0" onclick="setBetChip(0)" title="Set Bet to 0">0</button>
              <button class="bj-chip-btn bj-chip-1" onclick="addBetChip(1)">+1</button>
              <button class="bj-chip-btn bj-chip-5" onclick="addBetChip(5)">+5</button>
              <button class="bj-chip-btn bj-chip-25" onclick="addBetChip(25)">+25</button>
              <button class="bj-chip-btn bj-chip-100" onclick="addBetChip(100)">+100</button>
              <button class="bj-chip-btn bj-chip-500" onclick="addBetChip(500)">+500</button>
            </div>
          </div>

          <!-- Action Grid -->
          <div class="bj-actions-grid">
            <button class="bj-action-btn" id="bj-btn-hit" disabled>
              <span>Hit</span>
              <span class="bj-action-icon">📥</span>
            </button>
            <button class="bj-action-btn" id="bj-btn-stand" disabled>
              <span>Stand</span>
              <span class="bj-action-icon">✋</span>
            </button>
            <button class="bj-action-btn" id="bj-btn-split" disabled>
              <span>Split</span>
              <span class="bj-action-icon">🔀</span>
            </button>
            <button class="bj-action-btn" id="bj-btn-double-down" disabled>
              <span>Double</span>
              <span class="bj-action-icon">⚡</span>
            </button>
          </div>

          <button class="bj-main-btn" id="bj-btn-main">Bet</button>
        </div>

        <!-- Main Felt Table -->
        <div class="bj-table">
          <div class="bj-ribbons">
            <div class="bj-ribbon-text">BLACKJACK PAYS 3 TO 2</div>
            <div class="bj-ribbon-text">INSURANCE PAYS 2 TO 1</div>
          </div>

          <!-- Dealer Hand Area -->
          <div class="bj-hand-area">
            <div class="bj-score-badge" id="bj-dealer-score">?</div>
            <div class="bj-cards-row" id="bj-dealer-cards">
              <!-- Cards rendered dynamically -->
            </div>
          </div>

          <!-- Result Overlay -->
          <div class="bj-result-overlay" id="bj-result-overlay">
            <div class="bj-result-title" id="bj-result-title">YOU WIN</div>
            <div class="bj-result-payout" id="bj-result-payout">+20 BigD Coins</div>
          </div>

          <!-- Player Hand Area -->
          <div class="bj-hand-area">
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
    if (btnHit) btnHit.onclick = doHit;
    if (btnStand) btnStand.onclick = doStand;
    if (btnDoubleDown) btnDoubleDown.onclick = doDoubleDown;
    if (btnSplit) btnSplit.onclick = doSplit;
  }

  window.setBetChip = function(amt) {
    const betInput = document.getElementById('bj-bet-input');
    if (betInput) betInput.value = amt;
  };

  window.addBetChip = function(amt) {
    const betInput = document.getElementById('bj-bet-input');
    if (betInput) {
      const current = parseInt(betInput.value || 0, 10);
      betInput.value = current + amt;
    }
  };

  async function syncBalance() {
    const balanceEl = document.getElementById('bj-balance-display');
    const centerBalanceEl = document.getElementById('bj-center-balance-val');

    let pts = 0;
    if (window.authUser) {
      pts = window.authUser.points || 0;
    } else {
      const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
      if (token) {
        try {
          const res = await fetch('/auth/me', { headers: { 'Authorization': `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            window.authUser = data;
            pts = data.points || 0;
          }
        } catch {}
      }
    }

    if (balanceEl) balanceEl.textContent = pts.toLocaleString();
    if (centerBalanceEl) centerBalanceEl.textContent = pts.toLocaleString();
  }

  function renderCard(card, isHidden = false) {
    if (isHidden) {
      return `<div class="bj-card bj-card-back"></div>`;
    }
    const colorClass = card.isRed ? 'red' : 'black';
    return `
      <div class="bj-card ${colorClass}">
        <div class="bj-card-top">
          <span class="bj-card-value">${card.rank}</span>
          <span class="bj-card-suit-small">${card.suit}</span>
        </div>
        <span class="bj-card-suit-center">${card.suit}</span>
      </div>
    `;
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

  async function startDeal() {
    const betInput = document.getElementById('bj-bet-input');
    const betVal = parseInt(betInput.value || 0, 10);

    if (isNaN(betVal) || betVal < 0) {
      alert("Please enter a valid bet amount.");
      return;
    }

    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
    if (!token) {
      alert("Please log in to play Blackjack!");
      if (typeof loginWithDiscord === 'function') loginWithDiscord();
      return;
    }

    try {
      const res = await fetch('/api/casino/blackjack/deal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bet: betVal })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Deal failed.");
        return;
      }

      currentBet = betVal;
      isGameActive = true;
      activeHand = data.handState;

      // Update UI balance
      const balanceEl = document.getElementById('bj-balance-display');
      const centerBalanceEl = document.getElementById('bj-center-balance-val');
      if (balanceEl) balanceEl.textContent = (data.new_balance || 0).toLocaleString();
      if (centerBalanceEl) centerBalanceEl.textContent = (data.new_balance || 0).toLocaleString();
      if (window.authUser) window.authUser.points = data.new_balance;

      await dealSequenceAnimated();
    } catch (err) {
      console.error("Deal error:", err);
      alert("Server error starting game.");
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

  async function dealSequenceAnimated() {
    if (!activeHand) return;

    const dealerCardsEl = document.getElementById('bj-dealer-cards');
    const playerCardsEl = document.getElementById('bj-player-cards');
    const dealerScoreEl = document.getElementById('bj-dealer-score');
    const playerScoreEl = document.getElementById('bj-player-score');
    const overlay = document.getElementById('bj-result-overlay');

    const insModal = document.getElementById('bj-insurance-modal');
    if (insModal) { insModal.classList.remove('show'); insModal.style.display = 'none'; }
    if (overlay) overlay.classList.remove('show');
    if (dealerCardsEl) dealerCardsEl.innerHTML = '';
    if (playerCardsEl) playerCardsEl.innerHTML = '';
    if (dealerScoreEl) { dealerScoreEl.textContent = '?'; dealerScoreEl.className = 'bj-score-badge'; }
    if (playerScoreEl) { playerScoreEl.style.display = 'block'; playerScoreEl.textContent = '0'; playerScoreEl.className = 'bj-score-badge'; }

    setButtonsDisabled(true);
    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    // 1. Card 1 -> Player (Face Up)
    if (activeHand.playerCards[0]) {
      playerCardsEl.innerHTML += renderCard(activeHand.playerCards[0]);
      if (playerScoreEl) playerScoreEl.textContent = activeHand.playerCards[0].value;
      playSound('deal');
      await delay(400);
    }

    // 2. Card 1 -> Dealer (Face Up)
    if (activeHand.dealerCards[0]) {
      dealerCardsEl.innerHTML += renderCard(activeHand.dealerCards[0]);
      if (dealerScoreEl) dealerScoreEl.textContent = activeHand.dealerVisibleScore;
      playSound('deal');
      await delay(400);
    }

    // 3. Card 2 -> Player (Face Up)
    if (activeHand.playerCards[1]) {
      playerCardsEl.innerHTML += renderCard(activeHand.playerCards[1]);
      if (playerScoreEl) playerScoreEl.textContent = activeHand.playerScore;
      playSound('deal');
      await delay(400);
    }

    // 4. Card 2 -> Dealer (FACE DOWN HOLE CARD)
    if (activeHand.dealerCards[1]) {
      dealerCardsEl.innerHTML += `<div class="bj-card bj-card-back" id="bj-dealer-hole-card"></div>`;
      playSound('deal');
      await delay(400);
    }

    // If Dealer shows an Ace, offer Insurance
    if (activeHand.offerInsurance && !activeHand.isEnded) {
      await showInsuranceModal();
    } else if (activeHand.isEnded) {
      await revealDealerTurnAnimated();
    } else {
      setButtonsDisabled(false);
      const btnDoubleDown = document.getElementById('bj-btn-double-down');
      const btnSplit = document.getElementById('bj-btn-split');
      const btnMain = document.getElementById('bj-btn-main');

      const canSplit = activeHand.canSplit || (activeHand.playerCards.length === 2 && (activeHand.playerCards[0].rank === activeHand.playerCards[1].rank || activeHand.playerCards[0].value === activeHand.playerCards[1].value));

      if (btnDoubleDown) btnDoubleDown.disabled = activeHand.playerCards.length !== 2;
      if (btnSplit) btnSplit.disabled = !canSplit;
      if (btnMain) { btnMain.textContent = 'Game in Progress'; btnMain.disabled = true; }
    }
  }

  async function showInsuranceModal() {
    return new Promise((resolve) => {
      let overlay = document.getElementById('bj-insurance-modal');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'bj-insurance-modal';
        overlay.className = 'bj-result-overlay show';
        document.querySelector('.bj-table').appendChild(overlay);
      }

      overlay.style.cssText = 'background:rgba(10,10,25,0.96); backdrop-filter:blur(12px); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:28px; text-align:center; z-index:9999; pointer-events:auto; border:2px solid #53fa5d; border-radius:14px; box-shadow:0 0 40px rgba(83,250,93,0.35);';

      overlay.innerHTML = `
        <div style="font-size:1.6rem; font-weight:900; color:#53fa5d; margin-bottom:10px; text-shadow:0 0 15px rgba(83,250,93,0.5);">🛡️ DEALER SHOWS AN ACE</div>
        <div style="font-size:0.95rem; color:#d0c8ef; margin-bottom:24px; max-width:340px; line-height:1.5;">Buy Insurance for 50% of your bet (${activeHand.insuranceCost} BigD Coins)? Pays 2:1 if Dealer has Blackjack.</div>
        <div style="display:flex; gap:14px; position:relative; z-index:10000;">
          <button id="bj-ins-yes" style="background:#53fa5d; color:#000; border:none; padding:14px 24px; border-radius:8px; font-weight:900; cursor:pointer; font-size:1rem; text-transform:uppercase; pointer-events:auto; box-shadow:0 0 15px rgba(83,250,93,0.4);">Accept Insurance</button>
          <button id="bj-ins-no" style="background:rgba(255,255,255,0.15); color:#fff; border:1px solid rgba(255,255,255,0.25); padding:14px 24px; border-radius:8px; font-weight:800; cursor:pointer; font-size:1rem; pointer-events:auto;">Decline</button>
        </div>
      `;

      overlay.classList.add('show');

      const handleChoice = async (buy) => {
        overlay.classList.remove('show');
        overlay.style.display = 'none';
        const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
        if (token) {
          try {
            const res = await fetch('/api/casino/blackjack/insurance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ buyInsurance: buy })
            });
            const data = await res.json();
            if (res.ok) {
              activeHand = data.handState;
              if (data.new_balance !== undefined) {
                const balanceEl = document.getElementById('bj-balance-display');
                if (balanceEl) balanceEl.textContent = (data.new_balance || 0).toLocaleString();
              }
            }
          } catch (e) { console.error("Insurance error:", e); }
        }

        if (activeHand.isEnded) {
          await revealDealerTurnAnimated();
        } else {
          setButtonsDisabled(false);
          const btnDoubleDown = document.getElementById('bj-btn-double-down');
          const btnSplit = document.getElementById('bj-btn-split');
          const canSplit = activeHand.canSplit || (activeHand.playerCards.length === 2 && (activeHand.playerCards[0].rank === activeHand.playerCards[1].rank || activeHand.playerCards[0].value === activeHand.playerCards[1].value));
          if (btnDoubleDown) btnDoubleDown.disabled = activeHand.playerCards.length !== 2;
          if (btnSplit) btnSplit.disabled = !canSplit;
        }
        resolve();
      };

      setTimeout(() => {
        const btnYes = document.getElementById('bj-ins-yes');
        const btnNo = document.getElementById('bj-ins-no');
        if (btnYes) btnYes.onclick = () => handleChoice(true);
        if (btnNo) btnNo.onclick = () => handleChoice(false);
      }, 50);
    });
  }

  async function revealDealerTurnAnimated() {
    const dealerCardsEl = document.getElementById('bj-dealer-cards');
    const dealerScoreEl = document.getElementById('bj-dealer-score');
    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    setButtonsDisabled(true);

    // 1. Reveal Dealer Hole Card (Card 2)
    if (dealerCardsEl && activeHand.dealerCards[1]) {
      dealerCardsEl.innerHTML = activeHand.dealerCards.slice(0, 2).map(c => renderCard(c)).join('');
      if (dealerScoreEl) {
        dealerScoreEl.textContent = calcHandScore(activeHand.dealerCards.slice(0, 2)).score;
      }
      playSound('chip');
      await delay(550);
    }

    // 2. Draw remaining Dealer cards sequentially
    if (activeHand.dealerCards.length > 2) {
      for (let i = 2; i < activeHand.dealerCards.length; i++) {
        dealerCardsEl.innerHTML += renderCard(activeHand.dealerCards[i]);
        const currentSubScore = calcHandScore(activeHand.dealerCards.slice(0, i + 1)).score;
        if (dealerScoreEl) dealerScoreEl.textContent = currentSubScore;
        playSound('deal');
        await delay(500);
      }
    }

    if (dealerScoreEl) {
      dealerScoreEl.textContent = activeHand.dealerScore;
      dealerScoreEl.className = 'bj-score-badge' + (activeHand.dealerScore > 21 ? ' bust' : '');
    }

    if (activeHand.outcome === 'win' || activeHand.outcome === 'blackjack') {
      playSound('win');
    } else if (activeHand.outcome === 'loss' || activeHand.outcome === 'bust') {
      playSound('loss');
    }

    showResultBanner(activeHand.outcome, activeHand.payout);

    const btnMain = document.getElementById('bj-btn-main');
    if (btnMain) {
      btnMain.textContent = 'Deal Again';
      btnMain.disabled = false;
    }
  }

  function calcHandScore(cards) {
    let score = 0;
    let aces = 0;
    for (const c of cards) {
      score += c.value;
      if (c.rank === 'A') aces++;
    }
    while (score > 21 && aces > 0) {
      score -= 10;
      aces--;
    }
    return { score };
  }

  function renderHandState() {
    if (!activeHand) return;

    const overlay = document.getElementById('bj-result-overlay');
    if (overlay) overlay.classList.remove('show');

    // Render Dealer Cards
    const dealerCardsEl = document.getElementById('bj-dealer-cards');
    const dealerScoreEl = document.getElementById('bj-dealer-score');
    if (dealerCardsEl) {
      dealerCardsEl.innerHTML = activeHand.dealerCards.map((c, idx) => renderCard(c, idx === 1 && !activeHand.isEnded)).join('');
    }
    if (dealerScoreEl) {
      dealerScoreEl.textContent = activeHand.isEnded ? activeHand.dealerScore : activeHand.dealerVisibleScore;
      dealerScoreEl.className = 'bj-score-badge' + (activeHand.isEnded && activeHand.dealerScore > 21 ? ' bust' : '');
    }

    // Render Player Cards
    const playerCardsEl = document.getElementById('bj-player-cards');
    const playerScoreEl = document.getElementById('bj-player-score');

    if (activeHand.isSplit && activeHand.splitHands) {
      if (playerCardsEl) {
        playerCardsEl.innerHTML = `
          <div style="display:flex; gap:20px; justify-content:center; align-items:flex-start; margin:10px 0;">
            <div style="display:flex; flex-direction:column; align-items:center; border:${activeHand.activeSplitIndex === 0 && !activeHand.isEnded ? '2px solid #53fa5d' : '1px solid rgba(255,255,255,0.15)'}; padding:10px 14px; border-radius:10px; background:rgba(0,0,0,0.35); box-shadow:${activeHand.activeSplitIndex === 0 && !activeHand.isEnded ? '0 0 15px rgba(83,250,93,0.3)' : 'none'};">
              <div style="font-size:0.75rem; font-weight:800; color:${activeHand.activeSplitIndex === 0 && !activeHand.isEnded ? '#53fa5d' : '#a09bbd'}; margin-bottom:6px;">HAND 1 ${activeHand.activeSplitIndex === 0 && !activeHand.isEnded ? '● PLAYING' : ''}</div>
              <div style="display:flex; gap:8px;">${activeHand.splitHands[0].playerCards.map(c => renderCard(c)).join('')}</div>
              <div class="bj-score-badge ${activeHand.splitHands[0].playerScore > 21 ? 'bust' : ''}" style="margin-top:6px;">${activeHand.splitHands[0].playerScore}</div>
            </div>
            <div style="display:flex; flex-direction:column; align-items:center; border:${activeHand.activeSplitIndex === 1 && !activeHand.isEnded ? '2px solid #53fa5d' : '1px solid rgba(255,255,255,0.15)'}; padding:10px 14px; border-radius:10px; background:rgba(0,0,0,0.35); box-shadow:${activeHand.activeSplitIndex === 1 && !activeHand.isEnded ? '0 0 15px rgba(83,250,93,0.3)' : 'none'};">
              <div style="font-size:0.75rem; font-weight:800; color:${activeHand.activeSplitIndex === 1 && !activeHand.isEnded ? '#53fa5d' : '#a09bbd'}; margin-bottom:6px;">HAND 2 ${activeHand.activeSplitIndex === 1 && !activeHand.isEnded ? '● PLAYING' : ''}</div>
              <div style="display:flex; gap:8px;">${activeHand.splitHands[1].playerCards.map(c => renderCard(c)).join('')}</div>
              <div class="bj-score-badge ${activeHand.splitHands[1].playerScore > 21 ? 'bust' : ''}" style="margin-top:6px;">${activeHand.splitHands[1].playerScore}</div>
            </div>
          </div>
        `;
      }
      if (playerScoreEl) playerScoreEl.style.display = 'none';
    } else {
      if (playerCardsEl) {
        playerCardsEl.innerHTML = activeHand.playerCards.map(c => renderCard(c)).join('');
      }
      if (playerScoreEl) {
        playerScoreEl.style.display = 'block';
        playerScoreEl.textContent = activeHand.playerScore;
        playerScoreEl.className = 'bj-score-badge' + (activeHand.playerScore > 21 ? ' bust' : activeHand.outcome === 'win' || activeHand.outcome === 'blackjack' ? ' win' : '');
      }
    }

    // Toggle Action Buttons
    const btnHit = document.getElementById('bj-btn-hit');
    const btnStand = document.getElementById('bj-btn-stand');
    const btnDoubleDown = document.getElementById('bj-btn-double-down');
    const btnSplit = document.getElementById('bj-btn-split');
    const btnMain = document.getElementById('bj-btn-main');

    const canAction = !activeHand.isEnded;
    const canSplit = !activeHand.isSplit && (activeHand.canSplit || (activeHand.playerCards.length === 2 && (activeHand.playerCards[0].rank === activeHand.playerCards[1].rank || activeHand.playerCards[0].value === activeHand.playerCards[1].value)));

    if (btnHit) btnHit.disabled = !canAction;
    if (btnStand) btnStand.disabled = !canAction;
    if (btnDoubleDown) btnDoubleDown.disabled = !canAction || activeHand.playerCards.length !== 2;
    if (btnSplit) btnSplit.disabled = !canAction || !canSplit;

    if (btnMain) {
      btnMain.textContent = activeHand.isEnded ? 'Deal Again' : 'Game in Progress';
      btnMain.disabled = !activeHand.isEnded;
    }

    if (activeHand.isEnded) {
      showResultBanner(activeHand.outcome, activeHand.payout);
    }
  }

  async function performAction(actionName) {
    if (!activeHand || activeHand.isEnded) return;

    const token = typeof getAuthToken === 'function' ? getAuthToken() : null;
    if (!token) return;

    setButtonsDisabled(true);

    try {
      const res = await fetch('/api/casino/blackjack/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: actionName, handId: activeHand.handId })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Action failed.");
        setButtonsDisabled(false);
        return;
      }

      activeHand = data.handState;
      if (data.new_balance !== undefined) {
        const balanceEl = document.getElementById('bj-balance-display');
        const centerBalanceEl = document.getElementById('bj-center-balance-val');
        if (balanceEl) balanceEl.textContent = (data.new_balance || 0).toLocaleString();
        if (centerBalanceEl) centerBalanceEl.textContent = (data.new_balance || 0).toLocaleString();
        if (window.authUser) window.authUser.points = data.new_balance;
      }

      if (actionName === 'split') {
        playSound('chip');
        renderHandState();
        setButtonsDisabled(false);
        const btnDoubleDown = document.getElementById('bj-btn-double-down');
        const btnSplit = document.getElementById('bj-btn-split');
        if (btnDoubleDown) btnDoubleDown.disabled = true;
        if (btnSplit) btnSplit.disabled = true; // Single split only
      } else if (actionName === 'hit') {
        if (activeHand.isSplit) {
          renderHandState();
        } else {
          const playerCardsEl = document.getElementById('bj-player-cards');
          const playerScoreEl = document.getElementById('bj-player-score');
          if (playerCardsEl) playerCardsEl.innerHTML = activeHand.playerCards.map(c => renderCard(c)).join('');
          if (playerScoreEl) {
            playerScoreEl.textContent = activeHand.playerScore;
            playerScoreEl.className = 'bj-score-badge' + (activeHand.playerScore > 21 ? ' bust' : '');
          }
        }
        playSound('deal');

        if (activeHand.isEnded) {
          await revealDealerTurnAnimated();
        } else {
          setButtonsDisabled(false);
          const btnDoubleDown = document.getElementById('bj-btn-double-down');
          const btnSplit = document.getElementById('bj-btn-split');
          if (btnDoubleDown) btnDoubleDown.disabled = true;
          if (btnSplit) btnSplit.disabled = true;
        }
      } else if (actionName === 'stand' || actionName === 'double') {
        if (activeHand.isSplit && !activeHand.isEnded) {
          renderHandState();
          playSound('deal');
          setButtonsDisabled(false);
          const btnDoubleDown = document.getElementById('bj-btn-double-down');
          const btnSplit = document.getElementById('bj-btn-split');
          if (btnDoubleDown) btnDoubleDown.disabled = true;
          if (btnSplit) btnSplit.disabled = true;
        } else {
          if (actionName === 'double') {
            const playerCardsEl = document.getElementById('bj-player-cards');
            const playerScoreEl = document.getElementById('bj-player-score');
            if (playerCardsEl) playerCardsEl.innerHTML = activeHand.playerCards.map(c => renderCard(c)).join('');
            if (playerScoreEl) playerScoreEl.textContent = activeHand.playerScore;
            playSound('deal');
            const delay = (ms) => new Promise(res => setTimeout(res, ms));
            await delay(400);
          }
          await revealDealerTurnAnimated();
        }
      }
    } catch (err) {
      console.error("Action error:", err);
      setButtonsDisabled(false);
    }
  }

  function doHit() { performAction('hit'); }
  function doStand() { performAction('stand'); }
  function doDoubleDown() { performAction('double'); }
  function doSplit() { performAction('split'); }

  function showResultBanner(outcome, payout) {
    const overlay = document.getElementById('bj-result-overlay');
    const titleEl = document.getElementById('bj-result-title');
    const payoutEl = document.getElementById('bj-result-payout');
    if (!overlay || !titleEl || !payoutEl) return;

    let finalOutcome = outcome;

    // Defensive score enforcement to guarantee strict rule compliance
    if (activeHand && !activeHand.isSplit) {
      if (activeHand.playerScore > 21) {
        finalOutcome = 'bust';
      } else if (activeHand.dealerScore > 21) {
        finalOutcome = 'win';
      } else if (activeHand.playerScore > activeHand.dealerScore) {
        finalOutcome = 'win';
      } else if (activeHand.playerScore < activeHand.dealerScore) {
        finalOutcome = 'loss';
      } else if (activeHand.playerScore === activeHand.dealerScore) {
        finalOutcome = 'push';
      }
    }

    if (finalOutcome === 'win' || finalOutcome === 'blackjack') {
      titleEl.textContent = finalOutcome === 'blackjack' ? 'BLACKJACK!' : 'YOU WIN!';
      titleEl.className = 'bj-result-title win';
      payoutEl.textContent = `+${(payout || 0).toLocaleString()} BigD Coins`;
    } else if (finalOutcome === 'loss' || finalOutcome === 'bust') {
      titleEl.textContent = finalOutcome === 'bust' ? 'PLAYER BUST' : 'DEALER WINS';
      titleEl.className = 'bj-result-title loss';
      payoutEl.textContent = `-${currentBet.toLocaleString()} BigD Coins`;
    } else {
      titleEl.textContent = 'PUSH (TIE)';
      titleEl.className = 'bj-result-title push';
      payoutEl.textContent = `Bet Returned`;
    }

    overlay.classList.add('show');
  }

  // Auto-init on DOM load if element exists
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initBlackjackUI());
  } else {
    initBlackjackUI();
  }

  window.initBlackjackUI = initBlackjackUI;
})();
