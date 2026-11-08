import { useState } from "react";
import { useApp } from "../../app/store";
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
 * disagrees with the one a pre-made recipe's star edits.
 */
export function FavoritesSection() {
  const favorites = useApp((s) => s.state?.favorites) ?? [];
  const saveFavorites = useApp((s) => s.saveFavorites);
  const problem = useApp((s) => s.error);
  const [editing, setEditing] = useState<number | "new" | null>(null);

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
    <Section
      title="Favorites"
      note={`Keep as many as you like. The first ${QUICK_ACCESS_LIMIT} are the quick-access menu you get by holding the button; move a favorite up to put it there.`}
    >
      <GroupLabel>
        Quick access · {quick.length} of {QUICK_ACCESS_LIMIT}
      </GroupLabel>
      {quick.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hair px-4 py-5 text-sm text-paper/55">
          Nothing here yet. Add a favorite below, or star a pre-made recipe.
        </p>
      ) : (
        <Group>{quick.map((favorite, index) => renderRow(favorite, index))}</Group>
      )}

      {more.length > 0 && (
        <div className="mt-5">
          <GroupLabel>More favorites · {more.length}</GroupLabel>
          <Group>
            {more.map((favorite, index) => renderRow(favorite, index + QUICK_ACCESS_LIMIT))}
          </Group>
        </div>
      )}

      <div className="mt-4">
        {editing === "new" ? (
          <div className="overflow-hidden rounded-2xl border border-hair bg-paper/[0.04]">
            <FavoriteEditor
              initial={{ name: "", url: "" }}
              hint={
                favorites.length >= QUICK_ACCESS_LIMIT
                  ? "Quick access is full, so this one is added to More favorites."
                  : undefined
              }
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
            <PlusIcon /> Add favorite
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

  return (
    <div>
      <div className="flex items-center pr-1">
        <button
          type="button"
          aria-expanded={editing}
          aria-label={`Edit ${favorite.name}`}
          onClick={onEdit}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left"
        >
          <SiteTile name={favorite.name} icon={favorite.icon} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium">{favorite.name}</span>
            <span className="block truncate text-sm text-paper/55">{host}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label={`Move ${favorite.name} up`}
          disabled={first}
          onClick={() => onMove(-1)}
          className={arrow}
        >
          <UpIcon />
        </button>
        <button
          type="button"
          aria-label={`Move ${favorite.name} down`}
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

  const done = async () => {
    const address = normalizeWebUrl(url);
    if (!name.trim() || !address) {
      setProblem("A favorite needs a name and a valid address.");
      return;
    }
    await onCommit({ name: name.trim(), url: address });
  };

  return (
    <div className="flex flex-col gap-2.5 border-t border-hair bg-paper/[0.03] px-4 py-3.5">
      <input
        aria-label="Favorite name"
        className={field}
        maxLength={MAX_FAVORITE_NAME}
        placeholder="Name"
        value={name}
        onChange={(event) => {
          setProblem(null);
          setName(event.target.value);
        }}
      />
      <input
        aria-label="Favorite address"
        className={field}
        autoCapitalize="none"
        autoCorrect="off"
        inputMode="url"
        placeholder="example.com"
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
          Save
        </button>
        <button type="button" onClick={onCancel} className={quietButton}>
          Cancel
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className={`${quietButton} ml-auto text-red-400`}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
