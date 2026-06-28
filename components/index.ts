/**
 * components/index.ts
 * ---------------------------------------------------------------------------
 * Barrel export for top-level UI components. Existing deep imports like
 * `import MessageBubble from '@/components/MessageBubble'` continue to work
 * unchanged. This barrel adds an alternative grouped import surface:
 *
 *     import { ChatInterface, MessageBubble, PreviewPanel } from '@/components';
 */
export { default as AuthGuard } from './AuthGuard';
export { default as BrandLogo } from './BrandLogo';
export { default as ChatInput } from './ChatInput';
export { default as ChatInterface } from './ChatInterface';
export { default as CodeEditorPanel } from './CodeEditorPanel';
export { default as MarkdownContent } from './MarkdownContent';
export { default as MermaidBlock } from './MermaidBlock';
export { default as MessageBubble } from './MessageBubble';
export { default as ModelSelector } from './ModelSelector';
export { default as PreviewPanel } from './PreviewPanel';
export { default as RagViewerPanel } from './RagViewerPanel';
export { default as ResizableSidebar } from './ResizableSidebar';
export { default as SendToRagDialog } from './SendToRagDialog';
export { default as Sidebar } from './Sidebar';
export { default as SystemPromptModal } from './SystemPromptModal';
export { default as ThemeToggle } from './ThemeToggle';
export { default as WritingGuideModal } from './WritingGuideModal';

export type { LiveToolInvocation, UIPart } from './MessageBubble';
export type { PreviewFile } from './PreviewPanel';
