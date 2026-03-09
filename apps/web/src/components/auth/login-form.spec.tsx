import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const mockLogin = vi.fn();
const mockNotify = vi.fn();
const mockReplace = vi.fn();
const mockSearchGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: mockSearchGet }),
}));

vi.mock("./auth-provider", () => ({
  useAuth: () => ({ login: mockLogin }),
}));

vi.mock("../feedback/toast-provider", () => ({
  useToast: () => ({ notify: mockNotify }),
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchGet.mockReturnValue("/app/projects");
  });

  it("submits credentials and redirects to next route on success", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValueOnce(undefined);

    render(<LoginForm />);

    await user.click(screen.getByTestId("login-submit"));

    expect(mockLogin).toHaveBeenCalledWith("admin@test.com", "123456");
    expect(mockNotify).toHaveBeenCalledWith("success", "Signed in successfully");
    expect(mockReplace).toHaveBeenCalledWith("/app/projects");
  });

  it("shows error message and toast when login fails", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error("Invalid credentials"));

    render(<LoginForm />);

    await user.click(screen.getByTestId("login-submit"));

    expect(await screen.findByText("Invalid credentials")).toBeInTheDocument();
    expect(mockNotify).toHaveBeenCalledWith("error", "Invalid credentials");
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
