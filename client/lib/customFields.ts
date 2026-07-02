class CustomField {
  definition: CustomFieldDefinition;
  constructor(definition: CustomFieldDefinition) {
    this.definition = definition;
  }
}

export class CustomFieldStringTemplate extends CustomField {
  format: string;
  separator: string;
  constructor(definition: CustomFieldDefinition) {
    super(definition);
    this.format = definition.settings.stringtemplateFormat;
    this.separator = definition.settings.stringtemplateSeparator;
  }

  getFormattedValue(rawValue?: string[]) {
    const ret = (rawValue ?? [])
      .filter(value => !!value.trim())
      .map(value => {
        let _ret = this.format.replace(/[%$]\{.+?[^0-9]\}/g, function(_match: string) {
          let __ret;
          if (_match.match(/%\{value\}/i)) {
            __ret = value;
          } else {
            _match = _match.replace(/^\$/, "");
            try {
              const _json = JSON.parse(_match);
              __ret =  value.replace(new RegExp(_json.regex, _json.flags), _json.replace);
            } catch (err) {
              console.error(err);
            }
          }
          // The catch branch leaves __ret undefined, which the original code
          // returns as-is (String.replace then substitutes the text
          // "undefined"); the cast preserves that pre-existing runtime behaviour.
          return __ret as string;
        });
        return _ret;
      })
      .join(this.separator ?? '');
    return ret;
  }
}

// Definition document backing a custom field; only the string-template settings
// read by this module are described here.
interface CustomFieldDefinition {
  settings: {
    stringtemplateFormat: string;
    stringtemplateSeparator: string;
  };
}
