import { parseBody, CreateLobbySchema, RegisterTraderSchema, OpenPositionSchema, PlaceBetSchema, FireEventSchema, AdminRoundSchema } from '../lib/validation';

describe('API Validation Schemas', () => {
  describe('CreateLobbySchema', () => {
    it('accepts valid lobby creation', () => {
      const result = parseBody(CreateLobbySchema, { name: 'Test Lobby', format: 'elimination' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.name).toBe('Test Lobby');
    });

    it('rejects empty name', () => {
      const result = parseBody(CreateLobbySchema, { name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects name over 64 chars', () => {
      const result = parseBody(CreateLobbySchema, { name: 'A'.repeat(65) });
      expect(result.success).toBe(false);
    });

    it('defaults format to elimination', () => {
      const result = parseBody(CreateLobbySchema, { name: 'Test' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.format).toBe('elimination');
    });

    it('accepts rounds format', () => {
      const result = parseBody(CreateLobbySchema, { name: 'Test', format: 'rounds' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid format', () => {
      const result = parseBody(CreateLobbySchema, { name: 'Test', format: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('trims name whitespace', () => {
      const result = parseBody(CreateLobbySchema, { name: '  Test Lobby  ' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.name).toBe('Test Lobby');
    });
  });

  describe('RegisterTraderSchema', () => {
    it('accepts valid registration', () => {
      const result = parseBody(RegisterTraderSchema, { display_name: 'Player1' });
      expect(result.success).toBe(true);
    });

    it('rejects empty display_name', () => {
      const result = parseBody(RegisterTraderSchema, { display_name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid handle characters', () => {
      const result = parseBody(RegisterTraderSchema, { display_name: 'Test', handle: 'bad handle!' });
      expect(result.success).toBe(false);
    });

    it('accepts valid handle', () => {
      const result = parseBody(RegisterTraderSchema, { display_name: 'Test', handle: 'good_handle' });
      expect(result.success).toBe(true);
    });

    it('accepts null optional fields', () => {
      const result = parseBody(RegisterTraderSchema, { display_name: 'Test', handle: null, team_name: null, wallet_address: null });
      expect(result.success).toBe(true);
    });
  });

  describe('OpenPositionSchema', () => {
    const validPosition = {
      trader_id: '550e8400-e29b-41d4-a716-446655440000',
      round_id: '550e8400-e29b-41d4-a716-446655440001',
      symbol: 'BTC',
      direction: 'long',
      size: 1000,
      leverage: 5,
    };

    it('accepts valid position', () => {
      const result = parseBody(OpenPositionSchema, validPosition);
      expect(result.success).toBe(true);
    });

    it('rejects negative size', () => {
      const result = parseBody(OpenPositionSchema, { ...validPosition, size: -100 });
      expect(result.success).toBe(false);
    });

    it('rejects size over 1M', () => {
      const result = parseBody(OpenPositionSchema, { ...validPosition, size: 2_000_000 });
      expect(result.success).toBe(false);
    });

    it('rejects leverage over 100', () => {
      const result = parseBody(OpenPositionSchema, { ...validPosition, leverage: 200 });
      expect(result.success).toBe(false);
    });

    it('rejects invalid direction', () => {
      const result = parseBody(OpenPositionSchema, { ...validPosition, direction: 'sideways' });
      expect(result.success).toBe(false);
    });

    it('defaults order_type to market', () => {
      const result = parseBody(OpenPositionSchema, validPosition);
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.order_type).toBe('market');
    });

    it('accepts limit order with limit_price', () => {
      const result = parseBody(OpenPositionSchema, { ...validPosition, order_type: 'limit', limit_price: 50000 });
      expect(result.success).toBe(true);
    });

    it('rejects non-uuid trader_id', () => {
      const result = parseBody(OpenPositionSchema, { ...validPosition, trader_id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('PlaceBetSchema', () => {
    it('accepts valid bet', () => {
      const result = parseBody(PlaceBetSchema, {
        bettor_id: '550e8400-e29b-41d4-a716-446655440000',
        outcome_id: '550e8400-e29b-41d4-a716-446655440001',
        amount: 100,
      });
      expect(result.success).toBe(true);
    });

    it('rejects bet over 100K', () => {
      const result = parseBody(PlaceBetSchema, {
        bettor_id: '550e8400-e29b-41d4-a716-446655440000',
        outcome_id: '550e8400-e29b-41d4-a716-446655440001',
        amount: 200_000,
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero amount', () => {
      const result = parseBody(PlaceBetSchema, {
        bettor_id: '550e8400-e29b-41d4-a716-446655440000',
        outcome_id: '550e8400-e29b-41d4-a716-446655440001',
        amount: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('FireEventSchema', () => {
    it('accepts valid event', () => {
      const result = parseBody(FireEventSchema, { type: 'flash_crash', asset: 'BTC', magnitude: 0.5, duration_seconds: 60 });
      expect(result.success).toBe(true);
    });

    it('rejects magnitude over 1', () => {
      const result = parseBody(FireEventSchema, { type: 'flash_crash', magnitude: 1.5 });
      expect(result.success).toBe(false);
    });

    it('rejects duration over 3600', () => {
      const result = parseBody(FireEventSchema, { type: 'flash_crash', duration_seconds: 5000 });
      expect(result.success).toBe(false);
    });

    it('allows preset_id without other fields', () => {
      const result = parseBody(FireEventSchema, { type: 'preset', preset_id: 'fed-pivot' });
      expect(result.success).toBe(true);
    });
  });

  describe('AdminRoundSchema', () => {
    it('accepts valid UUID', () => {
      const result = parseBody(AdminRoundSchema, { round_id: '550e8400-e29b-41d4-a716-446655440000' });
      expect(result.success).toBe(true);
    });

    it('rejects non-UUID', () => {
      const result = parseBody(AdminRoundSchema, { round_id: 'abc123' });
      expect(result.success).toBe(false);
    });

    it('rejects missing round_id', () => {
      const result = parseBody(AdminRoundSchema, {});
      expect(result.success).toBe(false);
    });
  });
});
