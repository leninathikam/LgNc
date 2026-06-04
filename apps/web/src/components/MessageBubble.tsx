import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import clsx from "clsx";

interface Props {
  role: "user" | "assistant" | "system";
  content: string;
  streaming?: boolean;
}

export function MessageBubble({ role, content, streaming }: Props) {
  const isUser = role === "user";
  return (
    <div className={clsx("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[min(48rem,85%)] rounded-2xl px-4 py-3 text-[15px]",
          isUser
            ? "bg-accent text-accent-fg rounded-br-md"
            : "border border-border bg-surface rounded-bl-md",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          <div className="prose-chat">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-accent" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
