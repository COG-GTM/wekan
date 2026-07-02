/* eslint-disable */

// ------------------------------------------------------------------------
// Created by STRd6
// MIT License
// https://github.com/distri/jquery-image_reader/blob/master/paste.coffee.md
//
// Raymond re-write it to javascript
//
// NOTE (TypeScript migration): this is vendored third-party code that
// monkey-patches jQuery's internal `$.event.fix` and augments copy/paste events
// with `clipboardData` — internals @types/jquery deliberately does not model.
// Its parameters are therefore typed `any`: they are jQuery event/callback
// objects at an untyped library boundary and re-typing vendored code would risk
// changing its runtime behaviour.

(function($: any) {
  $.event.fix = (function(originalFix: any) {
    return function(this: any, event: any) {
      event = originalFix.apply(this, arguments);
      if (
        event.type.indexOf('copy') === 0 ||
        event.type.indexOf('paste') === 0
      ) {
        event.clipboardData = event.originalEvent.clipboardData;
      }
      return event;
    };
  })($.event.fix);

  const defaults = {
    callback: $.noop,
    matchType: /image.*/,
  };

  return ($.fn.pasteImageReader = function(this: any, options: any) {
    if (typeof options === 'function') {
      options = {
        callback: options,
      };
    }
    options = $.extend({}, defaults, options);
    return this.each(function(this: any) {
      const element = this;
      return $(element).on('paste', function(event: any) {
        const types = event.clipboardData.types;
        const items = event.clipboardData.items;
        for (let i = 0; i < types.length; i++) {
          if (
            types[i].match(options.matchType) ||
            items[i].type.match(options.matchType)
          ) {
            const f = items[i].getAsFile();
            const reader = new FileReader();
            reader.onload = function(evt: any) {
              return options.callback.call(element, {
                dataURL: evt.target.result,
                event: evt,
                file: f,
                name: f.name,
              });
            };
            reader.readAsDataURL(f);
            return;
          }
        }
      });
    });
  });
})(jQuery);
