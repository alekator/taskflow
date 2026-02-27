"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "./auth-provider";
import { ROUTES } from "../../lib/routes";
import { useToast } from "../feedback/toast-provider";
import { getErrorDetails } from "../../lib/errors";
import type { UserRole } from "../../lib/types";

const USER_ROLE = "USER";

export function RegisterForm() {
  const { register } = useAuth();
  const { notify } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>(USER_ROLE);
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const requiresInvite = role !== USER_ROLE;

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      await register({
        email,
        password,
        name: name.trim() || undefined,
        role,
        inviteCode: requiresInvite ? inviteCode.trim() || undefined : undefined,
      });
      const next = searchParams.get("next") || ROUTES.app;
      notify("success", "Account created successfully");
      router.replace(next);
    } catch (err) {
      const details = getErrorDetails(err);
      setError(details.message);
      notify("error", details.message);
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="auth-form">
      <label>
        Email
        <input
          data-testid="register-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label>
        Password
        <input
          data-testid="register-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          maxLength={128}
          required
        />
      </label>

      <label>
        Name
        <input
          data-testid="register-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Optional display name"
        />
      </label>

      <label>
        Account type
        <select
          data-testid="register-role"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          <option value="USER">Owner / Member</option>
          <option value="MANAGER">Manager</option>
          <option value="ADMIN">Admin</option>
        </select>
      </label>

      {requiresInvite ? (
        <label>
          Invite code
          <input
            data-testid="register-invite-code"
            type="password"
            autoComplete="off"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            minLength={6}
            maxLength={128}
            required
          />
        </label>
      ) : null}

      <p className="meta">
        Project owner rights are granted when you create a project.
      </p>

      {error ? <p className="error-text">{error}</p> : null}

      <button
        data-testid="register-submit"
        className="button button-primary"
        disabled={pending}
        type="submit"
      >
        {pending ? "Creating account..." : "Create account"}
      </button>
    </form>
  );
}
