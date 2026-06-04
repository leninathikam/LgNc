import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { api } from "../lib/api";
import { useTheme } from "../lib/theme";
import {
  BrainIcon,
  ChatIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
  TrashIcon,
} from "./icons";

export function AppLayout() {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();

  const { data: conversations = [] } = useQuery({
    queryKey: ["conversations"],
    queryFn: api.listConversations,
  });

  const remove = useMutation({
    mutationFn: api.deleteConversation,
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (id === conversationId) navigate("/");
    },
  });

  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg">
            <BrainIcon className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">LgNc</div>
            <div className="text-[11px] text-muted">local + yours</div>
          </div>
        </div>

        <div className="px-3">
          <button
            onClick={() => navigate("/")}
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
          >
            <PlusIcon className="h-4 w-4" />
            New chat
          </button>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-2">
          <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            Conversations
          </div>
          {conversations.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted">No chats yet.</p>
          )}
          {conversations.map((conv) => (
            <NavLink
              key={conv.id}
              to={`/c/${conv.id}`}
              className={({ isActive }) =>
                clsx(
                  "group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition",
                  isActive ? "bg-elevated text-fg" : "text-muted hover:bg-elevated hover:text-fg",
                )
              }
            >
              <ChatIcon className="h-4 w-4 shrink-0 opacity-70" />
              <span className="flex-1 truncate">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  remove.mutate(conv.id);
                }}
                className="opacity-0 transition group-hover:opacity-100 hover:text-red-400"
                title="Delete conversation"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </NavLink>
          ))}
        </div>

        <nav className="border-t border-border p-2">
          <SidebarLink to="/memories" icon={<BrainIcon className="h-4 w-4" />} label="Memory" />
          <SidebarLink to="/settings" icon={<SettingsIcon className="h-4 w-4" />} label="Settings" />
          <button
            onClick={toggle}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-elevated hover:text-fg"
          >
            {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
          isActive ? "bg-elevated text-fg" : "text-muted hover:bg-elevated hover:text-fg",
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
