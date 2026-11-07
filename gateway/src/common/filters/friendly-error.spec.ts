import { toFriendlyMessage } from './friendly-error';

describe('toFriendlyMessage', () => {
  it('passes budget-exceeded messages through unchanged (already specific)', () => {
    const msg = 'Daily budget exceeded: $12.00 spent of $10.00 limit';
    expect(toFriendlyMessage(402, msg)).toBe(msg);
  });

  it('maps AI Brain unavailability to a friendly retry message', () => {
    expect(toFriendlyMessage(502, 'AI Brain unavailable')).toMatch(/temporarily unavailable/i);
  });

  it('maps connection-refused errors to the same friendly message', () => {
    expect(toFriendlyMessage(502, 'connect ECONNREFUSED 127.0.0.1:8000')).toMatch(/temporarily unavailable/i);
  });

  it('maps database unavailability to a friendly message', () => {
    expect(toFriendlyMessage(503, 'Database unavailable')).toMatch(/database.*temporarily unavailable/i);
  });

  it('maps missing API key errors to an actionable admin message', () => {
    expect(toFriendlyMessage(503, 'Anthropic API key not configured')).toMatch(/administrator/i);
  });

  it('maps timeouts to a friendly retry message', () => {
    expect(toFriendlyMessage(504, 'Request timed out after 120000ms')).toMatch(/took too long/i);
  });

  it('maps 401 to a session-expired message', () => {
    expect(toFriendlyMessage(401, 'Unauthorized')).toMatch(/session has expired/i);
  });

  it('maps 403 to a permission message', () => {
    expect(toFriendlyMessage(403, 'Forbidden resource')).toMatch(/permission/i);
  });

  it('maps 404 to a not-found message', () => {
    expect(toFriendlyMessage(404, 'Task abc123 not found')).toMatch(/couldn't find/i);
  });

  it('maps 429 to a rate-limit message', () => {
    expect(toFriendlyMessage(429, 'ThrottlerException: Too Many Requests')).toMatch(/too quickly/i);
  });

  it('maps any other 5xx to a generic retry message without leaking internals', () => {
    const friendly = toFriendlyMessage(500, 'TypeError: Cannot read properties of undefined');
    expect(friendly).not.toContain('TypeError');
    expect(friendly).toMatch(/went wrong/i);
  });

  it('leaves ordinary 400 validation messages untouched (already user-facing)', () => {
    const msg = 'message must be shorter than or equal to 10000 characters';
    expect(toFriendlyMessage(400, msg)).toBe(msg);
  });
});
