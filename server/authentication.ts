import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { ReactiveCache } from '/imports/reactiveCache';

// Authentication helpers — exported for use by API routes and model files
export const Authentication = {
  async checkUserId(userId: string | undefined) {
    if (userId === undefined) {
      const error = new Meteor.Error('Unauthorized', 'Unauthorized');
      error.statusCode = 401;
      throw error;
    }
    const admin = await ReactiveCache.getUser({ _id: userId, isAdmin: true });

    if (admin === undefined) {
      const error = new Meteor.Error('Forbidden', 'Forbidden');
      error.statusCode = 403;
      throw error;
    }
  },

  // This will only check if the user is logged in.
  // The authorization checks for the user will have to be done inside each API endpoint
  checkLoggedIn(userId: string | null | undefined) {
    if (userId === undefined) {
      const error = new Meteor.Error('Unauthorized', 'Unauthorized');
      error.statusCode = 401;
      throw error;
    }
  },

  // An admin should be authorized to access everything, so we use a separate check for admins
  // This throws an error if otherReq is false and the user is not an admin
  async checkAdminOrCondition(userId: string | null | undefined, otherReq: boolean | null | undefined) {
    if (otherReq) return;
    const admin = await ReactiveCache.getUser({ _id: userId, isAdmin: true });
    if (admin === undefined) {
      const error = new Meteor.Error('Forbidden', 'Forbidden');
      error.statusCode = 403;
      throw error;
    }
  },

  // Helper function. Will throw an error if the user is not active BoardAdmin or active Normal user of the board.
  async checkBoardAccess(userId: string | undefined, boardId: string) {
    Authentication.checkLoggedIn(userId);
    const board = await ReactiveCache.getBoard(boardId);
    Authentication.checkBoardExists(board);
    const normalAccess = board.members.some((e: BoardMember) => e.userId === userId && e.isActive && !e.isNoComments && !e.isCommentOnly && !e.isWorker);
    await Authentication.checkAdminOrCondition(userId, normalAccess);
  },

  // Helper function. Will throw an error if the user does not have write access to the board (excludes read-only users).
  async checkBoardWriteAccess(userId: string | null | undefined, boardId: string) {
    Authentication.checkLoggedIn(userId);
    const board = await ReactiveCache.getBoard(boardId);
    Authentication.checkBoardExists(board);
    const writeAccess = board.members.some((e: BoardMember) => e.userId === userId && e.isActive && !e.isNoComments && !e.isCommentOnly && !e.isWorker && !e.isReadOnly && !e.isReadAssignedOnly);
    await Authentication.checkAdminOrCondition(userId, writeAccess);
  },

  // Helper function. Will throw an error if the user is not a board admin.
  async checkBoardAdmin(userId: string | undefined, boardId: string) {
    Authentication.checkLoggedIn(userId);
    const board = await ReactiveCache.getBoard(boardId);
    Authentication.checkBoardExists(board);
    const adminAccess = board.members.some((e: BoardMember) => e.userId === userId && e.isActive && e.isAdmin);
    await Authentication.checkAdminOrCondition(userId, adminAccess);
  },

  // Helper function. Throws a 404 error when the board does not exist, so REST
  // handlers return HTTP 404 instead of crashing on `board.members` of an
  // undefined board (which surfaced as a generic HTTP 500). See #5804.
  checkBoardExists(board: BoardDoc | null | undefined) {
    if (!board) {
      const error = new Meteor.Error('NotFound', 'Board not found');
      error.statusCode = 404;
      throw error;
    }
  },
};

