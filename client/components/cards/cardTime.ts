import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { TAPi18n } from '/imports/i18n';
import Cards from '/models/cards';
import { getCurrentCardIdFromContext } from '/client/lib/currentCard';

function getCardId() {
  return getCurrentCardIdFromContext();
}

Template.editCardSpentTimePopup.onCreated(function (this: EditCardSpentTimePopupInstance) {
  this.error = new ReactiveVar('');
  this.card = Cards.findOne(getCardId());
});

Template.editCardSpentTimePopup.helpers({
  error() {
    return (Template.instance() as EditCardSpentTimePopupInstance).error;
  },
  card() {
    return Cards.findOne(getCardId());
  },
  getIsOvertime() {
    const card = Cards.findOne(getCardId());
    return card?.getIsOvertime ? card.getIsOvertime() : false;
  },
});

Template.editCardSpentTimePopup.events({
  //TODO : need checking this portion
  'submit .edit-time'(evt: JQuery.TriggeredEvent, tpl: EditCardSpentTimePopupInstance) {
    evt.preventDefault();
    const card = Cards.findOne(getCardId());
    if (!card) return;

    const form = evt.target as HTMLFormElement & { time: HTMLInputElement };
    const spentTime = parseFloat(form.time.value);
    let isOvertime = false;
    if (($('#overtime').attr('class') as string).indexOf('is-checked') >= 0) {
      isOvertime = true;
    }
    if (spentTime >= 0) {
      card.setSpentTime(spentTime);
      card.setIsOvertime(isOvertime);
      Popup.back();
    } else {
      tpl.error.set('invalid-time');
      form.time.focus();
    }
  },
  'click .js-delete-time'(evt: JQuery.TriggeredEvent) {
    evt.preventDefault();
    const card = Cards.findOne(getCardId());
    if (!card) return;
    card.setSpentTime(null);
    card.setIsOvertime(false);
    Popup.back();
  },
  'click a.js-toggle-overtime'(evt: JQuery.TriggeredEvent) {
    const card = Cards.findOne(getCardId());
    if (!card) return;
    card.setIsOvertime(!card.getIsOvertime());
    $('#overtime .materialCheckBox').toggleClass('is-checked');
    $('#overtime').toggleClass('is-checked');
  },
});

Template.cardSpentTime.helpers({
  // `this` is the card data context (a Mongo card doc).
  showTitle(this: any) {
    const card = Cards.findOne(this._id) || this;
    if (card.getIsOvertime && card.getIsOvertime()) {
      return `${TAPi18n.__(
        'overtime',
      )} ${card.getSpentTime()} ${TAPi18n.__('hours')}`;
    } else if (card.getSpentTime) {
      return `${TAPi18n.__(
        'card-spent',
      )} ${card.getSpentTime()} ${TAPi18n.__('hours')}`;
    }
    return '';
  },
  showTime(this: any) {
    const card = Cards.findOne(this._id) || this;
    return card.getSpentTime ? card.getSpentTime() : '';
  },
  getIsOvertime(this: any) {
    const card = Cards.findOne(this._id) || this;
    return card.getIsOvertime ? card.getIsOvertime() : false;
  },
});

Template.cardSpentTime.events({
  'click .js-edit-time': Popup.open('editCardSpentTime'),
});

// The edit-spent-time popup instance holds a validation error message and the
// card being edited.
interface EditCardSpentTimePopupInstance extends Blaze.TemplateInstance {
  error: ReactiveVar<string>;
  card?: ReturnType<typeof Cards.findOne>;
}
