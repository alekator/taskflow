import type { AuthSession } from "../types";
import { clearSession, readSession, writeSession } from "./storage";

const sampleSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: {
    id: "user-1",
    email: "user@test.com",
    role: "USER",
    name: "User",
  },
};

describe("auth storage", () => {
  it("writes and reads session", () => {
    writeSession(sampleSession);

    expect(readSession()).toEqual(sampleSession);
  });

  it("returns null for broken json", () => {
    window.localStorage.setItem("taskflow.session", "{invalid");

    expect(readSession()).toBeNull();
  });

  it("clears saved session", () => {
    writeSession(sampleSession);
    clearSession();

    expect(readSession()).toBeNull();
  });
});
