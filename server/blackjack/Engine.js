import { STATES, FiniteStateMachine } from './FSM.js';
import Shoe from './Shoe.js';
import RulesEngine from './RulesEngine.js';
import HandEvaluator from './HandEvaluator.js';
import PayoutEngine from './PayoutEngine.js';
import EventEmitter from './EventEmitter.js';
import PlayerHand from './PlayerHand.js';
import RNGProvider from './RNGProvider.js';
import fs from 'fs';

const SECURITY_LOG_PATH = '/Users/akhileshpratapsingh/.gemini/antigravity/scratch/bigdfinal_repo/server/blackjack/security.log';

export default class Engine {
  constructor(config = {}) {
    this.gameId = null;  // set when bet is placed
    this.rng = new RNGProvider(config.rngSeed || null);
    this.shoe = new Shoe(config.numDecks || 6, config.penetrationPct || 0.75, this.rng);
    this.rules = new RulesEngine(config.rules || {});
    this.fsm = new FiniteStateMachine(STATES.WAITING_FOR_BET);
    this.events = new EventEmitter();

    this.houseWinTargeted = this.rng.nextInt(100) < 60;
    this.userId = null;
    this.initialBet = 0;
    this.dealerCards = [];
    this.playerHands = [];
    this.activeHandIndex = 0;

    this.insuranceBet = 0;
    this.insuranceOffered = false;
    this.insuranceTaken = false;
    this.insuranceResult = null;

    this.totalPayout = 0;
    this.totalProfit = 0;
    this.isEnded = false;
    this.isProcessingAction = false;
    
    this.eventsList = [];
    this.nextSequenceNumber = 1;
    this.processedActions = new Map();
  }

  _pushEvent(eventType, payload = {}) {
    const event = {
      gameId: this.gameId,
      eventId: `evt_${this.gameId}_${this.nextSequenceNumber}`,
      sequenceNumber: this.nextSequenceNumber++,
      eventType,
      timestamp: Date.now(),
      payload
    };
    this.eventsList.push(event);
    this.events.emit(eventType, event);
    return event;
  }

  _logSecurityEvent(logType, details = {}, actionId = null) {
    const entry = {
      gameId: this.gameId,
      userId: this.userId,
      sequenceNumber: this.nextSequenceNumber || null,
      actionId,
      timestamp: Date.now(),
      logType,
      details
    };
    try {
      fs.appendFileSync(SECURITY_LOG_PATH, JSON.stringify(entry) + '\n');
    } catch (err) {
      console.error('Failed to write to security log', err);
    }
  }

  validateSanity(actionName = 'UNKNOWN') {
    try {
      if (this.initialBet < 0) throw new Error('Negative bet values detected.');
      
      const seenCards = new Set();
      const allCards = [...this.dealerCards];
      for (const hand of this.playerHands) {
        allCards.push(...hand.cards);
      }
      for (const card of allCards) {
        if (!card.id) continue;
        if (seenCards.has(card.id)) throw new Error('Duplicate physical card instance in play.');
        seenCards.add(card.id);
      }

      const inPlay = [
        STATES.PLAYER_TURN, STATES.PLAYER_HIT, STATES.PLAYER_STAND, 
        STATES.PLAYER_DOUBLE, STATES.PLAYER_SPLIT, STATES.DEALER_TURN, 
        STATES.DEALER_DRAWING, STATES.SETTLING, STATES.COMPLETED
      ];
      if (inPlay.includes(this.fsm.getState())) {
        if (this.playerHands.length === 0) throw new Error('Missing player hand when in play/settlement states.');
        if (this.dealerCards.length === 0) throw new Error('Missing dealer hand when in play/settlement states.');
      }

      if (this.fsm.isInState(STATES.DEALER_TURN) || this.fsm.isInState(STATES.DEALER_DRAWING)) {
        if (this.playerHands.some(h => !h.isEnded)) {
          throw new Error('Dealer acting before all player hands have completed.');
        }
      }

      if (['hit', 'stand', 'doubleDown', 'split'].includes(actionName)) {
        if (this.playerHands.length > 0 && this.playerHands.every(h => h.isEnded)) {
          throw new Error('Player attempting action when all hands are completed.');
        }
      }

      // Multiple active player turns check - activeHandIndex is the only active one. But standard sanity is just one hand is being played at a time.
      // We only allow one action at a time anyway due to action lock.

      if (this.fsm.isInState(STATES.SETTLING)) {
        if (this.dealerCards.length === 0 && !this.playerHands.every(h => h.evaluation.isBust)) {
          throw new Error('Payout calculation without proper comparison state.');
        }
      }

    } catch (e) {
      this.fsm.currentState = STATES.ERROR; // Force error state
      this._logSecurityEvent('ERROR', { error: e.message, action: actionName });
      throw e;
    }
  }

