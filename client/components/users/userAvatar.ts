import { ReactiveCache } from '/imports/reactiveCache';
import { ReactiveVar } from 'meteor/reactive-var';
import { avatarUpdateCounter } from '/client/components/users/avatarUpdateCounter';
import Avatars from '/models/avatars';
import Presences from '/models/presences';
import { Utils } from '/client/lib/utils';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';

Template.userAvatar.helpers({
  userData(this: any) {
    const user = ReactiveCache.getUser(this.userId, {
      fields: {
        profile: 1,
        username: 1,
      },
    });
    return user;
  },

  avatarUrl(this: any) {
    const user = ReactiveCache.getUser(this.userId, { fields: { profile: 1 } });
    const base = (user && user.profile && user.profile.avatarUrl) || '';
    if (!base) return '';
    // Append current boardId when available so public viewers can access avatars on public boards
    try {
      const boardId = Utils.getCurrentBoardId && Utils.getCurrentBoardId();
      if (boardId) {
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}boardId=${encodeURIComponent(boardId)}`;
      }
    } catch (_) {}
    return base;
  },

  memberType(this: any) {
    const user = ReactiveCache.getUser(this.userId);
    if (!user) return '';

    const board = Utils.getCurrentBoard();
    if (!board) return '';

    // Return role in priority order: Admin, Normal, NormalAssignedOnly, NoComments, CommentOnly, CommentAssignedOnly, Worker, ReadOnly, ReadAssignedOnly
    if (user.isBoardAdmin()) return 'admin';
    if (board.hasReadAssignedOnly(user._id)) return 'read-assigned-only';
    if (board.hasReadOnly(user._id)) return 'read-only';
    if (board.hasWorker(user._id)) return 'worker';
    if (board.hasCommentAssignedOnly(user._id)) return 'comment-assigned-only';
    if (board.hasCommentOnly(user._id)) return 'comment-only';
    if (board.hasNoComments(user._id)) return 'no-comments';
    if (board.hasNormalAssignedOnly(user._id)) return 'normal-assigned-only';
    return 'normal';
  },

/*
  presenceStatusClassName() {
    const user = ReactiveCache.getUser(this.userId);
    const userPresence = Presences.findOne({ userId: this.userId });
    if (user && user.isInvitedTo(Session.get('currentBoard'))) return 'pending';
    else if (!userPresence) return 'disconnected';
    else if (Session.equals('currentBoard', userPresence.state.currentBoardId))
      return 'active';
    else return 'idle';
  },
*/

});

Template.userAvatarInitials.helpers({
  initials(this: any) {
    const user = ReactiveCache.getUser(this.userId);
    return user && user.getInitials();
  },

  viewPortWidth(this: any) {
    const user = ReactiveCache.getUser(this.userId);
    return ((user && user.getInitials().length) || 1) * 12;
  },
});

Template.boardOrgRow.onCreated(function (this: BoardRowInstance) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);
  this.findOrgsOptions = new ReactiveVar({});

  this.page = new ReactiveVar(1);
  this.autorun(() => {
    const limitOrgs = this.page.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('org', this.findOrgsOptions.get(), limitOrgs, () => {});
  });
});

Template.boardOrgRow.onRendered(function (this: BoardRowInstance) {
  this.loading.set(false);
});

Template.boardOrgRow.helpers({
  isLoading() {
    return (Template.instance() as BoardRowInstance).loading.get();
  },
  orgData(this: any) {
    return ReactiveCache.getOrg(this.orgId);
  },
});

Template.boardOrgRow.events({
  'keyup input'(event: JQuery.TriggeredEvent, tpl: BoardRowInstance) {
    tpl.error.set('');
  },
  'click .js-manage-board-removeOrg': Popup.open('removeBoardOrg'),
});

Template.boardOrgName.helpers({
  orgName(this: any) {
    const org = ReactiveCache.getOrg(this.orgId);
    return org && org.orgDisplayName;
  },

  orgViewPortWidth(this: any) {
    const org = ReactiveCache.getOrg(this.orgId);
    return ((org && org.orgDisplayName.length) || 1) * 12;
  },
});

Template.boardTeamRow.onCreated(function (this: BoardRowInstance) {
  this.error = new ReactiveVar('');
  this.loading = new ReactiveVar(false);
  this.findOrgsOptions = new ReactiveVar({});

  this.page = new ReactiveVar(1);
  this.autorun(() => {
    const limitTeams = this.page.get() * Number.MAX_SAFE_INTEGER;
    this.subscribe('team', this.findOrgsOptions.get(), limitTeams, () => {});
  });
});

Template.boardTeamRow.onRendered(function (this: BoardRowInstance) {
  this.loading.set(false);
});

Template.boardTeamRow.helpers({
  isLoading() {
    return (Template.instance() as BoardRowInstance).loading.get();
  },
  teamData(this: any) {
    return ReactiveCache.getTeam(this.teamId);
  },
});

Template.boardTeamRow.events({
  'keyup input'(event: JQuery.TriggeredEvent, tpl: BoardRowInstance) {
    tpl.error.set('');
  },
  'click .js-manage-board-removeTeam': Popup.open('removeBoardTeam'),
});

Template.boardTeamName.helpers({
  teamName(this: any) {
    const team = ReactiveCache.getTeam(this.teamId);
    return team && team.teamDisplayName;
  },

  teamViewPortWidth(this: any) {
    const team = ReactiveCache.getTeam(this.teamId);
    return ((team && team.teamDisplayName.length) || 1) * 12;
  },
});

// #5850: row showing a single board email-domain share, with a remove affordance.
Template.boardDomainRow.helpers({
  domainViewPortWidth(this: any) {
    return ((this.domain && this.domain.length) || 1) * 12;
  },
});

Template.boardDomainRow.events({
  // The row's data context is `{ domain }`, which becomes removeBoardDomainPopup's
  // data context, so the popup can read `this.domain` directly.
  'click .js-manage-board-removeDomain': Popup.open('removeBoardDomain'),
});

Template.changeAvatarPopup.onCreated(function (this: ChangeAvatarPopupInstance) {
  this.error = new ReactiveVar('');
  this.avatarUpdateCounter = new ReactiveVar(0);  // Trigger to force helper re-evaluation
  // Whether an admin has blocked avatar uploads (Admin Panel > Attachments >
  // Transfer limits). Default false (avatars enabled); when true the upload
  // option is hidden and the upload is also rejected server-side.
  this.avatarUploadBlocked = new ReactiveVar(false);
  // err/blocked: any — untyped Meteor method callback (Meteor.Error / method return).
  Meteor.call('isAvatarUploadBlocked', (err: any, blocked: any) => {
    if (!err) this.avatarUploadBlocked.set(blocked === true);
  });
  Meteor.subscribe('my-avatars');
});

Template.changeAvatarPopup.helpers({
  error() {
    return (Template.instance() as ChangeAvatarPopupInstance).error;
  },
  avatarUploadBlocked() {
    return (Template.instance() as ChangeAvatarPopupInstance).avatarUploadBlocked.get();
  },
  uploadedAvatars() {
    (Template.instance() as ChangeAvatarPopupInstance).avatarUpdateCounter.get();  // Create dependency on update counter
    const ret = ReactiveCache.getAvatars({ userId: Meteor.userId() }, {}, true);
    return ret;
  },
  avatarLink(this: any) {
    if (this && typeof this.link === 'function') {
      return this.link();
    }
    return '';
  },
  isSelected(this: any) {
    (Template.instance() as ChangeAvatarPopupInstance).avatarUpdateCounter.get();  // Create dependency on update counter
    const userProfile = ReactiveCache.getCurrentUser().profile;
    const avatarUrl = userProfile && userProfile.avatarUrl;
    const currentAvatarUrl = this.link && typeof this.link === 'function' ? this.link() : '';
    // Normalize URLs by removing query parameters for comparison
    // (they may be added for boardId but shouldn't affect selection comparison)
    const normalizeUrl = (url: string) => url ? url.split('?')[0] : '';
    return normalizeUrl(avatarUrl) === normalizeUrl(currentAvatarUrl);
  },
  noAvatarUrl() {
    (Template.instance() as ChangeAvatarPopupInstance).avatarUpdateCounter.get();  // Create dependency on update counter
    const userProfile = ReactiveCache.getCurrentUser().profile;
    const avatarUrl = userProfile && userProfile.avatarUrl;
    return !avatarUrl;
  },
});

function changeAvatarSetAvatar(tpl: ChangeAvatarPopupInstance, avatarUrl: string) {
  // err: any — untyped Meteor.call rejection (Meteor.Error).
  Meteor.call('setAvatarUrl', avatarUrl, (err: any) => {
    if (err) {
      tpl.error.set(err.reason || 'Error setting avatar');
    } else {
      // Trigger a re-evaluation of helpers to show updated avatar selection
      const counter = tpl.avatarUpdateCounter.get();
      tpl.avatarUpdateCounter.set(counter + 1);
      // Also increment global counter for admin people list updates
      avatarUpdateCounter.set(avatarUpdateCounter.get() + 1);
      // Clear input for next upload
      tpl.$('.js-upload-avatar-input').val('');
    }
  });
}

Template.changeAvatarPopup.events({
  'click .js-upload-avatar'(event: JQuery.TriggeredEvent, tpl: ChangeAvatarPopupInstance) {
    tpl.$('.js-upload-avatar-input').click();
  },
  async 'change .js-upload-avatar-input'(event: JQuery.TriggeredEvent, tpl: ChangeAvatarPopupInstance) {
    const inputEl = event.currentTarget as HTMLInputElement;
    if (inputEl.files && inputEl.files[0]) {
      const uploader = await Avatars.insertAsync(
        {
          file: inputEl.files[0],
          chunkSize: 'dynamic',
        },
        false,
      );
      // error/fileData/fileRef: any — ostrio:files uploader event payloads are untyped.
      uploader.on('error', (error: any, fileData: any) => {
        tpl.error.set(error.reason);
      });
      uploader.on('uploaded', (error: any, fileRef: any) => {
        if (!error) {
          // Trigger a re-evaluation of helpers to show new uploaded avatar
          const counter = tpl.avatarUpdateCounter.get();
          tpl.avatarUpdateCounter.set(counter + 1);
          // Also increment global counter for admin people list updates
          avatarUpdateCounter.set(avatarUpdateCounter.get() + 1);
        } else {
          tpl.error.set(error.reason);
        }
      });
      uploader.start();
    }
  },
  'click .js-select-avatar'(this: any, event: JQuery.TriggeredEvent, tpl: ChangeAvatarPopupInstance) {
    event.preventDefault();
    event.stopPropagation();
    if (this && typeof this.link === 'function') {
      const avatarUrl = this.link();
      changeAvatarSetAvatar(tpl, avatarUrl);
    }
  },
  'click .js-select-initials'(event: JQuery.TriggeredEvent, tpl: ChangeAvatarPopupInstance) {
    event.preventDefault();
    event.stopPropagation();
    changeAvatarSetAvatar(tpl, '');
  },
  'click .js-delete-avatar': Popup.afterConfirm('deleteAvatar', async function(this: any) {
    // Inside the each loop, 'this' is the avatar object
    const avatarId = this._id;
    if (avatarId) {
      await Avatars.removeAsync(avatarId);
    }
    Popup.back();
  }),
});

Template.cardMemberPopup.helpers({
  user(this: any) {
    return ReactiveCache.getUser(this.userId);
  },
});

Template.cardMemberPopup.events({
  'click .js-remove-member'(this: any) {
    ReactiveCache.getCard(this.cardId).unassignMember(this.userId);
    Popup.back();
  },
  'click .js-edit-profile': Popup.open('editProfile'),
});

Template.adminChangeAvatarPopup.onCreated(function (this: AdminChangeAvatarPopupInstance) {
  this.error = new ReactiveVar('');
  this.avatarUpdateCounter = new ReactiveVar(0);
  const userId = this.data._id || (this.data.user && this.data.user._id);
  this.targetUserId = userId;
  if (userId) {
    Meteor.subscribe('avatars-for-user', userId);
  }
});

Template.adminChangeAvatarPopup.helpers({
  error() {
    return (Template.instance() as AdminChangeAvatarPopupInstance).error;
  },
  userId(this: any) {
    const instance = Template.instance() as AdminChangeAvatarPopupInstance;
    return instance.targetUserId || (this._id || (this.user && this.user._id));
  },
  userData(this: any) {
    return this.user || this;
  },
  uploadedAvatars(this: any) {
    (Template.instance() as AdminChangeAvatarPopupInstance).avatarUpdateCounter.get();
    const instance = Template.instance() as AdminChangeAvatarPopupInstance;
    const userId = instance.targetUserId || (this._id || (this.user && this.user._id));
    if (!userId) return [];
    const ret = ReactiveCache.getAvatars({ userId: userId }, {}, true);
    return ret;
  },
  avatarLink(this: any) {
    if (this && typeof this.link === 'function') {
      return this.link();
    }
    return '';
  },
  currentEditingUser() {
    (Template.instance() as AdminChangeAvatarPopupInstance).avatarUpdateCounter.get();
    const instance = Template.instance() as AdminChangeAvatarPopupInstance;
    const userId = instance.targetUserId;
    if (!userId) return null;
    return ReactiveCache.getUser(userId);
  },
  isSelected(this: any) {
    (Template.instance() as AdminChangeAvatarPopupInstance).avatarUpdateCounter.get();
    const instance = Template.instance() as AdminChangeAvatarPopupInstance;
    const userId = instance.targetUserId;
    if (!userId) return false;
    const user = ReactiveCache.getUser(userId);
    if (!user) return false;
    const userProfile = user.profile;
    const avatarUrl = userProfile && userProfile.avatarUrl;
    const currentAvatarUrl = this.link && typeof this.link === 'function' ? this.link() : '';
    const normalizeUrl = (url: string) => url ? url.split('?')[0] : '';
    return normalizeUrl(avatarUrl) === normalizeUrl(currentAvatarUrl);
  },
  noAvatarUrl() {
    (Template.instance() as AdminChangeAvatarPopupInstance).avatarUpdateCounter.get();
    const instance = Template.instance() as AdminChangeAvatarPopupInstance;
    const userId = instance.targetUserId;
    if (!userId) return true;
    const user = ReactiveCache.getUser(userId);
    if (!user) return true;
    const userProfile = user.profile;
    const avatarUrl = userProfile && userProfile.avatarUrl;
    return !avatarUrl;
  },
});

function adminChangeAvatarSetAvatar(tpl: AdminChangeAvatarPopupInstance, avatarUrl: string) {
  const userId = tpl.targetUserId || (Template.currentData()._id || (Template.currentData().user && Template.currentData().user._id));
  if (!userId) {
    console.error('Cannot set avatar: no userId found');
    return;
  }
  // err: any — untyped Meteor.call rejection (Meteor.Error).
  Meteor.call('adminSetAvatarUrl', userId, avatarUrl, (err: any) => {
    if (err) {
      tpl.error.set(err.reason || 'Error setting avatar');
    } else {
      const counter = tpl.avatarUpdateCounter.get();
      tpl.avatarUpdateCounter.set(counter + 1);
      // Also increment global counter to update admin people list
      avatarUpdateCounter.set(avatarUpdateCounter.get() + 1);
      tpl.$('.js-upload-avatar-input').val('');
    }
  });
}

Template.adminChangeAvatarPopup.events({
  'click .js-upload-avatar'(event: JQuery.TriggeredEvent, tpl: AdminChangeAvatarPopupInstance) {
    tpl.$('.js-upload-avatar-input').click();
  },
  async 'change .js-upload-avatar-input'(this: any, event: JQuery.TriggeredEvent, tpl: AdminChangeAvatarPopupInstance) {
    const inputEl = event.currentTarget as HTMLInputElement;
    if (inputEl.files && inputEl.files[0]) {
      const userId = tpl.targetUserId || (this._id || (this.user && this.user._id));
      const uploader = await Avatars.insertAsync(
        {
          file: inputEl.files[0],
          chunkSize: 'dynamic',
          meta: {
            adminUploadForUserId: userId,
          },
        },
        false,
      );
      // error/fileData/fileRef: any — ostrio:files uploader event payloads are untyped.
      uploader.on('error', (error: any, fileData: any) => {
        tpl.error.set(error.reason);
      });
      uploader.on('uploaded', (error: any, fileRef: any) => {
        if (!error) {
          const counter = tpl.avatarUpdateCounter.get();
          tpl.avatarUpdateCounter.set(counter + 1);
          // Also increment global counter to update admin people list
          avatarUpdateCounter.set(avatarUpdateCounter.get() + 1);
        } else {
          tpl.error.set(error.reason);
        }
      });
      uploader.start();
    }
  },
  'click .js-select-avatar'(this: any, event: JQuery.TriggeredEvent, tpl: AdminChangeAvatarPopupInstance) {
    event.preventDefault();
    event.stopPropagation();
    if (this && typeof this.link === 'function') {
      const avatarUrl = this.link();
      adminChangeAvatarSetAvatar(tpl, avatarUrl);
    }
  },
  'click .js-select-initials'(event: JQuery.TriggeredEvent, tpl: AdminChangeAvatarPopupInstance) {
    event.preventDefault();
    event.stopPropagation();
    adminChangeAvatarSetAvatar(tpl, '');
  },
  'click .js-delete-avatar': Popup.afterConfirm('deleteAvatar', async function(this: any) {
    // Inside the each loop, 'this' is the avatar object
    const avatarId = this._id;
    if (avatarId) {
      await Avatars.removeAsync(avatarId);
    }
    Popup.back();
  }),
});

// findOrgsOptions holds a dynamic Mongo selector; targetUserId is a resolved
// user id (string|undefined) — both `any` because their shapes come from the
// data context / subscriptions rather than a local type.
interface BoardRowInstance extends Blaze.TemplateInstance {
  error: ReactiveVar<string>;
  loading: ReactiveVar<boolean>;
  findOrgsOptions: ReactiveVar<any>;
  page: ReactiveVar<number>;
}

interface ChangeAvatarPopupInstance extends Blaze.TemplateInstance {
  error: ReactiveVar<string>;
  avatarUpdateCounter: ReactiveVar<number>;
  avatarUploadBlocked: ReactiveVar<boolean>;
}

interface AdminChangeAvatarPopupInstance extends Blaze.TemplateInstance {
  error: ReactiveVar<string>;
  avatarUpdateCounter: ReactiveVar<number>;
  targetUserId: any;
}
