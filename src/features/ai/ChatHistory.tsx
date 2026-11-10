import { selectLocale, useApp } from "../../app/store";
import { useT } from "../../i18n/useT";
import { CloseIcon } from "../../shared/icons";
import type { ChatSession } from "./ipc";

/** The chats of the site on screen, each with the recipe it ended up attached to. */
export function ChatHistory({
  chats,
  activeId,
  onOpen,
  onDelete,
}: {
  chats: readonly ChatSession[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const locale = useApp(selectLocale);
  const t = useT();

  if (chats.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-sm text-paper/55">{t("assistant.historyEmpty")}</p>
    );
  }

  return (
    <ul className="divide-y divide-hair overflow-hidden rounded-2xl border border-hair bg-paper/[0.04]">
      {chats.map((chat) => (
        <li key={chat.id} className="flex items-center">
          <button
            type="button"
            aria-current={chat.id === activeId}
            onClick={() => onOpen(chat.id)}
            className="min-w-0 flex-1 px-4 py-3 text-start active:bg-paper/[0.08]"
          >
            <span className="block truncate text-sm font-medium text-paper">{chat.title}</span>
            <span className="block truncate text-xs text-paper/55">
              {chat.recipeName ? `${chat.recipeName} · ` : ""}
              {new Date(chat.updatedAt).toLocaleDateString(locale, {
                month: "short",
                day: "numeric",
              })}
            </span>
          </button>
          <button
            type="button"
            aria-label={t("assistant.deleteChat")}
            onClick={() => onDelete(chat.id)}
            className="grid size-11 shrink-0 place-items-center text-paper/55"
          >
            <CloseIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}
