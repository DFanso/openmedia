import { useState } from "react";
import { useApp } from "../../app/store";
import { useT } from "../../i18n/useT";
import { QUICK_ACCESS_LIMIT } from "../../shared/favorites";
import { DownIcon, PlusIcon, UpIcon } from "../../shared/icons";
import type { Favorite, FavoriteInput } from "../../shared/ipc";
import { SiteTile } from "../../shared/SiteTile";
import { normalizeWebUrl } from "../../shared/url";
import { describeAddress } from "../history/address";
import { MAX_FAVORITE_NAME } from "./presets";
import { Group, GroupLabel, Section, field, primaryButton, quietButton } from "./ui";

const asInput = ({ name, url }: Favorite): FavoriteInput => ({ name, url });

/**
 * The favorites list is as long as the user likes; the first few are the quick-access menu that
 * fans out from the floating button. Every change saves at once, so the list in Settings never
 * disagrees with the one a recipe's star edits.
 */
export function FavoritesSection() {
  const favorites = useApp((s) => s.state?.favorites) ?? [];
  const saveFavorites = useApp((s) => s.saveFavorites);
  const problem = useApp((s) => s.error);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const t = useT();

  const quick = favorites.slice(0, QUICK_ACCESS_LIMIT);
  const more = favorites.slice(QUICK_ACCESS_LIMIT);

  const replaceAll = (next: FavoriteInput[]) => {
    setEditing(null);
    return saveFavorites(next);
  };

  const move = (index: number, by: -1 | 1) => {
    const next = favorites.map(asInput);
    [next[index], next[index + by]] = [next[index + by], next[index]];
    void replaceAll(next);
  };

  const commit = (index: number | "new", entry: FavoriteInput) => {
    const next = favorites.map(asInput);
    if (index === "new") next.push(entry);
    else next[index] = entry;
    return replaceAll(next);
  };

  const remove = (index: number) => {
    void replaceAll(favorites.map(asInput).filter((_, at) => at !== index));
  };

  const renderRow = (favorite: Favorite, index: number) => (
    <FavoriteRow
      key={favorite.id}
      favorite={favorite}
      first={index === 0}
      last={index === favorites.length - 1}
      editing={editing === index}
      onEdit={() => setEditing(editing === index ? null : index)}
      onMove={(by) => move(index, by)}
      onCommit={(entry) => commit(index, entry)}
      onRemove={() => remove(index)}
    />
  );

  return (
    <Section title={t("favorites.title")} note={t("favorites.note", { limit: QUICK_ACCESS_LIMIT })}>
      <GroupLabel>
        {t("favorites.quickAccess", { count: quick.length, limit: QUICK_ACCESS_LIMIT })}
      </GroupLabel>
      {quick.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hair px-4 py-5 text-sm text-paper/55">
          {t("favorites.quickEmpty")}
        </p>
      ) : (
        <Group>{quick.map((favorite, index) => renderRow(favorite, index))}</Group>
      )}

      {more.length > 0 && (
        <details className="group/more mt-5">
          <summary className="flex cursor-pointer list-none items-center justify-between px-1 pt-1 pb-2 text-[13px] font-medium text-paper/60">
            <span>{t("favorites.more", { count: more.length })}</span>
            <span aria-hidden="true" className="text-paper/45 group-open/more:rotate-180">
              ⌄
            </span>
          </summary>
          <Group>
            {more.map((favorite, index) => renderRow(favorite, index + QUICK_ACCESS_LIMIT))}
          </Group>
        </details>
      )}

      <div className="mt-4">
        {editing === "new" ? (
          <div className="overflow-hidden rounded-2xl border border-hair bg-paper/[0.04]">
            <FavoriteEditor
              initial={{ name: "", url: "" }}
              hint={favorites.length >= QUICK_ACCESS_LIMIT ? t("favorites.quickFull") : undefined}
              onCommit={(entry) => commit("new", entry)}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex items-center gap-2 px-1 py-1 text-sm font-medium text-accent"
          >
            <PlusIcon /> {t("favorites.add")}
          </button>
        )}
      </div>

      {problem && <p className="mt-3 px-1 text-sm text-accent">{problem}</p>}
    </Section>
  );
}

