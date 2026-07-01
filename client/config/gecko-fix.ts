if (Object.prototype.hasOwnProperty('watch')) {
  // Legacy Firefox-only, non-standard Object.prototype.watch/unwatch removal;
  // these members are absent from lib.dom, so view the prototype as carrying
  // the optional legacy members to clear them.
  const objectProto = Object.prototype as {
    watch?: undefined;
    unwatch?: undefined;
  };
  objectProto.watch = undefined;
  objectProto.unwatch = undefined;
}
