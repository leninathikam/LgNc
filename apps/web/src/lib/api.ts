import type {
  ChatMessageRow,
  Conversation,
  MemoryItem,
  ModelInfo,
  ProviderStatus,
} from "./types";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * Whether this is a rate limit error
   */
  get isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  /**
   * Whether this is a payload too large error
   */
  get isPayloadTooLarge(): boolean {
    return this.statusCode === 413;
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errorMsg = (body as { error?: string }).error || `Request failed (${res.status})`;
    const retryAfter = res.headers.get("Retry-After")
      ? parseInt(res.headers.get("Retry-After") || "0", 10)
      : undefined;

    throw new ApiError(res.status, errorMsg, retryAfter);
  }
  return (await res.json()) as T;
}

export const api = {
  listConversations: () =>
    http<{ conversations: Conversation[] }>("/api/conversations").then(
      (r) => r.conversations,
    ),
  getConversation: (id: string) =>
    http<{ conversation: Conversation; messages: ChatMessageRow[] }>(
      `/api/conversations/${id}`,
    ),
  deleteConversation: (id: string) =>
    http<{ ok: true }>(`/api/conversations/${id}`, { method: "DELETE" }),

  listModels: () =>
    http<{ models: ModelInfo[] }>("/api/providers/models").then((r) => r.models),
  providerStatus: () =>
    http<{ providers: ProviderStatus[] }>("/api/keys").then((r) => r.providers),
  setKey: (provider: string, key: string) =>
    http<{ providers: ProviderStatus[] }>("/api/keys", {
      method: "POST",
      body: JSON.stringify({ provider, key }),
    }).then((r) => r.providers),
  deleteKey: (provider: string) =>
    http<{ providers: ProviderStatus[] }>(`/api/keys/${provider}`, {
      method: "DELETE",
    }).then((r) => r.providers),

  getSettings: () =>
    http<{ settings: Record<string, string> }>("/api/settings").then(
      (r) => r.settings,
    ),
  saveSettings: (patch: Record<string, string>) =>
    http<{ settings: Record<string, string> }>("/api/settings", {
      method: "POST",
      body: JSON.stringify(patch),
    }).then((r) => r.settings),

  listMemories: () =>
    http<{ memories: MemoryItem[] }>("/api/memories").then((r) => r.memories),
  addMemory: (content: string) =>
    http<{ memory: MemoryItem }>("/api/memories", {
      method: "POST",
      body: JSON.stringify({ content }),
    }).then((r) => r.memory),
  deleteMemory: (id: string) =>
    http<{ ok: true }>(`/api/memories/${id}`, { method: "DELETE" }),
};

export interface ChatMeta {
  conversationId: string;
  title: string;
  compacted?: boolean;
  contextFillPercent?: number | null;
}

export interface ChatStreamHandlers {
  onMeta?: (meta: ChatMeta) => void;
  onDelta: (text: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

/**
 * POSTs a chat message and consumes the SSE stream from the server.
 * EventSource can't POST, so we parse the SSE wire format off a fetch body.
/**
 * POSTs a chat message and consumes the SSE stream from the server.
 * EventSource can't POST, so we parse the SSE wire format off a fetch body.
 */
export async function streamChat(
  body: { conversationId?: string; model: string; message: string },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const errorMsg = (err as { error?: string }).error || "Request failed.";
    const retryAfter = res.headers.get("Retry-After")
      ? parseInt(res.headers.get("Retry-After") || "0", 10)
      : undefined;

    if (res.status === 429) {
      const waitSeconds = retryAfter || 60;
      handlers.onError?.(
        `Rate limited. Please wait ${waitSeconds} second${waitSeconds !== 1 ? "s" : ""} before trying again.`,
      );
    } else if (res.status === 413) {
      handlers.onError?.(
        `Message too large. Please shorten your message and try again.`,
      );
    } else {
      handlers.onError?.(errorMsg);
    }
    return;
  }

  if (!res.body) {
    handlers.onError?.("No response body");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      dispatchEvent(chunk, handlers);
    }
  }
  if (buffer.trim()) dispatchEvent(buffer, handlers);
}

function dispatchEvent(raw: string, handlers: ChatStreamHandlers): void {
  let event = "message";
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data += line.slice(5).trim();
  }
  if (!data) return;

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(data);
  } catch {
    return;
  }

  switch (event) {
    case "meta":
      handlers.onMeta?.(payload as unknown as ChatMeta);
      break;
    case "delta":
      handlers.onDelta(String(payload.text ?? ""));
      break;
    case "done":
      handlers.onDone?.();
      break;
    case "error":
      handlers.onError?.(String(payload.error ?? "Unknown error"));
      break;
  }
}