interface RowProps {
  favorite: Favorite;
  first: boolean;
  last: boolean;
  editing: boolean;
  onEdit: () => void;
  onMove: (by: -1 | 1) => void;
  onCommit: (entry: FavoriteInput) => Promise<boolean>;
  onRemove: () => void;
}

function FavoriteRow({
  favorite,
  first,
  last,
  editing,
  onEdit,
  onMove,
  onCommit,
  onRemove,
}: RowProps) {
  const { host } = describeAddress(favorite.url);
  const arrow = "grid size-10 place-items-center text-paper/65 disabled:opacity-20";
  const t = useT();

  return (
    <div>
      <div className="flex items-center pe-1">
        <button
          type="button"
          aria-expanded={editing}
          aria-label={t("favorites.edit", { name: favorite.name })}
          onClick={onEdit}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 ps-4 text-start"
        >
          <SiteTile name={favorite.name} icon={favorite.icon} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium">{favorite.name}</span>
            <span className="block truncate text-sm text-paper/55">{host}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label={t("favorites.moveUp", { name: favorite.name })}
          disabled={first}
          onClick={() => onMove(-1)}
          className={arrow}
        >
          <UpIcon />
        </button>
        <button
          type="button"
          aria-label={t("favorites.moveDown", { name: favorite.name })}
          disabled={last}
          onClick={() => onMove(1)}
          className={arrow}
        >
          <DownIcon />
        </button>
      </div>
      {editing && (
        <FavoriteEditor
          initial={{ name: favorite.name, url: favorite.url }}
          onCommit={onCommit}
          onCancel={onEdit}
          onRemove={onRemove}
        />
      )}
    </div>
  );
}

interface EditorProps {
  initial: FavoriteInput;
  hint?: string;
  onCommit: (entry: FavoriteInput) => Promise<boolean>;
  onCancel: () => void;
  onRemove?: () => void;
}

function FavoriteEditor({ initial, hint, onCommit, onCancel, onRemove }: EditorProps) {
  const [name, setName] = useState(initial.name);
  const [url, setUrl] = useState(initial.url);
  const [problem, setProblem] = useState<string | null>(null);
  const t = useT();

  const done = async () => {
    const address = normalizeWebUrl(url);
    if (!name.trim() || !address) {
      setProblem(t("favorites.invalid"));
      return;
    }
    await onCommit({ name: name.trim(), url: address });
  };

  return (
    <div className="flex flex-col gap-2.5 border-t border-hair bg-paper/[0.03] px-4 py-3.5">
      <input
        aria-label={t("favorites.nameLabel")}
        className={field}
        maxLength={MAX_FAVORITE_NAME}
        placeholder={t("favorites.namePlaceholder")}
        value={name}
        onChange={(event) => {
          setProblem(null);
          setName(event.target.value);
        }}
      />
      <input
        aria-label={t("favorites.addressLabel")}
        className={field}
        autoCapitalize="none"
        autoCorrect="off"
        inputMode="url"
        placeholder={t("favorites.addressPlaceholder")}
        value={url}
        onChange={(event) => {
          setProblem(null);
          setUrl(event.target.value);
        }}
      />
      {(problem ?? hint) && (
        <p className={`text-sm ${problem ? "text-accent" : "text-paper/55"}`}>{problem ?? hint}</p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void done()} className={primaryButton}>
          {t("common.save")}
        </button>
        <button type="button" onClick={onCancel} className={quietButton}>
          {t("common.cancel")}
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className={`${quietButton} ms-auto text-red-400`}
          >
            {t("common.remove")}
          </button>
        )}
      </div>
    </div>
  );
}
