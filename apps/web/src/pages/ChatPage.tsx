import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, streamChat } from "../lib/api";
import { ModelPicker } from "../components/ModelPicker";
import { MessageBubble } from "../components/MessageBubble";
import { Composer } from "../components/Composer";
import { BrainIcon } from "../components/icons";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextInfo, setContextInfo] = useState<{
    fillPercent: number | null;
    compacted: boolean;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const { data: models = [] } = useQuery({ queryKey: ["models"], queryFn: api.listModels });
  const { data: conversationData } = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => api.getConversation(conversationId!),
    enabled: Boolean(conversationId),
  });

  const [model, setModel] = useState("");

  // Pick a sensible default model: saved preference, else first available.
  useEffect(() => {
    if (model) return;
    const saved = settings?.default_model;
    if (saved && models.some((m) => m.id === saved)) {
      setModel(saved);
    } else {
      const firstAvailable = models.find((m) => m.available) ?? models[0];
      if (firstAvailable) setModel(firstAvailable.id);
    }
  }, [settings, models, model]);

  // Load server messages when opening an existing conversation (not mid-stream).
  useEffect(() => {
    if (isStreaming) return;
    if (conversationId && conversationData) {
      setMessages(
        conversationData.messages
          .filter((m) => m.role !== "system")
          .map((m) => ({ id: m.id, role: m.role, content: m.content })),
      );
    } else if (!conversationId) {
      setMessages([]);
    }
  }, [conversationId, conversationData, isStreaming]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  function changeModel(id: string) {
    setModel(id);
    api.saveSettings({ default_model: id }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    });
  }

  async function handleSend(text: string) {
    if (!model) {
      setError("Select a model first (add an API key in Settings if needed).");
      return;
    }
    setError(null);
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", content: text }]);
    setStreamingText("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let assembled = "";
    let newConversationId = conversationId;

    await streamChat(
      { conversationId, model, message: text },
      {
        onMeta: (meta) => {
          newConversationId = meta.conversationId;
          setContextInfo({
            fillPercent: meta.contextFillPercent ?? null,
            compacted: Boolean(meta.compacted),
          });
        },
        onDelta: (delta) => {
          assembled += delta;
          setStreamingText(assembled);
        },
        onError: (msg) => setError(msg),
        onDone: () => {},
      },
      controller.signal,
    ).catch((err) => {
      if (err?.name !== "AbortError") setError(err?.message ?? "Something went wrong.");
    });

    setIsStreaming(false);
    abortRef.current = null;

    if (assembled.trim()) {
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: assembled },
      ]);
    }
    setStreamingText("");

    queryClient.invalidateQueries({ queryKey: ["conversations"] });
    queryClient.invalidateQueries({ queryKey: ["memories"] });
    if (newConversationId && newConversationId !== conversationId) {
      queryClient.invalidateQueries({ queryKey: ["conversation", newConversationId] });
      navigate(`/c/${newConversationId}`, { replace: true });
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  const hasAvailableModel = useMemo(() => models.some((m) => m.available), [models]);
  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h1 className="truncate text-sm font-medium text-muted">
          {conversationData?.conversation.title ?? "New chat"}
        </h1>
        <div className="flex items-center gap-3">
          {contextInfo?.fillPercent != null && (
            <span
              className="hidden items-center gap-1.5 text-xs text-muted sm:flex"
              title="Approximate share of the model's context window in use"
            >
              {contextInfo.compacted && (
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                  compacted
                </span>
              )}
              context {contextInfo.fillPercent}%
            </span>
          )}
          <ModelPicker value={model} onChange={changeModel} />
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {isEmpty ? (
          <EmptyState hasModel={hasAvailableModel} />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} content={m.content} />
            ))}
            {isStreaming && (
              <MessageBubble role="assistant" content={streamingText || "..."} streaming />
            )}
          </div>
        )}
        {error && (
          <div className="mx-auto mt-4 max-w-3xl rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      <Composer
        disabled={isStreaming}
        streaming={isStreaming}
        onSend={handleSend}
        onStop={handleStop}
      />
    </div>
  );
}

function EmptyState({ hasModel }: { hasModel: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
        <BrainIcon className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-semibold">Your personal assistant</h2>
      <p className="mt-2 max-w-md text-sm text-muted">
        Finally, an AI that's actually yours. It lives on your machine, learns how you
        work, and gets better the longer you use it.
      </p>
      {!hasModel && (
        <p className="mt-4 max-w-md text-sm text-amber-400">
          No model is ready yet. Add an API key in Settings, or run a local model with
          Ollama.
        </p>
      )}
    </div>
  );
}
