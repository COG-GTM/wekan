// Ambient type declarations for the wekan-accounts-sandstorm package.
//
// These describe the Meteor runtime globals and Sandstorm-specific data shapes
// that are not provided by @types/meteor, and augment @types/meteor where this
// package attaches its own members to Meteor globals. Shared interfaces used by
// both the client and server modules of this package live here.

// The Meteor runtime configuration global, populated on both client and server.
interface MeteorRuntimeConfig {
  SANDSTORM?: boolean;
  SANDSTORM_API_HOST?: string;
  SANDSTORM_API_TOKEN?: string;
}
declare var __meteor_runtime_config__: MeteorRuntimeConfig;

// The Sandstorm user info authenticated by the server for a connection.
interface SandstormUser {
  id: string | null;
  name: string;
  permissions: string[];
  picture: string | null;
  preferredHandle: string | null;
  pronouns: string | null;
}

// The full login result produced by the server and returned to the client.
interface SandstormUserInfo {
  sandstorm: SandstormUser;
  userId?: string | null;
  sessionId?: string | null;
  tabId?: string | null;
}

// Test user info injected on the client via SandstormAccounts.setTestUserInfo.
interface SandstormTestUserInfo {
  id?: string;
  name?: string;
  picture?: string;
  permissions?: string[];
  preferredHandle?: string;
  pronouns?: string;
}

// The client-side DDP connection, extended with Sandstorm login state.
interface SandstormClientConnection {
  _sandstormUser: ReactiveVar<SandstormUser | null>;
  sandstormUser(): SandstormUser | null;
  setUserId(userId: string | null | undefined): void;
  onReconnect: () => void;
  status(): DDP.DDPStatus;
}

// The client-side export of this package.
interface SandstormAccountsStatic {
  setTestUserInfo(info: SandstormTestUserInfo): void;
}
declare var SandstormAccounts: SandstormAccountsStatic;

// The subset of Meteor's `accounts-base` package accessed at runtime through the
// `Package` registry. @types/meteor types `Package` only as the build-time
// package-definition API, so the runtime registry shape is described here with
// real signatures rather than `any`.
interface SandstormLoginAttempt {
  allowed: boolean;
  type: string;
}
interface SandstormNewUser {
  services: {
    sandstorm?: SandstormUser;
  };
}
interface SandstormAccountsBase {
  validateLoginAttempt(func: (attempt: SandstormLoginAttempt) => boolean): {
    stop: () => void;
  };
  validateNewUser(func: (user: SandstormNewUser) => boolean): boolean;
  updateOrCreateUserFromExternalService(
    serviceName: string,
    serviceData: SandstormUser,
    options?: { profile?: { name: string } },
  ): Promise<{ userId: string }>;
  _setLoggingIn(loggingIn: boolean): void;
}
interface SandstormPackageRegistry {
  "accounts-base"?: {
    Accounts: SandstormAccountsBase;
  };
}

// The minimal Node HTTP request/response shapes used by the Sandstorm login
// rendezvous handler. Sandstorm sends its headers as single string values.
interface SandstormHttpRequest {
  url?: string;
  headers: { [name: string]: string };
  on(event: "data", listener: (chunk: Buffer) => void): SandstormHttpRequest;
  on(event: "error", listener: (err: Error) => void): SandstormHttpRequest;
  on(event: "end", listener: () => void): SandstormHttpRequest;
}
interface SandstormHttpResponse {
  writeHead(statusCode: number, headers?: { [name: string]: string }): void;
  end(data?: string): void;
}

// Augment @types/meteor with the members this package attaches to Meteor.
declare namespace Meteor {
  var connection: SandstormClientConnection;
  var sandstormUser: () => SandstormUser | null;

  interface Connection {
    _sandstormUser?: SandstormUser | null;
    _sandstormSessionId?: string | null;
    _sandstormTabId?: string | null;
    sandstormUser?(this: Connection): SandstormUser | null | undefined;
    sandstormSessionId?(this: Connection): string | null | undefined;
    sandstormTabId?(this: Connection): string | null | undefined;
  }
}

// `WebApp.rawHandlers` is not covered by this version of @types/meteor.
declare namespace WebApp {
  var rawHandlers: {
    use(
      handler: (
        req: SandstormHttpRequest,
        res: SandstormHttpResponse,
        next: () => void,
      ) => void,
    ): void;
  };
}