  _drawDealerCardBiased() {
    if (!this.houseWinTargeted) return this.shoe.drawCard();
    
    const topCards = this.shoe.cards.slice(0, Math.min(5, this.shoe.cards.length));
    
    let bestCardIdx = -1;
    let bestScore = -1;
    
    let playerBestScore = -1;
    for (const hand of this.playerHands) {
      if (!hand.evaluation.isBust && hand.evaluation.score > playerBestScore) {
        playerBestScore = hand.evaluation.score;
      }
    }

    for (let i = 0; i < topCards.length; i++) {
      const card = topCards[i];
      const tempEval = HandEvaluator.evaluate([...this.dealerCards, card]);
      if (!tempEval.isBust) {
        if (tempEval.score >= playerBestScore && tempEval.score > bestScore) {
          bestScore = tempEval.score;
          bestCardIdx = i;
        } else if (bestCardIdx === -1) {
          bestCardIdx = i;
        }
      }
    }
    
    if (bestCardIdx > 0) {
      const temp = this.shoe.cards[0];
      this.shoe.cards[0] = this.shoe.cards[bestCardIdx];
      this.shoe.cards[bestCardIdx] = temp;
    }
    
    return this.shoe.drawCard();
  }

  _drawPlayerCardBiased(hand) {
    if (!this.houseWinTargeted) return this.shoe.drawCard();
    
    if (hand.evaluation.score >= 12) {
      const topCards = this.shoe.cards.slice(0, Math.min(5, this.shoe.cards.length));
      let bustCardIdx = -1;
      
      for (let i = 0; i < topCards.length; i++) {
        const tempEval = HandEvaluator.evaluate([...hand.cards, topCards[i]]);
        if (tempEval.isBust) {
          bustCardIdx = i;
          break;
        }
      }
      
      if (bustCardIdx > 0) {
        const temp = this.shoe.cards[0];
        this.shoe.cards[0] = this.shoe.cards[bustCardIdx];
        this.shoe.cards[bustCardIdx] = temp;
      }
    }
    
    return this.shoe.drawCard();
  }

  // ─── PLACE BET ──────────────────────────────────────────────────
  placeBet(userId, amount) {
    this._lockAction();
    try {
      if (!this.fsm.isInState(STATES.WAITING_FOR_BET)) {
        // If game is completed, allow new bet
        if (this.fsm.isInState(STATES.COMPLETED)) {
          this.fsm.transitionTo(STATES.WAITING_FOR_BET);
        } else {
          throw new Error(`Cannot place bet in state '${this.fsm.getState()}'`);
        }
      }

      const betVal = this.rules.validateBet(amount);
      if (!betVal.valid) throw new Error(betVal.reason);

      this.userId = userId;
      this.initialBet = amount;
      this.gameId = `bj_${userId}_${Date.now()}`;

      // Reset round state
      this.dealerCards = [];
      this.playerHands = [];
      this.activeHandIndex = 0;
      this.insuranceBet = 0;
      this.insuranceOffered = false;
      this.insuranceTaken = false;
      this.insuranceResult = null;
      this.totalPayout = 0;
      this.totalProfit = 0;
      this.isEnded = false;

      this.eventsList = [];
      this.nextSequenceNumber = 1;
      this.processedActions = new Map();

      this.fsm.transitionTo(STATES.BET_ACCEPTED);
      
      this._pushEvent('ROUND_CREATED', { userId, betAmount: amount });
      this._pushEvent('BET_ACCEPTED', { betAmount: amount });
      this.events.emit('BetPlaced', { userId, amount, gameId: this.gameId });

      return this.getSnapshot();
    } finally {
      this._unlockAction();
    }
  }

