/**
 * Jade compiler adapted from mquandalle:jade-compiler Meteor package.
 *
 * This module brings together:
 * - The custom Lexer (handles +component, if/unless/each/with)
 * - The custom Parser (wraps jade's parser with custom lexer + markdown mixin)
 * - The transpilers (FileCompiler, TemplateCompiler) that convert Jade AST to Spacebars AST
 * - The JadeCompiler API that orchestrates parse -> compile
 */

// NOTE: Do NOT use 'use strict' here. The original Meteor jade compiler code
// relies on sloppy mode behavior, e.g. setting properties on string primitives
// (which silently fails in sloppy mode but throws in strict mode).

import path from 'path';
import loadMeteorPackages from './meteor-packages';

// The forked jade 1.3.0 package bundled from mquandalle's fork
import jade from './vendor/jade';

import {
  AttrsDict,
  HtmlContent,
  HtmlNode,
  JadeAttr,
  JadeBlock,
  JadeCode,
  JadeCompilerApi,
  JadeCompilerBundle,
  JadeFileResult,
  JadeLexer,
  JadeNode,
  JadeParseOptions,
  JadeParser,
  JadeToken,
  ParseFragmentOptions,
} from './types';

let _compiler: JadeCompilerBundle | null = null;

function getCompiler(): JadeCompilerBundle {
  if (_compiler) return _compiler;

  const pkgs = loadMeteorPackages();
  const HTML = pkgs.HTML;
  const HTMLTools = pkgs.HTMLTools;
  const BlazeTools = pkgs.BlazeTools;
  const SpacebarsCompiler = pkgs.SpacebarsCompiler;

  // ============================================================
  // Lexer — from mquandalle:jade-compiler/lib/lexer.js
  // ============================================================

  // We get the Lexer constructor from the forked jade package
  const JadeLexer = jade.Lexer;

  // Create our custom Lexer by subclassing
  const Lexer = function (
    this: LexerInstance,
    str: string,
    filename: string,
  ): void {
    JadeLexer.call(this, str, filename);
  } as object as LexerConstructor;
  Lexer.prototype = Object.create(JadeLexer.prototype);
  (Lexer.prototype as object as { constructor: LexerConstructor }).constructor =
    Lexer;

  // Copy all own properties from jade Lexer prototype
  // (some are defined as own props, not on the prototype chain)
  Object.keys(JadeLexer.prototype).forEach(function (key) {
    const subProto = Lexer.prototype as object as Record<string, ProtoMethod>;
    const superProto = JadeLexer.prototype as object as Record<
      string,
      ProtoMethod
    >;
    if (!Object.prototype.hasOwnProperty.call(subProto, key)) {
      subProto[key] = superProto[key];
    }
  });

  const unwrap = function (value: string): string | undefined {
    if (typeof value === 'string' && value.trim())
      return /^\(?(.+?)\)?$/m.exec(value.replace(/\n/g, '').trim())![1];
  };

  // Built-in components: if, unless, else if, else, with, each
  Lexer.prototype.builtInComponents = function (
    this: LexerInstance,
  ): JadeToken | undefined {
    const self = this;
    let tok: JadeToken;
    const captures = /^(if|unless|else if|else|with|each)\b(.*)/.exec(
      self.input,
    );
    if (captures) {
      self.consume(captures[0].length);
      tok = self.tok('mixin', captures[1]);
      tok.args = unwrap(captures[2]);
      return tok;
    }
  };

  // User components: +componentName(arguments)
  Lexer.prototype.userComponents = function (
    this: LexerInstance,
  ): JadeToken | undefined {
    const self = this;
    let tok: JadeToken;
    let argRegex: RegExp;
    const captureComponentName = /^\+([\.\w-]+) */.exec(self.input);
    if (captureComponentName) {
      self.consume(captureComponentName[0].length);
      tok = self.tok('mixin', captureComponentName[1]);
      if (self.input[0] === '(') {
        argRegex = /^\([\s\S]*?\)(?=(([^"]*"){2})*[^"]*$)/m;
      } else {
        argRegex = /[^\n]*/;
      }
      const capturesArgs = argRegex.exec(self.input);
      self.consume(capturesArgs![0].length);
      tok.args = unwrap(capturesArgs![0]);
      return tok;
    }
  };

  // Override next() to add our custom token types
  const _lexerSuperNext = JadeLexer.prototype.next;
  Lexer.prototype.next = function (this: LexerInstance): JadeToken {
    const self = this;
    return (
      self.builtInComponents() ||
      self.userComponents() ||
      _lexerSuperNext.call(self)
    );
  };

  // ============================================================
  // Parser — from mquandalle:jade-compiler/lib/parser.js
  // ============================================================

  const JadeParser = jade.Parser;
  const jadeNodes = jade.nodes;

  const Parser = function (
    this: JadeParser,
    str: string,
    filename: string,
    options?: JadeParseOptions,
  ): void {
    // Strip any UTF-8 BOM
    this.input = str.replace(/^\uFEFF/, '');
    this.filename = filename;
    this.blocks = {};
    this.mixins = {};
    this.options = options || {};
    const Constructor = this.options.lexer || Lexer;
    this.lexer = new Constructor(this.input, filename);
    this.contexts = [this];
    this.inMixin = false;
  } as object as ParserConstructor;

  Parser.prototype = Object.create(JadeParser.prototype);
  (Parser.prototype as object as { constructor: ParserConstructor }).constructor =
    Parser;

  // Override parseMixin to handle markdown component specially
  const _parserSuperParseMixin = JadeParser.prototype.parseMixin;
  Parser.prototype.parseMixin = function (this: JadeParser): JadeNode {
    const tok = this.peek();
    let mixin: JadeNode;

    if (tok.type === 'mixin' && tok.val === 'markdown') {
      this.advance();
      this.lexer.pipeless = true;
      mixin = new jadeNodes.Mixin(
        'markdown',
        '',
        this.parseTextBlock(),
        false,
      );
      this.lexer.pipeless = false;
      return mixin;
    } else {
      return _parserSuperParseMixin.call(this);
    }
  };

  // ============================================================
  // Transpilers — from mquandalle:jade-compiler/lib/transpilers.js
  // ============================================================

  const noNewLinePrefix = '__noNewLine__';
  const startsWithNoNewLinePrefix = new RegExp('^' + noNewLinePrefix);

  const stringRepresentationToLiteral = function (
    val: HtmlContent,
  ): string | null {
    if (typeof val !== 'string') return null;

    const scanner = new HTMLTools.Scanner(val);
    const parsed = BlazeTools.parseStringLiteral(scanner);
    return parsed ? parsed.value : null;
  };

  const isSpecialMarkdownComponent = function (node: JadeNode): boolean {
    return node.type === 'Mixin' && node.name === 'markdown';
  };

  const isTextOnlyNode = function (node: JadeNode): boolean {
    const textOnlyTags = ['textarea', 'script', 'style'];
    return (
      !!node.textOnly &&
      node.type === 'Tag' &&
      textOnlyTags.indexOf(node.name!) !== -1
    );
  };

  const throwError = function (message: string | undefined, node: JadeNode): never {
    message = message || 'Syntax error';
    if (node.line) message += ' on line ' + node.line;
    throw new Error(message);
  };

  // ---- FileCompiler ----
  const FileCompiler = function (
    this: FileCompilerInstance,
    tree: JadeBlock,
    options?: CompilerOptions,
  ): void {
    const self = this;
    self.nodes = tree.nodes;
    self.filename = (options && options.filename) || '';
    self.head = null;
    self.body = null;
    self.bodyAttrs = {};
    self.templates = {};
  } as object as FileCompilerConstructor;

  Object.assign(FileCompiler.prototype, {
    compile: function (this: FileCompilerInstance): JadeFileResult {
      const self = this;
      for (let i = 0; i < self.nodes.length; i++)
        self.registerRootNode(self.nodes[i]);

      return {
        head: self.head,
        body: self.body,
        bodyAttrs: self.bodyAttrs,
        templates: self.templates,
      };
    },

    registerRootNode: function (this: FileCompilerInstance, node: JadeNode): void {
      const self = this;

      if (
        node.type === 'Comment' ||
        node.type === 'BlockComment' ||
        (node.type === 'TAG' && node.name === undefined)
      ) {
        return;
      } else if (node.type === 'Doctype') {
        throwError('Meteor sets the doctype for you', node);
      } else if (node.name === 'body' || node.name === 'head') {
        const template = node.name;

        if (self[template] !== null) throwError(template + ' is set twice', node);
        if (node.name === 'head' && node.attrs!.length > 0)
          throwError('Attributes on head are not supported', node);
        else if (node.name === 'body' && node.attrs!.length > 0)
          self.bodyAttrs = self.formatBodyAttrs(node.attrs!);

        self[template] = new TemplateCompiler(node.block!).compile();
      } else if (node.name === 'template') {
        if (node.attrs!.length !== 1 || node.attrs![0].name !== 'name')
          throwError('Templates must only have a "name" attribute', node);

        const name = (node.attrs![0].val as string).slice(1, -1);

        if (Object.prototype.hasOwnProperty.call(self.templates, name))
          throwError('Template "' + name + '" is set twice', node);

        self.templates[name] = new TemplateCompiler(node.block!).compile();
      } else {
        throwError(node.type + ' must be in a template', node);
      }
    },

    formatBodyAttrs: function (
      this: FileCompilerInstance,
      attrsList: JadeAttr[],
    ): AttrsDict {
      const attrsDict: AttrsDict = {};
      attrsList.forEach(function (attr) {
        if (attr.escaped) attr.val = (attr.val as string).slice(1, -1);
        attrsDict[attr.name] = attr.val;
      });
      return attrsDict;
    },
  });

  // ---- TemplateCompiler ----
  const TemplateCompiler = function (
    this: TemplateCompilerInstance,
    tree: JadeBlock,
    options?: CompilerOptions,
  ): void {
    const self = this;
    self.tree = tree;
    self.filename = (options && options.filename) || '';
  } as object as TemplateCompilerConstructor;

  Object.assign(TemplateCompiler.prototype, {
    compile: function (this: TemplateCompilerInstance): HtmlContent {
      const self = this;
      return self._optimize(self.visitBlock(self.tree));
    },

    visitBlock: function (
      this: TemplateCompilerInstance,
      block?: JadeBlock | null,
    ): HtmlContent[] {
      if (
        block === undefined ||
        block === null ||
        !Object.prototype.hasOwnProperty.call(block, 'nodes')
      )
        return [];

      const self = this;
      const buffer: HtmlContent[] = [];
      const nodes = block.nodes;
      let currentNode: JadeNode;
      let elseNode: JadeNode | undefined = undefined;
      let stack: JadeNode[] = [];

      for (let i = 0; i < nodes.length; i++) {
        currentNode = nodes[i];

        if (currentNode.type === 'Mixin') {
          stack = [];
          while (
            currentNode.name === 'if' &&
            nodes[i + 1] &&
            nodes[i + 1].type === 'Mixin' &&
            nodes[i + 1].name === 'else if'
          ) {
            stack.push(nodes[++i]);
          }

          if (
            nodes[i + 1] &&
            nodes[i + 1].type === 'Mixin' &&
            nodes[i + 1].name === 'else'
          ) {
            stack.push(nodes[++i]);
          }

          elseNode = stack.shift();
          if (elseNode && elseNode.name === 'else if') {
            elseNode.name = 'if';
            elseNode = {
              name: 'else',
              type: 'Mixin',
              block: { nodes: [elseNode].concat(stack) },
              call: false,
            };
          }
        }

        buffer.push(self.visitNode(currentNode, elseNode));
      }

      return buffer;
    },

    getRawText: function (
      this: TemplateCompilerInstance,
      block: JadeBlock,
    ): string {
      const self = this;
      let parts: HtmlContent[] = block.nodes.map(function (n) {
        return n.val;
      });
      parts = self._interposeEOL(parts);
      return (parts as string[]).reduce(function (a, b) {
        return a + b;
      }, '');
    },

    visitNode: function (
      this: TemplateCompilerInstance,
      node: JadeNode,
      elseNode?: JadeNode,
    ): HtmlContent {
      const self = this;
      const attrs = self.visitAttributes(node.attrs);
      let content: HtmlContent;

      if (node.code) {
        content = self.visitCode(node.code);
      } else if (isTextOnlyNode(node) || isSpecialMarkdownComponent(node)) {
        content = self.getRawText(node.block!);
        if (isSpecialMarkdownComponent(node)) {
          content = self.parseText(content, { textMode: HTML.TEXTMODE.STRING });
        }
      } else {
        content = self.visitBlock(node.block);
      }

      const elseContent = self.visitBlock(elseNode && elseNode.block);

      const dispatch = self as object as Record<string, VisitMethod>;
      return dispatch['visit' + node.type].call(
        self,
        node,
        attrs,
        content,
        elseContent,
      );
    },

    visitCode: function (
      this: TemplateCompilerInstance,
      code: JadeCode,
    ): HtmlContent {
      const val = code.val;
      const strLiteral = stringRepresentationToLiteral(val);
      if (strLiteral !== null) {
        return noNewLinePrefix + strLiteral;
      } else {
        return [this._spacebarsParse(this.lookup(code.val, code.escape))];
      }
    },

    visitMixin: function (
      this: TemplateCompilerInstance,
      node: JadeNode,
      attrs: HtmlContent,
      content: HtmlContent,
      elseContent: HtmlContent,
    ): HtmlNode {
      const self = this;
      const componentName = node.name;

      if (componentName === 'else') throwError('Unexpected else block', node);

      const spacebarsSymbol = (content as HtmlContent[]).length === 0 ? '>' : '#';
      const args = node.args || '';
      const mustache = '{{' + spacebarsSymbol + componentName + ' ' + args + '}}';
      const tag = self._spacebarsParse(mustache);

      content = self._optimize(content);
      elseContent = self._optimize(elseContent);
      if (content) tag.content = content;
      if (elseContent) tag.elseContent = elseContent;

      return tag;
    },

    visitTag: function (
      this: TemplateCompilerInstance,
      node: JadeNode,
      attrs: AttrsDict,
      content: HtmlContent,
    ): HtmlNode {
      const self = this;
      const tagName = node.name!.toLowerCase();

      content = self._optimize(content, true);

      if (tagName === 'textarea') {
        attrs.value = content;
        content = null;
      } else if (tagName === 'style') {
        content = self.parseText(content as string);
      }

      if (!Array.isArray(content)) content = content ? [content] : [];

      if (Object.keys(attrs).length > 0) content.unshift(attrs);

      return HTML.getTag(tagName).apply(null, content);
    },

    visitText: function (
      this: TemplateCompilerInstance,
      node: JadeNode,
    ): HtmlContent {
      const self = this;
      return node.val ? self.parseText(node.val) : null;
    },

    parseText: function (
      this: TemplateCompilerInstance,
      text: string,
      options?: ParseFragmentOptions,
    ): HtmlContent {
      text = text.replace(/#\{\s*((\.{1,2}\/)*[\w\.-]+)\s*\}/g, '{{$1}}');
      text = text.replace(/!\{\s*((\.{1,2}\/)*[\w\.-]+)\s*\}/g, '{{{$1}}}');

      options = options || {};
      options.getTemplateTag = SpacebarsCompiler.TemplateTag.parseCompleteTag;

      return HTMLTools.parseFragment(text, options);
    },

    visitComment: function (
      this: TemplateCompilerInstance,
      comment: JadeNode,
    ): HtmlNode | undefined {
      if (comment.buffer) return HTML.Comment(comment.val!);
    },

    visitBlockComment: function (
      this: TemplateCompilerInstance,
      comment: JadeNode,
    ): HtmlNode | undefined {
      const self = this;
      comment.val =
        '\n' +
        comment
          .block!.nodes.map(function (n) {
            return n.val;
          })
          .join('\n') +
        '\n';
      return self.visitComment(comment);
    },

    visitFilter: function (
      this: TemplateCompilerInstance,
      filter: JadeNode,
    ): HtmlContent {
      return throwError('Jade filters are not supported in meteor-jade', filter);
    },

    visitWhen: function (
      this: TemplateCompilerInstance,
      node: JadeNode,
    ): HtmlContent {
      return throwError('Case statements are not supported in meteor-jade', node);
    },

    visitAttributes: function (
      this: TemplateCompilerInstance,
      attrs?: JadeAttr[] | string,
    ): HtmlContent {
      if (attrs === undefined) return;

      if (typeof attrs === 'string') return attrs;

      const self = this;
      const dict: AttrsDict = {};

      const concatAttributes = function (
        a: HtmlContent,
        b: HtmlContent,
      ): HtmlContent {
        if (typeof a === 'string' && typeof b === 'string') return a + b;
        if (a === undefined) return b;

        if (!Array.isArray(a)) a = [a];
        if (!Array.isArray(b)) b = [b];
        return a.concat(b);
      };
      const dynamicAttrs: HtmlContent[] = [];

      attrs.forEach(function (attr) {
        let val: HtmlContent = attr.val;
        const key = attr.name;

        const strLiteral = stringRepresentationToLiteral(val);
        if (strLiteral) {
          val = self.parseText(strLiteral, { textMode: HTML.TEXTMODE.STRING });
          // parseText may return a primitive string; only set .position on objects/arrays
          if (val !== null && val !== undefined && typeof val === 'object') {
            (val as HtmlNode).position =
              HTMLTools.TEMPLATE_TAG_POSITION.IN_ATTRIBUTE;
          }
        } else if (val === true || val === "''" || val === '""') {
          val = '';
        } else {
          val = self._spacebarsParse(
            self.lookup(val as string | boolean, attr.escaped),
          );
          if (val !== null && val !== undefined && typeof val === 'object') {
            (val as HtmlNode).position =
              HTMLTools.TEMPLATE_TAG_POSITION.IN_ATTRIBUTE;
          }
        }

        if (key === '$dyn') {
          if (val !== null && val !== undefined && typeof val === 'object') {
            (val as HtmlNode).position =
              HTMLTools.TEMPLATE_TAG_POSITION.IN_START_TAG;
          }
          return dynamicAttrs.push(val);
        } else if ((key === 'class' || key === 'id') && dict[key]) {
          val = [' ', val];
        }

        dict[key] = concatAttributes(dict[key], val);
      });

      if (dynamicAttrs.length === 0) {
        return dict;
      } else {
        dynamicAttrs.unshift(dict);
        return HTML.Attrs.apply(null, dynamicAttrs);
      }
    },

    lookup: function (
      this: TemplateCompilerInstance,
      val: string | boolean,
      escape?: boolean,
    ): HtmlContent {
      let mustache = '{{' + val + '}}';
      if (!escape) mustache = '{' + mustache + '}';
      return HTMLTools.parseFragment(mustache);
    },

    _spacebarsParse: SpacebarsCompiler.TemplateTag.parse,

    _removeNewLinePrefixes: function (
      this: TemplateCompilerInstance,
      array: HtmlContent,
    ): HtmlContent {
      const removeNewLinePrefix = function (val: HtmlContent): HtmlContent {
        if (typeof val === 'string' && startsWithNoNewLinePrefix.test(val))
          return val.slice(noNewLinePrefix.length);
        else return val;
      };

      if (!Array.isArray(array)) return removeNewLinePrefix(array);
      else return array.map(removeNewLinePrefix);
    },

    _interposeEOL: function (
      this: TemplateCompilerInstance,
      array: HtmlContent[],
    ): HtmlContent[] {
      for (let i = array.length - 1; i > 0; i--) {
        const item = array[i];
        if (!(typeof item === 'string' && startsWithNoNewLinePrefix.test(item)))
          array.splice(i, 0, '\n');
      }
      return array;
    },

    _optimize: function (
      this: TemplateCompilerInstance,
      content: HtmlContent,
      interposeEOL?: boolean,
    ): HtmlContent {
      const self = this;

      if (!Array.isArray(content)) return self._removeNewLinePrefixes(content);

      if (content.length === 0) return undefined;
      if (content.length === 1) content = self._optimize(content[0]);
      else if (interposeEOL) content = self._interposeEOL(content);
      else content = content;

      return self._removeNewLinePrefixes(content);
    },
  });

  // ============================================================
  // JadeCompiler API — from mquandalle:jade-compiler/lib/exports.js
  // ============================================================

  const codeGen = SpacebarsCompiler.codeGen;

  const JadeCompiler: JadeCompilerApi = {
    parse: function (
      source: string,
      options?: JadeParseOptions,
    ): JadeFileResult | HtmlContent {
      options = options || {};
      let parser: JadeParser;
      let Compiler: FileCompilerConstructor | TemplateCompilerConstructor;

      try {
        parser = new Parser(source, options.filename || '', { lexer: Lexer });
        Compiler = options.fileMode ? FileCompiler : TemplateCompiler;
        return new Compiler(parser.parse(), options).compile();
      } catch (err) {
        throw err;
      }
    },

    compile: function (source: string): string {
      const ast = JadeCompiler.parse(source, { fileMode: false });
      return codeGen(ast as HtmlContent);
    },
  };

  _compiler = {
    JadeCompiler: JadeCompiler,
    SpacebarsCompiler: SpacebarsCompiler,
    HTML: HTML,
  };

  return _compiler;
}

export = getCompiler;

/* ------------------------------------------------------------------ *
 * Local structural types for the prototype-based classes defined      *
 * inside getCompiler(). Placed below the code per migration style.    *
 * ------------------------------------------------------------------ */

/** A method copied between jade Lexer prototypes. */
type ProtoMethod = (...args: JadeToken[]) => JadeToken;

/** The custom Lexer instance (jade Lexer + our component tokenizers). */
interface LexerInstance extends JadeLexer {
  builtInComponents(): JadeToken | undefined;
  userComponents(): JadeToken | undefined;
}

interface LexerConstructor {
  new (str: string, filename: string): LexerInstance;
  prototype: LexerInstance;
}

interface ParserConstructor {
  new (str: string, filename: string, options?: JadeParseOptions): JadeParser;
  prototype: JadeParser;
}

/** Options accepted by the FileCompiler / TemplateCompiler constructors. */
interface CompilerOptions {
  filename?: string;
}

/** Signature shared by every `visit<NodeType>` transpiler method. */
type VisitMethod = (
  this: TemplateCompilerInstance,
  node: JadeNode,
  attrs?: HtmlContent,
  content?: HtmlContent,
  elseContent?: HtmlContent,
) => HtmlContent;

interface FileCompilerInstance {
  nodes: JadeNode[];
  filename: string;
  head: HtmlContent;
  body: HtmlContent;
  bodyAttrs: AttrsDict;
  templates: { [name: string]: HtmlContent };
  compile(): JadeFileResult;
  registerRootNode(node: JadeNode): void;
  formatBodyAttrs(attrsList: JadeAttr[]): AttrsDict;
}

interface FileCompilerConstructor {
  new (tree: JadeBlock, options?: CompilerOptions): FileCompilerInstance;
  prototype: FileCompilerInstance;
}

interface TemplateCompilerInstance {
  tree: JadeBlock;
  filename: string;
  compile(): HtmlContent;
  visitBlock(block?: JadeBlock | null): HtmlContent[];
  getRawText(block: JadeBlock): string;
  visitNode(node: JadeNode, elseNode?: JadeNode): HtmlContent;
  visitCode(code: JadeCode): HtmlContent;
  visitMixin(
    node: JadeNode,
    attrs: HtmlContent,
    content: HtmlContent,
    elseContent: HtmlContent,
  ): HtmlNode;
  visitTag(node: JadeNode, attrs: AttrsDict, content: HtmlContent): HtmlNode;
  visitText(node: JadeNode): HtmlContent;
  parseText(text: string, options?: ParseFragmentOptions): HtmlContent;
  visitComment(comment: JadeNode): HtmlNode | undefined;
  visitBlockComment(comment: JadeNode): HtmlNode | undefined;
  visitFilter(filter: JadeNode): never;
  visitWhen(node: JadeNode): never;
  visitAttributes(attrs?: JadeAttr[] | string): HtmlContent;
  lookup(val: string | boolean, escape?: boolean): HtmlContent;
  _spacebarsParse(input: HtmlContent): HtmlNode;
  _removeNewLinePrefixes(array: HtmlContent): HtmlContent;
  _interposeEOL(array: HtmlContent[]): HtmlContent[];
  _optimize(content: HtmlContent, interposeEOL?: boolean): HtmlContent;
}

interface TemplateCompilerConstructor {
  new (tree: JadeBlock, options?: CompilerOptions): TemplateCompilerInstance;
  prototype: TemplateCompilerInstance;
}
