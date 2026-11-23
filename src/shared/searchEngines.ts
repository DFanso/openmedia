import type { SearchEngine } from "./ipc";

export const DEFAULT_SEARCH_ENGINE: SearchEngine = "google";

/**
 * The engines the command bar can search with. `url` is the address the encoded query is appended
 * to. Each engine's home page, which the app can open at launch, is `home_url` in `library.rs`.
 */
export const SEARCH_ENGINES: readonly { id: SearchEngine; name: string; url: string }[] = [
  { id: "duckDuckGo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  { id: "google", name: "Google", url: "https://www.google.com/search?q=" },
  { id: "bing", name: "Bing", url: "https://www.bing.com/search?q=" },
  { id: "brave", name: "Brave Search", url: "https://search.brave.com/search?q=" },
  { id: "ecosia", name: "Ecosia", url: "https://www.ecosia.org/search?q=" },
  { id: "startpage", name: "Startpage", url: "https://www.startpage.com/sp/search?query=" },
  { id: "yahoo", name: "Yahoo", url: "https://search.yahoo.com/search?p=" },
];

/** The engine's name as the user reads it. */
export function searchEngineName(engine: SearchEngine): string {
  return (SEARCH_ENGINES.find((candidate) => candidate.id === engine) ?? SEARCH_ENGINES[0]).name;
}

/** The web search for `query` on `engine`. The query is encoded, so it cannot add parameters. */
export function searchUrl(query: string, engine: SearchEngine = DEFAULT_SEARCH_ENGINE): string {
  const entry =
    SEARCH_ENGINES.find((candidate) => candidate.id === engine) ??
    SEARCH_ENGINES.find((candidate) => candidate.id === DEFAULT_SEARCH_ENGINE) ??
    SEARCH_ENGINES[0];
  return `${entry.url}${encodeURIComponent(query.trim())}`;
}
