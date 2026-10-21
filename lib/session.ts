export type Session = {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  email?: string;
};

export class LoginRequired extends Error {
  constructor(message = "Google Drive authorization required") {
    super(message);
    this.name = "LoginRequired";
  }
}

/** Serializes refreshes; a logout generation prevents a late refresh restoring credentials. */
export function createTokenManager(
  storage: {
    read(): Promise<Session | null>;
    write(value: Session | null): Promise<void>;
  },
  renew: (session: Session, force: boolean) => Promise<Session>,
) {
  let session: Session | null = null;
  let pending: Promise<string> | undefined;
  let generation = 0;

  return {
    async restore() {
      session = await storage.read();
      return session;
    },
    async set(value: Session | null) {
      generation++;
      session = value;
      await storage.write(value);
    },
    async token(force = false): Promise<string> {
      if (!session) throw new LoginRequired("Vui lòng đăng nhập Google.");
      if (!force && session.accessToken && session.expiresAt > Date.now() + 60_000) {
        return session.accessToken;
      }
      if (pending) return pending;

      const version = generation;
      const original = session;
      pending = (async () => {
        try {
          const next = await renew(original, force);
          if (version !== generation) {
            throw new LoginRequired("Phiên đăng nhập đã thay đổi.");
          }
          session = {
            ...original,
            ...next,
            refreshToken: next.refreshToken || original.refreshToken,
          };
          await storage.write(session);
          return session.accessToken;
        } catch (error) {
          if (error instanceof LoginRequired && version === generation) {
            session = null;
            await storage.write(null);
          }
          throw error;
        } finally {
          pending = undefined;
        }
      })();
      return pending;
    },
  };
}