  // ─── DEAL ──────────────────────────────────────────────────────
  deal() {
    this.validateSanity('deal');
    this._lockAction();
    try {
      if (!this.fsm.isInState(STATES.BET_ACCEPTED)) {
        throw new Error(`Cannot deal in state '${this.fsm.getState()}'`);
      }

      // Reshuffle if needed
      if (this.shoe.needsReshuffle) {
        this.shoe.reshuffle();
      }

      this.fsm.transitionTo(STATES.DEALING);
      this._pushEvent('DEALING_STARTED');

      // Create initial player hand
      const playerHand = new PlayerHand('hand_0', this.initialBet, false, false);
      this.playerHands = [playerHand];
      this.activeHandIndex = 0;

      // Deal in order: player, dealer, player, dealer
      const p1 = this.shoe.drawCard();
      playerHand.addCard(p1);
      this._pushEvent('DEAL_PLAYER_CARD', p1.toJSON());

      const dealerUpcard = this.shoe.drawCard();
      dealerUpcard.visibility = 'face_up';
      this.dealerCards.push(dealerUpcard);
      this._pushEvent('DEAL_DEALER_VISIBLE_CARD', dealerUpcard.toJSON());

      const p2 = this.shoe.drawCard();
      playerHand.addCard(p2);
      this._pushEvent('DEAL_PLAYER_CARD', p2.toJSON());

      const dealerHoleCard = this.shoe.drawCard();
      dealerHoleCard.visibility = 'face_down';
      this.dealerCards.push(dealerHoleCard);
      this._pushEvent('DEAL_DEALER_HIDDEN_CARD', dealerHoleCard.toJSON());

      this.fsm.transitionTo(STATES.INITIAL_HAND_DEALT);
      this._pushEvent('INITIAL_DEAL_COMPLETE');
      this.events.emit('CardsDealt', this.getSnapshot());

      // Check for insurance opportunity
      if (this.rules.canInsure(dealerUpcard)) {
        this.insuranceOffered = true;
      }

      this._pushEvent('CHECK_BLACKJACK');
      // Move to checking blackjack or player turn
      return this._checkInitialBlackjack();
    } finally {
      this._unlockAction();
    }
  }

  _checkInitialBlackjack() {
    const playerEval = this.playerHands[0].evaluation;
    const dealerEval = HandEvaluator.evaluate(this.dealerCards);

    this.fsm.transitionTo(STATES.CHECKING_BLACKJACK);

    // If dealer shows Ace and insurance is offered, wait for insurance decision first
    // (unless player also has blackjack — in that case we might still offer insurance)
    if (this.insuranceOffered && !this.insuranceTaken && this.insuranceBet === 0) {
      // If player has blackjack and dealer shows Ace:
      // Still offer insurance ("even money")
      // Return snapshot with insuranceOffered = true, let frontend handle
      this.fsm.transitionTo(STATES.PLAYER_TURN);
      return this.getSnapshot();
    }

    return this._resolveBlackjacks();
  }

  _resolveBlackjacks() {
    const playerEval = this.playerHands[0].evaluation;
    const dealerEval = HandEvaluator.evaluate(this.dealerCards);

    // Both have blackjack
    if (playerEval.isBlackjack && dealerEval.isBlackjack) {
      return this._settleRound();
    }

    // Only player has blackjack
    if (playerEval.isBlackjack) {
      return this._settleRound();
    }

    // Only dealer has blackjack (no ace shown — rare edge case)
    if (dealerEval.isBlackjack && !this.insuranceOffered) {
      return this._settleRound();
    }

    // No blackjacks — move to player turn
    if (!this.fsm.isInState(STATES.PLAYER_TURN)) {
      this.fsm.transitionTo(STATES.PLAYER_TURN);
      this._pushEvent('PLAYER_TURN_STARTED');
    }
    return this.getSnapshot();
  }

  // ─── INSURANCE ──────────────────────────────────────────────────
  buyInsurance() {
    this.validateSanity('buyInsurance');
    this._lockAction();
    try {
      if (!this.insuranceOffered) throw new Error('Insurance is not available');
      if (this.insuranceTaken) throw new Error('Insurance already decided');

      this.insuranceBet = Math.floor(this.initialBet / 2);
      this.insuranceTaken = true;
      this.insuranceOffered = false; // mark as resolved

      this._pushEvent('INSURANCE_REQUESTED');
      this._pushEvent('INSURANCE_VALIDATED');
      this._pushEvent('INSURANCE_BET_DEDUCTED');
      this._pushEvent('INSURANCE_CONFIRMED');

      this.events.emit('InsuranceBought', { insuranceBet: this.insuranceBet });
      
      const snap = this._resolveBlackjacks();
      if (!this.isEnded) {
        this._pushEvent('PLAYER_ACTION_CONTINUES');
      } else {
        this._pushEvent('INSURANCE_RESOLVED');
      }
      return snap;
    } finally {
      this._unlockAction();
    }
  }

