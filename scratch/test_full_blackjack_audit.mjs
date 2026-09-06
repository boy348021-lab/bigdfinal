import ActionDispatcher from '../server/blackjack/ActionDispatcher.js';
import Engine from '../server/blackjack/Engine.js';
import Card from '../server/blackjack/Card.js';
import PlayerHand from '../server/blackjack/PlayerHand.js';

console.log('====================================================');
console.log('   COMPREHENSIVE BLACKJACK AUDIT & SIMULATION       ');
console.log('====================================================\n');

class MockSupabase {
  constructor(initialPoints = 10000) {
    this.users = {
      'user_test_123': {
        id: 'user_test_123',
        points: initialPoints,
        degencity_username: 'achilles35911',
        metadata: { august_wager_points: 10000, redeemed_points: 0 }
      }
    };
    this.audit_logs = [];
  }

  async rpc(funcName, params) {
    if (funcName === 'modify_points') {
      const { p_user_id, p_delta, p_action, p_source, p_ref } = params;
      const user = this.users[p_user_id];
      if (!user) throw new Error(`User ${p_user_id} not found`);

      const before = user.points;
      const after = before + p_delta;
      if (after < 0) {
        return { data: null, error: { message: 'Insufficient points' } };
      }
      user.points = after;
      this.audit_logs.push({
        user_id: p_user_id,
        action: p_action,
        points_before: before,
        points_after: after,
        source: p_source,
        transaction_reference: p_ref
      });
      return { data: after, error: null };
    }
    throw new Error(`Unknown RPC ${funcName}`);
  }

  from(tableName) {
    return {
      select: (cols) => ({
        eq: (col1, val1) => ({
          eq: (col2, val2) => ({
            then: (cb) => {
              if (tableName === 'audit_logs') {
                const filtered = this.audit_logs.filter(l => l.user_id === val1 && l.source === val2);
                return Promise.resolve(cb({ data: filtered, error: null }));
              }
              return Promise.resolve(cb({ data: [], error: null }));
            }
          })
        })
      })
    };
  }
}

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
  }
}

