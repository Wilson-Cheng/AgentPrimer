/**
 * components/chat/constants.ts
 * ---------------------------------------------------------------------------
 * UI tuning constants extracted from ChatInterface.tsx. Kept in a separate
 * file so they can be reused by helpers and sub-components without dragging
 * in the rest of the chat surface.
 */
export const ACTION_MENU_WIDTH = 220;
export const ACTION_MENU_HEIGHT = 188;
export const ACTION_MENU_GAP = 8;
export const ACTION_MENU_MARGIN = 8;

/** Number of historical messages loaded on session-open. Tuned to comfortably
 *  fit a single viewport-worth of bubbles while keeping JSON.parse +
 *  ReactMarkdown work bounded for chats with hundreds of tool calls. */
export const INITIAL_PAGE_SIZE = 50;

/** Page size for the "Load earlier" button. Slightly larger so a couple of
 *  clicks recovers a long history without N round-trips. */
export const OLDER_PAGE_SIZE = 50;