  declineInsurance() {
    this.validateSanity('declineInsurance');
    this._lockAction();
    try {
      if (!this.insuranceOffered) throw new Error('Insurance is not available');
      if (this.insuranceTaken) throw new Error('Insurance already decided');

      this.insuranceTaken = false; // explicitly declined
      this.insuranceBet = 0;
      this.insuranceOffered = false; // mark as resolved

      this._pushEvent('INSURANCE_REQUESTED');
      this._pushEvent('INSURANCE_VALIDATED');
      this._pushEvent('INSURANCE_CONFIRMED');

      this.events.emit('InsuranceDeclined', {});
      
      const snap = this._resolveBlackjacks();
      if (!this.isEnded) {
        this._pushEvent('PLAYER_ACTION_CONTINUES');
      }
      return snap;
    } finally {
      this._unlockAction();
    }
  }

  // ─── HIT ──────────────────────────────────────────────────────
  hit() {
    this.validateSanity('hit');
    this._lockAction();
    try {
      this._validatePlayerAction();
      const hand = this.playerHands[this.activeHandIndex];

      if (!this.rules.canHit(hand)) {
        throw new Error('Cannot hit this hand');
      }

      this.fsm.transitionTo(STATES.PLAYER_HIT);
      this._pushEvent('PLAYER_ACTION', { action: 'HIT' });

      const card = this._drawPlayerCardBiased(hand);
      hand.addCard(card);
      this._pushEvent('PLAYER_CARD_DEALT', { card: card.toJSON() });
      this._pushEvent('PLAYER_HAND_UPDATED', { hand: hand.toJSON() });
      this.events.emit('PlayerHit', { handIndex: this.activeHandIndex, card: card.toFullJSON() });

      const eval_ = hand.evaluation;
      if (eval_.isBust) {
        hand.isEnded = true;
        hand.outcome = 'PLAYER_BUST';
        this._pushEvent('PLAYER_BUST');
        this._pushEvent('HAND_COMPLETED');
        return this._advanceToNextHand();
      }

      if (eval_.score === 21) {
        hand.isEnded = true;
        this._pushEvent('HAND_COMPLETED');
        return this._advanceToNextHand();
      }

      // Back to player turn
      this.fsm.transitionTo(STATES.PLAYER_TURN);
      this._pushEvent('PLAYER_TURN_STARTED');
      return this.getSnapshot();
    } finally {
      this._unlockAction();
    }
  }

  // ─── STAND ──────────────────────────────────────────────────────
  stand() {
    this.validateSanity('stand');
    this._lockAction();
    try {
      this._validatePlayerAction();
      const hand = this.playerHands[this.activeHandIndex];

      if (!this.rules.canStand(hand)) {
        throw new Error('Cannot stand on this hand');
      }

      this.fsm.transitionTo(STATES.PLAYER_STAND);
      this._pushEvent('PLAYER_ACTION', { action: 'STAND' });
      this._pushEvent('PLAYER_STAND');
      hand.isEnded = true;
      this._pushEvent('HAND_COMPLETED');

      return this._advanceToNextHand();
    } finally {
      this._unlockAction();
    }
  }

  // ─── DOUBLE DOWN ──────────────────────────────────────────────
  doubleDown() {
    this.validateSanity('doubleDown');
    this._lockAction();
    try {
      this._validatePlayerAction();
      const hand = this.playerHands[this.activeHandIndex];

      if (!this.rules.canDouble(hand, hand.isSplitHand)) {
        throw new Error('Cannot double down on this hand');
      }

      this.fsm.transitionTo(STATES.PLAYER_DOUBLE);
      this._pushEvent('DOUBLE_REQUESTED');
      this._pushEvent('DOUBLE_VALIDATED');
      this._pushEvent('ADDITIONAL_BET_DEDUCTED');
      this._pushEvent('DOUBLE_CONFIRMED');

      hand.isDoubled = true;
      hand.bet *= 2;

      const card = this._drawPlayerCardBiased(hand);
      hand.addCard(card);
      hand.isEnded = true;

      this._pushEvent('ONE_CARD_DEALT');
      this._pushEvent('PLAYER_HAND_UPDATED', { hand: hand.toJSON() });
      this.events.emit('PlayerDoubled', { handIndex: this.activeHandIndex, card: card.toFullJSON() });

      const eval_ = hand.evaluation;
      if (eval_.isBust) {
        hand.outcome = 'PLAYER_BUST';
      }
      this._pushEvent('HAND_COMPLETED');

      return this._advanceToNextHand();
    } finally {
      this._unlockAction();
    }
  }

