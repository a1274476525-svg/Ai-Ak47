/**
 * Maps a raw backend/exception message to a short, actionable sentence for
 * end users. The original message is preserved separately (see `detail` in
 * AllExceptionsFilter) for anyone who wants the underlying detail.
 */
export function toFriendlyMessage(status: number, raw: string): string {
  const r = raw.toLowerCase();

  if (status === 402 || r.includes('budget exceeded')) {
    return raw; // already a clear, specific sentence from the budget guardrail
  }
  if (r.includes('ai brain unavailable') || r.includes('econnrefused') || r.includes('fetch failed')) {
    return 'The AI engine is temporarily unavailable. Please try again in a moment.';
  }
  if (r.includes('database unavailable') || r.includes('connection terminated')) {
    return 'A required service (database) is temporarily unavailable. Please try again shortly.';
  }
  if (r.includes('api key not configured')) {
    return 'This feature needs an AI provider API key configured by an administrator before it can run.';
  }
  if (r.includes('timeout') || r.includes('timed out') || r.includes('aborterror')) {
    return 'The request took too long and was cancelled. Try again, or use a smaller/simpler input.';
  }
  if (status === 401) {
    return 'Your session has expired — please sign in again.';
  }
  if (status === 403) {
    return "You don't have permission to do that.";
  }
  if (status === 404) {
    return "We couldn't find what you were looking for.";
  }
  if (status === 429) {
    return "You're sending requests too quickly. Please slow down and try again.";
  }
  if (status >= 500) {
    return 'Something went wrong while processing your request. Please try again.';
  }

  return raw;
}
