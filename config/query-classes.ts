import { TAPi18n } from '/imports/i18n';
import { 
  formatDateTime, 
  formatDate, 
  formatTime, 
  getISOWeek, 
  isValidDate, 
  isBefore, 
  isAfter, 
  isSame, 
  add, 
  subtract, 
  startOf, 
  endOf, 
  format, 
  parseDate, 
  now, 
  createDate, 
  fromNow, 
  calendar 
} from '/imports/lib/dateUtils';
import {
  OPERATOR_ASSIGNEE,
  OPERATOR_BOARD,
  OPERATOR_COMMENT,
  OPERATOR_CREATED_AT,
  OPERATOR_CREATOR,
  OPERATOR_DEBUG,
  OPERATOR_DUE,
  OPERATOR_HAS,
  OPERATOR_LABEL,
  OPERATOR_LIMIT,
  OPERATOR_LIST,
  OPERATOR_MEMBER,
  OPERATOR_MODIFIED_AT,
  OPERATOR_ORG,
  OPERATOR_SORT,
  OPERATOR_STATUS,
  OPERATOR_SWIMLANE,
  OPERATOR_TEAM,
  OPERATOR_TITLE,
  OPERATOR_DESCRIPTION,
  OPERATOR_CUSTOMFIELD,
  OPERATOR_ATTACHMENT_TEXT,
  OPERATOR_CHECKLIST_TEXT,
  OPERATOR_UNKNOWN,
  OPERATOR_USER,
  ORDER_ASCENDING,
  ORDER_DESCENDING,
  PREDICATE_ALL,
  PREDICATE_ARCHIVED,
  PREDICATE_ASSIGNEES,
  PREDICATE_ATTACHMENT,
  PREDICATE_CHECKLIST,
  PREDICATE_CREATED_AT,
  PREDICATE_DESCRIPTION,
  PREDICATE_DUE_AT,
  PREDICATE_END_AT,
  PREDICATE_ENDED,
  PREDICATE_MEMBERS,
  PREDICATE_MODIFIED_AT,
  PREDICATE_MONTH,
  PREDICATE_OPEN,
  PREDICATE_OVERDUE,
  PREDICATE_PRIVATE,
  PREDICATE_PROJECTION,
  PREDICATE_PUBLIC,
  PREDICATE_QUARTER,
  PREDICATE_SELECTOR,
  PREDICATE_START_AT,
  PREDICATE_WEEK,
  PREDICATE_YEAR,
} from './search-const';
import Boards from '../models/boards';

export class QueryDebug {
  predicate: string | null = null;

  constructor(predicate?: string | null) {
    if (predicate) {
      this.set(predicate)
    }
  }

  get() {
    return this.predicate;
  }

  set(predicate: string | null) {
    if ([PREDICATE_ALL, PREDICATE_SELECTOR, PREDICATE_PROJECTION].includes(
      predicate as string
    )) {
      this.predicate = predicate;
    } else {
      this.predicate = null;
    }
  }

  show() {
    return (this.predicate !== null);
  }

  showAll() {
    return (this.predicate === PREDICATE_ALL);
  }

  showSelector() {
    return (this.predicate === PREDICATE_ALL || this.predicate === PREDICATE_SELECTOR);
  }

  showProjection() {
    return (this.predicate === PREDICATE_ALL || this.predicate === PREDICATE_PROJECTION);
  }
}

export class QueryParams {
  params: QueryParamsMap;
  text = '';

  constructor(params: QueryParamsMap = {}, text = '') {
    this.params = params;
    this.text = text;
  }

  hasOperator(operator: string) {
    const value = this.params[operator] as { length?: number } | undefined;
    return (
      value !== undefined &&
      (value.length === undefined || value.length > 0)
    );
  }

  addPredicate(operator: string, predicate: QueryPredicateValue) {
    if (!this.hasOperator(operator)) {
      this.params[operator] = [];
    }
    (this.params[operator] as QueryPredicateValue[]).push(predicate);
  }

  setPredicate(operator: string, predicate: QueryPredicateValue) {
    this.params[operator] = predicate;
  }

  getPredicate(operator: string) {
    if (this.hasOperator(operator)){
      if (typeof this.params[operator] === 'object') {
        return (this.params[operator] as QueryPredicateValue[])[0];
      } else {
        return this.params[operator];
      }
    }
    return null;
  }

  getPredicates(operator: string) {
    return this.params[operator];
  }

  getParams() {
    return this.params;
  }
}