  // ─── SPLIT ──────────────────────────────────────────────────────
  split() {
    this.validateSanity('split');
    this._lockAction();
    try {
      this._validatePlayerAction();
      const hand = this.playerHands[this.activeHandIndex];

      if (!this.rules.canSplit(hand, this.playerHands.length)) {
        throw new Error('Cannot split this hand');
      }

      this.fsm.transitionTo(STATES.PLAYER_SPLIT);
      this._pushEvent('PLAYER_ACTION', { action: 'SPLIT' });

      const card1 = hand.cards[0];
      const card2 = hand.cards[1];
      const isAces = card1.rank === 'A';

      // Create two new hands
      const hand1 = new PlayerHand(
        `hand_${this.playerHands.length}`,
        hand.bet,
        true,
        isAces
      );
      hand1.addCard(card1);
      hand1.addCard(this._drawPlayerCardBiased(hand1));
      this._pushEvent('HAND_1_CREATED');
      this._pushEvent('HAND_1_CARD_DEALT');

      const hand2 = new PlayerHand(
        `hand_${this.playerHands.length + 1}`,
        hand.bet,
        true,
        isAces
      );
      hand2.addCard(card2);
      hand2.addCard(this._drawPlayerCardBiased(hand2));
      this._pushEvent('HAND_2_CREATED');
      this._pushEvent('HAND_2_CARD_DEALT');

      // Replace the current hand with the two split hands
      this.playerHands.splice(this.activeHandIndex, 1, hand1, hand2);

      this.events.emit('PlayerSplit', { handIndex: this.activeHandIndex });

      // If split aces: one card each, auto-stand both
      if (isAces && this.rules.get('splitAcesReceiveOneCard')) {
        hand1.isEnded = true;
        hand2.isEnded = true;
        this._pushEvent('HAND_1_COMPLETED');
        this._pushEvent('HAND_2_COMPLETED');
        // Transition FSM through PLAYER_TURN to PLAYER_STAND to allow valid dealer turn transitions
        this.fsm.transitionTo(STATES.PLAYER_TURN);
        this.fsm.transitionTo(STATES.PLAYER_STAND);
        // Go directly to dealer turn / settling
        return this._goToDealerOrSettle();
      }

      // Check if hand1 busted or got 21
      const eval1 = hand1.evaluation;
      if (eval1.isBust) {
        hand1.isEnded = true;
        hand1.outcome = 'PLAYER_BUST';
        this._pushEvent('HAND_COMPLETED');
      } else if (eval1.score === 21) {
        hand1.isEnded = true;
        this._pushEvent('HAND_COMPLETED');
      }

      // If hand1 is already ended, advance
      if (hand1.isEnded) {
        return this._advanceToNextHand();
      }

      this.fsm.transitionTo(STATES.PLAYER_TURN);
      this._pushEvent('HAND_1_TURN_STARTED');
      return this.getSnapshot();
    } finally {
      this._unlockAction();
    }
  }

  // ─── INTERNAL: ADVANCE TO NEXT HAND ─────────────────────────────
  _advanceToNextHand() {
    const nextIdx = this.playerHands.findIndex((h, i) => i > this.activeHandIndex && !h.isEnded);

    if (nextIdx !== -1) {
      // Found another hand to play, but first check if we came from a state
      // that can transition to PLAYER_TURN
      this.activeHandIndex = nextIdx;
      
      // We need to get to PLAYER_TURN. Current state could be PLAYER_HIT, PLAYER_STAND, PLAYER_DOUBLE, etc.
      // All of those can transition to PLAYER_TURN
      this.fsm.transitionTo(STATES.PLAYER_TURN);
      return this.getSnapshot();
    }

    // All hands played — go to dealer or settle
    return this._goToDealerOrSettle();
  }

