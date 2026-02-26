declare module "socket.io-client" {
  type SocketListener = (payload: unknown) => void;

  export type Socket = {
    emit(event: string, payload?: unknown): void;
    on(event: string, listener: SocketListener): void;
    off(event: string, listener: SocketListener): void;
    disconnect(): void;
  };

  export function io(
    url: string,
    options?: {
      transports?: string[];
      withCredentials?: boolean;
    },
  ): Socket;
}
