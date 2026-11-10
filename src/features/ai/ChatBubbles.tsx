import type { ReactNode } from "react";

/** What the user asked, on the user's side of the chat. */
export function RequestBubble({ request }: { request: string }) {
  return (
    <p className="ms-auto max-w-[85%] rounded-2xl rounded-ee-md bg-accent/15 px-3.5 py-2 text-sm leading-snug break-words text-paper select-text">
      {request}
    </p>
  );
}

/** What the assistant said back, on the assistant's side. */
export function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[92%] rounded-2xl rounded-es-md bg-paper/[0.06] px-3.5 py-2 text-sm leading-snug break-words text-paper select-text">
      {children}
    </div>
  );
}