export class QueryErrors {
  operatorTagMap: OperatorTagMapEntry[] = [
    [OPERATOR_BOARD, 'board-title-not-found'],
    [OPERATOR_SWIMLANE, 'swimlane-title-not-found'],
    [
      OPERATOR_LABEL,
      label => {
        if ((Boards as object as WekanBoardsModel).labelColors().includes(label)) {
          return {
            tag: 'label-color-not-found',
            value: label,
            color: true,
          };
        } else {
          return {
            tag: 'label-not-found',
            value: label,
            color: false,
          };
        }
      },
    ],
    [OPERATOR_LIST, 'list-title-not-found'],
    [OPERATOR_COMMENT, 'comment-not-found'],
    [OPERATOR_USER, 'user-username-not-found'],
    [OPERATOR_ASSIGNEE, 'user-username-not-found'],
    [OPERATOR_MEMBER, 'user-username-not-found'],
    [OPERATOR_CREATOR, 'user-username-not-found'],
    [OPERATOR_ORG, 'org-name-not-found'],
    [OPERATOR_TEAM, 'team-name-not-found'],
  ];

  _errors: Record<string, QueryError[]>;
  operatorTags: Record<string, string | OperatorTagResolver>;
  colorMap: Record<string, string>;

  constructor() {
    this._errors = {};

    this.operatorTags = {};
    this.operatorTagMap.forEach(([operator, tag]) => {
      this.operatorTags[operator] = tag;
    });

    this.colorMap = (Boards as object as WekanBoardsModel).colorMap();
  }

  addError(operator: string, error: QueryError) {
    if (!this._errors[operator]) {
      this._errors[operator] = [];
    }
    this._errors[operator].push(error);
  }

  addNotFound(operator: string, value: string) {
    const operatorTag = this.operatorTags[operator];
    if (typeof operatorTag === 'function') {
      this.addError(operator, operatorTag(value));
    } else {
      this.addError(operator, { tag: operatorTag, value });
    }
  }

  hasErrors() {
    return Object.entries(this._errors).length > 0;
  }

  errors() {
    const errs: QueryError[] = [];
    // eslint-disable-next-line no-unused-vars
    Object.entries(this._errors).forEach(([, errors]) => {
      errors.forEach(err => {
        errs.push(err);
      });
    });
    return errs;
  }

  errorMessages() {
    const messages: string[] = [];
    // eslint-disable-next-line no-unused-vars
    Object.entries(this._errors).forEach(([, errors]) => {
      errors.forEach(err => {
        messages.push(TAPi18n.__(err.tag, err.value));
      });
    });
    return messages;
  }
}

export class Query {
  selector: MongoSelector = {};
  projection: MongoSelector = {};

  _errors: QueryErrors;
  queryParams: QueryParams;
  colorMap: Record<string, string>;

  constructor(selector?: MongoSelector, projection?: MongoSelector) {
    this._errors = new QueryErrors();
    this.queryParams = new QueryParams();
    this.colorMap = (Boards as object as WekanBoardsModel).colorMap();

    if (selector) {
      this.selector = selector;
    }

    if (projection) {
      this.projection = projection;
    }
  }

  hasErrors() {
    return this._errors.hasErrors();
  }

  errors() {
    return this._errors.errors();
  }

  addError(operator: string, error: QueryError) {
    this._errors.addError(operator, error)
  }

  errorMessages() {
    return this._errors.errorMessages();
  }

  getQueryParams() {
    return this.queryParams;
  }

  setQueryParams(queryParams: QueryParams) {
    this.queryParams = queryParams;
  }

  addPredicate(operator: string, predicate: QueryPredicateValue) {
    this.queryParams.addPredicate(operator, predicate);
  }

