// Shared, cross-cutting types for the wekan-ldap package.

// A value returned for an LDAP attribute. Depending on the attribute and how it
// is requested, ldapts returns either string(s) or raw Buffer(s).
export type LdapValue = string | string[] | Buffer | Buffer[];

// A directory entry as produced by LDAP.extractLdapEntryData(): the original
// ldapts entry keyed by attribute name (with Buffers stringified), plus a `_raw`
// copy that preserves the untouched values.
export interface LdapUser {
  _raw: Record<string, LdapValue>;
  // LDAP entries expose arbitrary attributes whose names are only known at
  // runtime and whose value types depend on the directory schema, so the
  // attribute index is intentionally typed as `any`.
  [attribute: string]: any;
}

// The identifier used to correlate a directory entry with a Wekan account,
// produced by getLdapUserUniqueID().
export interface LdapUniqueId {
  attribute: string;
  value: string;
}
