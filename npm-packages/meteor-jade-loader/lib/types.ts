/**
 * Shared TypeScript types for meteor-jade-loader.
 *
 * The Meteor build packages (htmljs, html-tools, blaze-tools,
 * spacebars-compiler) and the vendored jade fork are untyped legacy code that
 * is executed either inside a Node `vm` sandbox or via CommonJS `require`.
 * These interfaces describe only the surface actually used by the loader so
 * that the interop points are typed without resorting to `any`.
 */

/**
 * A compiled HTMLjs / Spacebars node. These are produced by the Meteor
 * packages and treated as mostly-opaque handles by the loader, which only ever
 * reads/writes the few properties declared here.
 */
export interface HtmlNode {
  content?: HtmlContent;
  elseContent?: HtmlContent;
  position?: number;
  value?: HtmlContent;
}

/**
 * The recursive shape of content accepted and produced by the HTMLjs helpers:
 * plain text, booleans, compiled nodes, or (nested) arrays of the same.
 */
export type HtmlContent =
  | string
  | boolean
  | null
  | undefined
  | HtmlNode
  | HtmlContent[];

/** A dictionary of tag attributes keyed by attribute name. */
export type AttrsDict = { [name: string]: HtmlContent };

export interface HtmlTextmode {
  STRING: string;
  RCDATA: string;
  ATTRIBUTE: string;
}

/** Package.htmljs.HTML */
export interface HtmlApi {
  toHTML(node: HtmlContent): string;
  getTag(tagName: string): (...args: HtmlContent[]) => HtmlNode;
  Comment(value: string): HtmlNode;
  Attrs(...args: HtmlContent[]): HtmlNode;
  TEXTMODE: HtmlTextmode;
}

/** The scanner produced by `new HTMLTools.Scanner(input)`. */
export interface HtmlToolsScanner {
  input: string;
  pos: number;
}

export interface HtmlToolsScannerConstructor {
  new (input: string): HtmlToolsScanner;
}

export interface TemplateTagPosition {
  IN_ATTRIBUTE: number;
  IN_START_TAG: number;
  IN_RCDATA: number;
  IN_RAWTEXT: number;
  ELEMENT: number;
}

export interface ParseFragmentOptions {
  textMode?: string;
  getTemplateTag?: (...args: HtmlContent[]) => HtmlNode;
}

/** Package['html-tools'].HTMLTools */
export interface HtmlToolsApi {
  Scanner: HtmlToolsScannerConstructor;
  parseFragment(input: string, options?: ParseFragmentOptions): HtmlContent;
  TEMPLATE_TAG_POSITION: TemplateTagPosition;
}

export interface ParsedStringLiteral {
  value: string;
}

/** Package['blaze-tools'].BlazeTools */
export interface BlazeToolsApi {
  parseStringLiteral(scanner: HtmlToolsScanner): ParsedStringLiteral | null;
}

export interface CodeGenOptions {
  isBody?: boolean;
  isTemplate?: boolean;
  sourceName?: string;
}

export interface TemplateTagApi {
  parse(input: HtmlContent): HtmlNode;
  parseCompleteTag(...args: HtmlContent[]): HtmlNode;
}

/** Package['spacebars-compiler'].SpacebarsCompiler */
export interface SpacebarsCompilerApi {
  codeGen(tree: HtmlContent, options?: CodeGenOptions): string;
  TemplateTag: TemplateTagApi;
}

/** The bundle of Meteor package APIs the jade compiler needs. */
export interface MeteorPackages {
  HTML: HtmlApi;
  HTMLTools: HtmlToolsApi;
  BlazeTools: BlazeToolsApi;
  SpacebarsCompiler: SpacebarsCompilerApi;
}

/**
 * The value returned by `getCompiler()` in jade-compiler: the assembled
 * JadeCompiler plus the two Meteor packages the loader references directly.
 */
export interface JadeCompilerBundle {
  JadeCompiler: JadeCompilerApi;
  SpacebarsCompiler: SpacebarsCompilerApi;
  HTML: HtmlApi;
}

export interface JadeParseOptions {
  filename?: string;
  fileMode?: boolean;
  lexer?: JadeLexerConstructor;
}

/** The result produced by the FileCompiler (file-mode parse). */
export interface JadeFileResult {
  head: HtmlContent;
  body: HtmlContent;
  bodyAttrs: AttrsDict;
  templates: { [name: string]: HtmlContent };
}

export interface JadeCompilerApi {
  parse(source: string, options?: JadeParseOptions): JadeFileResult | HtmlContent;
  compile(source: string): string;
}

/* ------------------------------------------------------------------ *
 * Jade AST types (from the vendored jade fork's lexer/parser).       *
 * ------------------------------------------------------------------ */

export interface JadeAttr {
  name: string;
  val: string | boolean;
  escaped?: boolean;
}

export interface JadeCode {
  val: string;
  escape?: boolean;
}

export interface JadeBlock {
  nodes: JadeNode[];
}

export interface JadeNode {
  type: string;
  name?: string;
  val?: string;
  args?: string;
  attrs?: JadeAttr[];
  block?: JadeBlock;
  code?: JadeCode;
  escape?: boolean;
  escaped?: boolean;
  textOnly?: boolean;
  line?: number;
  buffer?: boolean;
  call?: boolean;
}

export interface JadeToken {
  type: string;
  val: string;
  args?: string;
}

/** The jade Lexer instance surface used by the custom lexer subclass. */
export interface JadeLexer {
  input: string;
  pipeless: boolean;
  consume(len: number): void;
  tok(type: string, val?: string): JadeToken;
  next(): JadeToken;
}

export interface JadeLexerConstructor {
  new (str: string, filename: string): JadeLexer;
  prototype: JadeLexer;
  call(thisArg: JadeLexer, str: string, filename: string): void;
}

/** The jade Parser instance surface used by the custom parser subclass. */
export interface JadeParser {
  input: string;
  filename: string;
  blocks: { [name: string]: JadeBlock };
  mixins: { [name: string]: JadeNode };
  options: JadeParseOptions;
  lexer: JadeLexer;
  contexts: JadeParser[];
  inMixin: boolean;
  peek(): JadeToken;
  advance(): JadeToken;
  parseTextBlock(): JadeBlock;
  parseMixin(): JadeNode;
  parse(): JadeBlock;
}

export interface JadeParserConstructor {
  new (str: string, filename: string, options?: JadeParseOptions): JadeParser;
  prototype: JadeParser;
}

export interface JadeMixinConstructor {
  new (
    name: string,
    args: string,
    block: JadeBlock,
    call: boolean,
  ): JadeNode;
}

export interface JadeNodes {
  Mixin: JadeMixinConstructor;
}

/** The vendored jade fork module (`./vendor/jade`). */
export interface JadeModule {
  Lexer: JadeLexerConstructor;
  Parser: JadeParserConstructor;
  nodes: JadeNodes;
}
