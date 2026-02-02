// Shared types and utilities for chql-chat

export interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
  createdAt: number;
}

export interface DSLQuery {
  operation: string;
  parameters: Record<string, unknown>;
}

export interface DSLResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
