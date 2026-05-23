const Validator = require("../helpers/validators");
const { AppError } = require("../helpers/errors");
const { pickAllowedTopLevelFields } = require("../helpers/sanitize");

function validateRequest(rules) {
  return async (req, res, next) => {
    try {
      const resolvedRules = typeof rules === "function" ? rules(req) : rules;
      const allowedFields = Object.keys(resolvedRules || {});

      req.body = pickAllowedTopLevelFields(req.body || {}, allowedFields);
      req.params = pickAllowedTopLevelFields(req.params || {}, allowedFields);
      req.query = pickAllowedTopLevelFields(req.query || {}, allowedFields);

      const validator = new Validator(
        {
          ...req.body,
          ...req.params,
          ...req.query,
        },
        resolvedRules || {},
      );
      await validator.validate();
      next();
    } catch (error) {
      next(
        error.status
          ? AppError.validation(error.message, error.errors)
          : error,
      );
    }
  };
}

function allowRoles(roles = []) {
  const normalizedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }

    if (!normalizedRoles.length || normalizedRoles.includes(req.user.role)) {
      return next();
    }

    return next(AppError.forbidden("You do not have permission for this action"));
  };
}

module.exports = {
  validateRequest,
  allowRoles,
};
