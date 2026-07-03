/**
 * CJS stand-in for the ESM-only `uuid` package so jest can load modules that
 * import it (ai-assistant.service, llm-stream.service). Deterministic ids keep
 * assertions stable.
 */
let counter = 0;

export const v4 = (): string => `uuid-${++counter}`;
