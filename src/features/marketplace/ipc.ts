import { invoke } from "@tauri-apps/api/core";

export interface RulePreview {
  label: string;
  kind: "hide" | "css";
  selector: string;
  declarations: Record<string, string>;
}

export interface OptionPreview {
  label: string;
  description: string;
  onByDefault: boolean;
}

/** What a recipe would add, as Rust validated it: the review screen shows exactly this. */
export interface RecipePreview {
  id: string;
  name: string;
  version: string;
  author: string | null;
  notes: string | null;
  sites: string[];
  options: OptionPreview[];
  rules: RulePreview[];
  /** The version already installed under this id, which adding would replace. */
  replaces: string | null;
}

export interface MarketItem {
  id: string;
  name: string;
  version: string;
  author: string;
  summary: string;
  hosts: string[];
  featured: boolean;
  installs: number | null;
  installedVersion: string | null;
  updateAvailable: boolean;
}

export interface MarketListing {
  items: MarketItem[];
  /** Names of installed recipes that were withdrawn; Rust already removed them. */
  withdrawn: string[];
}

export interface MarketStatus {
  /** False when the build has no marketplace address and keys. */
  available: boolean;
  countInstalls: boolean;
}

export type ReportReason = "harmful" | "broken" | "misleading" | "spam" | "other";

export interface SubmitResult {
  submissionId: string;
  firstSubmission: boolean;
}

async function command(name: string, args?: Record<string, unknown>): Promise<void> {
  await invoke(name, args);
}

export const marketplace = {
  status: () => invoke<MarketStatus>("marketplace_status"),
  setCounting: (enabled: boolean) => command("marketplace_set_counting", { enabled }),
  /** Fetches and verifies the signed catalog. Rejects with a short fixed message on any failure. */
  list: () => invoke<MarketListing>("marketplace_list"),
  preview: (recipeId: string) => invoke<RecipePreview>("marketplace_preview", { recipeId }),
  install: (recipeId: string) => command("marketplace_install", { recipeId }),
  uninstall: (recipeId: string) => command("marketplace_uninstall", { recipeId }),
  report: (recipeId: string, reason: ReportReason) =>
    command("marketplace_report", { recipeId, reason }),
  submit: (recipeId: string, slug: string, summary: string, author: string) =>
    invoke<SubmitResult>("marketplace_submit", { recipeId, slug, summary, author }),
};

export const sharing = {
  exportRecipes: (recipeIds: string[]) => invoke<string>("export_recipes", { recipeIds }),
  previewImport: (text: string) => invoke<RecipePreview[]>("preview_recipe_import", { text }),
  importRecipes: (text: string, recipeIds: string[]) =>
    command("import_recipes", { text, recipeIds }),
  removeImported: (recipeId: string) => command("remove_imported_recipe", { recipeId }),
};
