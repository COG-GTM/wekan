import { ReactiveCache } from '/imports/reactiveCache';
import { ReactiveVar } from 'meteor/reactive-var';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import DOMPurify from 'dompurify';
import { sanitizeHTML, sanitizeText } from '/imports/lib/secureDOMPurify';
import { TAPi18n } from '/imports/i18n';
import { Utils } from '/client/lib/utils';
import { getSidebarInstance } from '/client/features/sidebar/service';

const activitiesPerPage = 500;

Template.activities.onCreated(function (this: ActivitiesInstance) {
  // Register with sidebar so it can call loadNextPage on us
  const Sidebar = getSidebarInstance();
  if (Sidebar) {
    Sidebar.activitiesInstance = this;
  }

  // XXX Should we use ReactiveNumber?
  this.page = new ReactiveVar(1);
  this.loadNextPageLocked = false;
  this.loadNextPage = () => {
    if (this.loadNextPageLocked === false) {
      this.page.set(this.page.get() + 1);
      this.loadNextPageLocked = true;
    }
  };

  // TODO is sidebar always available? E.g. on small screens/mobile devices
  const sidebar = getSidebarInstance();
  if (sidebar && sidebar.infiniteScrolling) {
    sidebar.infiniteScrolling.resetNextPeak();
  }
  this.autorun(() => {
    const data = Template.currentData();
    let mode = data?.mode;
    if (mode) {
      const capitalizedMode = Utils.capitalize(mode);
      let searchId;
      const showActivities = _showActivities(data);
      if (mode === 'linkedcard' || mode === 'linkedboard') {
        const currentCard = Utils.getCurrentCard();
        searchId = currentCard.linkedId;
        mode = mode.replace('linked', '');
      } else if (mode === 'card') {
        searchId = Utils.getCurrentCardId();
      } else {
        searchId = Session.get(`current${capitalizedMode}`);
      }
      const limit = this.page.get() * activitiesPerPage;
      if (searchId === null) return;

      this.subscribe('activities', mode, searchId, limit, showActivities, () => {
        this.loadNextPageLocked = false;

        // TODO the guard can be removed as soon as the TODO above is resolved
        if (!sidebar || !sidebar.infiniteScrolling) return;
        // If the sidebar peak hasn't increased, that means that there are no more
        // activities, and we can stop calling new subscriptions.
        const nextPeakBefore = sidebar.infiniteScrolling.getNextPeak();
        sidebar.calculateNextPeak();
        const nextPeakAfter = sidebar.infiniteScrolling.getNextPeak();
        if (nextPeakBefore === nextPeakAfter) {
          sidebar.infiniteScrolling.resetNextPeak();
        }
      });
    }
  });
});

function _showActivities(data: any) {
  let ret = false;
  let mode = data?.mode;
  if (mode) {
    if (mode === 'linkedcard' || mode === 'linkedboard') {
      const currentCard = Utils.getCurrentCard();
      ret = currentCard.showActivities ?? false;
    } else if (mode === 'card') {
      // For card mode, get showActivities from data context or fallback to current card
      const card = data?.card || Utils.getCurrentCard();
      ret = card?.showActivities ?? false;
    } else {
      ret = Utils.getCurrentBoard().showActivities ?? false;
    }
  }
  return ret;
}

Template.activities.helpers({
  showActivities() {
    const data = Template.currentData();
    return _showActivities(data);
  },

  activities(this: any) {
    const activities = this.card?.activities?.();
    return activities || [];
  },
});

Template.boardActivities.helpers({
  boardActivitiesList() {
    const board = Utils.getCurrentBoard();
    const activities = board?.activities?.();
    return activities || [];
  },
});

Template.cardActivities.helpers({
  cardActivitiesList() {
    const data = Template.currentData();
    const card = data?.card;
    const activities = card?.activities?.();
    return activities || [];
  },
});

