import { TAPi18n } from '/imports/i18n';
import { ReactiveCache } from '/imports/reactiveCache';
import { SWIMLANE_COLORS } from '/models/metadata/colors';
import Swimlanes from '/models/swimlanes';
import { Utils } from '/client/lib/utils';
import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
const { calculateIndexData } = Utils;

let swimlaneColors: string[];
Meteor.startup(() => {
  swimlaneColors = SWIMLANE_COLORS;
});

function swimlaneHeaderCollapsed(check?: boolean) {
  const swimlane = Template.currentData();
  const status = Utils.getSwimlaneCollapseState(swimlane);
  if (check === undefined) {
    return status;
  } else {
    const next = typeof check === 'boolean' ? check : !status;
    Utils.setSwimlaneCollapseState(swimlane, next);
    return next;
  }
}

Template.swimlaneHeader.events({
  'click .js-collapse-swimlane'(event: JQuery.TriggeredEvent) {
    event.preventDefault();
    swimlaneHeaderCollapsed(!swimlaneHeaderCollapsed());
  },
  'click .js-open-swimlane-menu': Popup.open('swimlaneAction'),
  'click .js-open-add-swimlane-menu': Popup.open('swimlaneAdd'),
  async submit(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    event.preventDefault();
    const newTitle = (tpl.$('.list-name-input').val() as string).trim();
    const swimlane = Template.currentData();
    if (newTitle) {
      await swimlane.rename(newTitle.trim());
    }
  },
});

Template.swimlaneFixedHeader.helpers({
  isBoardAdmin() {
    return ReactiveCache.getCurrentUser()?.isBoardAdmin();
  },
  collapseSwimlane() {
    const swimlane = Template.currentData();
    return Utils.getSwimlaneCollapseState(swimlane);
  },
  isTitleDefault(title: string) {
    // https://github.com/wekan/wekan/issues/4763
    // https://github.com/wekan/wekan/issues/4742
    // Translation text for "default" does not work, it returns an object.
    // When that happens, try use translation "defaultdefault" that has same content of default, or return text "Default".
    // This can happen, if swimlane does not have name.
    // Yes, this is fixing the symptom (Swimlane title does not have title)
    // instead of fixing the problem (Add Swimlane title when creating swimlane)
    // because there could be thousands of swimlanes, adding name Default to all of them
    // would be very slow.
    if (title.startsWith("key 'default") && title.endsWith('returned an object instead of string.')) {
      if (`${TAPi18n.__('defaultdefault')}`.startsWith("key 'default") && `${TAPi18n.__('defaultdefault')}`.endsWith('returned an object instead of string.')) {
        return 'Default';
      } else  {
        return `${TAPi18n.__('defaultdefault')}`;
      }
    } else if (title === 'Default') {
      return `${TAPi18n.__('defaultdefault')}`;
    } else  {
      return title;
    }
  },
});

Template.editSwimlaneTitleForm.helpers({
  isTitleDefault(title: string) {
    // https://github.com/wekan/wekan/issues/4763
    // https://github.com/wekan/wekan/issues/4742
    // Translation text for "default" does not work, it returns an object.
    // When that happens, try use translation "defaultdefault" that has same content of default, or return text "Default".
    // This can happen, if swimlane does not have name.
    // Yes, this is fixing the symptom (Swimlane title does not have title)
    // instead of fixing the problem (Add Swimlane title when creating swimlane)
    // because there could be thousands of swimlanes, adding name Default to all of them
    // would be very slow.
    if (title.startsWith("key 'default") && title.endsWith('returned an object instead of string.')) {
      if (`${TAPi18n.__('defaultdefault')}`.startsWith("key 'default") && `${TAPi18n.__('defaultdefault')}`.endsWith('returned an object instead of string.')) {
        return 'Default';
      } else  {
        return `${TAPi18n.__('defaultdefault')}`;
      }
    } else if (title === 'Default') {
      return `${TAPi18n.__('defaultdefault')}`;
    } else  {
      return title;
    }
  },
});

Template.swimlaneActionPopup.events({
  'click .js-add-swimlane': Popup.open('swimlaneAdd'),
  'click .js-add-list-from-swimlane': Popup.open('addList'),
  'click .js-set-swimlane-color': Popup.open('setSwimlaneColor'),
  'click .js-set-swimlane-height': Popup.open('setSwimlaneHeight'),
  'click .js-close-swimlane': Popup.afterConfirm('swimlaneArchive', async function(this: any) {
    await this.archive();
    Popup.close();
  }),
  'click .js-move-swimlane': Popup.open('moveSwimlane'),
  'click .js-copy-swimlane': Popup.open('copySwimlane'),
});

Template.swimlaneActionPopup.helpers({
  isCommentOnly() {
    return ReactiveCache.getCurrentUser().isCommentOnly();
  },
});

