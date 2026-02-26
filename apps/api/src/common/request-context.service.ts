import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export type RequestContextStore = {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
};

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<RequestContextStore>();

  run<T>(store: RequestContextStore, callback: () => T): T {
    return this.als.run(store, callback);
  }

  get(): RequestContextStore | undefined {
    return this.als.getStore();
  }
}
