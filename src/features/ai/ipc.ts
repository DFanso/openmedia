import { invoke } from "@tauri-apps/api/core";
import type { OptionGroup } from "../../shared/ipc";

/** What `ai_prepare` returns: the exact text that `ai_send` will send, for the user to read. */
export interface PreparedRequest {
  id: string;
  providerName: string;
  model: string | null;
  /** System prompt plus user message, exactly as sent. */
  payload: string;
  tokenEstimate: number;
}

export interface ProposalRule {
  label: string;
  selector: string;
  /** Elements this rule hides on the page right now. */
  matches: number;
}

export interface Proposal {
  id: string;
  kind: "existingOption" | "newOption";
  summary: string;
  recipeId: string;
  recipeName: string;
  /** Accepting saves a changed copy of a bundled recipe. */
  forked: boolean;
  option: { id: string | null; label: string; description: string; group: OptionGroup };
  rules: ProposalRule[];
  /** Rules that matched nothing. */
  unmatched: number;
}

/**
 * The assistant's own commands. They live beside the feature that uses them, so the shared IPC
 * module keeps only what the rest of the app needs. The keys never pass through here: Rust reads
 * them from the secure store when it makes the request.
 */
export const assistant = {
  /** Reads the open page, redacts it and builds the request. Nothing leaves the device yet. */
  prepare: (request: string) => invoke<PreparedRequest>("ai_prepare", { request }),
  /** Sends a prepared request and previews the answer on the page. */
  send: (id: string) => invoke<Proposal>("ai_send", { id }),
  /** Saves the proposal as a switch and removes the preview. */
  accept: async (id: string): Promise<void> => {
    await invoke("ai_accept", { id });
  },
  /** Removes the preview and drops the proposal. */
  reject: async (id: string): Promise<void> => {
    await invoke("ai_reject", { id });
  },
  /** Turns the "show what will be sent" step on or off. */
  setPreview: async (enabled: boolean): Promise<void> => {
    await invoke("set_ai_preview", { enabled });
  },
};
