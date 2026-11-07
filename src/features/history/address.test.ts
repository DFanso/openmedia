import { describe, expect, it } from "vitest";
import { describeAddress } from "./address";

describe("describeAddress", () => {
  it("drops www and the root path", () => {
    expect(describeAddress("https://www.reddit.com/")).toEqual({ host: "reddit.com", rest: "" });
  });

  it("keeps the path and query as the second line", () => {
    expect(describeAddress("https://www.reddit.com/r/rust?sort=top")).toEqual({
      host: "reddit.com",
      rest: "/r/rust?sort=top",
    });
  });

  it("keeps the port and marks plain http apart from https", () => {
    expect(describeAddress("http://localhost:8765/a").host).toBe("http://localhost:8765");
    expect(describeAddress("https://localhost:8765/a").host).toBe("localhost:8765");
  });

  it("falls back to the raw text for something that is not a url", () => {
    expect(describeAddress("not a url")).toEqual({ host: "not a url", rest: "" });
  });
});
