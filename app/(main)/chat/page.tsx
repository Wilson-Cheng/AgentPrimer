'use client';

import ChatInterface from '@/components/ChatInterface';

/**
 * app/(main)/chat/page.tsx
 * ---------------------------------------------------------------------------
 * Blank new-conversation view. Rendered when the user clicks "New Conversation"
 * (or navigates to /chat directly). The layout's persistent sidebar stays
 * mounted — only the content area changes.
 */

export default function ChatPage() {
  return <ChatInterface />;
}
