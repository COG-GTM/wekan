/* eslint-disable */

// ------------------------------------------------------------------------
// Created by STRd6
// MIT License
// https://github.com/distri/jquery-image_reader/blob/master/drop.coffee.md
//
// Raymond re-write it to javascript
//
// NOTE (TypeScript migration): this is vendored third-party code that
// monkey-patches jQuery's internal `$.event.fix` and augments drag/drop events
// with `dataTransfer` — internals @types/jquery deliberately does not model.
// Its parameters are therefore typed `any`: they are jQuery event/callback
// objects at an untyped library boundary and re-typing vendored code would risk
// changing its runtime behaviour.

(function($: any) {
  $.event.fix = (function(originalFix: any) {
    return function(this: any, event: any) {
      event = originalFix.apply(this, arguments);
      if (
        event.type.indexOf('drag') === 0 ||
        event.type.indexOf('drop') === 0
      ) {
        event.dataTransfer = event.originalEvent.dataTransfer;
      }
      return event;
    };
  })($.event.fix);

  const defaults = {
    callback: $.noop,
    matchType: /image.*/,
  };

  return ($.fn.dropImageReader = function(this: any, options: any) {
    if (typeof options === 'function') {
      options = {
        callback: options,
      };
    }
    options = $.extend({}, defaults, options);
    const stopFn = function(event: any) {
      event.stopPropagation();
      return event.preventDefault();
    };
    return this.each(function(this: any) {
      const element = this;
      $(element).on('dragenter dragover dragleave', stopFn);
      return $(element).on('drop', function(event: any) {
        stopFn(event);
        const files = event.dataTransfer.files;
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f.type.match(options.matchType)) {
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