async function runAudit() {
  const userId = 'user_test_123';
  const mockDb = new MockSupabase(10000);
  const activeGames = new Map();
  const dispatcher = new ActionDispatcher(activeGames, mockDb);

  console.log('--- TEST 1: Initial Deal & Bet Deduction ---');
  let dealRes = await dispatcher.dispatch(userId, 'DEAL', { bet: 1000 });
  assert(mockDb.users[userId].points === 9000, `Bet 1,000 deducted: balance is now ${mockDb.users[userId].points} (expected 9000)`);
  assert(dealRes.updatedBalance === 9000, `Dispatcher returned updated balance 9000`);
  assert(dealRes.snapshot.playerHands.length === 1, `Player dealt 1 hand`);
  assert(dealRes.snapshot.playerHands[0].cards.length === 2, `Player hand has 2 cards`);
  assert(dealRes.snapshot.dealerCards.length === 2, `Dealer has 2 cards`);

  console.log('\n--- TEST 2: Active Hand Actions (HIT / STAND) ---');
  let gameEngine = activeGames.get(userId);
  if (!gameEngine.isEnded) {
    let actionRes = await dispatcher.dispatch(userId, 'HIT');
    assert(actionRes.snapshot.playerHands[0].cards.length === 3, `HIT drew a 3rd card`);
    
    if (!actionRes.snapshot.isEnded) {
      actionRes = await dispatcher.dispatch(userId, 'STAND');
    }
    assert(actionRes.snapshot.isEnded === true, `Game round completed`);
  }

  console.log('\n--- TEST 3: Double Down Wager & Payout ---');
  mockDb.users[userId].points = 10000;
  mockDb.audit_logs = [];
  activeGames.delete(userId);

  let deal2 = await dispatcher.dispatch(userId, 'DEAL', { bet: 1000 });
  assert(mockDb.users[userId].points === 9000, `Initial bet 1000 deducted: bal = 9000`);
  
  let eng2 = activeGames.get(userId);
  if (!eng2.isEnded) {
    let dblRes = await dispatcher.dispatch(userId, 'DOUBLE');
    assert(mockDb.audit_logs.length >= 2, `Audit log recorded double down bet deduction`);
    assert(dblRes.snapshot.playerHands[0].cards.length === 3, `Double down drew exactly 1 card`);
    assert(dblRes.snapshot.isEnded === true, `Double down round completed`);
  }

  console.log('\n--- TEST 4: Insurance Mechanics & 2:1 Payout ---');
  mockDb.users[userId].points = 10000;
  mockDb.audit_logs = [];
  activeGames.delete(userId);

  let insEngine = new Engine();
  const dCard1 = new Card('spades', 'A', 99);
  const dCard2 = new Card('hearts', '10', 99);
  dCard2.visibility = 'face_down';
  insEngine.dealerCards = [dCard1, dCard2];

  const pHand = new PlayerHand('hand_0', 1000, false, false);
  pHand.addCard(new Card('clubs', '10', 99));
  pHand.addCard(new Card('diamonds', '8', 99));
  insEngine.playerHands = [pHand];
  insEngine.initialBet = 1000;
  insEngine.insuranceOffered = true;
  insEngine.fsm.currentState = 'INSURANCE_OFFERED';
  activeGames.set(userId, insEngine);

  let insRes = await dispatcher.dispatch(userId, 'INSURANCE_BUY');
  assert(mockDb.audit_logs.find(l => l.action === 'BLACKJACK_INSURANCE') !== undefined, `Insurance wager (500 pts = 50% of 1000) recorded in audit log`);
  assert(insRes.snapshot.insuranceTaken === true, `Insurance status marked as taken`);
  assert(insRes.snapshot.isEnded === true, `Game ended immediately on dealer natural blackjack`);
  assert(mockDb.users[userId].points === 11000, `Insurance payout credited 1500 (2:1 + wager): final bal = 11000`);

  console.log('\n--- TEST 5: Split Aces Edge Case ---');
  mockDb.users[userId].points = 10000;
  mockDb.audit_logs = [];
  activeGames.delete(userId);

  let splitEngine = new Engine();
  splitEngine.dealerCards = [new Card('spades', '7', 99), new Card('hearts', '9', 99)];
  const sHand = new PlayerHand('hand_0', 1000, false, false);
  sHand.addCard(new Card('clubs', 'A', 99));
  sHand.addCard(new Card('diamonds', 'A', 99));
  splitEngine.playerHands = [sHand];
  splitEngine.initialBet = 1000;
  splitEngine.fsm.currentState = 'PLAYER_TURN';
  activeGames.set(userId, splitEngine);

  let splitRes = await dispatcher.dispatch(userId, 'SPLIT');
  assert(splitRes.snapshot.playerHands.length === 2, `Split created 2 hands`);
  assert(splitRes.snapshot.playerHands[0].cards[0].rank === 'A', `Hand 1 starts with Ace`);
  assert(splitRes.snapshot.playerHands[1].cards[0].rank === 'A', `Hand 2 starts with Ace`);
  assert(splitRes.snapshot.isEnded === true, `Split Aces auto-stands both hands & completes round cleanly`);

  console.log('\n--- TEST 6: Audit Log Net Gain/Loss Balance Formula Sync ---');
  let bjLogs = mockDb.audit_logs.filter(l => l.user_id === userId && l.source === 'blackjack');
  let bjNet = bjLogs.reduce((sum, log) => sum + (log.points_after - log.points_before), 0);
  let augustWagerPoints = 10000;
  let redeemedPoints = 0;
  let calculatedBalance = Math.max(0, augustWagerPoints - redeemedPoints + bjNet);
  assert(calculatedBalance === mockDb.users[userId].points, `Formula (augustWagerPoints - redeemed + bjNet) = ${calculatedBalance} matches exact DB user balance ${mockDb.users[userId].points}`);

  console.log('\n====================================================');
  console.log(`   RESULTS: ${passedCount} passed, ${failedCount} failed`);
  console.log('====================================================\n');

  if (failedCount > 0) process.exit(1);
}

runAudit().catch(err => {
  console.error("Audit script error:", err);
  process.exit(1);
});
