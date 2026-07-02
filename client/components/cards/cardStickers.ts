import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveCache } from '/imports/reactiveCache';
import { STICKER_PICKER } from '/models/metadata/stickers';

// Picker popup that lets a user add/remove stickers on a card. Each entry is
// { icon, highlight?, name? }: the plain Font Awesome icons plus the mascot
// (underlined) and computer (ringed) highlighted stickers. Opened from the card
// details stickers section with the card as the data context.

Template.cardStickersPopup.onCreated(function (this: CardStickersPopupInstance) {
  const data = Template.currentData();
  this.cardId = data && data._id;
});

function pickerCard(tpl: CardStickersPopupInstance) {
  return ReactiveCache.getCard(tpl.cardId);
}

Template.cardStickersPopup.helpers({
  stickerIcons() {
    return STICKER_PICKER;
  },
  isSelected(this: StickerContext) {
    const card = pickerCard(Template.instance() as CardStickersPopupInstance);
    return !!(card && card.hasSticker(this.icon, this.highlight));
  },
  stickerTitle(this: StickerContext) {
    return this.name || this.icon;
  },
});

Template.cardStickersPopup.events({
  'click .js-select-sticker'(this: StickerContext, event: JQuery.TriggeredEvent) {
    event.preventDefault();
    const card = pickerCard(Template.instance() as CardStickersPopupInstance);
    if (card) {
      card.toggleSticker(this.icon, this.highlight, this.name);
    }
  },
});

// The sticker picker popup remembers which card it was opened for.
interface CardStickersPopupInstance extends Blaze.TemplateInstance {
  cardId?: string;
}

// A sticker entry from STICKER_PICKER, also the data context of each picker row.
interface StickerContext {
  icon: string;
  highlight?: boolean;
  name?: string;
}