  buildParams(queryText: string) {
    this.queryParams = new QueryParams();

    queryText = queryText.trim();
    // eslint-disable-next-line no-console
    //console.log('query:', query);

    if (!queryText) {
      return;
    }

    const reOperator1 = new RegExp(
      '^((?<operator>[\\p{Letter}\\p{Mark}]+):|(?<abbrev>[#@]))(?<value>[\\p{Letter}\\p{Mark}]+)(\\s+|$)',
      'iu',
    );
    const reOperator2 = new RegExp(
      '^((?<operator>[\\p{Letter}\\p{Mark}]+):|(?<abbrev>[#@]))(?<quote>["\']*)(?<value>.*?)\\k<quote>(\\s+|$)',
      'iu',
    );
    const reText = new RegExp('^(?<text>\\S+)(\\s+|$)', 'u');
    const reQuotedText = new RegExp(
      '^(?<quote>["\'])(?<text>.*?)\\k<quote>(\\s+|$)',
      'u',
    );
    const reNegatedOperator = new RegExp('^-(?<operator>.*)$');

    const operators: Record<string, string> = {
      'operator-board': OPERATOR_BOARD,
      'operator-board-abbrev': OPERATOR_BOARD,
      'operator-swimlane': OPERATOR_SWIMLANE,
      'operator-swimlane-abbrev': OPERATOR_SWIMLANE,
      'operator-list': OPERATOR_LIST,
      'operator-list-abbrev': OPERATOR_LIST,
      'operator-label': OPERATOR_LABEL,
      'operator-label-abbrev': OPERATOR_LABEL,
      'operator-user': OPERATOR_USER,
      'operator-user-abbrev': OPERATOR_USER,
      'operator-member': OPERATOR_MEMBER,
      'operator-member-abbrev': OPERATOR_MEMBER,
      'operator-assignee': OPERATOR_ASSIGNEE,
      'operator-creator': OPERATOR_CREATOR,
      'operator-assignee-abbrev': OPERATOR_ASSIGNEE,
      'operator-status': OPERATOR_STATUS,
      'operator-due': OPERATOR_DUE,
      'operator-created': OPERATOR_CREATED_AT,
      'operator-modified': OPERATOR_MODIFIED_AT,
      'operator-comment': OPERATOR_COMMENT,
      'operator-has': OPERATOR_HAS,
      'operator-sort': OPERATOR_SORT,
      'operator-limit': OPERATOR_LIMIT,
      'operator-debug': OPERATOR_DEBUG,
      'operator-org': OPERATOR_ORG,
      'operator-team': OPERATOR_TEAM,
      'operator-title': OPERATOR_TITLE,
      'operator-description': OPERATOR_DESCRIPTION,
      'operator-customfield': OPERATOR_CUSTOMFIELD,
      'operator-attachment-text': OPERATOR_ATTACHMENT_TEXT,
      'operator-checklist-text': OPERATOR_CHECKLIST_TEXT,
    };

    const predicates: Record<string, Record<string, string>> = {
      durations: {
        'predicate-week': PREDICATE_WEEK,
        'predicate-month': PREDICATE_MONTH,
        'predicate-quarter': PREDICATE_QUARTER,
        'predicate-year': PREDICATE_YEAR,
      },
    };
    predicates[OPERATOR_DUE] = {
      'predicate-overdue': PREDICATE_OVERDUE,
    };
    predicates[OPERATOR_STATUS] = {
      'predicate-archived': PREDICATE_ARCHIVED,
      'predicate-all': PREDICATE_ALL,
      'predicate-open': PREDICATE_OPEN,
      'predicate-ended': PREDICATE_ENDED,
      'predicate-public': PREDICATE_PUBLIC,
      'predicate-private': PREDICATE_PRIVATE,
    };
    predicates[OPERATOR_SORT] = {
      'predicate-due': PREDICATE_DUE_AT,
      'predicate-created': PREDICATE_CREATED_AT,
      'predicate-modified': PREDICATE_MODIFIED_AT,
    };
    predicates[OPERATOR_HAS] = {
      'predicate-description': PREDICATE_DESCRIPTION,
      'predicate-checklist': PREDICATE_CHECKLIST,
      'predicate-attachment': PREDICATE_ATTACHMENT,
      'predicate-start': PREDICATE_START_AT,
      'predicate-end': PREDICATE_END_AT,
      'predicate-due': PREDICATE_DUE_AT,
      'predicate-assignee': PREDICATE_ASSIGNEES,
      'predicate-member': PREDICATE_MEMBERS,
    };
    predicates[OPERATOR_DEBUG] = {
      'predicate-all': PREDICATE_ALL,
      'predicate-selector': PREDICATE_SELECTOR,
      'predicate-projection': PREDICATE_PROJECTION,
    };

    const predicateTranslations: Record<string, Record<string, string>> = {};
    Object.entries(predicates).forEach(([category, catPreds]) => {
      predicateTranslations[category] = {};
      Object.entries(catPreds).forEach(([tag, value]) => {
        predicateTranslations[category][TAPi18n.__(tag)] = value;
      });
    });
    // eslint-disable-next-line no-console
    // console.log('predicateTranslations:', predicateTranslations);

    const operatorMap: Record<string, string> = {};
    Object.entries(operators).forEach(([key, value]) => {
      operatorMap[TAPi18n.__(key).toLowerCase()] = value;
    });
    // eslint-disable-next-line no-console
    // console.log('operatorMap:', operatorMap);

    let text = '';
    while (queryText) {
      let m = queryText.match(reOperator1);
      if (!m) {
        m = queryText.match(reOperator2);
        if (m) {
          queryText = queryText.replace(reOperator2, '');
        }
      } else {
        queryText = queryText.replace(reOperator1, '');
      }
      if (m) {
        let op;
        if (m.groups!.operator) {
          op = m.groups!.operator.toLowerCase();
        } else {
          op = m.groups!.abbrev.toLowerCase();
        }
        // eslint-disable-next-line no-prototype-builtins
        if (operatorMap.hasOwnProperty(op)) {
          const operator = operatorMap[op];
          let value: QueryPredicateValue = m.groups!.value;
          if (operator === OPERATOR_LABEL) {
            if ((value as string) in this.colorMap) {
              value = this.colorMap[value as string];
              // console.log('found color:', value);
            }
          } else if (
            [OPERATOR_DUE, OPERATOR_CREATED_AT, OPERATOR_MODIFIED_AT].includes(
              operator,
            )
          ) {
            const days = parseInt(value as string, 10);
            let duration: string | null = null;
            if (isNaN(days)) {
              // duration was specified as text
              if (predicateTranslations.durations[value as string]) {
                duration = predicateTranslations.durations[value as string];
                let date: Date | null = null;
                switch (duration) {
                  case PREDICATE_WEEK:
                    // eslint-disable-next-line no-case-declarations
                    const week = getISOWeek(now());
                    if (week === 52) {
                      date = new Date(now().getFullYear() + 1, 0, 1); // January 1st of next year
                    } else {
                      // Calculate the date for the next week
                      const currentDate = now();
                      const daysToAdd = (week + 1) * 7 - (currentDate.getDay() + 6) % 7;
                      date = add(currentDate, daysToAdd, 'days');
                    }
                    break;
                  case PREDICATE_MONTH:
                    // eslint-disable-next-line no-case-declarations
                    const month = now().getMonth();
                    // .getMonth() is zero indexed
                    if (month === 11) {
                      date = new Date(now().getFullYear() + 1, 0, 1); // January 1st of next year
                    } else {
                      date = new Date(now().getFullYear(), month + 1, 1); // First day of next month
                    }
                    break;
                  case PREDICATE_QUARTER:
                    // eslint-disable-next-line no-case-declarations
                    const quarter = Math.floor(now().getMonth() / 3) + 1;
                    if (quarter === 4) {
                      date = new Date(now().getFullYear() + 1, 0, 1); // January 1st of next year
                    } else {
                      const nextQuarterMonth = quarter * 3; // 3, 6, 9 for quarters 2, 3, 4
                      date = new Date(now().getFullYear(), nextQuarterMonth, 1); // First day of next quarter
                    }
                    break;
                  case PREDICATE_YEAR:
                    date = new Date(now().getFullYear() + 1, 0, 1); // January 1st of next year
                    break;
                }
                if (date) {
                  value = {
                    operator: '$lt',
                    value: formatDate(date),
                  };
                }
              } else if (
                operator === OPERATOR_DUE &&
                value === PREDICATE_OVERDUE
              ) {
                value = {
                  operator: '$lt',
                  value: formatDate(now()),
                };
              } else {
                this.addError(OPERATOR_DUE, {
                  tag: 'operator-number-expected',
                  value: { operator: op, value: value as string },
                });
                continue;
              }
            } else if (operator === OPERATOR_DUE) {
              value = {
                operator: '$lt',
                value: formatDate(add(add(now(), 1, 'days'), days + 1, duration ? duration : 'days')),
              };
            } else {
              value = {
                operator: '$gte',
                value: formatDate(subtract(now(), days, duration ? duration : 'days')),
              };
            }
          } else if (operator === OPERATOR_SORT) {
            let negated = false;
            const m = (value as string).match(reNegatedOperator);
            if (m) {
              value = m.groups!.operator;
              negated = true;
            }
            if (!predicateTranslations[OPERATOR_SORT][value as string]) {
              this.addError(OPERATOR_SORT, {
                tag: 'operator-sort-invalid',
                value: value as string,
              });
              continue;
            } else {
              value = {
                name: predicateTranslations[OPERATOR_SORT][value as string],
                order: negated ? ORDER_DESCENDING : ORDER_ASCENDING,
              };
            }
          } else if (operator === OPERATOR_STATUS) {
            if (!predicateTranslations[OPERATOR_STATUS][value as string]) {
              this.addError(OPERATOR_STATUS, {
                tag: 'operator-status-invalid',
                value: value as string,
              });
              continue;
            } else {
              value = predicateTranslations[OPERATOR_STATUS][value as string];
            }
          } else if (operator === OPERATOR_HAS) {
            let negated = false;
            const m = (value as string).match(reNegatedOperator);
            if (m) {
              value = m.groups!.operator;
              negated = true;
            }
            if (!predicateTranslations[OPERATOR_HAS][value as string]) {
              this.addError(OPERATOR_HAS, {
                tag: 'operator-has-invalid',
                value: value as string,
              });
              continue;
            } else {
              value = {
                field: predicateTranslations[OPERATOR_HAS][value as string],
                exists: !negated,
              };
            }
          } else if (operator === OPERATOR_LIMIT) {
            const limit = parseInt(value as string, 10);
            if (isNaN(limit) || limit < 0) {
              this.addError(OPERATOR_LIMIT, {
                tag: 'operator-limit-invalid',
                value: value as string,
              });
              continue;
            } else if (limit == 0) {
              // no limit
              continue;
            } else {
              value = limit;
            }
          } else if (operator === OPERATOR_DEBUG) {
            if (!predicateTranslations[OPERATOR_DEBUG][value as string]) {
              this.addError(OPERATOR_DEBUG, {
                tag: 'operator-debug-invalid',
                value: value as string,
              });
              continue;
            } else {
              value = predicateTranslations[OPERATOR_DEBUG][value as string];
            }
          }

          this.queryParams.addPredicate(operator, value);
        } else {
          this.addError(OPERATOR_UNKNOWN, {
            tag: 'operator-unknown-error',
            value: op,
          });
        }
        continue;
      }

      m = queryText.match(reQuotedText);
      if (!m) {
        m = queryText.match(reText);
        if (m) {
          queryText = queryText.replace(reText, '');
        }
      } else {
        queryText = queryText.replace(reQuotedText, '');
      }
      if (m) {
        text += (text ? ' ' : '') + m.groups!.text;
      }
    }

    this.queryParams.text = text;

    // eslint-disable-next-line no-console
    if (this.queryParams.hasOperator(OPERATOR_DEBUG)) {
      // eslint-disable-next-line no-console
      console.log('text:', this.queryParams.text);
      console.log('queryParams:', this.queryParams);
    }
  }
}

