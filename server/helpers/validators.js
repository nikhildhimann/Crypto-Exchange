class Validator {
  constructor(data = {}, rules = {}) {
    this.data = data;
    this.rules = rules;
    this.errors = {};
  }

  async validate() {
    for (const field of Object.keys(this.rules)) {
      const value = this.resolveFieldValue(field);
      const fieldRules = String(this.rules[field]).split("|");
      const isRequired = fieldRules.some(
        (rule) => rule === "required" || rule.startsWith("required_if:"),
      );

      if (!isRequired && (value === undefined || value === null || value === "")) {
        continue;
      }

      for (const rule of fieldRules) {
        const [ruleName, ruleParam] = rule.includes(":") ? rule.split(":") : [rule];
        const validatorMethod = this[`validate_${ruleName}`];

        if (typeof validatorMethod !== "function") {
          throw new Error(`Validation rule "${ruleName}" is not defined.`);
        }

        if (!validatorMethod.call(this, value, ruleParam, field)) {
          this.addError(field, ruleName, ruleParam);
        }
      }
    }

    if (Object.keys(this.errors).length) {
      const error = new Error("Validation failed");
      error.status = 400;
      error.errors = this.errors;
      throw error;
    }

    return true;
  }

  resolveFieldValue(field) {
    return field.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), this.data);
  }

  addError(field, rule, param) {
    const fieldRules = this.getFieldRules(field);
    const isNumericField =
      fieldRules.includes("numeric") || fieldRules.includes("integer");
    const messages = {
      required: `${field} is required.`,
      required_if: `${field} is required.`,
      min: isNumericField
        ? `${field} must be at least ${param}.`
        : `${field} must be at least ${param} characters long.`,
      max: isNumericField
        ? `${field} must not exceed ${param}.`
        : `${field} must not exceed ${param} characters.`,
      email: `${field} must be a valid email.`,
      string: `${field} must be a string.`,
      boolean: `${field} must be a boolean.`,
      array: `${field} must be an array.`,
      object: `${field} must be an object.`,
      numeric: `${field} must be numeric.`,
      integer: `${field} must be an integer.`,
      date: `${field} must be a valid date.`,
      in: `${field} must be one of: ${param}.`,
      regex: `${field} format is invalid.`,
      mongoid: `${field} must be a valid identifier.`,
    };

    if (!this.errors[field]) {
      this.errors[field] = [];
    }

    this.errors[field].push(messages[rule] || `${field} is invalid.`);
  }

  getFieldRules(field) {
    return String(this.rules[field] || "")
      .split("|")
      .map((rule) => (rule.includes(":") ? rule.split(":")[0] : rule))
      .filter(Boolean);
  }

  isNumericRuleField(field) {
    const fieldRules = this.getFieldRules(field);
    return fieldRules.includes("numeric") || fieldRules.includes("integer");
  }

  resolveComparableValue(value, field) {
    if (this.isNumericRuleField(field)) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    }

    if (Array.isArray(value)) {
      return value.length;
    }

    if (value && typeof value === "object") {
      return Object.keys(value).length;
    }

    return String(value).length;
  }

  validate_required(value) {
    return value !== undefined && value !== null && value !== "";
  }

  validate_required_if(value, param) {
    const [otherField, expectedValue] = String(param).split(",");
    if (this.resolveFieldValue(otherField) === expectedValue) {
      return this.validate_required(value);
    }
    return true;
  }

  validate_min(value, param, field) {
    return this.resolveComparableValue(value, field) >= Number(param);
  }

  validate_max(value, param, field) {
    return this.resolveComparableValue(value, field) <= Number(param);
  }

  validate_email(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
  }

  validate_string(value) {
    return typeof value === "string";
  }

  validate_boolean(value) {
    return (
      typeof value === "boolean" ||
      String(value).toLowerCase() === "true" ||
      String(value).toLowerCase() === "false"
    );
  }

  validate_array(value) {
    return Array.isArray(value);
  }

  validate_object(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  validate_numeric(value) {
    return !Number.isNaN(Number(value));
  }

  validate_integer(value) {
    return Number.isInteger(Number(value));
  }

  validate_date(value) {
    return !Number.isNaN(Date.parse(value));
  }

  validate_in(value, param) {
    return String(param)
      .split(",")
      .map((item) => item.trim())
      .includes(String(value));
  }

  validate_regex(value, param) {
    const pattern = String(param || "");

    if (!Validator.isSafeRegexPattern(pattern)) {
      return false;
    }

    try {
      return new RegExp(pattern).test(String(value));
    } catch (_error) {
      return false;
    }
  }

  validate_mongoid(value) {
    return /^[a-f\d]{24}$/i.test(String(value));
  }

  static isSafeRegexPattern(pattern) {
    if (!pattern || pattern.length > 300) {
      return false;
    }

    // Allow anchored lookaheads/non-capturing groups used by internal amount
    // validators, but keep blocking lookbehinds, named groups, and inline flags.
    if (/\(\?<[=!]/.test(pattern) || /\(\?<[^=!]/.test(pattern)) {
      return false;
    }

    if (/\(\?[a-z-]/i.test(pattern) && !/\(\?:/.test(pattern)) {
      return false;
    }

    if (/\\[1-9]/.test(pattern)) {
      return false;
    }

    if (/[^\w\s\\^$.*+?()[\]{}|,:@!%&=<>/_-]/.test(pattern)) {
      return false;
    }

    try {
      new RegExp(pattern);
      return true;
    } catch (_error) {
      return false;
    }
  }
}

module.exports = Validator;
