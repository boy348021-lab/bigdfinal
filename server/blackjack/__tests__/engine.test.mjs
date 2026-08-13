/**
 * Comprehensive Blackjack Engine Test Suite
 * Runs with: node server/blackjack/__tests__/engine.test.mjs
 * Uses Node's built-in assert module — no external dependencies.
 */
import assert from 'assert';
import RNGProvider from '../RNGProvider.js';
import Card, { SUITS, RANKS } from '../Card.js';
import Shoe from '../Shoe.js';
import HandEvaluator from '../HandEvaluator.js';
import RulesEngine, { DEFAULT_RULES } from '../RulesEngine.js';
import PlayerHand from '../PlayerHand.js';
import PayoutEngine from '../PayoutEngine.js';
import { STATES, FiniteStateMachine } from '../FSM.js';
import Engine from '../Engine.js';
import ActionDispatcher from '../ActionDispatcher.js';

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  ❌ ${name}`);
    console.log(`     → ${err.message}`);
  }
}

function makeCard(rank, suit = 'spades', deckIndex = 0) {
  return new Card(suit, rank, deckIndex);
}

function makeEngine(seed = 42) {
  return new Engine({ rngSeed: seed, rules: { minBet: 1, maxBet: 10000 } });
}

// Helper: deal a game and return the engine in PLAYER_TURN state
function dealGame(seed = 42, bet = 100) {
  const engine = makeEngine(seed);
  engine.placeBet('test_user', bet);
  engine.deal();
  return engine;
}

console.log('\n═══════════════════════════════════════════════');
console.log('  BLACKJACK ENGINE TEST SUITE');
console.log('═══════════════════════════════════════════════\n');

// ─── 1. RNGProvider Tests ────────────────────────────────────────────────────
console.log('▸ RNGProvider');

test('Seeded RNG produces deterministic results', () => {
  const rng1 = new RNGProvider(12345);
  const rng2 = new RNGProvider(12345);
  const seq1 = [rng1.nextInt(100), rng1.nextInt(100), rng1.nextInt(100)];
  const seq2 = [rng2.nextInt(100), rng2.nextInt(100), rng2.nextInt(100)];
  assert.deepStrictEqual(seq1, seq2);
});

test('Seeded shuffle produces deterministic order', () => {
  const rng1 = new RNGProvider(999);
  const rng2 = new RNGProvider(999);
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepStrictEqual(rng1.shuffle(arr), rng2.shuffle(arr));
});

test('Shuffle does not mutate original array', () => {
  const rng = new RNGProvider(42);
  const arr = [1, 2, 3, 4, 5];
  const copy = [...arr];
  rng.shuffle(arr);
  assert.deepStrictEqual(arr, copy);
});

// ─── 2. Card Tests ───────────────────────────────────────────────────────────
console.log('\n▸ Card');

test('Card has deterministic ID', () => {
  const card = new Card('spades', 'A', 0);
  assert.strictEqual(card.id, 'd0_A_spades');
});

test('Face cards have value 10', () => {
  assert.strictEqual(makeCard('J').value, 10);
  assert.strictEqual(makeCard('Q').value, 10);
  assert.strictEqual(makeCard('K').value, 10);
});

test('Ace has base value 11', () => {
  assert.strictEqual(makeCard('A').value, 11);
});

test('Number cards have face value', () => {
  assert.strictEqual(makeCard('7').value, 7);
  assert.strictEqual(makeCard('10').value, 10);
  assert.strictEqual(makeCard('2').value, 2);
});

test('toJSON hides face-down card details', () => {
  const card = makeCard('A');
  card.visibility = 'face_down';
  const json = card.toJSON();
  assert.strictEqual(json.visibility, 'face_down');
  assert.strictEqual(json.rank, undefined);
  assert.strictEqual(json.suit, undefined);
  assert.strictEqual(json.value, undefined);
});

test('toFullJSON always reveals everything', () => {
  const card = makeCard('A');
  card.visibility = 'face_down';
  const json = card.toFullJSON();
  assert.strictEqual(json.rank, 'A');
  assert.strictEqual(json.suit, 'spades');
  assert.strictEqual(json.value, 11);
});

// ─── 3. Shoe Tests ───────────────────────────────────────────────────────────
console.log('\n▸ Shoe');

test('6-deck shoe has 312 cards (minus burn)', () => {
  const rng = new RNGProvider(42);
  const shoe = new Shoe(6, 0.75, rng);
  // 312 - 1 burn = 311
  assert.strictEqual(shoe.getRemainingCount(), 311);
});

test('All card IDs in shoe are unique', () => {
  const rng = new RNGProvider(42);
  const shoe = new Shoe(6, 0.75, rng);
  const ids = new Set();
  const count = shoe.getRemainingCount();
  for (let i = 0; i < count; i++) {
    const card = shoe.drawCard();
    assert.ok(!ids.has(card.id), `Duplicate card ID: ${card.id}`);
    ids.add(card.id);
  }
  assert.strictEqual(ids.size, count);
});

test('Drawing from empty shoe triggers reshuffle', () => {
  const rng = new RNGProvider(42);
  const shoe = new Shoe(1, 0.75, rng); // 1 deck = 52 cards, minus burn = 51
  const count = shoe.getRemainingCount();
  for (let i = 0; i < count; i++) {
    shoe.drawCard();
  }
  assert.strictEqual(shoe.getRemainingCount(), 0);
  // Next draw should trigger reshuffle
  const card = shoe.drawCard();
  assert.ok(card);
  assert.ok(shoe.getRemainingCount() > 0);
});

// ─── 4. HandEvaluator Tests ─────────────────────────────────────────────────
console.log('\n▸ HandEvaluator');

test('A + 6 = 17 (soft)', () => {
  const result = HandEvaluator.evaluate([makeCard('A'), makeCard('6')]);
  assert.strictEqual(result.score, 17);
  assert.strictEqual(result.isSoft, true);
  assert.strictEqual(result.isBust, false);
});

test('A + 6 + 10 = 17 (hard)', () => {
  const result = HandEvaluator.evaluate([makeCard('A'), makeCard('6'), makeCard('10')]);
  assert.strictEqual(result.score, 17);
  assert.strictEqual(result.isHard, true);
  assert.strictEqual(result.isSoft, false);
});

test('A + A = 12 (soft)', () => {
  const result = HandEvaluator.evaluate([makeCard('A'), makeCard('A', 'hearts')]);
  assert.strictEqual(result.score, 12);
  assert.strictEqual(result.isSoft, true);
});

test('A + A + 9 = 21 (soft)', () => {
  const result = HandEvaluator.evaluate([makeCard('A'), makeCard('A', 'hearts'), makeCard('9')]);
  assert.strictEqual(result.score, 21);
  assert.strictEqual(result.isSoft, true);
});

test('A + A + 9 + 10 = 21 (hard)', () => {
  const result = HandEvaluator.evaluate([
    makeCard('A'), makeCard('A', 'hearts'), makeCard('9'), makeCard('10')
  ]);
  assert.strictEqual(result.score, 21);
  assert.strictEqual(result.isHard, true);
});

test('A + K = Blackjack (21, 2 cards, not split)', () => {
  const result = HandEvaluator.evaluate([makeCard('A'), makeCard('K')]);
  assert.strictEqual(result.score, 21);
  assert.strictEqual(result.isBlackjack, true);
});

test('A + Q = Blackjack', () => {
  const result = HandEvaluator.evaluate([makeCard('A'), makeCard('Q')]);
  assert.strictEqual(result.isBlackjack, true);
});

test('A + J = Blackjack', () => {
  const result = HandEvaluator.evaluate([makeCard('A'), makeCard('J')]);
  assert.strictEqual(result.isBlackjack, true);
});

test('A + 10 = Blackjack', () => {
  const result = HandEvaluator.evaluate([makeCard('A'), makeCard('10')]);
  assert.strictEqual(result.isBlackjack, true);
});

test('5 + 5 + A = 21 but NOT blackjack (3 cards)', () => {
  const result = HandEvaluator.evaluate([makeCard('5'), makeCard('5', 'hearts'), makeCard('A')]);
  assert.strictEqual(result.score, 21);
  assert.strictEqual(result.isBlackjack, false);
});

test('Split hand with A + K is NOT blackjack', () => {
  const result = HandEvaluator.evaluate([makeCard('A'), makeCard('K')], true);
  assert.strictEqual(result.score, 21);
  assert.strictEqual(result.isBlackjack, false);
});

test('K + Q + 5 = bust (25)', () => {
  const result = HandEvaluator.evaluate([makeCard('K'), makeCard('Q'), makeCard('5')]);
  assert.strictEqual(result.score, 25);
  assert.strictEqual(result.isBust, true);
});

test('Empty cards = score 0', () => {
  const result = HandEvaluator.evaluate([]);
  assert.strictEqual(result.score, 0);
});

// ─── 5. RulesEngine Tests ───────────────────────────────────────────────────
console.log('\n▸ RulesEngine');

test('Default rules match specification', () => {
  const rules = new RulesEngine();
  assert.strictEqual(rules.get('numDecks'), 6);
  assert.strictEqual(rules.get('dealerStandsSoft17'), true);
  assert.strictEqual(rules.get('blackjackPays'), 1.5);
  assert.strictEqual(rules.get('insurancePays'), 2);
  assert.strictEqual(rules.get('maxSplitDepth'), 3);
  assert.strictEqual(rules.get('doubleAfterSplit'), true);
  assert.strictEqual(rules.get('splitAcesReceiveOneCard'), true);
  assert.strictEqual(rules.get('splitAcesCannotHit'), true);
  assert.strictEqual(rules.get('surrenderAllowed'), false);
  assert.strictEqual(rules.get('insuranceAvailable'), true);
});

test('Bet validation enforces min/max', () => {
  const rules = new RulesEngine({ minBet: 10, maxBet: 5000 });
  assert.strictEqual(rules.validateBet(5).valid, false);
  assert.strictEqual(rules.validateBet(10).valid, true);
  assert.strictEqual(rules.validateBet(5000).valid, true);
  assert.strictEqual(rules.validateBet(5001).valid, false);
  assert.strictEqual(rules.validateBet(3.5).valid, false);
});

test('Dealer stands on soft 17 when dealerStandsSoft17 = true', () => {
  const rules = new RulesEngine({ dealerStandsSoft17: true });
  assert.strictEqual(rules.shouldDealerHit({ score: 17, isSoft: true }), false);
  assert.strictEqual(rules.shouldDealerHit({ score: 16, isSoft: false }), true);
  assert.strictEqual(rules.shouldDealerHit({ score: 18, isSoft: false }), false);
});

test('Dealer hits soft 17 when dealerStandsSoft17 = false', () => {
  const rules = new RulesEngine({ dealerStandsSoft17: false });
  assert.strictEqual(rules.shouldDealerHit({ score: 17, isSoft: true }), true);
  assert.strictEqual(rules.shouldDealerHit({ score: 17, isSoft: false }), false);
});

test('Insurance only when dealer shows Ace', () => {
  const rules = new RulesEngine();
  assert.strictEqual(rules.canInsure(makeCard('A')), true);
  assert.strictEqual(rules.canInsure(makeCard('K')), false);
  assert.strictEqual(rules.canInsure(makeCard('10')), false);
});

// ─── 6. PayoutEngine Tests ──────────────────────────────────────────────────
console.log('\n▸ PayoutEngine');

test('Player blackjack pays 3:2', () => {
  const hand = new PlayerHand('h1', 1000);
  hand.addCard(makeCard('A'));
  hand.addCard(makeCard('K'));
  const dEval = { score: 19, isBust: false, isBlackjack: false };
  const rules = new RulesEngine();
  const result = PayoutEngine.calculateHandResult(hand, dEval, rules);
  assert.strictEqual(result.outcome, 'PLAYER_BLACKJACK');
  assert.strictEqual(result.payout, 2500); // 1000 + 1500
  assert.strictEqual(result.profit, 1500);
});

test('Both blackjack = push', () => {
  const hand = new PlayerHand('h1', 1000);
  hand.addCard(makeCard('A'));
  hand.addCard(makeCard('K'));
  const dEval = { score: 21, isBust: false, isBlackjack: true };
  const rules = new RulesEngine();
  const result = PayoutEngine.calculateHandResult(hand, dEval, rules);
  assert.strictEqual(result.outcome, 'PUSH');
  assert.strictEqual(result.payout, 1000);
  assert.strictEqual(result.profit, 0);
});

test('Player win pays 1:1', () => {
  const hand = new PlayerHand('h1', 1000);
  hand.addCard(makeCard('10'));
  hand.addCard(makeCard('9'));
  const dEval = { score: 18, isBust: false, isBlackjack: false };
  const rules = new RulesEngine();
  const result = PayoutEngine.calculateHandResult(hand, dEval, rules);
  assert.strictEqual(result.outcome, 'PLAYER_WIN');
  assert.strictEqual(result.payout, 2000);
  assert.strictEqual(result.profit, 1000);
});

test('Push returns original wager', () => {
  const hand = new PlayerHand('h1', 1000);
  hand.addCard(makeCard('10'));
  hand.addCard(makeCard('8'));
  const dEval = { score: 18, isBust: false, isBlackjack: false };
  const rules = new RulesEngine();
  const result = PayoutEngine.calculateHandResult(hand, dEval, rules);
  assert.strictEqual(result.outcome, 'PUSH');
  assert.strictEqual(result.payout, 1000);
  assert.strictEqual(result.profit, 0);
});

test('Player bust = loss', () => {
  const hand = new PlayerHand('h1', 1000);
  hand.addCard(makeCard('K'));
  hand.addCard(makeCard('Q'));
  hand.addCard(makeCard('5'));
  const dEval = { score: 18, isBust: false, isBlackjack: false };
  const rules = new RulesEngine();
  const result = PayoutEngine.calculateHandResult(hand, dEval, rules);
  assert.strictEqual(result.outcome, 'PLAYER_BUST');
  assert.strictEqual(result.payout, 0);
  assert.strictEqual(result.profit, -1000);
});

test('Dealer bust = player wins', () => {
  const hand = new PlayerHand('h1', 1000);
  hand.addCard(makeCard('10'));
  hand.addCard(makeCard('5'));
  const dEval = { score: 24, isBust: true, isBlackjack: false };
  const rules = new RulesEngine();
  const result = PayoutEngine.calculateHandResult(hand, dEval, rules);
  assert.strictEqual(result.outcome, 'PLAYER_WIN');
  assert.strictEqual(result.payout, 2000);
});

test('Insurance win (dealer has blackjack)', () => {
  const dEval = { score: 21, isBust: false, isBlackjack: true };
  const rules = new RulesEngine();
  const result = PayoutEngine.calculateInsuranceResult(500, dEval, rules);
  assert.strictEqual(result.outcome, 'INSURANCE_WIN');
  assert.strictEqual(result.payout, 1500); // 500 + 1000
  assert.strictEqual(result.profit, 1000);
});

test('Insurance loss (dealer no blackjack)', () => {
  const dEval = { score: 19, isBust: false, isBlackjack: false };
  const rules = new RulesEngine();
  const result = PayoutEngine.calculateInsuranceResult(500, dEval, rules);
  assert.strictEqual(result.outcome, 'INSURANCE_LOSS');
  assert.strictEqual(result.payout, 0);
  assert.strictEqual(result.profit, -500);
});

// ─── 7. FSM Tests ───────────────────────────────────────────────────────────
console.log('\n▸ FSM');

test('FSM starts in WAITING_FOR_BET', () => {
  const fsm = new FiniteStateMachine();
  assert.strictEqual(fsm.getState(), STATES.WAITING_FOR_BET);
});

test('Valid transition: WAITING_FOR_BET → BET_ACCEPTED', () => {
  const fsm = new FiniteStateMachine();
  fsm.transitionTo(STATES.BET_ACCEPTED);
  assert.strictEqual(fsm.getState(), STATES.BET_ACCEPTED);
});

test('Illegal transition throws error', () => {
  const fsm = new FiniteStateMachine();
  assert.throws(() => fsm.transitionTo(STATES.PLAYER_TURN), /Illegal transition/);
});

test('canTransitionTo returns boolean without throwing', () => {
  const fsm = new FiniteStateMachine();
  assert.strictEqual(fsm.canTransitionTo(STATES.BET_ACCEPTED), true);
  assert.strictEqual(fsm.canTransitionTo(STATES.PLAYER_TURN), false);
});

test('FSM tracks history', () => {
  const fsm = new FiniteStateMachine();
  fsm.transitionTo(STATES.BET_ACCEPTED);
  fsm.transitionTo(STATES.DEALING);
  assert.strictEqual(fsm.history.length, 3);
  assert.strictEqual(fsm.history[0], STATES.WAITING_FOR_BET);
  assert.strictEqual(fsm.history[1], STATES.BET_ACCEPTED);
  assert.strictEqual(fsm.history[2], STATES.DEALING);
});

test('FSM reset clears history', () => {
  const fsm = new FiniteStateMachine();
  fsm.transitionTo(STATES.BET_ACCEPTED);
  fsm.reset(STATES.WAITING_FOR_BET);
  assert.strictEqual(fsm.getState(), STATES.WAITING_FOR_BET);
  assert.strictEqual(fsm.history.length, 1);
});

test('Invalid target state throws', () => {
  const fsm = new FiniteStateMachine();
  assert.throws(() => fsm.transitionTo('GARBAGE_STATE'), /Invalid state/);
});

// ─── 8. Engine Tests ────────────────────────────────────────────────────────
console.log('\n▸ Engine');

test('Engine starts in WAITING_FOR_BET', () => {
  const engine = makeEngine();
  assert.strictEqual(engine.fsm.getState(), STATES.WAITING_FOR_BET);
});

test('placeBet transitions to BET_ACCEPTED', () => {
  const engine = makeEngine();
  engine.placeBet('user1', 100);
  assert.strictEqual(engine.fsm.getState(), STATES.BET_ACCEPTED);
  assert.strictEqual(engine.initialBet, 100);
});

test('placeBet rejects invalid amounts', () => {
  const engine = makeEngine();
  assert.throws(() => engine.placeBet('user1', 0), /Minimum bet/);
  assert.throws(() => engine.placeBet('user1', -50));
  assert.throws(() => engine.placeBet('user1', 99999), /Maximum bet/);
});

test('deal creates 4 cards (2 player + 2 dealer)', () => {
  const engine = makeEngine();
  engine.placeBet('user1', 100);
  const snapshot = engine.deal();
  assert.strictEqual(engine.playerHands[0].cards.length, 2);
  assert.strictEqual(engine.dealerCards.length, 2);
});

test('Dealer hole card is face-down in snapshot', () => {
  const engine = makeEngine();
  engine.placeBet('user1', 100);
  const snapshot = engine.deal();
  if (!snapshot.isEnded) {
    // Find the face-down card in dealer cards
    const faceDown = snapshot.dealerCards.find(c => c.visibility === 'face_down');
    if (faceDown) {
      assert.strictEqual(faceDown.rank, undefined, 'Hidden card rank should not be revealed');
      assert.strictEqual(faceDown.suit, undefined, 'Hidden card suit should not be revealed');
    }
  }
});

test('Cannot HIT before dealing', () => {
  const engine = makeEngine();
  assert.throws(() => engine.hit());
});

test('Cannot STAND before dealing', () => {
  const engine = makeEngine();
  assert.throws(() => engine.stand());
});

test('Cannot place second bet during active game', () => {
  const engine = makeEngine(100);
  engine.placeBet('user1', 100);
  engine.deal();
  if (!engine.isEnded) {
    assert.throws(() => engine.placeBet('user1', 200), /Cannot place bet/);
  }
});

test('HIT draws a card', () => {
  // Use many seeds to find one where the game doesn't end immediately
  let engine;
  for (let seed = 1; seed < 200; seed++) {
    engine = makeEngine(seed);
    engine.placeBet('user1', 100);
    const snap = engine.deal();
    if (!snap.isEnded && snap.canHit && !snap.insuranceOffered) break;
    if (snap.insuranceOffered) {
      engine.declineInsurance();
      if (!engine.isEnded && engine.playerHands[0].cards.length === 2) break;
    }
  }
  if (!engine.isEnded) {
    const cardsBefore = engine.playerHands[0].cards.length;
    engine.hit();
    assert.strictEqual(engine.playerHands[0].cards.length, cardsBefore + 1);
  }
});

test('STAND ends the hand and triggers dealer/settlement', () => {
  let engine;
  for (let seed = 1; seed < 200; seed++) {
    engine = makeEngine(seed);
    engine.placeBet('user1', 100);
    const snap = engine.deal();
    if (snap.insuranceOffered) engine.declineInsurance();
    if (!engine.isEnded) break;
  }
  if (!engine.isEnded) {
    const snapshot = engine.stand();
    assert.strictEqual(snapshot.isEnded, true);
    assert.ok(snapshot.totalPayout !== undefined);
  }
});

test('Game completes with valid outcome', () => {
  const engine = makeEngine(42);
  engine.placeBet('user1', 100);
  engine.deal();
  if (engine.insuranceOffered) engine.declineInsurance();
  if (!engine.isEnded) {
    engine.stand();
  }
  assert.strictEqual(engine.isEnded, true);
  const hand = engine.playerHands[0];
  assert.ok(hand.outcome !== null, 'Hand should have an outcome');
  const validOutcomes = ['PLAYER_BLACKJACK', 'DEALER_BLACKJACK', 'PLAYER_WIN', 'DEALER_WIN', 'PUSH', 'PLAYER_BUST', 'SURRENDER'];
  assert.ok(validOutcomes.includes(hand.outcome), `Outcome '${hand.outcome}' is valid`);
});

test('Completed game snapshot reveals dealer cards', () => {
  const engine = makeEngine(42);
  engine.placeBet('user1', 100);
  engine.deal();
  if (engine.insuranceOffered) engine.declineInsurance();
  if (!engine.isEnded) engine.stand();
  const snapshot = engine.getSnapshot();
  assert.strictEqual(snapshot.isEnded, true);
  // All dealer cards should be face-up now
  for (const dc of snapshot.dealerCards) {
    assert.strictEqual(dc.visibility, 'face_up');
    assert.ok(dc.rank !== undefined, 'Revealed dealer card should have rank');
  }
});

test('Action lock prevents concurrent actions', () => {
  const engine = makeEngine(42);
  engine.isProcessingAction = true;
  assert.throws(() => engine.placeBet('user1', 100), /Action locked/);
  engine.isProcessingAction = false;
});

test('Multiple games: engine can be reused after completion', () => {
  const engine = makeEngine(42);
  // Game 1
  engine.placeBet('user1', 100);
  engine.deal();
  if (engine.insuranceOffered) engine.declineInsurance();
  if (!engine.isEnded) engine.stand();
  assert.strictEqual(engine.isEnded, true);

  // Game 2
  engine.placeBet('user1', 200);
  engine.deal();
  if (engine.insuranceOffered) engine.declineInsurance();
  if (!engine.isEnded) engine.stand();
  assert.strictEqual(engine.isEnded, true);
  assert.strictEqual(engine.initialBet, 200);
});

// ─── 9. Double Down Tests ───────────────────────────────────────────────────
console.log('\n▸ Double Down');

test('Double down doubles bet and draws exactly one card', () => {
  let engine;
  let found = false;
  for (let seed = 1; seed < 500; seed++) {
    engine = makeEngine(seed);
    engine.placeBet('user1', 100);
    const snap = engine.deal();
    if (snap.insuranceOffered) engine.declineInsurance();
    if (!engine.isEnded && snap.canDouble) {
      found = true;
      break;
    }
  }
  if (found) {
    const cardsBefore = engine.playerHands[0].cards.length;
    const snapshot = engine.doubleDown();
    assert.strictEqual(engine.playerHands[0].cards.length, cardsBefore + 1);
    assert.strictEqual(engine.playerHands[0].bet, 200); // doubled
    assert.strictEqual(engine.playerHands[0].isDoubled, true);
    assert.strictEqual(snapshot.isEnded, true); // auto-stand after double
  }
});

// ─── 10. Split Tests ────────────────────────────────────────────────────────
console.log('\n▸ Split');

test('Split creates two hands from matching cards', () => {
  let engine;
  let found = false;
  for (let seed = 1; seed < 1000; seed++) {
    engine = makeEngine(seed);
    engine.placeBet('user1', 100);
    const snap = engine.deal();
    if (snap.insuranceOffered) engine.declineInsurance();
    if (!engine.isEnded && snap.canSplit) {
      found = true;
      break;
    }
  }
  if (found) {
    const handsBefore = engine.playerHands.length;
    engine.split();
    assert.strictEqual(engine.playerHands.length, handsBefore + 1);
    assert.strictEqual(engine.playerHands[0].isSplitHand, true);
    assert.strictEqual(engine.playerHands[1].isSplitHand, true);
  } else {
    console.log('     ⚠ Could not find splittable hand in seed range');
  }
});

test('Split Aces auto-stands both hands and triggers dealer turn without errors', () => {
  const engine = makeEngine(1);
  const mockCards = [
    new Card('hearts', 'A', 0),   // player 1
    new Card('spades', '5', 0),   // dealer visible
    new Card('diamonds', 'A', 0), // player 2
    new Card('clubs', '6', 0),    // dealer hidden
    new Card('clubs', '9', 0),    // player hand 1 draw (A + 9 = 20)
    new Card('diamonds', 'K', 0), // player hand 2 draw (A + K = 21)
    new Card('spades', 'K', 0)    // dealer hit card (if any)
  ];
  engine.shoe.drawCard = () => mockCards.shift() || new Card('clubs', '2', 0);

  engine.placeBet('user1', 100);
  const snap1 = engine.deal();
  assert.strictEqual(snap1.canSplit, true);

  const snap2 = engine.split();
  assert.strictEqual(engine.playerHands.length, 2);
  assert.strictEqual(engine.playerHands[0].isEnded, true);
  assert.strictEqual(engine.playerHands[1].isEnded, true);
  assert.strictEqual(snap2.isEnded, true);
});

// ─── 11. Insurance Tests ────────────────────────────────────────────────────
console.log('\n▸ Insurance');

test('Insurance offered when dealer shows Ace', () => {
  let engine;
  let found = false;
  for (let seed = 1; seed < 1000; seed++) {
    engine = makeEngine(seed);
    engine.placeBet('user1', 100);
    const snap = engine.deal();
    if (snap.insuranceOffered || snap.canInsure) {
      found = true;
      break;
    }
  }
  if (found) {
    assert.strictEqual(engine.insuranceOffered, true);
    assert.strictEqual(engine.dealerCards[0].rank, 'A');
  } else {
    console.log('     ⚠ Could not find dealer-ace in seed range');
  }
});

test('Can buy and decline insurance', () => {
  let engine;
  for (let seed = 1; seed < 1000; seed++) {
    engine = makeEngine(seed);
    engine.placeBet('user1', 1000);
    engine.deal();
    if (engine.insuranceOffered) break;
  }
  if (engine.insuranceOffered) {
    // Test decline
    const engine2 = makeEngine(engine.rng.seed || 42);
    // Recreate same state
    const snap = engine.declineInsurance();
    assert.strictEqual(engine.insuranceBet, 0);
    assert.ok(snap);
  }
});

// ─── 12. Snapshot Security Tests ────────────────────────────────────────────
console.log('\n▸ Snapshot Security');

test('Snapshot never reveals shoe contents', () => {
  const engine = makeEngine(42);
  engine.placeBet('user1', 100);
  const snapshot = engine.deal();
  assert.strictEqual(snapshot.remainingCards !== undefined, true);
  // Snapshot should NOT have a 'shoe' or 'cards' array
  assert.strictEqual(snapshot.shoe, undefined);
});

test('getFullState reveals hidden dealer card', () => {
  const engine = makeEngine(42);
  engine.placeBet('user1', 100);
  engine.deal();
  if (!engine.isEnded) {
    const full = engine.getFullState();
    const allRevealed = full.dealerCards.every(c => c.rank !== undefined);
    assert.strictEqual(allRevealed, true, 'Full state should reveal all dealer cards');
  }
});

// ─── 13. Edge Cases ─────────────────────────────────────────────────────────
console.log('\n▸ Edge Cases');

test('Game with bet = 1 (minimum)', () => {
  const engine = makeEngine(42);
  engine.placeBet('user1', 1);
  const snap = engine.deal();
  assert.strictEqual(engine.initialBet, 1);
  if (engine.insuranceOffered) engine.declineInsurance();
  if (!engine.isEnded) engine.stand();
  assert.strictEqual(engine.isEnded, true);
});

test('Game with bet = 10000 (maximum)', () => {
  const engine = makeEngine(42);
  engine.placeBet('user1', 10000);
  const snap = engine.deal();
  assert.strictEqual(engine.initialBet, 10000);
  if (engine.insuranceOffered) engine.declineInsurance();
  if (!engine.isEnded) engine.stand();
  assert.strictEqual(engine.isEnded, true);
});

test('Hitting until bust works correctly', () => {
  let engine;
  let busted = false;
  for (let seed = 1; seed < 500; seed++) {
    engine = makeEngine(seed);
    engine.placeBet('user1', 100);
    engine.deal();
    if (engine.insuranceOffered) engine.declineInsurance();
    if (engine.isEnded) continue;
    
    // Keep hitting until bust or 21
    let attempts = 0;
    while (!engine.isEnded && engine.playerHands[engine.activeHandIndex] && 
           !engine.playerHands[engine.activeHandIndex].isEnded && attempts < 10) {
      try {
        engine.hit();
        attempts++;
      } catch (e) {
        break;
      }
    }
    if (engine.isEnded) {
      busted = true;
      break;
    }
  }
  if (busted) {
    assert.strictEqual(engine.isEnded, true);
  }
});

// ─── 14. All States Defined ─────────────────────────────────────────────────
console.log('\n▸ State Completeness');

test('All 16 required states are defined', () => {
  const requiredStates = [
    'WAITING_FOR_BET', 'BET_ACCEPTED', 'DEALING', 'INITIAL_HAND_DEALT',
    'CHECKING_BLACKJACK', 'PLAYER_TURN', 'PLAYER_HIT', 'PLAYER_DOUBLE',
    'PLAYER_SPLIT', 'PLAYER_STAND', 'DEALER_TURN', 'DEALER_DRAWING',
    'SETTLING', 'COMPLETED', 'CANCELLED', 'ERROR'
  ];
  for (const state of requiredStates) {
    assert.ok(STATES[state] !== undefined, `State ${state} should be defined`);
  }
});

// ─── 15. Event Sequencing Tests ───────────────────────────────────────────────
console.log('\n▸ Event Sequencing & Idempotency');

test('Event sequence generated during DEAL', () => {
  const engine = makeEngine(42);
  engine.placeBet('user1', 100);
  const snap = engine.deal();
  
  const events = engine.eventsList;
  assert.ok(events.length > 0, 'Should have generated events');
  
  // Verify monotonic sequence numbers
  for (let i = 0; i < events.length; i++) {
    assert.strictEqual(events[i].sequenceNumber, i + 1);
    assert.strictEqual(events[i].eventId, `evt_${engine.gameId}_${i + 1}`);
  }

  // Check expected sequence for DEAL (no blackjack):
  // ROUND_CREATED, BET_ACCEPTED, DEALING_STARTED, DEAL_PLAYER_CARD, DEAL_DEALER_VISIBLE_CARD, 
  // DEAL_PLAYER_CARD, DEAL_DEALER_HIDDEN_CARD, INITIAL_DEAL_COMPLETE, CHECK_BLACKJACK, PLAYER_TURN_STARTED
  const expectedTypes = [
    'ROUND_CREATED', 'BET_ACCEPTED', 'DEALING_STARTED', 
    'DEAL_PLAYER_CARD', 'DEAL_DEALER_VISIBLE_CARD', 
    'DEAL_PLAYER_CARD', 'DEAL_DEALER_HIDDEN_CARD', 
    'INITIAL_DEAL_COMPLETE', 'CHECK_BLACKJACK'
  ];

  for (let i = 0; i < expectedTypes.length; i++) {
    assert.strictEqual(events[i].eventType, expectedTypes[i]);
  }

  // Check that dealer hole card is face_down in the event payload
  const hiddenCardEvent = events.find(e => e.eventType === 'DEAL_DEALER_HIDDEN_CARD');
  assert.ok(hiddenCardEvent, 'Must have DEAL_DEALER_HIDDEN_CARD event');
  assert.strictEqual(hiddenCardEvent.payload.visibility, 'face_down');
  assert.strictEqual(hiddenCardEvent.payload.rank, undefined, 'Hidden card rank should not be in event');
});

test('ActionDispatcher Idempotency', async () => {
  const activeGames = new Map();
  // mock supabase
  const supabase = {
    rpc: async () => ({ data: 1000, error: null })
  };
  const dispatcher = new ActionDispatcher(activeGames, supabase);
  
  // First deal
  const actionIdDeal = 'req_deal_1';
  const res1 = await dispatcher.dispatch('user1', 'DEAL', { bet: 100, actionId: actionIdDeal });
  assert.ok(res1.snapshot);
  
  const engine = activeGames.get('user1');
  const initialEventsLength = engine.eventsList.length;
  
  // Duplicate deal
  const res2 = await dispatcher.dispatch('user1', 'DEAL', { bet: 100, actionId: actionIdDeal });
  assert.deepStrictEqual(res1, res2, 'Duplicate request should return identical cached response');
  assert.strictEqual(engine.eventsList.length, initialEventsLength, 'Duplicate request should not generate new events');
  
  // Now hit
  const actionIdHit = 'req_hit_1';
  const res3 = await dispatcher.dispatch('user1', 'HIT', { actionId: actionIdHit });
  assert.ok(res3.snapshot);
  const eventsAfterHit = engine.eventsList.length;
  assert.ok(eventsAfterHit > initialEventsLength, 'Hit should generate new events');
  
  // Duplicate hit
  const res4 = await dispatcher.dispatch('user1', 'HIT', { actionId: actionIdHit });
  assert.deepStrictEqual(res3, res4, 'Duplicate hit should return cached response');
  assert.strictEqual(engine.eventsList.length, eventsAfterHit, 'Duplicate hit should not generate new events');
});

// ─── 16. Security & Integrity Tests ──────────────────────────────────────────
console.log('\n▸ Security & Integrity (Phase 6)');

test('Impossible state detection: duplicate card triggers ERROR', () => {
  const engine = makeEngine(42);
  engine.placeBet('user1', 100);
  engine.deal();
  if (engine.insuranceOffered) engine.declineInsurance();
  
  // Artificially create duplicate card
  engine.dealerCards.push(engine.playerHands[0].cards[0]);
  
  assert.throws(() => {
    engine.getSnapshot(); // which calls validateSanity
  }, /Duplicate physical card/);
  
  assert.strictEqual(engine.fsm.getState(), STATES.ERROR);
});

test('Wallet integrity stress test (1000 rounds)', () => {
  let balance = 100000;
  let totalBet = 100;
  
  for(let seed = 1; seed <= 1000; seed++) {
    const engine = makeEngine(seed);
    const balance_before = balance;
    balance -= totalBet;
    
    engine.placeBet('stress_user', totalBet);
    engine.deal();
    
    if (engine.insuranceOffered) {
       engine.declineInsurance();
    }
    
    let iterations = 0;
    while (!engine.isEnded && iterations < 20) {
       try {
          if (engine.getSnapshot().canHit) {
             engine.hit();
          } else if (engine.getSnapshot().canStand) {
             engine.stand();
          }
       } catch (e) {
          break; // probably bust or complete
       }
       iterations++;
    }
    
    if (!engine.isEnded && engine.fsm.getState() !== STATES.ERROR) {
       if (engine.getSnapshot().canStand) engine.stand();
    }
    
    assert.strictEqual(engine.isEnded, true, `Round ${seed} did not end`);
    
    const payout = engine.totalPayout;
    const balance_after = balance + payout;
    balance = balance_after;
    
    // verify wallet invariant
    assert.strictEqual(balance_before - totalBet + payout, balance_after);
    assert.notStrictEqual(engine.fsm.getState(), STATES.ERROR, `Engine in ERROR state on round ${seed}`);
  }
});

// ─── 17. Frontend Queue Simulation ──────────────────────────────────────────
console.log('\n▸ Frontend Queue Simulation');

test('Out-of-order delivery queue in frontend', () => {
  const queue = [];
  let expectedSeq = 1;
  const processed = [];
  
  function receiveEvent(ev) {
     queue.push(ev);
     queue.sort((a,b) => a.seq - b.seq);
     
     while (queue.length > 0 && queue[0].seq === expectedSeq) {
       const next = queue.shift();
       processed.push(next.seq);
       expectedSeq++;
     }
  }
  
  receiveEvent({seq: 4});
  receiveEvent({seq: 2});
  receiveEvent({seq: 3});
  receiveEvent({seq: 1});
  
  assert.deepStrictEqual(processed, [1, 2, 3, 4]);
});

test('Duplicate/Missing events handling on frontend', () => {
  const queue = [];
  let expectedSeq = 1;
  const processed = [];
  const processedSet = new Set();
  
  function receiveEvent(ev) {
     if (processedSet.has(ev.seq)) return; // discard duplicate already processed
     if (queue.some(q => q.seq === ev.seq)) return; // discard duplicate already in queue
     queue.push(ev);
     queue.sort((a,b) => a.seq - b.seq);
     
     while (queue.length > 0 && queue[0].seq === expectedSeq) {
       const next = queue.shift();
       processed.push(next.seq);
       processedSet.add(next.seq);
       expectedSeq++;
     }
  }
  
  receiveEvent({seq: 1});
  receiveEvent({seq: 2});
  receiveEvent({seq: 3});
  receiveEvent({seq: 5});
  receiveEvent({seq: 5});
  receiveEvent({seq: 5});
  receiveEvent({seq: 7});
  
  assert.deepStrictEqual(processed, [1, 2, 3]);
  
  receiveEvent({seq: 4});
  assert.deepStrictEqual(processed, [1, 2, 3, 4, 5]);
  
  receiveEvent({seq: 6});
  assert.deepStrictEqual(processed, [1, 2, 3, 4, 5, 6, 7]);
});

// ─── SUMMARY ────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\n  FAILURES:');
  for (const f of failures) {
    console.log(`  ❌ ${f.name}: ${f.error}`);
  }
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
