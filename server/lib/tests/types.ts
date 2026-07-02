// Shared types for the server/lib test suites.

// The shape of an error captured from a `try { ... } catch` in the tests. It
// covers both native Errors (`message`) and Meteor.Error instances (`error`,
// `reason`), which the security/permission tests assert on interchangeably.
export interface CaughtError {
  error?: string;
  reason?: string;
  message?: string;
}
