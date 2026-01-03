import type { Document } from '@langchain/core/documents';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const formatHistory = (history: ChatMessage[]): string => {
  return history
    .map((msg) => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
    .join('\n');
};

export const formatDocumentsAsString = (documents: Document[]): string => {
  return documents.map((doc) => doc.pageContent).join('\n\n');
};