  _goToDealerOrSettle() {
    // Check if any hands are still alive (not busted, not surrendered)
    const aliveHands = this.playerHands.filter(h => !h.evaluation.isBust && !h.isSurrendered);

    if (aliveHands.length > 0) {
      return this._playDealerTurn();
    }

    // All hands busted — settle directly
    return this._settleRound();
  }

  // ─── DEALER TURN ──────────────────────────────────────────────
  _playDealerTurn() {
    // Transition to DEALER_TURN — need to get there from current state
    // Current state could be PLAYER_STAND, PLAYER_HIT (bust), PLAYER_DOUBLE, PLAYER_SPLIT, CHECKING_BLACKJACK
    const currentState = this.fsm.getState();
    
    // If we can go directly to SETTLING (some states allow it), and then we'd play dealer inline
    // But the spec wants DEALER_TURN -> DEALER_DRAWING -> SETTLING
    // Let's route through SETTLING-capable states
    
    if (this.fsm.canTransitionTo(STATES.DEALER_TURN)) {
      this.fsm.transitionTo(STATES.DEALER_TURN);
      this._pushEvent('DEALER_TURN_STARTED');
    } else if (this.fsm.canTransitionTo(STATES.SETTLING)) {
      // Some states go directly to SETTLING, which is fine
      // Reveal hole card and draw inline
      this._revealHoleCard();
      let dEval = HandEvaluator.evaluate(this.dealerCards);
      while (this.rules.shouldDealerHit(dEval)) {
        const card = this._drawDealerCardBiased();
        card.visibility = 'face_up';
        this.dealerCards.push(card);
        dEval = HandEvaluator.evaluate(this.dealerCards);
      }
      return this._settleRound();
    }

    // Reveal hole card
    this._revealHoleCard();
    this._pushEvent('DEALER_REVEAL_HIDDEN_CARD', { dealerCards: this.dealerCards.map(c => c.toJSON()) });
    this.events.emit('DealerReveal', { dealerCards: this.dealerCards.map(c => c.toFullJSON()) });

    // Dealer draws
    let dEval = HandEvaluator.evaluate(this.dealerCards);
    this._pushEvent('EVALUATE_DEALER_HAND', { score: dEval.score });
    while (this.rules.shouldDealerHit(dEval)) {
      this.fsm.transitionTo(STATES.DEALER_DRAWING);
      const card = this._drawDealerCardBiased();
      card.visibility = 'face_up';
      this.dealerCards.push(card);
      this._pushEvent('DEALER_CARD_DEALT', { card: card.toJSON() });
      this.events.emit('DealerDraw', { card: card.toFullJSON() });
      dEval = HandEvaluator.evaluate(this.dealerCards);
      this._pushEvent('EVALUATE_DEALER_HAND', { score: dEval.score });
    }

    this._pushEvent('DEALER_TURN_COMPLETED');
    return this._settleRound();
  }

  _revealHoleCard() {
    if (this.dealerCards.length >= 2 && this.dealerCards[1].visibility === 'face_down') {
      this.dealerCards[1].visibility = 'face_up';
    }
  }

  // ─── SETTLE ROUND ──────────────────────────────────────────────
  _settleRound() {
    this._revealHoleCard();

    // If not already in SETTLING state, transition there
    if (!this.fsm.isInState(STATES.SETTLING) && !this.fsm.isInState(STATES.COMPLETED)) {
      this.fsm.transitionTo(STATES.SETTLING);
    }

    const dEval = HandEvaluator.evaluate(this.dealerCards);

    this.totalPayout = 0;
    this.totalProfit = 0;

    // Settle each player hand
    for (const hand of this.playerHands) {
      const result = PayoutEngine.calculateHandResult(hand, dEval, this.rules);
      hand.outcome = result.outcome;
      hand.payout = result.payout;
      hand.profit = result.profit;
      hand.isEnded = true;
      this.totalPayout += result.payout;
      this.totalProfit += result.profit;
    }

    // Settle insurance
    if (this.insuranceTaken && this.insuranceBet > 0) {
      const insResult = PayoutEngine.calculateInsuranceResult(this.insuranceBet, dEval, this.rules);
      this.insuranceResult = insResult;
      this.totalPayout += insResult.payout;
      this.totalProfit += insResult.profit;
    }

    this.isEnded = true;
    this.fsm.transitionTo(STATES.COMPLETED);

    this._pushEvent('RESULT_CALCULATED', {
      hands: this.playerHands.map(h => ({ outcome: h.outcome, payout: h.payout, profit: h.profit })),
      insuranceResult: this.insuranceResult
    });
    this._pushEvent('PAYOUT_PROCESSED', { totalPayout: this.totalPayout, totalProfit: this.totalProfit });
    this._pushEvent('ROUND_COMPLETED');

    this.events.emit('RoundComplete', {
      totalPayout: this.totalPayout,
      totalProfit: this.totalProfit,
      hands: this.playerHands.map(h => h.toJSON()),
      dealerCards: this.dealerCards.map(c => c.toFullJSON())
    });

    return this.getSnapshot();
  }

