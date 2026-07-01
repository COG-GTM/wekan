// Type declarations for third-party / Meteor modules used by wekan-markdown that
// do not ship their own definitions or are only partially covered by @types/meteor.

// markdown-it-emoji ships no type definitions. It exposes three ready-made
// markdown-it plugin presets. `full` is the preset used by wekan-markdown.
declare module 'markdown-it-emoji' {
  import type { PluginSimple } from 'markdown-it';
  export const full: PluginSimple;
  export const light: PluginSimple;
  export const bare: PluginSimple;
  const emojiDefault: PluginSimple;
  export default emojiDefault;
}

// meteor/htmljs is not covered by @types/meteor. Only the members used by this
// package are declared here.
declare module 'meteor/htmljs' {
  export namespace HTML {
    interface Raw {
      value: string;
    }
    function Raw(value: string): Raw;
    const TEXTMODE: {
      STRING: number;
      RCDATA: number;
      ATTRIBUTE: number;
    };
  }
}

// Augment @types/meteor's Blaze definitions with the internal `_toText` helper
// and the ability to register a Template instance (not just a Function) as a
// global helper, both of which this package relies on at runtime.
declare module 'meteor/blaze' {
  namespace Blaze {
    function _toText(content: Blaze.Template | Blaze.View, textMode: number): string;
    interface TemplateStatic<D = any, T = TemplateInstance<D>> {
      registerHelper(name: string, func: Blaze.Template): void;
    }
  }
}
