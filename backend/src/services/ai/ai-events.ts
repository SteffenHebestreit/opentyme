/**
 * AG-UI protocol event constants and emitter type, shared by the AI services.
 * Defined locally to avoid @ag-ui/core ESM bundling issues.
 */

export const EventType = {
  RUN_STARTED: 'RUN_STARTED',
  RUN_FINISHED: 'RUN_FINISHED',
  RUN_ERROR: 'RUN_ERROR',
  TEXT_MESSAGE_START: 'TEXT_MESSAGE_START',
  TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
  TEXT_MESSAGE_END: 'TEXT_MESSAGE_END',
  TOOL_CALL_START: 'TOOL_CALL_START',
  TOOL_CALL_ARGS: 'TOOL_CALL_ARGS',
  TOOL_CALL_END: 'TOOL_CALL_END',
  TOOL_CALL_RESULT: 'TOOL_CALL_RESULT',
  TOOL_APPROVAL_REQUIRED: 'TOOL_APPROVAL_REQUIRED',
} as const;

/** AG-UI emitter callback — the caller passes a res.write binding. */
export type EventEmitter = (event: Record<string, unknown>) => void;
