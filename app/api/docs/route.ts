import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_DOCS = {
  openapi: '3.0.0',
  info: {
    title: 'Battle Trade API',
    version: '1.0.0',
    description: 'Competitive trading arena API — lobbies, positions, sabotage, events, prediction markets',
  },
  servers: [
    { url: '/api', description: 'Relative' },
  ],
  paths: {
    '/health': {
      get: { summary: 'Health check', tags: ['System'], responses: { 200: { description: 'OK' } } },
    },
    '/lobby/create': {
      post: {
        summary: 'Create a new lobby',
        tags: ['Lobby'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateLobby' } } },
        },
        responses: { 200: { description: 'Lobby created', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, invite_code: { type: 'string' } } } } } } },
      },
    },
    '/lobby/{id}/info': {
      get: {
        summary: 'Get lobby info',
        tags: ['Lobby'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Lobby info' } },
      },
    },
    '/lobby/{id}/register': {
      post: {
        summary: 'Register a trader in a lobby',
        tags: ['Lobby'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterTrader' } } },
        },
        responses: { 200: { description: 'Trader registered' } },
      },
    },
    '/lobby/{id}/positions': {
      get: {
        summary: 'Get positions for a trader',
        tags: ['Trading'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'trader_id', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Positions list' } },
      },
      post: {
        summary: 'Open a new position',
        tags: ['Trading'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/OpenPosition' } } },
        },
        responses: { 200: { description: 'Position opened' } },
      },
    },
    '/lobby/{id}/leaderboard': {
      get: {
        summary: 'Get leaderboard standings',
        tags: ['Trading'],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'round_id', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Standings array' } },
      },
    },
    '/lobby/{id}/markets': {
      get: { summary: 'Get prediction market for current round', tags: ['Markets'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Market data' } } },
    },
    '/lobby/{id}/markets/bet': {
      post: {
        summary: 'Place a bet on a market outcome',
        tags: ['Markets'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PlaceBet' } } } },
        responses: { 200: { description: 'Bet placed' } },
      },
    },
    '/lobby/{id}/sabotage': {
      post: {
        summary: 'Fire a sabotage weapon',
        tags: ['Sabotage'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Sabotage' } } } },
        responses: { 200: { description: 'Sabotage fired' } },
      },
    },
    '/lobby/{id}/events': {
      post: {
        summary: 'Fire a volatility event (admin)',
        tags: ['Admin'],
        security: [{ adminAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/FireEvent' } } } },
        responses: { 200: { description: 'Event fired' } },
      },
    },
    '/lobby/{id}/admin/round/start': {
      post: {
        summary: 'Start a round (admin)',
        tags: ['Admin'],
        security: [{ adminAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['round_id'], properties: { round_id: { type: 'string', format: 'uuid' } } } } } },
        responses: { 200: { description: 'Round started' } },
      },
    },
    '/lobby/{id}/admin/round/freeze': {
      post: { summary: 'Freeze round scores (admin)', tags: ['Admin'], security: [{ adminAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Round frozen' } } },
    },
    '/lobby/{id}/admin/round/eliminate': {
      post: { summary: 'Eliminate last-place trader (admin)', tags: ['Admin'], security: [{ adminAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Trader eliminated' } } },
    },
    '/lobby/{id}/admin/liquidate': {
      post: { summary: 'Run liquidation sweep (admin)', tags: ['Admin'], security: [{ adminAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Liquidation results' } } },
    },
    '/lobby/{id}/admin/reset': {
      post: { summary: 'Reset game — clears all rounds, positions, sabotages (admin)', tags: ['Admin'], security: [{ adminAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Game reset' } } },
    },
  },
  components: {
    securitySchemes: {
      adminAuth: { type: 'apiKey', in: 'header', name: 'Authorization', description: 'Admin password' },
    },
    schemas: {
      CreateLobby: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', maxLength: 64 },
          format: { type: 'string', enum: ['elimination', 'rounds', 'marathon', 'blitz'], default: 'elimination' },
          config: { type: 'object' },
          is_public: { type: 'boolean', default: true },
          admin_password: { type: 'string' },
        },
      },
      RegisterTrader: {
        type: 'object',
        required: ['display_name'],
        properties: {
          display_name: { type: 'string', maxLength: 32 },
          handle: { type: 'string', maxLength: 24, pattern: '^[a-zA-Z0-9_]*$' },
          team_name: { type: 'string', maxLength: 32 },
          wallet_address: { type: 'string', maxLength: 64 },
          wants_whitelist: { type: 'boolean' },
        },
      },
      OpenPosition: {
        type: 'object',
        required: ['trader_id', 'round_id', 'symbol', 'direction', 'size', 'leverage'],
        properties: {
          trader_id: { type: 'string', format: 'uuid' },
          round_id: { type: 'string', format: 'uuid' },
          symbol: { type: 'string' },
          direction: { type: 'string', enum: ['long', 'short'] },
          size: { type: 'number', minimum: 0, maximum: 1000000 },
          leverage: { type: 'integer', minimum: 1, maximum: 100 },
          order_type: { type: 'string', enum: ['market', 'limit', 'stop_limit', 'trailing_stop'], default: 'market' },
          limit_price: { type: 'number' },
          stop_price: { type: 'number' },
          trail_pct: { type: 'number', maximum: 50 },
        },
      },
      PlaceBet: {
        type: 'object',
        required: ['bettor_id', 'outcome_id', 'amount'],
        properties: {
          bettor_id: { type: 'string', format: 'uuid' },
          outcome_id: { type: 'string', format: 'uuid' },
          amount: { type: 'integer', minimum: 1, maximum: 100000 },
        },
      },
      Sabotage: {
        type: 'object',
        required: ['attacker_id', 'target_id', 'weapon_type'],
        properties: {
          attacker_id: { type: 'string', format: 'uuid' },
          target_id: { type: 'string', format: 'uuid' },
          weapon_type: { type: 'string' },
        },
      },
      FireEvent: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string' },
          asset: { type: 'string' },
          magnitude: { type: 'number', minimum: 0, maximum: 1 },
          duration_seconds: { type: 'integer', minimum: 1, maximum: 3600 },
          trigger_mode: { type: 'string', enum: ['manual', 'algo'], default: 'manual' },
          preset_id: { type: 'string' },
        },
      },
    },
  },
};

export function GET() {
  return NextResponse.json(API_DOCS, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