// A single parsed predicate value produced by the query parser. It starts as a
// raw string token and may be narrowed/transformed into a structured predicate
// (date range, sort spec, existence check) or a numeric limit.
type QueryPredicateValue =
  | string
  | number
  | { operator: string; value: string }
  | { name: string; order: string }
  | { field: string; exists: boolean };

// Map of search operator -> the predicate(s) recorded for it. A given operator
// may hold either a list of predicates (the common case) or a single scalar
// predicate set via setPredicate.
interface QueryParamsMap {
  [operator: string]: QueryPredicateValue[] | QueryPredicateValue;
}

// The `value` payload attached to a query error, either a raw token or an
// operator/value pair describing the offending input.
type QueryErrorValue = string | { operator: string; value: string };

// A single query parse error, translated to a user-facing message via TAPi18n.
interface QueryError {
  tag: string;
  value?: QueryErrorValue;
  color?: boolean;
}

// Resolver used for operators (e.g. label) whose error tag depends on the value.
type OperatorTagResolver = (label: string) => QueryError;

// Entry in the operator -> error-tag map: either a static tag or a resolver.
type OperatorTagMapEntry = [string, string | OperatorTagResolver];

// A MongoDB selector/projection object passed into a Query. Kept intentionally
// permissive (recursive record) since selectors are built dynamically.
// Wekan augments the Boards Mongo.Collection with helper methods that are not
// part of the base collection type; narrow to them where needed.
interface WekanBoardsModel {
  labelColors(): string[];
  colorMap(): Record<string, string>;
}

interface MongoSelector {
  [key: string]:
    | string
    | number
    | boolean
    | Date
    | RegExp
    | MongoSelector
    | MongoSelector[]
    | null
    | undefined;
}
