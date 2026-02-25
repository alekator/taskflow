export type RequestUser = { id: string; email: string; role: string };
export type RequestWithUser = Request & { user: RequestUser };
