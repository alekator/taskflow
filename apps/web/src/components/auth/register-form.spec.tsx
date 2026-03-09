import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RegisterForm } from "./register-form";

const mockRegister = vi.fn();
const mockNotify = vi.fn();
const mockReplace = vi.fn();
const mockSearchGet = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => ({ get: mockSearchGet }),
}));

vi.mock("./auth-provider", () => ({
  useAuth: () => ({ register: mockRegister }),
}));

vi.mock("../feedback/toast-provider", () => ({
  useToast: () => ({ notify: mockNotify }),
}));

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchGet.mockReturnValue(null);
  });

  it("hides invite code for USER role and sends trimmed payload", async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValueOnce(undefined);

    render(<RegisterForm />);

    await user.type(screen.getByTestId("register-email"), "owner@test.com");
    await user.type(screen.getByTestId("register-password"), "123456");
    await user.type(screen.getByTestId("register-name"), "  Owner Name  ");
    await user.click(screen.getByTestId("register-submit"));

    expect(screen.queryByTestId("register-invite-code")).not.toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledWith({
      email: "owner@test.com",
      password: "123456",
      name: "Owner Name",
      role: "USER",
      inviteCode: undefined,
    });
    expect(mockNotify).toHaveBeenCalledWith(
      "success",
      "Account created successfully",
    );
    expect(mockReplace).toHaveBeenCalledWith("/app");
  });

  it("requires and sends invite code for elevated roles", async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValueOnce(undefined);

    render(<RegisterForm />);

    await user.type(screen.getByTestId("register-email"), "manager@test.com");
    await user.type(screen.getByTestId("register-password"), "123456");
    await user.selectOptions(screen.getByTestId("register-role"), "MANAGER");
    await user.type(screen.getByTestId("register-invite-code"), "  CODE-123  ");
    await user.click(screen.getByTestId("register-submit"));

    expect(mockRegister).toHaveBeenCalledWith({
      email: "manager@test.com",
      password: "123456",
      name: undefined,
      role: "MANAGER",
      inviteCode: "CODE-123",
    });
  });

  it("renders backend error message when registration fails", async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValueOnce(new Error("Invite code is invalid"));

    render(<RegisterForm />);

    await user.type(screen.getByTestId("register-email"), "admin@test.com");
    await user.type(screen.getByTestId("register-password"), "123456");
    await user.selectOptions(screen.getByTestId("register-role"), "ADMIN");
    await user.type(screen.getByTestId("register-invite-code"), "BAD-CODE");
    await user.click(screen.getByTestId("register-submit"));

    expect(await screen.findByText("Invite code is invalid")).toBeInTheDocument();
    expect(mockNotify).toHaveBeenCalledWith("error", "Invite code is invalid");
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
