import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { BrainIcon, PlusIcon, TrashIcon } from "../components/icons";

export function MemoriesPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: memories = [] } = useQuery({
    queryKey: ["memories"],
    queryFn: api.listMemories,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["memories"] });

  const add = useMutation({
    mutationFn: () => api.addMemory(draft),
    onSuccess: () => {
      setDraft("");
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: api.deleteMemory,
    onSuccess: invalidate,
  });

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold">Memory</h1>
        <p className="text-sm text-muted">
          What LgNc has learned about you. Stored locally, fully editable - it is your
          data.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && draft.trim() && add.mutate()}
              placeholder="Teach LgNc something about you..."
              className="flex-1 rounded-lg border border-border bg-elevated px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={() => add.mutate()}
              disabled={!draft.trim() || add.isPending}
              className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-40"
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </button>
          </div>

          {memories.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
              <BrainIcon className="mb-3 h-8 w-8 text-muted" />
              <p className="text-sm text-muted">
                Nothing learned yet. Chat a bit and LgNc will start remembering what
                matters.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {memories.map((m) => (
                <li
                  key={m.id}
                  className="group flex items-start justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3"
                >
                  <span className="text-sm">{m.content}</span>
                  <button
                    onClick={() => remove.mutate(m.id)}
                    className="shrink-0 text-muted opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                    title="Forget this"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
