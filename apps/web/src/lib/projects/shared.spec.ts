import { buildQueryString } from "./shared";

describe("buildQueryString", () => {
  it("serializes primitive values", () => {
    const query = buildQueryString({ page: 2, q: "alpha" });

    expect(query).toBe("?page=2&q=alpha");
  });

  it("skips empty, null, and undefined values", () => {
    const query = buildQueryString({
      page: 1,
      q: "",
      status: undefined,
      assignee: null,
    });

    expect(query).toBe("?page=1");
  });

  it("returns empty string when query is absent", () => {
    expect(buildQueryString()).toBe("");
  });
});
