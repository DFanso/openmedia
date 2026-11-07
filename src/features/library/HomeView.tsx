import { useEffect, useState, type FormEvent } from "react";
import { normalizeWebUrl } from "../../shared/url";
import type { Profile, Site } from "../../shared/ipc";
import { useLibrary } from "./store";

interface HomeViewProps {
  onOpen: (profile: Profile, site: Site) => void;
}

export function HomeView({ onOpen }: HomeViewProps) {
  const { profiles, activeProfileId, error, load, selectProfile, createProfile, deleteProfile } =
    useLibrary();
  const addSite = useLibrary((state) => state.addSite);
  const removeSite = useLibrary((state) => state.removeSite);
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const profile = profiles.find((p) => p.id === activeProfileId);

  const submitSite = async (event: FormEvent) => {
    event.preventDefault();
    const url = normalizeWebUrl(address);
    if (!url) {
      setAddressError("Enter a website address, like instagram.com");
      return;
    }
    setAddressError(null);
    await addSite(url);
    setAddress("");
  };

  const promptNewProfile = () => {
    const name = window.prompt("Profile name");
    if (name) void createProfile(name);
  };

  const confirmDeleteProfile = (target: Profile) => {
    if (window.confirm(`Delete "${target.name}" and sign out of all its sites?`)) {
      void deleteProfile(target.id);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <h1 className="text-2xl font-semibold">OpenMedia</h1>

      <div className="flex items-center gap-2">
        <select
          aria-label="Profile"
          className="min-w-0 flex-1 rounded-lg bg-zinc-800 px-3 py-2"
          value={activeProfileId ?? ""}
          onChange={(e) => selectProfile(e.target.value)}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button className="rounded-lg bg-zinc-800 px-3 py-2" onClick={promptNewProfile}>
          New
        </button>
        {profile && profiles.length > 1 && (
          <button
            className="rounded-lg bg-zinc-800 px-3 py-2 text-red-400"
            onClick={() => confirmDeleteProfile(profile)}
          >
            Delete
          </button>
        )}
      </div>

      <form className="flex gap-2" onSubmit={(e) => void submitSite(e)}>
        <input
          aria-label="Website address"
          className="min-w-0 flex-1 rounded-lg bg-zinc-800 px-3 py-2"
          placeholder="Add a site, like instagram.com"
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="url"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <button className="rounded-lg bg-indigo-600 px-4 py-2 font-medium" type="submit">
          Add
        </button>
      </form>

      {(addressError ?? error) && <p className="text-sm text-red-400">{addressError ?? error}</p>}

      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {profile?.sites.map((site) => (
          <li key={site.id} className="flex items-center gap-2 rounded-xl bg-zinc-900">
            <button
              className="min-w-0 flex-1 px-4 py-4 text-left"
              onClick={() => onOpen(profile, site)}
            >
              <div className="truncate font-medium">{site.title}</div>
              <div className="truncate text-xs text-zinc-500">{site.url}</div>
            </button>
            <button
              aria-label={`Remove ${site.title}`}
              className="px-4 py-4 text-zinc-500"
              onClick={() => void removeSite(site.id)}
            >
              ✕
            </button>
          </li>
        ))}
        {profile?.sites.length === 0 && (
          <li className="py-8 text-center text-zinc-500">Add a site to get started.</li>
        )}
      </ul>
    </div>
  );
}
