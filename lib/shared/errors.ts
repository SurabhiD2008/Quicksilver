// The one error vocabulary for the whole API. Every error response is
// { "error": { "code": "<CODE>", "message": "<sentence>" } }.

export const ERRORS = {
  MALFORMED_JSON: { status: 400, message: 'The request body is not valid JSON.' },
  VALIDATION_FAILED: {
    status: 400,
    message: 'The request body does not match the expected shape.',
  },
  UNAUTHENTICATED: { status: 401, message: 'A valid bearer token is required.' },
  NOT_FOUND: { status: 404, message: 'No such route.' },
  VISIT_NOT_FOUND: { status: 404, message: 'No visit has that id.' },
  METHOD_NOT_ALLOWED: { status: 405, message: 'This route does not support that method.' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'The request body is too large.' },
  UNSUPPORTED_MEDIA_TYPE: { status: 415, message: 'Send the request body as application/json.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Try again later.' },
  DAILY_CAP_REACHED: { status: 429, message: 'The daily visit limit has been reached.' },
  ANALYTICS_DISABLED: { status: 503, message: 'Analytics is not configured on this deployment.' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong on our side.' },
  DATABASE_UNAVAILABLE: { status: 503, message: 'The database is unavailable. Try again later.' },
} as const;

export type ErrorCode = keyof typeof ERRORS;

export const ERROR_CODES = Object.keys(ERRORS) as [ErrorCode, ...ErrorCode[]];

export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

export function errorBody(code: ErrorCode): ErrorBody {
  return { error: { code, message: ERRORS[code].message } };
}
