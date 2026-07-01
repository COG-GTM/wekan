// resetPasswordEmail.js
//
// Pure, Meteor-free helpers backing the password-reset / verify-email /
// enroll-account email templates and send path. Extracted from
// config/accounts.js so the #5706 hardening can be unit-tested in plain Node
// (see tests/unit/resetPasswordEmail.test.js).
//
// #5706: "Internal Server Error (500) when attempting to reset a password".
// Two root causes are addressed here:
//   1. The email-template builders must never throw. The `user` argument from
//      accounts-password is normally a transformed Wekan user (with
//      getName()/getLanguage() from collection-helpers), but we must not assume
//      so: missing helpers or missing profile fields must not bubble up as a 500.
//   2. When SMTP is not configured (no MAIL_URL / MAIL_FROM, or a bad mail
//      server), Email.sendAsync throws and the exception otherwise propagates out
//      of Meteor's `forgotPassword` method as a raw HTTP 500. We wrap the send so
//      it surfaces as a clean, catchable error instead.

// Resolve the display name for a user without ever throwing.
// Prefers the collection-helper getName(), then profile.fullname, then username.
function safeUserName(user: ResetUser | null | undefined) {
  // Prefer the collection-helper getName(), but if it is missing or throws, fall
  // through to the raw profile/username so a registered user still gets a name.
  try {
    if (user && typeof user.getName === 'function') {
      return user.getName();
    }
  } catch (e) {
    // fall through to the profile-based fallback below
  }
  try {
    const profile: ResetUserProfile = (user && user.profile) || {};
    return profile.fullname || (user && user.username) || '';
  } catch (e) {
    return '';
  }
}

// Resolve the language for a user without ever throwing. Falls back to 'en'.
function safeUserLanguage(user: ResetUser | null | undefined) {
  // Prefer the collection-helper getLanguage(), but if it is missing or throws,
  // fall through to the raw profile language, defaulting to English.
  try {
    if (user && typeof user.getLanguage === 'function') {
      return user.getLanguage();
    }
  } catch (e) {
    // fall through to the profile-based fallback below
  }
  try {
    const profile: ResetUserProfile = (user && user.profile) || {};
    return profile.language || 'en';
  } catch (e) {
    return 'en';
  }
}

// Build one localized email-template field (subject/text) for the given i18n
// key `str` (e.g. 'resetPassword-text'). `translate` is the TAPi18n.__-style
// function (key, params, language) => string. Never throws: on any failure it
// returns a minimal, safe fallback so the caller cannot produce an HTTP 500.
function buildEmailTemplateField(
  str: string,
  translate: TranslateFn,
  siteName: string,
  user: ResetUser | null | undefined,
  url: string,
) {
  try {
    return translate(
      `email-${str}`,
      {
        url,
        user: safeUserName(user),
        siteName,
      },
      safeUserLanguage(user),
    );
  } catch (e) {
    // Last-resort fallback: never let a translation/render error become a 500.
    return `${str}: ${url}`;
  }
}

// Wrap an async reset-password email sender so any failure (SMTP misconfig,
// missing MAIL_URL/MAIL_FROM, mail server error) is converted via `makeError`
// into a clean, catchable error instead of an unhandled exception (HTTP 500).
// `makeError(code, message)` builds the thrown error (e.g. new Meteor.Error).
function wrapSendResetPasswordEmail(originalSend: SendResetPasswordEmail | null | undefined, makeError: MakeResetError) {
  if (typeof originalSend !== 'function') {
    return originalSend;
  }
  // `this` and `args` are forwarded verbatim to the wrapped Meteor send
  // function, whose signature is arbitrary, so `any` is unavoidable here.
  return async function wrappedSendResetPasswordEmail(this: any, ...args: any[]) {
    try {
      return await originalSend.apply(this, args);
    } catch (e) {
      throw makeError(
        'email-fail',
        (e && e.message) || 'Failed to send the password reset email.',
      );
    }
  };
}

export {
  safeUserName,
  safeUserLanguage,
  buildEmailTemplateField,
  wrapSendResetPasswordEmail,
};

interface ResetUserProfile {
  fullname?: string;
  language?: string;
}

interface ResetUser {
  getName?: () => string;
  getLanguage?: () => string;
  profile?: ResetUserProfile;
  username?: string;
}

type TranslateFn = (key: string, params: object, language: string) => string;

// The wrapped sender comes from accounts-password and takes arbitrary
// arguments, so `any` is unavoidable here.
type SendResetPasswordEmail = (this: any, ...args: any[]) => Promise<any>;

type MakeResetError = (code: string, message: string) => Error;
