import { useState } from "react";
import { useApp } from "../../app/store";
import { useT } from "../../i18n/useT";
import { GlyphPicker } from "../../shared/GlyphPicker";
import { CheckIcon, PlusIcon } from "../../shared/icons";
import type { Profile, ProfileInput } from "../../shared/ipc";
import { Screen } from "../../shared/Screen";
import { Spinner } from "../../shared/Spinner";
import { Group, dangerButton, field, primaryButton, quietButton } from "../settings/ui";
import { ProfileAvatar } from "./ProfileAvatar";
import { MAX_PROFILE_NAME, MAX_PROFILES, shownProfile } from "./profiles";

/**
 * The profiles: tap one to switch to it, edit its name and icon, add one, delete one that is not
 * in use. Opened from the floating button and from Settings.
 */
export function ProfilesScreen() {
  const closeSheet = useApp((s) => s.closeSheet);
  const list = useApp((s) => s.profiles);
  const switching = useApp((s) => s.profileSwitching);
  const error = useApp((s) => s.error);
  const { switchProfile, createProfile, updateProfile, deleteProfile } = useApp.getState();
  /** The profile being edited, `"new"` for one being added. */
  const [editing, setEditing] = useState<string | null>(null);
  const t = useT();
  if (!list) return null;
  const full = list.profiles.length >= MAX_PROFILES;

  return (
    <Screen title={t("profiles.title")} closeLabel={t("common.back")} onClose={closeSheet} back>
      <div className="flex flex-col gap-4">
        <p className="px-1 text-sm leading-snug text-paper/60">{t("profiles.note")}</p>
        <Group>
          {list.profiles.map((profile) => {
            const shown = shownProfile(profile, t);
            const active = profile.id === list.active;
            return (
              <div key={profile.id}>
                <div className="flex items-center gap-1 pe-2">
                  <button
                    type="button"
                    disabled={switching}
                    aria-current={active ? "true" : undefined}
                    aria-label={active ? shown.name : t("profiles.switch", { name: shown.name })}
                    onClick={() => void switchProfile(profile.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-start hover:bg-paper/[0.04] active:bg-paper/[0.05] disabled:opacity-60"
                  >
                    <ProfileAvatar profile={profile} size={22} framed />
                    <span className="min-w-0 flex-1 truncate text-base font-medium">
                      {shown.name}
                    </span>
                    {active && (
                      <span className="flex shrink-0 items-center gap-1 text-sm text-accent">
                        <CheckIcon />
                        {t("profiles.inUse")}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-expanded={editing === profile.id}
                    aria-label={t("profiles.edit", { name: shown.name })}
                    onClick={() => setEditing(editing === profile.id ? null : profile.id)}
                    className={quietButton}
                  >
                    {t("common.edit")}
                  </button>
                </div>
                {editing === profile.id && (
                  <ProfileEditor
                    initial={{ name: shown.name, icon: profile.icon }}
                    preview={profile}
                    submitLabel={t("common.save")}
                    onSubmit={async (input) => {
                      if (await updateProfile(profile.id, input)) setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                    onDelete={active ? undefined : () => void deleteProfile(profile.id)}
                  />
                )}
              </div>
            );
          })}
        </Group>

        {switching ? (
          <Spinner label={t("profiles.switching")} className="px-1 text-sm text-paper/70" />
        ) : (
          <p className="px-1 text-[13px] leading-snug text-paper/50">{t("profiles.switchNote")}</p>
        )}

        {editing === "new" ? (
          <Group>
            <ProfileEditor
              initial={{ name: "" }}
              preview={null}
              submitLabel={t("profiles.create")}
              onSubmit={async (input) => {
                if (await createProfile(input)) setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          </Group>
        ) : (
          <button
            type="button"
            disabled={full || switching}
            onClick={() => setEditing("new")}
            className={`${quietButton} flex items-center justify-center gap-2 self-start`}
          >
            <PlusIcon /> {t("profiles.new")}
          </button>
        )}
        {full && <p className="px-1 text-sm text-paper/55">{t("profiles.limit")}</p>}
        {error && <p className="px-1 text-sm text-accent">{error}</p>}
      </div>
    </Screen>
  );
}

interface EditorProps {
  initial: ProfileInput;
  /** The profile being edited, for the avatar the "no icon" choice shows; null for a new one. */
  preview: Profile | null;
  submitLabel: string;
  onSubmit: (input: ProfileInput) => Promise<void>;
  onCancel: () => void;
  /** Absent for a new profile and for the one in use. */
  onDelete?: () => void;
}

function ProfileEditor({
  initial,
  preview,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: EditorProps) {
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState<string | undefined>(initial.icon);
  const [confirming, setConfirming] = useState(false);
  const t = useT();
  const letter = { id: preview?.id ?? "new", name: name.trim() || preview?.name };

  return (
    <div className="flex flex-col gap-3 border-t border-hair bg-paper/[0.03] px-4 py-3.5 first:border-t-0">
      <input
        aria-label={t("profiles.nameLabel")}
        className={field}
        maxLength={MAX_PROFILE_NAME}
        placeholder={t("profiles.nameLabel")}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="text-sm font-medium">{t("profiles.iconLabel")}</div>
      <GlyphPicker
        label={t("profiles.iconLabel")}
        value={icon}
        onChange={setIcon}
        none={{
          label: t("profiles.iconNone"),
          content: <ProfileAvatar profile={letter} size={20} />,
        }}
      />
      {confirming && <p className="text-sm text-paper/70">{t("profiles.deleteNote")}</p>}
      {!onDelete && preview && (
        <p className="text-[13px] leading-snug text-paper/50">{t("profiles.deleteInUse")}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          className={primaryButton}
          disabled={name.trim() === ""}
          onClick={() => void onSubmit({ name: name.trim(), ...(icon ? { icon } : {}) })}
        >
          {submitLabel}
        </button>
        <button type="button" className={quietButton} onClick={onCancel}>
          {t("common.cancel")}
        </button>
        {onDelete &&
          (confirming ? (
            <button type="button" className={`${dangerButton} ms-auto`} onClick={onDelete}>
              {t("common.delete")}
            </button>
          ) : (
            <button
              type="button"
              className={`${quietButton} ms-auto`}
              onClick={() => setConfirming(true)}
            >
              {t("common.delete")}
            </button>
          ))}
      </div>
    </div>
  );
}
