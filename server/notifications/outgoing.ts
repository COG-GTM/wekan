import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { ReactiveCache } from '/imports/reactiveCache';
import { TAPi18n } from '/imports/i18n';
import { fetchSafe } from '/server/lib/ssrfGuard';
import CardComments from '/models/cardComments';
import Integrations from '/models/integrations';

const Lock = {
    // Maps a comment id to its current lock value: either the comment text
    // (string) being echoed or a numeric sentinel.
    _lock: {} as { [id: string]: string | number },
    _timer: {} as { [id: string]: number },
    echoDelay: 500, // echo should be happening much faster
    normalDelay: 1e3, // normally user typed comment will be much slower
    ECHO: 2,
    NORMAL: 1,
    NULL: 0,
    has(id: string, value: string | number) {
      const existing = this._lock[id];
      let ret = this.NULL;
      if (existing) {
        ret = existing === value ? this.ECHO : this.NORMAL;
      }
      return ret;
    },
    clear(id: string, delay: number) {
      const previous = this._timer[id];
      if (previous) {
        Meteor.clearTimeout(previous);
      }
      this._timer[id] = Meteor.setTimeout(() => this.unset(id), delay);
    },
    set(id: string, value: string | number) {
      const state = this.has(id, value);
      let delay = this.normalDelay;
      if (state === this.ECHO) {
        delay = this.echoDelay;
      }
      if (!value) {
        // user commented, we set a lock
        value = 1;
      }
      this._lock[id] = value;
      this.clear(id, delay); // always auto reset the locker after delay
    },
    unset(id: string) {
      delete this._lock[id];
    },
  };

  const webhooksAtbts = (process.env.WEBHOOKS_ATTRIBUTES &&
    process.env.WEBHOOKS_ATTRIBUTES.split(',')) || [
    'cardId',
    'listId',
    'oldListId',
    'boardId',
    'comment',
    'user',
    'card',
    'commentId',
    'swimlaneId',
    'customField',
    'customFieldValue',
    'labelId',
    'label',
    'attachmentId',
  ];
  // `data` is the untrusted JSON body returned by a webhook and `integration`
  // is the caller-supplied integration document; both are dynamic shapes, hence
  // `any`.
  const responseFunc = async (data: any, integration: any) => {
    const paramCommentId = data.commentId;
    const paramCardId = data.cardId;
    const paramBoardId = data.boardId;
    const newComment = data.comment;

    // Authorization: Verify the request is from a bidirectional webhook.
    // `Integrations.Const` is a runtime static attached to the collection (see
    // models/integrations), not part of the typed Mongo.Collection, hence `any`.
    if (!integration || integration.type !== (Integrations as any).Const.TWOWAY) {
      return; // Only bidirectional webhooks can update comments
    }

    // Authorization: Prevent cross-board comment injection
    if (paramBoardId !== integration.boardId) {
      return; // Webhook can only modify comments in its own board
    }

    if (paramCardId && paramBoardId && newComment && paramCommentId) {
      // only process data with the commentId, cardId, boardId and comment text
      const comment = await ReactiveCache.getCardComment({
        _id: paramCommentId,
        cardId: paramCardId,
        boardId: paramBoardId,
      });
      const board = await ReactiveCache.getBoard(paramBoardId);
      const card = await ReactiveCache.getCard(paramCardId);

      if (board && card && comment) {
        // Only update existing comments - do not create new comments from webhook responses
        Lock.set(comment._id, newComment);
        await CardComments.direct.updateAsync(comment._id, {
          $set: {
            text: newComment,
          },
        });
      }
    }
  };
