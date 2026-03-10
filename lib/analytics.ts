import { logger } from './logger';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com';

interface EventProperties {
  [key: string]: string | number | boolean | null | undefined;
}

export function trackEvent(event: string, properties: EventProperties = {}, distinctId?: string): void {
  if (!POSTHOG_KEY) {
    logger.debug(`[analytics] ${event}`, properties);
    return;
  }

  // Fire and forget — don't block on analytics
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      properties: {
        ...properties,
        distinct_id: distinctId || 'server',
        $lib: 'battle-trade-server',
      },
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    // Silent — analytics should never block
  });
}

// Pre-defined events for consistency
export const Events = {
  LOBBY_CREATED: 'lobby_created',
  TRADER_REGISTERED: 'trader_registered',
  ROUND_STARTED: 'round_started',
  TRADE_OPENED: 'trade_opened',
  TRADE_CLOSED: 'trade_closed',
  SABOTAGE_FIRED: 'sabotage_fired',
  BET_PLACED: 'bet_placed',
  CREDITS_PURCHASED: 'credits_purchased',
  EVENT_FIRED: 'event_fired',
  PLAYER_ELIMINATED: 'player_eliminated',
  GAME_RESET: 'game_reset',
} as const;
