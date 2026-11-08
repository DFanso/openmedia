import type { PreparedRequest, Proposal } from "./ipc";

export const prepared: PreparedRequest = {
  id: "job-1",
  providerName: "Anthropic",
  model: "claude-x",
  payload: "SYSTEM\n\nUSER",
  tokenEstimate: 1234,
};

export const proposal: Proposal = {
  id: "job-1",
  kind: "newOption",
  summary: "Hide the suggested videos",
  recipeId: "youtube",
  recipeName: "YouTube",
  forked: true,
  option: {
    id: null,
    label: "Hide suggested videos",
    description: "Removes the related list.",
    group: "content",
  },
  rules: [
    { label: "Related list", selector: "#related", matches: 3 },
    { label: "End screen", selector: ".end", matches: 0 },
  ],
  unmatched: 1,
};