Meteor.startup(() => {
  Accounts.validateLoginAttempt(function(options: { user?: LoginUser }) {
    const user = options.user || ({} as LoginUser);
    return !user.loginDisabled;
  });

  if (Meteor.isServer) {
    if (
      process.env.ORACLE_OIM_ENABLED === 'true' ||
      // Pre-existing dead comparison (env vars are strings); widen so the
      // boolean literal comparison type-checks without changing behavior.
      (process.env.ORACLE_OIM_ENABLED as string | boolean) === true
    ) {
      ServiceConfiguration.configurations.upsertAsync(
        // eslint-disable-line no-undef
        { service: 'oidc' },
        {
          $set: {
            loginStyle: process.env.OAUTH2_LOGIN_STYLE || 'redirect',
            clientId: process.env.OAUTH2_CLIENT_ID,
            secret: process.env.OAUTH2_SECRET,
            serverUrl: process.env.OAUTH2_SERVER_URL,
            authorizationEndpoint: process.env.OAUTH2_AUTH_ENDPOINT,
            userinfoEndpoint: process.env.OAUTH2_USERINFO_ENDPOINT,
            tokenEndpoint: process.env.OAUTH2_TOKEN_ENDPOINT,
            idTokenWhitelistFields:
              process.env.OAUTH2_ID_TOKEN_WHITELIST_FIELDS || [],
            requestPermissions: process.env.OAUTH2_REQUEST_PERMISSIONS,
          },
        },
      );
    } else if (
      process.env.OAUTH2_ENABLED === 'true' ||
      // Pre-existing dead comparison (env vars are strings); widen so the
      // boolean literal comparison type-checks without changing behavior.
      (process.env.OAUTH2_ENABLED as string | boolean) === true
    ) {
      ServiceConfiguration.configurations.upsertAsync(
        // eslint-disable-line no-undef
        { service: 'oidc' },
        {
          $set: {
            loginStyle: process.env.OAUTH2_LOGIN_STYLE || 'redirect',
            clientId: process.env.OAUTH2_CLIENT_ID,
            secret: process.env.OAUTH2_SECRET,
            serverUrl: process.env.OAUTH2_SERVER_URL,
            authorizationEndpoint: process.env.OAUTH2_AUTH_ENDPOINT,
            userinfoEndpoint: process.env.OAUTH2_USERINFO_ENDPOINT,
            tokenEndpoint: process.env.OAUTH2_TOKEN_ENDPOINT,
            idTokenWhitelistFields:
              process.env.OAUTH2_ID_TOKEN_WHITELIST_FIELDS || [],
            requestPermissions: process.env.OAUTH2_REQUEST_PERMISSIONS,
          },
          // OAUTH2_ID_TOKEN_WHITELIST_FIELDS || [],
          // OAUTH2_REQUEST_PERMISSIONS || 'openid profile email',
        },
        );
    } else if (
      process.env.CAS_ENABLED === 'true' ||
      // Pre-existing dead comparison (env vars are strings); widen so the
      // boolean literal comparison type-checks without changing behavior.
      (process.env.CAS_ENABLED as string | boolean) === true
    ) {
      ServiceConfiguration.configurations.upsertAsync(
        // eslint-disable-line no-undef
        { service: 'cas' },
        {
          $set: {
            baseUrl: process.env.CAS_BASE_URL,
            loginUrl: process.env.CAS_LOGIN_URL,
            serviceParam: 'service',
            popupWidth: 810,
            popupHeight: 610,
            popup: true,
            autoClose: true,
            validateUrl: process.env.CASE_VALIDATE_URL,
            casVersion: 3.0,
            attributes: {
              debug: process.env.DEBUG === 'true',
            },
          },
        },
      );
    } else if (
      process.env.SAML_ENABLED === 'true' ||
      // Pre-existing dead comparison (env vars are strings); widen so the
      // boolean literal comparison type-checks without changing behavior.
      (process.env.SAML_ENABLED as string | boolean) === true
    ) {
      ServiceConfiguration.configurations.upsertAsync(
        // eslint-disable-line no-undef
        { service: 'saml' },
        {
          $set: {
            provider: process.env.SAML_PROVIDER,
            entryPoint: process.env.SAML_ENTRYPOINT,
            issuer: process.env.SAML_ISSUER,
            cert: process.env.SAML_CERT,
            idpSLORedirectURL: process.env.SAML_IDPSLO_REDIRECTURL,
            privateKeyFile: process.env.SAML_PRIVATE_KEYFILE,
            publicCertFile: process.env.SAML_PUBLIC_CERTFILE,
            identifierFormat: process.env.SAML_IDENTIFIER_FORMAT,
            localProfileMatchAttribute:
              process.env.SAML_LOCAL_PROFILE_MATCH_ATTRIBUTE,
            attributesSAML: process.env.SAML_ATTRIBUTES || [
              'sn',
              'givenName',
              'mail',
            ],

            /*
            settings = {"saml":[{
              "provider":"openam",
              "entryPoint":"https://openam.idp.io/openam/SSORedirect/metaAlias/zimt/idp",
              "issuer": "https://sp.zimt.io/", //replace with url of your app
              "cert":"MIICizCCAfQCCQCY8tKaMc0 LOTS OF FUNNY CHARS ==",
              "idpSLORedirectURL": "http://openam.idp.io/openam/IDPSloRedirect/metaAlias/zimt/idp",
              "privateKeyFile": "certs/mykey.pem",  // path is relative to $METEOR-PROJECT/private
              "publicCertFile": "certs/mycert.pem",  // eg $METEOR-PROJECT/private/certs/mycert.pem
              "dynamicProfile": true // set to true if we want to create a user in Meteor.users dynamically if SAML assertion is valid
              "identifierFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified", // Defaults to urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress
              "localProfileMatchAttribute": "telephoneNumber" // CAUTION: this will be mapped to profile.<localProfileMatchAttribute> attribute in Mongo if identifierFormat (see above) differs from urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress,
              "attributesSAML": [telephoneNumber, sn, givenName, mail], // attrs from SAML attr statement, which will be used for local Meteor profile creation. Currently no real attribute mapping. If required use mapping on IdP side.
            }]}
            */
          },
        },
      );
    }
  }
});

// A board member entry, with the access-restriction flags the Authentication
// helpers consult when deciding board access.
interface BoardMember {
  userId: string;
  isActive?: boolean;
  isAdmin?: boolean;
  isNoComments?: boolean;
  isCommentOnly?: boolean;
  isWorker?: boolean;
  isReadOnly?: boolean;
  isReadAssignedOnly?: boolean;
}

// The subset of a board document checkBoardExists guards on.
interface BoardDoc {
  members?: BoardMember[];
}

// The subset of the user document validateLoginAttempt inspects.
interface LoginUser {
  loginDisabled?: boolean;
}
