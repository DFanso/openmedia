import { useState } from "react";
import { BrowserView } from "../features/browser/BrowserView";
import { HomeView } from "../features/library/HomeView";
import type { Profile, Site } from "../shared/ipc";

interface OpenSite {
  profile: Profile;
  site: Site;
}

export function App() {
  const [open, setOpen] = useState<OpenSite | null>(null);

  return open ? (
    <BrowserView profile={open.profile} site={open.site} onClose={() => setOpen(null)} />
  ) : (
    <HomeView onOpen={(profile, site) => setOpen({ profile, site })} />
  );
}
