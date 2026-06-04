import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "../lib/api";
import type { ProviderStatus } from "../lib/types";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: api.providerStatus,
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted">
          Bring your own keys. They are encrypted on disk and only ever sent to the
          provider you choose.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-8">
          <section className="space-y-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Providers
            </h2>
            {providers.map((p) => (
              <ProviderCard key={p.provider} provider={p} onChanged={() => {
                queryClient.invalidateQueries({ queryKey: ["providers"] });
                queryClient.invalidateQueries({ queryKey: ["models"] });
              }} />
            ))}
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Context
            </h2>
            <CompactionCard />
          </section>
        </div>
      </div>
    </div>
  );
}

function CompactionCard() {
  const queryClient = useQueryClient();
  const { data: settings = {} } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const save = useMutation({
    mutationFn: (patch: Record<string, string>) => api.saveSettings(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const enabled = settings.compaction_enabled !== "false";
  const threshold = settings.compaction_threshold ?? "0.8";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Auto-compact long conversations</div>
          <div className="max-w-md text-xs text-muted">
            When a chat nears the model's context window, LgNc summarizes older
            messages so conversations never hit the limit (and stay cheaper).
          </div>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={() =>
            save.mutate({ compaction_enabled: enabled ? "false" : "true" })
          }
          className={clsx(
            "relative h-6 w-11 shrink-0 rounded-full transition",
            enabled ? "bg-accent" : "bg-elevated",
          )}
        >
          <span
            className={clsx(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white transition",
              enabled ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-muted">
            Compact when context reaches
          </div>
          <div className="flex gap-2">
            {[
              { v: "0.75", label: "75%" },
              { v: "0.8", label: "80%" },
              { v: "0.9", label: "90%" },
            ].map((opt) => (
              <button
                key={opt.v}
                onClick={() => save.mutate({ compaction_threshold: opt.v })}
                className={clsx(
                  "rounded-lg border px-3 py-1.5 text-sm transition",
                  threshold === opt.v
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted hover:text-fg",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  onChanged,
}: {
  provider: ProviderStatus;
  onChanged: () => void;
}) {
  const [key, setKey] = useState("");
  const save = useMutation({
    mutationFn: () => api.setKey(provider.provider, key),
    onSuccess: () => {
      setKey("");
      onChanged();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteKey(provider.provider),
    onSuccess: onChanged,
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{provider.label}</div>
          <div className="text-xs text-muted">
            {provider.requiresKey ? "Requires an API key" : "Local - no key needed"}
          </div>
        </div>
        <span
          className={clsx(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            provider.configured
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-elevated text-muted",
          )}
        >
          {provider.configured
            ? provider.requiresKey
              ? "Key set"
              : "Connected"
            : provider.requiresKey
              ? "Not set"
              : "Offline"}
        </span>
      </div>

      {provider.requiresKey && (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={provider.configured ? "Replace key..." : "Paste API key..."}
            className="flex-1 rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={() => save.mutate()}
            disabled={!key.trim() || save.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-40"
          >
            Save
          </button>
          {provider.configured && (
            <button
              onClick={() => remove.mutate()}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-red-400"
            >
              Remove
            </button>
          )}
        </div>
      )}

      {!provider.requiresKey && !provider.configured && (
        <p className="mt-3 text-xs text-muted">
          Start Ollama locally (<code className="rounded bg-elevated px-1">ollama serve</code>)
          to use local models with zero keys.
        </p>
      )}
    </div>
  );
}
