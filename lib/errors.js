// @ts-check
/**
 * Typed error for anything the user or a client can fix. The handler turns it into
 * a JSON response with the HTTP status, a stable code and, when known, the field at fault.
 */
export class AppError extends Error {
  /**
   * @param {number} status HTTP status
   * @param {string} code stable machine-readable code, for example 'table_too_large'
   * @param {string} message plain words that say how to fix it
   * @param {string} [field] request field the error is about
   */
  constructor(status, code, message, field) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}
