export class AppError extends Error {
  statusCode: number;
  errors?: { field: string; message: string }[];
  /** Stable machine-readable identifier so clients can branch on the failure without parsing `message`. */
  code?: string;

  constructor(statusCode: number, message: string, errors?: { field: string; message: string }[], code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(errors: { field: string; message: string }[], message = "Validation failed") {
    super(422, message, errors);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(401, message);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(409, message);
  }
}

/**
 * 402 - the caller is authenticated and authorized, but their organization has no active
 * subscription (trial lapsed, payment never made, or period ended). `reason` is echoed so the
 * billing page can tell "your trial ended" apart from "your card failed".
 */
export class PaymentRequiredError extends AppError {
  reason: string;

  constructor(reason: string, message = "An active subscription is required to use this feature") {
    super(402, message, undefined, "SUBSCRIPTION_REQUIRED");
    this.reason = reason;
  }
}