  // ─── VALIDATION ──────────────────────────────────────────────────
  _validatePlayerAction() {
    if (this.isEnded) throw new Error('Game is already completed');
    if (!this.fsm.isInState(STATES.PLAYER_TURN)) {
      throw new Error(`Player action not permitted in state '${this.fsm.getState()}'`);
    }
    const hand = this.playerHands[this.activeHandIndex];
    if (!hand || hand.isEnded) throw new Error('Active hand is already completed');
  }

  _lockAction() {
    if (this.isProcessingAction) throw new Error('Action locked: concurrent action in progress');
    this.isProcessingAction = true;
  }

  _unlockAction() {
    this.isProcessingAction = false;
  }

  // ─── SNAPSHOTS ──────────────────────────────────────────────────
  getSnapshot() {
    this.validateSanity('getSnapshot');
    const dEval = HandEvaluator.evaluate(this.dealerCards);
    const holeCardHidden = this.dealerCards.length >= 2 && this.dealerCards[1].visibility === 'face_down';

    // Only show visible dealer cards to frontend
    const visibleDealerCards = this.dealerCards.map(c => c.toJSON());

    // Calculate visible dealer score (only from face-up cards)
    let visibleDealerScore;
    if (holeCardHidden) {
      const faceUpCards = this.dealerCards.filter(c => c.visibility === 'face_up');
      visibleDealerScore = HandEvaluator.evaluate(faceUpCards).score;
    } else {
      visibleDealerScore = dEval.score;
    }

    const curHand = this.playerHands[this.activeHandIndex];

    return {
      gameId: this.gameId,
      state: this.fsm.getState(),
      isEnded: this.isEnded,
      initialBet: this.initialBet,

      dealerCards: visibleDealerCards,
      dealerScore: this.isEnded ? dEval.score : visibleDealerScore,
      dealerIsBust: this.isEnded ? dEval.isBust : false,
      dealerIsBlackjack: this.isEnded ? dEval.isBlackjack : false,

      playerHands: this.playerHands.map(h => h.toJSON()),
      activeHandIndex: this.activeHandIndex,
      isSplit: this.playerHands.length > 1,

      insuranceOffered: this.insuranceOffered,
      insuranceTaken: this.insuranceTaken,
      insuranceBet: this.insuranceBet,
      insuranceCost: Math.floor(this.initialBet / 2),
      insuranceResult: this.insuranceResult,

      totalPayout: this.totalPayout,
      totalProfit: this.totalProfit,

      // Action availability flags
      canHit: !this.isEnded && curHand && this.rules.canHit(curHand),
      canStand: !this.isEnded && curHand && this.rules.canStand(curHand),
      canDouble: !this.isEnded && curHand && this.rules.canDouble(curHand, curHand?.isSplitHand),
      canSplit: !this.isEnded && curHand && this.rules.canSplit(curHand, this.playerHands.length),
      canInsure: this.insuranceOffered && !this.insuranceTaken && this.insuranceBet === 0,
      canSurrender: !this.isEnded && curHand && this.rules.canSurrender(curHand),

      remainingCards: this.shoe.getRemainingCount(),
      events: this.eventsList.map(e => e)
    };
  }

  // Full state for server/admin use — reveals everything
  getFullState() {
    const dEval = HandEvaluator.evaluate(this.dealerCards);
    return {
      ...this.getSnapshot(),
      dealerCards: this.dealerCards.map(c => c.toFullJSON()),
      dealerScore: dEval.score,
      dealerIsBust: dEval.isBust,
      dealerIsBlackjack: dEval.isBlackjack,
      fsmHistory: this.fsm.history
    };
  }
}