Template.swimlaneAddPopup.onCreated(function (this: SwimlaneAddPopupInstance) {
  this.currentSwimlane = Template.currentData();
});

Template.swimlaneAddPopup.events({
  async submit(event: JQuery.TriggeredEvent, tpl: SwimlaneAddPopupInstance) {
    event.preventDefault();
    const currentBoard = Utils.getCurrentBoard();
    const nextSwimlane = currentBoard.nextSwimlane(tpl.currentSwimlane);
    const titleInput = tpl.find('.swimlane-name-input') as HTMLInputElement;
    const title = titleInput.value.trim();
    const sortValue = calculateIndexData(
      tpl.currentSwimlane,
      nextSwimlane,
      1,
    );
    const swimlaneType = currentBoard.isTemplatesBoard()
      ? 'template-swimlane'
      : 'swimlane';

    if (title) {
      await Swimlanes.insertAsync({
        title,
        boardId: Session.get('currentBoard'),
        sort: sortValue.base || 0,
        type: swimlaneType,
      });

      titleInput.value = '';
      titleInput.focus();
    }
    // XXX ideally, we should move the popup to the newly
    // created swimlane so a user can add more than one swimlane
    // with a minimum of interactions
    Popup.back();
  },
  'click .js-swimlane-template': Popup.open('searchElement'),
});

Template.setSwimlaneColorPopup.onCreated(function (this: SetSwimlaneColorPopupInstance) {
  this.currentSwimlane = Template.currentData();
  this.currentColor = new ReactiveVar(this.currentSwimlane.color);
});

Template.setSwimlaneColorPopup.helpers({
  colors() {
    return swimlaneColors.map((color: string) => ({ color, name: '' }));
  },
  isSelected(color: string) {
    return (Template.instance() as SetSwimlaneColorPopupInstance).currentColor.get() === color;
  },
});

Template.setSwimlaneColorPopup.events({
  async 'submit form'(event: JQuery.TriggeredEvent, tpl: SetSwimlaneColorPopupInstance) {
    event.preventDefault();
    await tpl.currentSwimlane.setColor(tpl.currentColor.get());
    Popup.back();
  },
  'click .js-palette-color'(event: JQuery.TriggeredEvent, tpl: SetSwimlaneColorPopupInstance) {
    // paletteData: any — Blaze.getData returns the dynamic palette-cell data context.
    const paletteData: any = Blaze.getData(event.currentTarget);
    tpl.currentColor.set(paletteData?.color);
  },
  async 'click .js-submit'(event: JQuery.TriggeredEvent, tpl: SetSwimlaneColorPopupInstance) {
    event.preventDefault();
    await tpl.currentSwimlane.setColor(tpl.currentColor.get());
    Popup.back();
  },
  async 'click .js-remove-color'(event: JQuery.TriggeredEvent, tpl: SetSwimlaneColorPopupInstance) {
    event.preventDefault();
    await tpl.currentSwimlane.setColor(null);
    Popup.back();
  },
});

Template.setSwimlaneHeightPopup.onCreated(function (this: SetSwimlaneHeightPopupInstance) {
  this.currentSwimlane = Template.currentData();
});

Template.setSwimlaneHeightPopup.helpers({
  swimlaneHeightValue() {
    const swimlane = Template.currentData();
    const board = swimlane.boardId;
    return ReactiveCache.getCurrentUser().getSwimlaneHeight(board, swimlane._id);
  },
});

Template.setSwimlaneHeightPopup.events({
  'click .swimlane-height-apply'(event: JQuery.TriggeredEvent, tpl: Blaze.TemplateInstance) {
    const swimlane = Template.currentData();
    const board = swimlane.boardId;
    const height = parseInt(
      tpl.$('.swimlane-height-value').val() as string,
      10,
    );

    if (height != -1 && (height < 100 || !height)) {
      tpl.$('.swimlane-height-error').click();
    } else {
      Meteor.call('applySwimlaneHeight', board, swimlane._id, height);
      Popup.back();
    }
  },
  'click .swimlane-height-error': Popup.open('swimlaneHeightError'),
});

// currentSwimlane is a dynamic Swimlane model doc; currentColor holds its
// (nullable) color string. Both are `any` because the Swimlane doc shape is
// defined by the model/collection rather than a local type.
interface SwimlaneAddPopupInstance extends Blaze.TemplateInstance {
  currentSwimlane: any;
}

interface SetSwimlaneColorPopupInstance extends Blaze.TemplateInstance {
  currentSwimlane: any;
  currentColor: ReactiveVar<any>;
}

interface SetSwimlaneHeightPopupInstance extends Blaze.TemplateInstance {
  currentSwimlane: any;
}
