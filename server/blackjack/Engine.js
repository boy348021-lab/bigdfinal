import { STATES, FiniteStateMachine } from './FSM.js';
import Shoe from './Shoe.js';
import RulesEngine from './RulesEngine.js';
import HandEvaluator from './HandEvaluator.js';
import PayoutEngine from './PayoutEngine.js';
import EventEmitter from './EventEmitter.js';
import PlayerHand from './PlayerHand.js';

/**
 * Enterprise Blackjack Engine Subsystem
 * Single Source of Truth for Blackjack rules, state machine transitions, and turn evaluations.
 */
export default class Engine {
  constructor(config = {}) {
    this.gameId = `bj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    this.fsm = new FiniteStateMachine(STATES.WAITING_FOR_BET);
    this.shoe = new Shoe(config.numDecks || 6, config.penetrationPct || 0.75, config.rngSeed || null);
    this.rules = new RulesEngine(config.rules || {});
    this.events = new EventEmitter();

    this.userId = null;
    this.initialBet = 0;

    this.dealerCards = [];
    this.dealerHoleCardHidden = true;

    this.playerHands = [];
    this.activeHandIndex = 0;

    this.insuranceBet = 0;
    this.insuranceOffered = false;
    this.insuranceTaken = false;
    this.insuranceResolved = false;

    this.isProcessingAction = false;
    this.totalPayout = 0;
    this.totalProfit = 0;
    this.roundCompleted = false;
  }

  deal(userId, betAmount) {
    if (this.isProcessingAction) {
      throw new Error("Action locked: An action is currently being processed.");
    }
    this.isProcessingAction = true;

    try {
      // Re-initialize FSM cleanly for new round deal if coming from completed or active round
      if (this.fsm.isInState(STATES.ROUND_COMPLETE)) {
        this.fsm.transitionTo(STATES.RESET_ROUND);
        this.fsm.transitionTo(STATES.WAITING_FOR_BET);
      } else if (!this.fsm.isInState(STATES.WAITING_FOR_BET)) {
        this.fsm = new FiniteStateMachine(STATES.WAITING_FOR_BET);
      }

      if (isNaN(betAmount) || Number(betAmount) < 0) {
        throw new Error("Invalid bet amount");
      }

      this.userId = userId;
      this.initialBet = Number(betAmount);
      this.dealerCards = [];
      this.dealerHoleCardHidden = true;
      this.playerHands = [new PlayerHand('hand_0', this.initialBet, false)];
      this.activeHandIndex = 0;
      this.insuranceBet = 0;
      this.insuranceOffered = false;
      this.insuranceTaken = false;
      this.insuranceResolved = false;
      this.totalPayout = 0;
      this.totalProfit = 0;
      if (this.fsm.isInState(STATES.ROUND_COMPLETE)) {
        this.fsm.transitionTo(STATES.RESET_ROUND);
        this.fsm.transitionTo(STATES.WAITING_FOR_BET);
      }

      this.fsm.transitionTo(STATES.BET_PLACED);
      this.fsm.transitionTo(STATES.DEALING_INITIAL_CARDS);

      const pHand = this.playerHands[0];
      pHand.addCard(this.shoe.drawCard('player'));

      const dUpcard = this.shoe.drawCard('dealer');
      dUpcard.visibility = 'face_up';
      this.dealerCards.push(dUpcard);

      pHand.addCard(this.shoe.drawCard('player'));

      const dHoleCard = this.shoe.drawCard('dealer');
      dHoleCard.visibility = 'face_down';
      this.dealerCards.push(dHoleCard);

      this.events.emit('CardsDealt', this.getSnapshot());

      if (this.rules.canInsure(dUpcard) && this.initialBet > 0) {
        this.insuranceOffered = true;
        this.fsm.transitionTo(STATES.WAITING_FOR_INSURANCE);
        this.events.emit('InsuranceOffered', this.getSnapshot());
        return this.getSnapshot();
      }

      return this.evaluateInitialDeal();

    } finally {
      this.isProcessingAction = false;
    }
  }

  evaluateInitialDeal() {
    const pHand = this.playerHands[0];
    const pEval = pHand.evaluation;

    if (pEval.isBlackjack) {
      this.fsm.transitionTo(STATES.PLAYER_BLACKJACK);
      return this.resolveRound();
    }

    this.fsm.transitionTo(STATES.WAITING_FOR_PLAYER_ACTION);
    this.fsm.transitionTo(STATES.PLAYING_HAND_1);
    return this.getSnapshot();
  }

  buyInsurance() {
    if (this.isProcessingAction) throw new Error("Action locked");
    this.isProcessingAction = true;
    try {
      if (!this.fsm.isInState(STATES.WAITING_FOR_INSURANCE)) {
        throw new Error("Insurance is not currently available");
      }

      this.insuranceBet = Math.floor(this.initialBet * 0.5);
      this.insuranceTaken = true;
      this.events.emit('InsuranceTaken', { insuranceBet: this.insuranceBet });

      return this.evaluateInitialDeal();
    } finally {
      this.isProcessingAction = false;
    }
  }

  declineInsurance() {
    if (this.isProcessingAction) throw new Error("Action locked");
    this.isProcessingAction = true;
    try {
      if (!this.fsm.isInState(STATES.WAITING_FOR_INSURANCE)) {
        throw new Error("Insurance is not currently available");
      }

      this.insuranceTaken = false;
      this.insuranceBet = 0;

      return this.evaluateInitialDeal();
    } finally {
      this.isProcessingAction = false;
    }
  }

  hit() {
    if (this.isProcessingAction) throw new Error("Action locked");
    this.isProcessingAction = true;
    try {
      this.validateActionState();

      const hand = this.playerHands[this.activeHandIndex];
      if (hand.isEnded) throw new Error("Hand is already completed");

      const card = this.shoe.drawCard('player');
      hand.addCard(card);
      this.events.emit('CardDrawn', { handIndex: this.activeHandIndex, card });

      const pEval = hand.evaluation;
      if (pEval.isBust) {
        hand.isEnded = true;
        hand.outcome = 'bust';
        this.events.emit('PlayerBust', { handIndex: this.activeHandIndex });
        this.advanceToNextHandOrResolve();
      } else if (pEval.score === 21) {
        hand.isEnded = true;
        this.advanceToNextHandOrResolve();
      }

      return this.getSnapshot();
    } finally {
      this.isProcessingAction = false;
    }
  }

  stand() {
    if (this.isProcessingAction) throw new Error("Action locked");
    this.isProcessingAction = true;
    try {
      this.validateActionState();

      const hand = this.playerHands[this.activeHandIndex];
      if (hand.isEnded) throw new Error("Hand is already completed");

      hand.isEnded = true;
      this.advanceToNextHandOrResolve();

      return this.getSnapshot();
    } finally {
      this.isProcessingAction = false;
    }
  }

  doubleDown() {
    if (this.isProcessingAction) throw new Error("Action locked");
    this.isProcessingAction = true;
    try {
      this.validateActionState();

      const hand = this.playerHands[this.activeHandIndex];
      if (!this.rules.canDoubleDown(hand, hand.isSplitHand)) {
        throw new Error("Double down is not allowed on this hand");
      }

      hand.isDoubled = true;
      hand.bet *= 2;

      const card = this.shoe.drawCard('player');
      hand.addCard(card);
      hand.isEnded = true;

      const pEval = hand.evaluation;
      if (pEval.isBust) {
        hand.outcome = 'bust';
      }

      this.advanceToNextHandOrResolve();
      return this.getSnapshot();
    } finally {
      this.isProcessingAction = false;
    }
  }

  split() {
    if (this.isProcessingAction) throw new Error("Action locked");
    this.isProcessingAction = true;
    try {
      this.validateActionState();

      const hand = this.playerHands[this.activeHandIndex];
      if (!this.rules.canSplit(hand, this.playerHands.length)) {
        throw new Error("Hand cannot be split");
      }

      const card1 = hand.cards[0];
      const card2 = hand.cards[1];

      const splitHand1 = new PlayerHand(`hand_${this.playerHands.length}`, hand.bet, true);
      splitHand1.addCard(card1);
      splitHand1.addCard(this.shoe.drawCard('player'));

      const splitHand2 = new PlayerHand(`hand_${this.playerHands.length + 1}`, hand.bet, true);
      splitHand2.addCard(card2);
      splitHand2.addCard(this.shoe.drawCard('player'));

      this.playerHands.splice(this.activeHandIndex, 1, splitHand1, splitHand2);

      this.fsm.transitionTo(STATES.PLAYER_SPLIT);
      this.fsm.transitionTo(STATES.WAITING_FOR_PLAYER_ACTION);

      if (card1.rank === 'A' && this.rules.splitAcesOneCard) {
        splitHand1.isEnded = true;
        splitHand2.isEnded = true;
        this.resolveRound();
      }

      return this.getSnapshot();
    } finally {
      this.isProcessingAction = false;
    }
  }

  surrender() {
    if (this.isProcessingAction) throw new Error("Action locked");
    this.isProcessingAction = true;
    try {
      this.validateActionState();

      const hand = this.playerHands[this.activeHandIndex];
      if (!this.rules.canSurrender(hand)) {
        throw new Error("Surrender is not available");
      }

      hand.isSurrendered = true;
      hand.isEnded = true;

      this.fsm.transitionTo(STATES.PLAYER_SURRENDER);
      return this.resolveRound();
    } finally {
      this.isProcessingAction = false;
    }
  }

  validateActionState() {
    const currentState = this.fsm.getState();
    const validStates = [
      STATES.WAITING_FOR_PLAYER_ACTION,
      STATES.PLAYING_HAND_1,
      STATES.PLAYING_HAND_2,
      STATES.PLAYING_HAND_3,
      STATES.PLAYING_HAND_4
    ];
    if (!validStates.includes(currentState)) {
      throw new Error(`Action not permitted in state '${currentState}'`);
    }
  }

  advanceToNextHandOrResolve() {
    const nextUnplayedIndex = this.playerHands.findIndex((h, idx) => idx > this.activeHandIndex && !h.isEnded);

    if (nextUnplayedIndex !== -1) {
      this.activeHandIndex = nextUnplayedIndex;
      const stateMap = [STATES.PLAYING_HAND_1, STATES.PLAYING_HAND_2, STATES.PLAYING_HAND_3, STATES.PLAYING_HAND_4];
      const nextState = stateMap[Math.min(nextUnplayedIndex, 3)];
      this.fsm.transitionTo(nextState);
    } else {
      this.resolveRound();
    }
  }

  resolveRound() {
    if (this.roundCompleted) return this.getSnapshot();

    if (this.dealerCards.length >= 2) {
      this.dealerCards[1].visibility = 'face_up';
      this.dealerHoleCardHidden = false;
    }
    this.fsm.transitionTo(STATES.DEALER_REVEAL);

    let dEval = HandEvaluator.evaluate(this.dealerCards, false);
    const playableHands = this.playerHands.filter(h => !h.evaluation.isBust && !h.isSurrendered);

    if (playableHands.length > 0) {
      this.fsm.transitionTo(STATES.DEALER_PLAY);
      while (this.rules.shouldDealerHit(dEval)) {
        const dCard = this.shoe.drawCard('dealer');
        dCard.visibility = 'face_up';
        this.dealerCards.push(dCard);
        dEval = HandEvaluator.evaluate(this.dealerCards, false);
      }
    }

    this.fsm.transitionTo(STATES.COMPARE_RESULTS);

    this.totalPayout = 0;
    this.totalProfit = 0;

    for (const hand of this.playerHands) {
      const res = PayoutEngine.calculateHandPayout(hand, dEval, this.rules);
      hand.outcome = res.outcome;
      hand.payout = res.payout;
      hand.profit = res.profit;
      this.totalPayout += res.payout;
      this.totalProfit += res.profit;
    }

    if (this.insuranceTaken && this.insuranceBet > 0) {
      const insRes = PayoutEngine.calculateInsurancePayout(this.insuranceBet, dEval, this.rules);
      this.totalPayout += insRes.payout;
      this.totalProfit += insRes.profit;
    }

    this.fsm.transitionTo(STATES.PAYOUT);
    this.fsm.transitionTo(STATES.ROUND_COMPLETE);
    this.roundCompleted = true;

    this.events.emit('PayoutComplete', {
      totalPayout: this.totalPayout,
      totalProfit: this.totalProfit,
      hands: this.playerHands.map(h => h.toJSON())
    });

    return this.getSnapshot();
  }

  getSnapshot() {
    const dEval = HandEvaluator.evaluate(this.dealerCards, false);
    const visibleDealerCards = this.dealerHoleCardHidden
      ? [this.dealerCards[0]].filter(Boolean)
      : this.dealerCards;

    const visibleDealerScore = this.dealerHoleCardHidden && visibleDealerCards.length > 0
      ? (visibleDealerCards[0].numericValue || visibleDealerCards[0].value)
      : dEval.score;

    const primaryHand = this.playerHands[0] ? this.playerHands[0].toJSON() : null;

    return {
      gameId: this.gameId,
      state: this.fsm.getState(),
      isEnded: this.roundCompleted || this.fsm.isInState(STATES.ROUND_COMPLETE),
      initialBet: this.initialBet,
      bet: this.initialBet,
      dealerCards: visibleDealerCards.map(c => c.toJSON()),
      dealerScore: dEval.score,
      dealerVisibleScore: visibleDealerScore,
      dealerIsBust: dEval.isBust,
      dealerIsBlackjack: dEval.isBlackjack,
      playerHands: this.playerHands.map(h => h.toJSON()),
      playerCards: primaryHand ? primaryHand.cards : [],
      playerScore: primaryHand ? primaryHand.score : 0,
      activeHandIndex: this.activeHandIndex,
      isSplit: this.playerHands.length > 1,
      insuranceOffered: this.insuranceOffered,
      insuranceCost: Math.floor(this.initialBet * 0.5),
      insuranceTaken: this.insuranceTaken,
      insuranceBet: this.insuranceBet,
      totalPayout: this.totalPayout,
      totalProfit: this.totalProfit,
      payout: this.totalPayout,
      outcome: primaryHand ? primaryHand.outcome : null,
      remainingCards: this.shoe.getRemainingCardsCount()
    };
  }
}
