// Pure, dependency-free helpers for per-user announcement dismissal (#6051).
// The implementation lives in models/announcements.js (an isomorphic model
// file) so client and server share identical logic. This module re-exports the
// pure functions at the documented test path and is itself free of any
// Meteor/Mongo runtime dependency.
import { announcementVersion as computeAnnouncementVersion } from '/models/announcements';

export { shouldShowAnnouncement } from '/models/announcements';

// Re-export announcementVersion with the looser input type that reflects its
// real contract: the function guards against a missing document/`_id` and only
// reads `_id`/`title`/`body`, so a partial announcement (as passed by the unit
// tests and other callers) is valid input. The runtime value is the exact same
// function; only the parameter type is widened.
export const announcementVersion = computeAnnouncementVersion as (
  announcement: AnnouncementVersionInput | null | undefined,
) => string | null;

// The announcement fields consulted when computing its version fingerprint.
interface AnnouncementVersionInput {
  _id?: string;
  title?: string;
  body?: string;
}