Meteor.methods({
    // `integration` and `params` are caller-supplied dynamic shapes (validated
    // at runtime via `check` below), hence `any`.
    async outgoingWebhooks(integration: any, description: string, params: any) {
      if (this.userId) {
        // `check(x, Object)` asserts `x is object`, which would strip the
        // dynamic `any` shape these payloads need; casting the checked value to
        // `object` keeps the runtime validation while preventing that narrowing.
        check(integration as object, Object);
        check(description, String);
        check(params as object, Object);
        this.unblock();

        // label activity did not work yet, see wekan/models/activities.js
        const quoteParams = { ...params };
        const clonedParams = { ...params };
        [
          'card',
          'list',
          'oldList',
          'board',
          'oldBoard',
          'comment',
          'checklist',
          'swimlane',
          'oldSwimlane',
          'labelId',
          'label',
          'attachment',
          'attachmentId',
        ].forEach(key => {
          if (quoteParams[key]) quoteParams[key] = `"${params[key]}"`;
        });

        const userId = params.userId || integration.userId || this.userId;
        const user = await ReactiveCache.getUser(userId);
        if (!user || typeof user.getLanguage !== 'function') {
          return;
        }
        // #5875: load the recipient's language bundle on the server before
        // translating, otherwise it falls back to English.
        await TAPi18n.ensureLanguageLoaded(user.getLanguage());
        const descriptionText = TAPi18n.__(
          description,
          quoteParams,
          user.getLanguage(),
        );

        // If you don't want a hook, set the webhook description to "-".
        if (descriptionText === "-") return;

        const text = `${params.user} ${descriptionText}\n${params.url}`;

        if (text.length === 0) return;

        // Webhook payload assembled from a dynamic set of activity attributes.
        const value: { [key: string]: any } = {
          text: `${text}`,
        };

        webhooksAtbts.forEach(key => {
          if (params[key]) value[key] = params[key];
        });
        value.description = description;
        //integrations.forEach(integration => {
        const is2way = integration.type === (Integrations as any).Const.TWOWAY;
        const token = integration.token || '';
        const fetchHeaders: { [key: string]: string } = {
          'Content-Type': 'application/json',
        };
        if (token) fetchHeaders['X-Wekan-Token'] = token;

        // The `integration` object is supplied by the caller and must not be
        // trusted: verify a matching integration actually exists on its board
        // AND that the caller is a member of that board. Otherwise any
        // authenticated user could drive webhooks (and, via the two-way
        // response path below, overwrite comments) on boards they cannot access.
        const storedIntegration = await ReactiveCache.getIntegration({
          url: integration.url,
          boardId: integration.boardId,
        });
        if (!storedIntegration) return;
        const integrationBoard = await ReactiveCache.getBoard(storedIntegration.boardId);
        if (!integrationBoard || !integrationBoard.hasMember(this.userId)) return;

        const url = integration.url;

        if (is2way) {
          const cid = params.commentId;
          const comment = params.comment;
          const lockState = cid && Lock.has(cid, comment);
          if (cid && lockState !== Lock.NULL) {
            // it's a comment  and there is a previous lock
            return;
          } else if (cid) {
            Lock.set(cid, comment); // set a lock here
          }
        }

        // fetchSafe resolves DNS once, pins the connection to the resolved IP,
        // and blocks redirects — fully preventing DNS-rebinding SSRF attacks.
        let response;
        try {
          response = await fetchSafe(url, {
            method: 'POST',
            headers: fetchHeaders,
            body: JSON.stringify(is2way ? { description, ...clonedParams } : value),
          });
        } catch (err: any) {
          // `err` is a thrown fetch/network error of unknown concrete type; we
          // only read its `.message`, so it is typed `any`.
          throw new Meteor.Error(
            'invalid-webhook-url',
            `Webhook request failed: ${err.message}`,
          );
        }

        // `SafeResponse.status` is typed optional, but fetchSafe always sets it
        // on a resolved response; assert non-null to keep the original check.
        if (response && response.status! >= 200 && response.status! < 300) {
          if (is2way) {
            // Only act on a JSON-encoded response body
            let data = null;
            try {
              data = await response.json();
            } catch {
              data = null;
            }
            if (data) {
              try {
                await responseFunc(data, integration);
              } catch (e) {
                throw new Meteor.Error('error-process-data');
              }
            }
          }
          return response; // eslint-disable-line consistent-return
        } else {
          throw new Meteor.Error('error-invalid-webhook-response');
        }
      }
    },
  });
