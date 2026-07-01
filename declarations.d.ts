// Ambient declarations for the Wekan Meteor app's TypeScript migration.
//
// This file provides types for:
//   1. Community `meteor/*` packages that `@types/meteor` does not cover.
//   2. Wekan app-level globals referenced by the migrated `config/` files.
//
// It is intentionally scoped to what the currently-migrated files need; later
// migration sessions are expected to extend it as more layers are converted.

/// <reference types="meteor" />

// ---------------------------------------------------------------------------
// Shared route-handling types (used by both FlowRouter routes and the
// AccountsTemplates `ensureSignedIn` trigger).
// ---------------------------------------------------------------------------

/** Data passed to a FlowRouter layout render call. */
interface WekanRouteRenderData {
  headerBar?: string;
  content?: string;
}

/** The `this` context / context argument of a FlowRouter route action. */
interface WekanRouteContext {
  path: string;
  params: Record<string, string>;
  render(template: string, data?: WekanRouteRenderData): void;
}

/** A FlowRouter enter/exit trigger. */
type WekanRouteTrigger = (
  context: WekanRouteContext,
  redirect: (path: string) => void,
) => void;

// ---------------------------------------------------------------------------
// Community Meteor packages not covered by @types/meteor.
// ---------------------------------------------------------------------------

// ostrio:flow-router-extra — the router used throughout the Wekan client.
declare module 'meteor/ostrio:flow-router-extra' {
  interface FlowRouteDefinition {
    name?: string;
    triggersEnter?: WekanRouteTrigger[];
    triggersExit?: WekanRouteTrigger[];
    action?: (this: WekanRouteContext, params: Record<string, string>) => void;
  }

  interface FlowRouterTriggers {
    enter(triggers: WekanRouteTrigger[]): void;
    exit(triggers: WekanRouteTrigger[]): void;
  }

  interface FlowRouterStatic {
    triggers: FlowRouterTriggers;
    route(path: string, definition: FlowRouteDefinition): void;
    go(pathName: string, params?: Record<string, string>): void;
    path(pathName: string, params?: Record<string, string>): string;
    reload(): void;
    getRouteName(): string;
    getQueryParam(key: string): string;
  }

  const FlowRouter: FlowRouterStatic;
  export { FlowRouter };
}

// ---------------------------------------------------------------------------
// Wekan app-level globals referenced by config/ files.
// ---------------------------------------------------------------------------

/** A single field descriptor managed by useraccounts / AccountsTemplates. */
interface AccountsTemplatesField {
  _id?: string;
  type?: string;
  displayName?: string;
  required?: boolean;
  minLength?: number;
  autocomplete?: string;
  template?: string;
}

/** Error object surfaced to the AccountsTemplates `onSubmitHook`. */
interface AccountsTemplatesError {
  reason?: string;
  message?: string;
  details?: Record<string, string | string[]>;
}

interface AccountsTemplatesTexts {
  title?: Record<string, string>;
}

interface AccountsTemplatesConfigureOptions {
  defaultLayout?: string;
  defaultContentRegion?: string;
  confirmPassword?: boolean;
  enablePasswordChange?: boolean;
  sendVerificationEmail?: boolean;
  showForgotPasswordLink?: boolean;
  forbidClientAccountCreation?: boolean;
  homeRoutePath?: string;
  texts?: AccountsTemplatesTexts;
  onSubmitHook?: (error: AccountsTemplatesError | null, state: string) => void;
  onLogoutHook?: () => void;
}

interface AccountsTemplatesRouteOptions {
  redirect?: () => void;
}

interface AccountsTemplatesStatic {
  removeField(fieldId: string): AccountsTemplatesField;
  addFields(fields: AccountsTemplatesField[]): void;
  configure(options: AccountsTemplatesConfigureOptions): void;
  configureRoute(route: string, options?: AccountsTemplatesRouteOptions): void;
  ensureSignedIn: WekanRouteTrigger;
}

declare const AccountsTemplates: AccountsTemplatesStatic;

/** Wekan's global modal helper. */
interface WekanModalStatic {
  open(
    template: string,
    options?: { header?: string; onCloseGoTo?: string },
  ): void;
  back(): void;
}

declare const Modal: WekanModalStatic;
