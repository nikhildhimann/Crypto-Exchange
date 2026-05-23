const errorCodes = require("../common/constants/errorCodes");

class AppError extends Error {
  constructor(message, { status = 500, code = errorCodes.INTERNAL_ERROR, errors = null } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }

  static validation(message = "Validation failed", errors = null) {
    return new AppError(message, {
      status: 400,
      code: errorCodes.VALIDATION_ERROR,
      errors,
    });
  }

  static unauthorized(message = "Unauthorized") {
    return new AppError(message, {
      status: 401,
      code: errorCodes.UNAUTHORIZED,
    });
  }

  static forbidden(message = "Forbidden") {
    return new AppError(message, {
      status: 403,
      code: errorCodes.FORBIDDEN,
    });
  }

  static notFound(message = "Not found") {
    return new AppError(message, {
      status: 404,
      code: errorCodes.NOT_FOUND,
    });
  }

  static conflict(message = "Conflict") {
    return new AppError(message, {
      status: 409,
      code: errorCodes.CONFLICT,
    });
  }

  static rateLimited(message = "Too many requests") {
    return new AppError(message, {
      status: 429,
      code: errorCodes.RATE_LIMITED,
    });
  }

  static notImplemented(message = "This capability is not implemented yet") {
    return new AppError(message, {
      status: 501,
      code: errorCodes.NOT_IMPLEMENTED,
    });
  }

  static internal(message = "Internal server error") {
    return new AppError(message, {
      status: 500,
      code: errorCodes.INTERNAL_ERROR,
    });
  }
}

module.exports = { AppError };
