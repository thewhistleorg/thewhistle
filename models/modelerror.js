/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* ModelError - error thrown by model includes http status to return when error is thrown in API. */
/*                                                                                 C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


/**
 * Extend Error with ModelError which includes (http) status.
 *
 * This is useful if status codes other than 500 need to be returned from the model (e.g. for
 * referential integrity violations etc).
 *
 * @param {Number} status - HTTP status for API return status
 * @param {String} message - Message associated with error
 */
class ModelError extends Error {
    constructor(status, message) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
    }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default ModelError;
