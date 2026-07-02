// We use @textcomplete packages to integrate with our EscapeActions system.
// You should always use `createEscapeableTextComplete` or the jQuery extension
// `escapeableTextComplete` instead of the vanilla textcomplete.
import { Textcomplete } from '@textcomplete/core';
import type { StrategyProps, TextcompleteOption } from '@textcomplete/core';
import { TextareaEditor } from '@textcomplete/textarea';
import { ContenteditableEditor } from '@textcomplete/contenteditable';
import { EscapeActions } from '/client/lib/escapeActions';
import { shouldSubmitOnEnter } from '/client/lib/mentionKeyGuard';

let dropdownMenuIsOpened = false;

/**
 * Create an escapeable textcomplete instance for a textarea or contenteditable element
 * @param {HTMLTextAreaElement|HTMLElement} element - The target element
 * @param {Array} strategies - Array of strategy objects
 * @param {Object} options - Additional options
 * @returns {Textcomplete} The textcomplete instance
 */
export function createEscapeableTextComplete(
  element: HTMLElement,
  strategies: StrategyProps[],
  options: TextcompleteOption = {},
) {
  // Determine the appropriate editor based on element type
  const isContentEditable = element.isContentEditable || element.contentEditable === 'true';
  const Editor = isContentEditable ? ContenteditableEditor : TextareaEditor;

  // `Editor` is one of two constructors picked at runtime; the element type is
  // known-correct for the chosen branch but not statically, so widen it for the
  // constructor call.
  const editor = new Editor(element as HTMLTextAreaElement & HTMLElement);

  // Merge default options
  const mergedOptions: TextcompleteOption = {
    dropdown: {
      className: 'textcomplete-dropdown',
      maxCount: 10,
      placement: 'bottom',
      ...options.dropdown,
    },
  };

  const textcomplete = new Textcomplete(editor, strategies, mergedOptions);

  // When the autocomplete menu is shown we want both a press of both `Tab`
  // or `Enter` to validate the auto-completion. We also need to stop the
  // event propagation to prevent EscapeActions side effect, for instance the
  // minicard submission (on `Enter`) or going on the next column (on `Tab`).
  //
  // Regression #3289 / #4172 / #5457: pressing `Enter` to pick a suggested
  // user used to submit the comment / close the card instead of selecting the
  // mention. We must therefore stop the keydown from reaching any other
  // handler (the form `submit`, the inlinedForm/minicard handlers, …) AND
  // prevent the default newline so the textcomplete `selected` action is the
  // only effect. `stopImmediatePropagation` also blocks other listeners bound
  // to this same element (e.g. summernote in the richer editor).
  element.addEventListener('keydown', (evt) => {
    const isTabOrEnter = evt.keyCode === 9 || evt.keyCode === 13;
    if (isTabOrEnter && !shouldSubmitOnEnter({ autocompleteOpen: dropdownMenuIsOpened })) {
      evt.preventDefault();
      evt.stopImmediatePropagation();
      evt.stopPropagation();
    }
  });

  // Track dropdown state for EscapeActions integration
  // Since @textcomplete automatically closes when Escape is pressed, we
  // integrate with our EscapeActions system by tracking open/close state.
  textcomplete.on('show', () => {
    dropdownMenuIsOpened = true;
  });

  textcomplete.on('selected', () => {
    EscapeActions.preventNextClick();
  });

  textcomplete.on('hidden', () => {
    Tracker.afterFlush(() => {
      // XXX Hack. We unfortunately need to set a setTimeout here to make the
      // `noClickEscapeOn` work below, otherwise clicking on a autocomplete
      // item will close both the autocomplete menu (as expected) but also the
      // next item in the stack (for example the minicard editor) which we
      // don't want.
      setTimeout(() => {
        dropdownMenuIsOpened = false;
      }, 100);
    });
  });

  return textcomplete;
}

// jQuery extension for backward compatibility
$.fn.escapeableTextComplete = function(strategies: StrategyProps[], options: TextcompleteOption = {}) {
  return this.each(function() {
    createEscapeableTextComplete(this, strategies, options);
  });
};

EscapeActions.register(
  'textcomplete',
  () => {},
  () => dropdownMenuIsOpened,
  {
    noClickEscapeOn: '.textcomplete-dropdown',
  },
);
