import { Template } from 'meteor/templating';
import { Blaze } from 'meteor/blaze';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from 'meteor/meteor';
import { ReactiveCache } from '/imports/reactiveCache';
import { LABEL_COLORS } from '/models/metadata/colors';
import { EscapeActions } from '/client/lib/escapeActions';
import { Utils } from '/client/lib/utils';

let labelColors: string[];
Meteor.startup(() => {
  labelColors = LABEL_COLORS;
});

const getFallbackLabelColor = () => {
  if (Array.isArray(labelColors) && labelColors.length > 0) {
    return labelColors[0];
  }
  return 'green';
};

Template.formLabel.onCreated(function (this: FormLabelInstance) {
  const initialColor = this.data?.color || getFallbackLabelColor();
  this.currentColor = new ReactiveVar(initialColor);
});

Template.formLabel.helpers({
  labels() {
    const colors = Array.isArray(labelColors) ? labelColors : [getFallbackLabelColor()];
    return colors.map(color => ({ color, name: '' }));
  },
  isSelected(color: string) {
    return (Template.instance() as FormLabelInstance).currentColor.get() === color;
  },
});

Template.formLabel.events({
  'click .js-palette-color'(event: JQuery.TriggeredEvent, tpl: FormLabelInstance) {
    // dynamic Blaze data context of the clicked palette swatch
    const paletteData = Blaze.getData(event.currentTarget) as any;
    const selectedColor = paletteData?.color || Template.currentData()?.color || getFallbackLabelColor();
    tpl.currentColor.set(selectedColor);
  },
});

Template.createLabelPopup.helpers({
  // This is the default color for a new label. We search the first color that
  // is not already used in the board (although it's not a problem if two
  // labels have the same color).
  defaultColor() {
    const board = Utils.getCurrentBoard();
    const colors = Array.isArray(labelColors) ? labelColors : [getFallbackLabelColor()];
    const labels = Array.isArray(board?.labels) ? board.labels : [];
    const usedColors = labels.map((l: { color: string }) => l.color);
    const availableColors = colors.filter(c => !usedColors.includes(c));
    return availableColors.length > 0 ? availableColors[0] : colors[0];
  },
});

Template.cardLabelsPopup.onRendered(function (this: Blaze.TemplateInstance) {
  const tpl = this;
  const itemsSelector = 'li.js-card-label-item:not(.placeholder)';
  const $labels = tpl.$('.edit-labels-pop-over');

  $labels.sortable({
    connectWith: '.edit-labels-pop-over',
    tolerance: 'pointer',
    appendTo: '.edit-labels-pop-over',
    helper(element, currentItem) {
      let ret = currentItem.clone();
      if (currentItem.closest('.popup-container-depth-0').length == 0)
      { // only set css transform at every sub-popup, not at the main popup
        const content = currentItem.closest('.content')[0] as HTMLElement
        const offsetLeft = content.offsetLeft;
        const offsetTop = ($('.pop-over > .header').height() as number) * -1;
        ret.css("transform", `translate(${offsetLeft}px, ${offsetTop}px)`);
      }
      return ret;
    },
    distance: 7,
    items: itemsSelector,
    placeholder: 'card-label-wrapper placeholder',
    start(evt, ui) {
      ui.helper.css('z-index', 1000);
      ui.placeholder.height(ui.helper.height() as number);
      EscapeActions.clickExecute(evt.target, 'inlinedForm');
    },
    stop(this: any, evt, ui) {
      // Blaze.getData returns the dynamic per-label data context (has _id)
      const newLabelOrderOnlyIds = ui.item.parent().children().toArray().map(_element => (Blaze.getData(_element) as any)._id)
      const card = Blaze.getData(this) as any;
      card.board().setNewLabelOrder(newLabelOrderOnlyIds);
    },
  });

  // Disable drag-dropping if the current user is not a board member or is comment only
  tpl.autorun(() => {
    if (Utils.isTouchScreenOrShowDesktopDragHandles()) {
      $labels.sortable({
        handle: '.label-handle',
      });
    }
  });
});

Template.cardLabelsPopup.helpers({
  isLabelSelected(this: any, cardId: string) {
    return (ReactiveCache.getCard(cardId).labelIds || []).includes(this._id);
  },
});

Template.cardLabelsPopup.events({
  'click .js-select-label'(this: any, event: JQuery.TriggeredEvent) {
    const card = Template.currentData();
    const labelId = this._id;
    card.toggleLabel(labelId);
    event.preventDefault();
  },
  'click .js-edit-label': Popup.open('editLabel'),
  'click .js-add-label': Popup.open('createLabel'),
});

Template.createLabelPopup.events({
  // Create the new label
  'submit .create-label'(event: JQuery.TriggeredEvent, templateInstance: Blaze.TemplateInstance) {
    event.preventDefault();
    const board = Utils.getCurrentBoard();
    if (!board) {
      return;
    }
    const name = (templateInstance
      .$('#labelName')
      .val() as string)
      .trim();
    const selectedColorIcon = templateInstance.find('.js-palette-color .fa-check');
    const selectedPaletteNode = selectedColorIcon?.closest
      ? selectedColorIcon.closest('.js-palette-color') as HTMLElement
      : null;
    // dynamic Blaze data context of the selected palette swatch
    const selectedColorData = selectedPaletteNode && Blaze.getData(selectedPaletteNode) as any;
    const color = selectedColorData?.color || getFallbackLabelColor();
    board.addLabel(name, color);
    Popup.back();
  },
});

Template.editLabelPopup.events({
  'click .js-delete-label': Popup.afterConfirm('deleteLabel', function (this: any) {
    const board = Utils.getCurrentBoard();
    board.removeLabel(this._id);
    Popup.back(2);
  }),
  'submit .edit-label'(this: any, event: JQuery.TriggeredEvent, templateInstance: Blaze.TemplateInstance) {
    event.preventDefault();
    const board = Utils.getCurrentBoard();
    if (!board) {
      return;
    }
    const name = (templateInstance
      .$('#labelName')
      .val() as string)
      .trim();
    const selectedColorIcon = templateInstance.find('.js-palette-color .fa-check');
    const selectedPaletteNode = selectedColorIcon?.closest
      ? selectedColorIcon.closest('.js-palette-color') as HTMLElement
      : null;
    // dynamic Blaze data context of the selected palette swatch
    const selectedColorData = selectedPaletteNode && Blaze.getData(selectedPaletteNode) as any;
    const color = selectedColorData?.color || getFallbackLabelColor();
    board.editLabel(this._id, name, color);
    Popup.back();
  },
});

// The formLabel instance tracks the currently selected label color.
interface FormLabelInstance extends Blaze.TemplateInstance {
  currentColor: ReactiveVar<string>;
}
