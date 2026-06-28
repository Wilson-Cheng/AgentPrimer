/**
 * app/chat/[id]/page.tsx
 * ---------------------------------------------------------------------------
 * Loads a specific chat session by ID from the URL.
 * The `key` prop forces a full remount when navigating between sessions so
 * that initSession always runs fresh for the new session ID.
 */

import ChatInterface from '@/components/ChatInterface';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ChatSessionPage({ params }: Props) {
  const { id } = await params;
  return <ChatInterface key={id} initialSessionId={id} />;
}
