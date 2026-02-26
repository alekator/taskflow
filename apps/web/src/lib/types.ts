export type UserRole = "ADMIN" | "MANAGER" | "USER";

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  name: string | null;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
};
