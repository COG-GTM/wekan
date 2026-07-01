/**
 * Bootstraps the Meteor packages (htmljs, html-tools, blaze-tools, spacebars-compiler)
 * into a sandboxed environment so they can be used outside of Meteor's build system.
 *
 * These packages were extracted from the mquandalle:jade Meteor build plugin.
 * They communicate via a global `Package` object. We set that up here,
 * run each file, then export the symbols the jade compiler needs.
 */

'use strict';

import vm from 'vm';
import fs from 'fs';
import path from 'path';

import {
  BlazeToolsApi,
  HtmlApi,
  HtmlToolsApi,
  MeteorPackages,
  SpacebarsCompilerApi,
} from './types';

const vendorDir = path.join(__dirname, 'vendor');

interface MeteorGlobal {
  isClient: boolean;
  isServer: boolean;
}

interface UnderscoreShim {
  each<T>(obj: T[], fn: (value: T, index: number, array: T[]) => void): void;
  map<T, U>(obj: T[], fn: (value: T, index: number, array: T[]) => U): U[];
  indexOf<T>(arr: T[], val: T): number;
  extend(dest: object, ...sources: object[]): object;
}

interface TrackerShim {
  autorun(): void;
  nonreactive<T>(f: () => T): T;
}

/**
 * The global `Package` object shared across the sandboxed package files. The
 * four Meteor build packages attach themselves under the keyed properties at
 * runtime, so those are optional until the package files have been executed.
 */
interface PackageGlobal {
  meteor: { Meteor: MeteorGlobal };
  underscore: { _: UnderscoreShim };
  tracker: { Tracker: TrackerShim; Deps: object };
  htmljs?: { HTML: HtmlApi };
  'html-tools'?: { HTMLTools: HtmlToolsApi };
  'blaze-tools'?: { BlazeTools: BlazeToolsApi };
  'spacebars-compiler'?: { SpacebarsCompiler: SpacebarsCompilerApi };
}

// Cache the loaded packages so we only do this once per process
let _cached: MeteorPackages | null = null;

function loadMeteorPackages(): MeteorPackages {
  if (_cached) return _cached;

  // Create a sandbox with the minimal globals the packages expect
  const Meteor: MeteorGlobal = {
    isClient: false,
    isServer: true,
  };

  // The packages expect Package.meteor.Meteor, Package.underscore._,
  // and Package.tracker.Tracker to exist.
  // blaze-tools.js uses _.each; spacebars-compiler.js uses _.each, _.extend,
  // _.indexOf, _.map.  Provide native-JS implementations for all four.
  const Package: PackageGlobal = {
    meteor: { Meteor },
    underscore: {
      _: {
        each(obj, fn) {
          obj.forEach(fn);
        },
        map(obj, fn) {
          return obj.map(fn);
        },
        indexOf(arr, val) {
          return arr.indexOf(val);
        },
        extend(dest, ...sources) {
          sources.forEach(src => {
            if (src) Object.assign(dest, src);
          });
          return dest;
        },
      },
    },
    tracker: {
      Tracker: {
        autorun() {},
        nonreactive(f) {
          return f();
        },
      },
      Deps: {},
    },
  };

  // Build a shared context for all the package files
  const sandbox = {
    Package,
    console,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Math,
    JSON,
    Date,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    undefined,
    NaN,
    Infinity,
    decodeURIComponent,
    encodeURIComponent,
  };

  vm.createContext(sandbox);

  // Load each package file in order (dependencies first)
  const files = [
    'htmljs.js',
    'html-tools.js',
    'blaze-tools.js',
    'spacebars-compiler.js',
  ];

  files.forEach(file => {
    const code = fs.readFileSync(path.join(vendorDir, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  });

  _cached = {
    HTML: sandbox.Package.htmljs!.HTML,
    HTMLTools: sandbox.Package['html-tools']!.HTMLTools,
    BlazeTools: sandbox.Package['blaze-tools']!.BlazeTools,
    SpacebarsCompiler: sandbox.Package['spacebars-compiler']!.SpacebarsCompiler,
  };

  return _cached;
}

export default loadMeteorPackages;