Template.activity.helpers({
  checkItem(this: any) {
    const checkItemId = this.activity.checklistItemId;
    const checkItem = ReactiveCache.getChecklistItem(checkItemId);
    return checkItem && checkItem.title;
  },

  boardLabelLink(this: any) {
    const currentBoardId = Session.get('currentBoard');
    if (this.mode !== 'board') {
      return createBoardLink(this.activity.board(), this.activity.listName ? this.activity.listName : null);
    }
    else if (currentBoardId != this.activity.boardId) {
      return createBoardLink(this.activity.board(), this.activity.listName ? this.activity.listName : null);
    }
    return TAPi18n.__('this-board');
  },

  cardLabelLink(this: any) {
    const currentBoardId = Session.get('currentBoard');
    if (this.mode == 'card') {
      return TAPi18n.__('this-card');
    }
    else if (this.mode !== 'board') {
      return createCardLink(this.activity.card(), null);
    }
    else if (currentBoardId != this.activity.boardId) {
      return createCardLink(this.activity.card(), this.activity.board().title);
    }
    return createCardLink(this.activity.card(), null);
  },

  cardLink(this: any) {
    const currentBoardId = Session.get('currentBoard');
    if (this.mode !== 'board') {
      return createCardLink(this.activity.card(), null);
    }
    else if (currentBoardId != this.activity.boardId) {
      return createCardLink(this.activity.card(), this.activity.board().title);
    }
    return createCardLink(this.activity.card(), null);
  },

  receivedDate(this: any) {
    const card = this.activity.card();
    if (!card) return null;
    return card.receivedAt;
  },

  startDate(this: any) {
    const card = this.activity.card();
    if (!card) return null;
    return card.startAt;
  },

  dueDate(this: any) {
    const card = this.activity.card();
    if (!card) return null;
    return card.dueAt;
  },

  endDate(this: any) {
    const card = this.activity.card();
    if (!card) return null;
    return card.endAt;
  },

  lastLabel(this: any) {
    const lastLabelId = this.activity.labelId;
    if (!lastLabelId) return null;
    const lastLabel = ReactiveCache.getBoard(
      this.activity.boardId,
    ).getLabelById(lastLabelId);
    if (lastLabel && (lastLabel.name === undefined || lastLabel.name === '')) {
      return lastLabel.color;
    } else if (lastLabel.name !== undefined && lastLabel.name !== '') {
      return lastLabel.name;
    } else {
      return null;
    }
  },

  lastCustomField(this: any) {
    const lastCustomField = ReactiveCache.getCustomField(
      this.activity.customFieldId,
    );
    if (!lastCustomField) return null;
    return lastCustomField.name;
  },

  lastCustomFieldValue(this: any) {
    const lastCustomField = ReactiveCache.getCustomField(
      this.activity.customFieldId,
    );
    if (!lastCustomField) return null;
    const value = this.activity.value;
    if (
      lastCustomField.settings.dropdownItems &&
      lastCustomField.settings.dropdownItems.length > 0
    ) {
      const dropDownValue = lastCustomField.settings.dropdownItems.find(
        (item: any) => {
          return item._id === value;
        },
      );
      if (dropDownValue) return dropDownValue.name;
    }
    return value;
  },

  listLabel(this: any) {
    const activity = this.activity;
    const list = activity.list();
    return (list && list.title) || activity.title;
  },

  sourceLink(this: any) {
    const source = this.activity.source;
    if (source) {
      if (source.url) {
        return Blaze.toHTML(
          HTML.A(
            {
              href: source.url,
            },
            sanitizeHTML(source.system),
          ),
        );
      } else {
        return sanitizeHTML(source.system);
      }
    }
    return null;
  },

  memberLink(this: any) {
    return Blaze.toHTMLWithData(Template.memberName, {
      user: this.activity.member(),
    });
  },

  attachmentLink(this: any) {
    const attachment = this.activity.attachment();
    const attachmentUrl = attachment && typeof attachment.link === 'function'
      ? attachment.link()
      : '';
    // trying to display url before file is stored generates js errors
    return (
      (attachment &&
        attachment.path &&
        attachmentUrl &&
        Blaze.toHTML(
          HTML.A(
            {
              href: `${attachmentUrl}?download=true`,
              target: '_blank',
            },
            sanitizeText(attachment.name),
          ),
        )) ||
      sanitizeText(this.activity.attachmentName)
    );
  },

  customField(this: any) {
    const customField = this.activity.customField();
    if (!customField) return null;
    return customField.name;
  },
});

Template.activity.helpers({
  sanitize(value: string) {
    return sanitizeHTML(value);
  },
});

Template.commentReactions.events({
  'click .reaction'(event: JQuery.TriggeredEvent) {
    const user = ReactiveCache.getCurrentUser();
    if (user && user.isBoardMember()) {
      const codepoint = (event.currentTarget as HTMLElement).dataset['codepoint'];
      const commentId = Template.instance().data.commentId;
      const cardComment = ReactiveCache.getCardComment(commentId);
      cardComment.toggleReaction(codepoint);
    }
  },
  'click .open-comment-reaction-popup': Popup.open('addReaction'),
})

Template.addReactionPopup.events({
  'click .add-comment-reaction'(event: JQuery.TriggeredEvent) {
    const user = ReactiveCache.getCurrentUser();
    if (user && user.isBoardMember()) {
      const codepoint = (event.currentTarget as HTMLElement).dataset['codepoint'];
      const commentId = Template.instance().data.commentId;
      const cardComment = ReactiveCache.getCardComment(commentId);
      cardComment.toggleReaction(codepoint);
    }
    Popup.back();
  },
})

Template.addReactionPopup.helpers({
  codepoints() {
    // Starting set of unicode codepoints as comment reactions
    return [
      '&#128077;',
      '&#128078;',
      '&#128064;',
      '&#9989;',
      '&#10060;',
      '&#128591;',
      '&#128079;',
      '&#127881;',
      '&#128640;',
      '&#128522;',
      '&#129300;',
      '&#128532;'];
  }
})

Template.commentReactions.helpers({
  isSelected(userIds: string[]) {
    return Meteor.userId() && userIds.includes(Meteor.userId()!);
  },
  userNames(userIds: string[]) {
    const ret = ReactiveCache.getUsers({_id: {$in: userIds}})
      .map((user: any) => user.profile.fullname)
      .join(', ');
    return ret;
  }
})

function createCardLink(card: any, board: string | null) {
  if (!card) return '';
  let text = card.title;
  if (board) text = `${board} > ` + text;
  return (
    card &&
    Blaze.toHTML(
      HTML.A(
        {
          href: card.originRelativeUrl(),
          class: 'action-card',
        },
        sanitizeHTML(text),
      ),
    )
  );
}

function createBoardLink(board: any, list: string | null) {
  let text = board.title;
  if (list) text += `: ${list}`;
  return (
    board &&
    Blaze.toHTML(
      HTML.A(
        {
          href: board.originRelativeUrl(),
          class: 'action-board',
        },
        sanitizeHTML(text),
      ),
    )
  );
}

interface ActivitiesInstance extends Blaze.TemplateInstance {
  page: ReactiveVar<number>;
  loadNextPageLocked: boolean;
  loadNextPage: () => void;
}
