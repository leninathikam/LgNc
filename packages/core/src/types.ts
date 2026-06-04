export type ProviderId = "anthropic" | "openai" | "ollama";

export interface ModelInfo {
  /** Stable id used in API calls, e.g. "anthropic:claude-3-5-sonnet-latest". */
  id: string;
  provider: ProviderId;
  /** Model name passed to the provider SDK. */
  model: string;
  label: string;
  /** Whether this provider currently has what it needs to run (key or local server). */
  available: boolean;
}

export interface ProviderStatus {
  provider: ProviderId;
  label: string;
  /** True if an API key is configured (or, for Ollama, the server is reachable). */
  configured: boolean;
  requiresKey: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  conversationId?: string;
  model: string;
  messages: ChatMessage[];
}

export interface MemoryItem {
  id: string;
  content: string;
  sourceConversationId: string | null;
  createdAt: number;
  score?: number;
}
