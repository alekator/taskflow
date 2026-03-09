import { getErrorDetails } from "./errors";

describe("getErrorDetails", () => {
  it("returns message from Error instances", () => {
    const result = getErrorDetails(new Error("boom"));

    expect(result).toEqual({ message: "boom" });
  });

  it("builds fallback message by status code when message is missing", () => {
    const result = getErrorDetails({ statusCode: 412 });

    expect(result).toEqual({
      message: "Data version is stale. Reload and retry.",
      statusCode: 412,
    });
  });

  it("returns generic message for non-object values", () => {
    const result = getErrorDetails("fail");

    expect(result).toEqual({ message: "Unexpected error" });
  });
});
