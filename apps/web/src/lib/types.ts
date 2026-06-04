import type {
  MemoryItem,
  ModelInfo,
  ProviderId,
  ProviderStatus,
} from "@lgnc/core/types";

export type { MemoryItem, ModelInfo, ProviderId, ProviderStatus };

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageRow {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  model: string | null;
  createdAt: number;
}
