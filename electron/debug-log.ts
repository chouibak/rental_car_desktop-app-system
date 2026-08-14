/** Debug ingest is disabled in production builds. */
export function agentLog(
  _hypothesisId: string,
  _location: string,
  _message: string,
  _data: Record<string, unknown> = {},
) {}
