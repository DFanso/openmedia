/**
 * The shell keeps a few choices in its own storage (`localStorage`) rather than in Rust. Those
 * that belong to a profile are saved under a key with the profile's id in it; this remembers
 * which profile is in use, so they are read under the right key from the first frame.
 */
const ACTIVE_KEY = "om.profile";

export function storedProfile(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/** The key `base` is saved under for the profile in use; the bare key before any profile is known. */
export function profileKey(base: string, profile: string | null = storedProfile()): string {
  return profile ? `${base}:${profile}` : base;
}

/**
 * Records the profile in use. The first time one is known, what was saved under the bare keys
 * (from before profiles) becomes that profile's. True when the profile changed.
 */
export function rememberProfile(profile: string, bases: readonly string[]): boolean {
  const before = storedProfile();
  if (before === profile) return false;
  try {
    if (before === null) {
      for (const base of bases) {
        const saved = localStorage.getItem(base);
        if (saved !== null && localStorage.getItem(profileKey(base, profile)) === null) {
          localStorage.setItem(profileKey(base, profile), saved);
        }
        localStorage.removeItem(base);
      }
    }
    localStorage.setItem(ACTIVE_KEY, profile);
  } catch {
    // storage is unavailable: the choices hold for this session only
  }
  return true;
}

/** Forgets what a deleted profile kept under `bases`. */
export function forgetProfile(profile: string, bases: readonly string[]): void {
  try {
    for (const base of bases) localStorage.removeItem(profileKey(base, profile));
  } catch {
    // nothing to forget
  }
}
