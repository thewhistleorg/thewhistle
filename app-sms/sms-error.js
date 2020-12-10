/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* SMS Error class.                                                            Louis Slater 2018  */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

//One instance for each error thrown
class SmsError extends Error {

    /**
     *
     * @param {string}  message - Error message
     * @param {boolean} webRequest - true if the error is on a web request. false otherwise (ie for an SMS request).
     * @param {Object}  twiml
     */
    constructor(message, webRequest, twiml) {
        super(message);
        this.webRequest = webRequest;
        this.twiml = twiml;
    }
}


export default SmsError;
