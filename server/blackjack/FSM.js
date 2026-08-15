/**
 * Finite State Machine for Blackjack Engine.
 * Enforces strict state transitions. Rejects illegal moves.
 */

export const STATES = {
  WAITING_FOR_BET: 'WAITING_FOR_BET',
  BET_ACCEPTED: 'BET_ACCEPTED',
  DEALING: 'DEALING',
  INITIAL_HAND_DEALT: 'INITIAL_HAND_DEALT',
  CHECKING_BLACKJACK: 'CHECKING_BLACKJACK',
  INSURANCE_OFFERED: 'INSURANCE_OFFERED',
  PLAYER_TURN: 'PLAYER_TURN',
  PLAYER_HIT: 'PLAYER_HIT',
  PLAYER_DOUBLE: 'PLAYER_DOUBLE',
  PLAYER_SPLIT: 'PLAYER_SPLIT',
  PLAYER_STAND: 'PLAYER_STAND',
  DEALER_TURN: 'DEALER_TURN',
  DEALER_DRAWING: 'DEALER_DRAWING',
  SETTLING: 'SETTLING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ERROR: 'ERROR'
};

const TRANSITIONS = {
  [STATES.WAITING_FOR_BET]:     [STATES.BET_ACCEPTED],
  [STATES.BET_ACCEPTED]:        [STATES.DEALING],
  [STATES.DEALING]:             [STATES.INITIAL_HAND_DEALT],
  [STATES.INITIAL_HAND_DEALT]:  [STATES.CHECKING_BLACKJACK, STATES.PLAYER_TURN],
  [STATES.CHECKING_BLACKJACK]:  [STATES.INSURANCE_OFFERED, STATES.PLAYER_TURN, STATES.SETTLING, STATES.COMPLETED],
  [STATES.INSURANCE_OFFERED]:   [STATES.PLAYER_TURN, STATES.SETTLING],
  [STATES.PLAYER_TURN]:         [STATES.PLAYER_HIT, STATES.PLAYER_STAND, STATES.PLAYER_DOUBLE, STATES.PLAYER_SPLIT, STATES.SETTLING],
  [STATES.PLAYER_HIT]:          [STATES.PLAYER_TURN, STATES.SETTLING],
  [STATES.PLAYER_DOUBLE]:       [STATES.PLAYER_TURN, STATES.SETTLING],
  [STATES.PLAYER_SPLIT]:        [STATES.PLAYER_TURN],
  [STATES.PLAYER_STAND]:        [STATES.PLAYER_TURN, STATES.DEALER_TURN, STATES.SETTLING],
  [STATES.DEALER_TURN]:         [STATES.DEALER_DRAWING, STATES.SETTLING],
  [STATES.DEALER_DRAWING]:      [STATES.DEALER_DRAWING, STATES.SETTLING],
  [STATES.SETTLING]:            [STATES.COMPLETED],
  [STATES.COMPLETED]:           [STATES.WAITING_FOR_BET],
  [STATES.CANCELLED]:           [STATES.WAITING_FOR_BET],
  [STATES.ERROR]:               [STATES.WAITING_FOR_BET]
};

export class FiniteStateMachine {
  constructor(initialState = STATES.WAITING_FOR_BET) {
    this.currentState = initialState;
    this.history = [initialState];
  }

  transitionTo(nextState) {
    if (!STATES[nextState]) {
      throw new Error(`Invalid state: '${nextState}'`);
    }
    const allowed = TRANSITIONS[this.currentState] || [];
    if (!allowed.includes(nextState)) {
      throw new Error(`Illegal transition: '${this.currentState}' → '${nextState}'`);
    }
    this.currentState = nextState;
    this.history.push(nextState);
    return this.currentState;
  }

  getState() { return this.currentState; }
  isInState(state) { return this.currentState === state; }
  canTransitionTo(state) {
    const allowed = TRANSITIONS[this.currentState] || [];
    return allowed.includes(state);
  }
  reset(state = STATES.WAITING_FOR_BET) {
    this.currentState = state;
    this.history = [state];
  }
}
