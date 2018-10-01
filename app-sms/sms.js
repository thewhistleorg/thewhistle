/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Backend code for SMS API. Handles receiving and sending texts.              Louis Slater 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Twilio         from 'twilio';

import Report         from '../models/report.js';
import autoIdentifier from '../lib/auto-identifier.js';
import Db             from '../lib/db.js';
import SmsError       from '../app-sms/sms-error.js';
import FormGenerator  from '../lib/form-generator.js';

const constants = {
    SMS_NEW_REPORT:  'new_report',
    SMS_USED_BEFORE: 'used_before',
    SMS_ALIAS:       'alias',
    SMS_FINAL:       'final',
    SMS_RESPONSE:    'response',
    SMS_CONTINUE:    'continue',
    SMS_STORE:       'store',

    YES:     'yes',
    NO:      'no',
    UNKNOWN: 'unknown',

    cookies: {
        FIRST_TEXT:    'first_text',
        SESSION_ID:    'session_id',
        ALIAS:         'alias',
        NEXT_QUESTION: 'next_question',
        NEXT_SMS_TYPE: 'next_sms_type',
    },
};


//One instance for each project/organisation combination
class SmsApp {


    /**
     * Sets up SMS app for a given organisation/project combination
     *
     * @param   {string}   org - Organisation name
     * @param   {string}   project - Project name
     * 
     * @returns {Object}   SMS app object
     */
    constructor(org, project) {
        this.MessagingResponse = Twilio.twiml.MessagingResponse;
        this.db = org;
        //Remove -test from organisation if it is in it
        this.yamlFile = 'public/spec/' + org.replace('-test', '') + '/' + project + '.yaml';
        this.org = org;
        this.project = project;
        this.spec = null; // has to be done later as constructors can't have async expressions!
        this.questions = [];
    }


    /**
     * Parses the .yaml specifications, then sets this.spec, this.initialSms
     * and this.questions using the specifications.
     */
    async parseSpecifications() {
        if (!this.spec) this.spec = await FormGenerator.spec(this.org, this.project);
        this.getInitialSms();
        this.generateSmsQuestions();
    }


    /**
     * Sends the user an SMS by sending a POST request to Twilio.
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {string}   message - Text of the message to the user
     */
    sendSms(twiml, message) {
        const options = {
            method: 'POST',
            action: '/delete-outbound',
        };
        twiml.message(options, message);
        //Asynchronous call - method returns before effects carried out
    }


    /**
     * Determines whether there is an existing report for a given alias.
     *
     * @param   {string}   alias - Alias to check
     * 
     * @returns {boolean}  False if there are no reports in the database with the given alias. True otherwise.
     */
    async aliasExists(alias) {
        const reports = await Report.getBy(this.db, 'alias', alias);
        const ret = reports.length != 0;
        return ret;
    }


    /**
     * Generates an alias for which there is no existing report
     *
     * @returns {string}  Unique alias
     */
    async generateUniqueAlias() {
        //TODO: Accommodate for no free aliases?
        let alias = '';

        do {
            alias = await autoIdentifier();
        }
        while (await this.aliasExists(alias));

        return alias;
    }


    /**
     * Sets a cookie with a given key to a given value
     *
     * @param   {Object}   ctx
     * @param   {string}   key - Cookie key
     * @param   {Object}   value - Value to set cookie to
     */
    setCookie(ctx, key, value) {
        ctx.cookies.set(key, value, { httpOnly: false });
    }


    /**
     * Returns the value of a given cookie
     * 
     * @param {Object} ctx 
     * @param {string} key - Key for the cookie to get
     * @param {Object} twiml
     * 
     * @returns {string} - Value of the given cookie
     */
    getCookie(ctx, key, twiml) {
        const value = ctx.cookies.get(key);
        if (value) {
            return value;
        }
        throw new SmsError('Report cookies timed out.', true, twiml);
    }


    /**
     * Sends the user the first SMS and sets the appropriate cookies
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {string}   incomingSms - SMS text sent by user
     * @param   {string}   firstSms - First text the user sent (to start the report)
     */
    askIfUsedBefore(ctx, twiml, incomingSms, firstSms) {
        this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_USED_BEFORE);
        //Done now, so that we can store this in the database when the user has an alias
        this.setCookie(ctx, constants.cookies.FIRST_TEXT, incomingSms);
        const message = firstSms ? this.initialSms : 'Sorry, we didn\'t understand that response. Have you used this service before?';
        this.sendSms(twiml, message);
    }


    /**
     * Sends the user an SMS asking them to enter their alias
     *
     * Only runs if the user has said they have an existing alias
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {string}   opening - String to be prepended to the SMS.
     *                               Used when the user has just entered an invalid alias
     */
    askForAlias(ctx, twiml, opening) {
        let message = opening ? opening + ' ': '';
        message += 'Please enter your anonymous alias. To use a new alias, please reply \'NEW\'';
        this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_ALIAS);
        this.sendSms(twiml, message); //TODO: Get this from somewhere else?
    }


    /**
     * Generates the user a new unique alias, sets up the database entry and sends the user the first question
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     */
    async generateAliasAndStart(ctx, twiml) {
        const alias = await this.generateUniqueAlias();
        await this.initiateSmsReport(ctx, twiml, alias);
        const question = await this.getNextQuestion(ctx, twiml, 0);
        this.sendSms(twiml, 'Your new anonymous alias is ' + alias + '.\n' + question);
    }


    /**
     * Processes a user's manually inputted alias.
     * Starts the report if the alias is valid.
     * Prompts the user to re-enter their alias if it isn't.
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {string}   alias - Manually inputted user alias
     */
    async processAlias(ctx, twiml, alias) {
        alias = this.cleanResponse(alias);
        if (alias === 'new') {
            //User wants to use a new alias
            await this.generateAliasAndStart(ctx, twiml);
        } else {
            if (await this.aliasExists(alias)) {
                //If the user's alias is valid
                await this.initiateSmsReport(ctx, twiml, alias);
                const firstQuestion = await this.getNextQuestion(ctx, twiml, 0);
                this.sendSms(twiml, firstQuestion);
            } else {
                //If the user's alias is invalid
                this.askForAlias(ctx, twiml, 'Sorry, that alias hasn\'t been used before.');
            }
        }
    }


    /**
     * Gets and sends the user the next Question
     * 
     * @param   {Object}   ctx 
     * @param   {Object}   twiml
     * @param   {number}   nextQuestion - Index of the next question
     */
    async sendQuestion(ctx, twiml, nextQuestion) {
        const question = await this.getNextQuestion(ctx, twiml, nextQuestion);
        this.sendSms(twiml, question);
    }


    /**
     * Processes the user's response to a question
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {string}   incomingSms - SMS text sent by user
     */
    async receiveResponse(ctx, twiml, incomingSms) {
        try {
            const nextQuestion = this.getCookie(ctx, constants.cookies.NEXT_QUESTION, twiml);
            //Update database with the user's response
            await this.updateResponse(ctx, twiml, nextQuestion - 1, incomingSms);
            await this.sendQuestion(ctx, twiml, nextQuestion);
        } catch (e) {
            throw new SmsError('Could not store response.', false, twiml);
        }        
    }


    /**
     * Append information to the supplementary information field.
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {string}   incomingSms - SMS text sent by user
     */
    async addAmendments(ctx, twiml, incomingSms) {
        const sessionId = this.getCookie(ctx, constants.cookies.SESSION_ID, twiml);
        const report = await Report.get(this.db, sessionId);

        if (!report) {
            //Relevant report doesn't exist
            throw new SmsError('Cannot find the relevant report to update.', false, twiml);
        }

        try {
            //Get value for suppliementary information field
            let info = report.submitted['Supplementary information'] ? report.submitted['Supplementary information'] : '';
            info = info ==='' ? incomingSms : info + ' | ' + incomingSms;
            
            //Update supliementary information
            await Report.submissionDetails(this.db, sessionId, { 'Supplementary information': info });

            this.sendSms(twiml, 'Thank you for this extra information. You can send more if you wish. To start a new report, reply \'RESTART\'');
        } catch (e) {
            throw new SmsError('Cannot update the report.', false, twiml);
        }
    }


    /**
     * Ask the user if they want to continue with the report
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {string}   opening - Text to prepend to SMS
     */
    askIfContinue(ctx, twiml, opening) {
        const message = 'Would you like to continue with this report?';
        this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_CONTINUE);
        this.sendSms(twiml, opening + ' ' + message);
    }


    /**
     * Sends the user the help text
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {boolean}  reportStarted - True if the user is currently submitting answers. False otherwise.
     */
    sendHelpText(ctx, twiml, reportStarted) {
        //TODO: Get text from YAML
        const callMessage = 'If you would like to speak to someone, please call XXXXX.';
        if (reportStarted) {
            this.askIfContinue(ctx, twiml, callMessage);
        } else {
            this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_NEW_REPORT);
            this.sendSms(twiml, callMessage + ' ' + 'Reply \'START\' to start submitting a report');
        }
    }


    /**
     * Asks the user if they would like to store their report
     * 
     * @param   {Object}   ctx 
     * @param   {Object}   twiml
     * @param   {string}   opening - Prefix to text to send
     */
    askIfStore(ctx, twiml, opening) {
        let message = opening ? opening + ' ': '';
        message += 'Would you like to store your report? Please note that if you have amendments to your responses, you can give them after the last question.';
        this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_STORE);
        this.sendSms(twiml, message);
    }

    /**
     * Deletes the user's report
     * 
     * @param {Object} ctx 
     * @param {Object} twiml 
     */
    async deleteResponse(ctx, twiml) {
        try {
            const reportId = this.getCookie(ctx, constants.cookies.SESSION_ID, twiml);
            const reports = await Report.get(this.db, reportId);
            await Report.delete(this.db, reports._id);
        } catch (e) {
            throw new SmsError('Could not delete report.', false, twiml);
        }
    }


    /**
     * Send user final text after they have chosen to stop a report
     *
     * @param   {Object}   twiml
     * @param   {string}   opening - text to prepend to SMS
     */
    sendFinalSms(ctx, twiml, opening) {
        this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_NEW_REPORT);
        this.sendSms(twiml, opening + ' Thank you for using this reporting service. If you want to submit a new report, please send another text to this number. If you have any questions, please call XXXXXX');
    }


    /**
     * Takes a user's input, makes it all lower case, removes leading and trailing spaces and removes punctuation
     *
     * @param   {string}   message - SMS text sent by user
     * @returns {string} - Cleaned message
     */
    cleanResponse(message) {
        message = message.toLowerCase();
        message = message.trim();
        message = message.replace(/[~`!@#$%^&*(){}[\];:"'|,.>?/\\|\-_+=]/g, '');
        return message;
    }


    /**
     * Determines whether a given message starts with an element in a given list
     *
     * @param   {string}   message - SMS text sent by user
     * @param   {string[]} starts - List of potential message prefixes
     * 
     * @returns {boolean}  True if an element of starts is a prefix to message. False otherwise.
     */
    startsWithElement(message, starts) {
        for (let i = 0; i < starts.length; i++) {
            if (message.startsWith(starts[i])) {
                return true;
            }
        }
    }


    /**
     * Processes the user's response to a yes/no question to determine if it can be interpreted as a no
     *
     * @param   {string}   message - SMS text sent by user
     * 
     * @returns {boolean}  True if message can be interpreted as a no. False otherwise.
     */
    isNo(message) {
        const starts = [ 'no', 'na', 'i have not', 'i havent' ];
        return this.startsWithElement(message, starts) || message === 'n';
    }


    /**
     * Processes the user's response to a yes/no question to determine if it can be interpreted as a yes
     *
     * @param   {string}   message - SMS text sent by user
     * 
     * @returns {boolean}  True if message can be interpreted as a yes. False otherwise.
     */
    isYes(message) {
        const starts = [ 'ye', 'i have' ];
        return this.startsWithElement(message, starts) || message === 'y';
    }


    /**
     * Processes the user's response to a yes/no question
     *
     * @param   {string}   message - SMS text sent by user
     * 
     * @returns {string}   'yes', 'no' or 'unknown'
     */
    toYesOrNo(message) {
        message = this.cleanResponse(message);

        if (this.isNo(message)) {
            return constants.NO;
        } else if (this.isYes(message)) {
            return constants.YES;
        }

        return constants.UNKNOWN;
    }


    /**
     * Processes the user's response to determine whether it can be interpreted as 'help'
     *
     * @param   {string}   message - SMS text sent by user
     * 
     * @returns {string}   True if message can be interpreted as 'help'. False otherwise.
     */
    isHelp(message) {
        return this.cleanResponse(message) === 'help';
    }


    /**
     * Processes the user's response to determine whether it can be interpreted as 'restart'
     *
     * @param   {string}   message - SMS text sent by user
     * 
     * @returns {string}   True if message can be interpreted as 'restart'. False otherwise.
     */
    isRestart(message) {
        return this.cleanResponse(message) === 'restart';
    }


    /**
     * Returns the name of a particular field in the database.
     *
     * Uses the form's given questions and the given questionNo to return field
     *
     * @param   {number}   questionNo - Question number to return
     * 
     * @returns {string}   Field name as it appears in the database
     */
    getField(questionNo, twiml) {
        try {
            return this.questions[questionNo].label;
        } catch (e) {
            throw new SmsError('Could not get next question.', false, twiml);
        }
    }


    /**
     * Gets the initial SMS to send from the YAML specification file
     */
    getInitialSms() {
        //TODO: Get initial SMS from this.spec
        const initialSms = 'By completing this form, you consent to xxxxx.\nPlease reply with the keywords SKIP or HELP at any point.\nHave you used this reporting service before?';
        this.initialSms = initialSms;
    }


    /**
     * Updates the database and sets cookies to start the SMS report
     *
     * @param   {Object}   ctx
     * @param   {number}   alias - User's unique anonymous alias
     */
    async initiateSmsReport(ctx, twiml, alias) {
        try {
            const version = this.spec.version;
            
            //Adds skeleton report to the database
            const sessionId = await Report.submissionStart(this.org, this.project, alias, version, ctx.headers['user-agent'], null);
            
            //Add first text to report
            await Report.submissionDetails(this.db, sessionId, { 'First Text': this.getCookie(ctx, constants.cookies.FIRST_TEXT, twiml) });
            
            //Add last updated field to report
            await Report.update(this.db, sessionId, { 'lastUpdated': new Date() });
            
            //Generate unique evidence token
            //TODO: Accommodate for no free evidence tokens
            let evidenceToken = '';
            do {
                evidenceToken = Math.random().toString(36).substring(2);
            }
            while (!(await Report.getBy(this.db, 'evidenceToken', evidenceToken)));

            //Add evidence token to report
            await Report.update(this.db, sessionId, { 'evidenceToken': evidenceToken });

            //Update cookies
            this.setCookie(ctx, constants.cookies.SESSION_ID, sessionId);
            this.setCookie(ctx, constants.cookies.ALIAS, alias);
        } catch (e) {
            throw new SmsError('Could not start report.', false, twiml);
        }
    }


    /**
     * Sets-up the database connection
     * 
     * @param   {object}   twiml
     */
    async setupDatabase(twiml) {
        try {
            await Db.connect(this.db, { useNewUrlParser: true });
        } catch (e) {
            throw new SmsError('Could not connect to the database.', false, twiml);
        }
    }


    /**
     * Updates the appropriate database with a user's response
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {number}   questionNo - Index of the relevant question
     * @param   {string}   input - User's response to the relevant question
     */
    async updateResponse(ctx, twiml, questionNo, input) {
        await this.setupDatabase(twiml);

        const sessionId = this.getCookie(ctx, constants.cookies.SESSION_ID, twiml);

        const field = this.getField(questionNo, twiml);

        try {
            //Update relevant field in report
            await Report.submissionDetails(this.db, sessionId, { [field]: input });

            //Update last updated field
            await Report.update(this.db, sessionId, { 'lastUpdated': new Date() });
        } catch (e) {
            throw new SmsError('Could not store response.', false, twiml);
        }
    }


    /**
     * Gets the questions from the yaml specifications
     */
    generateSmsQuestions() {
        this.questions = [];
        //Set pages list to all pages given in the .yaml specifications
        //Matches 'p' followed by a number
        const pages = Object.keys(this.spec.pages).filter(key => /^p[0-9]+$/.test(key));

        for (let p = 1; p < pages.length; p++) {
            //For each text/input combination on a page
            for (let i = 0; i < this.spec.pages[pages[p]].length; i += 2) {
                this.questions.push({
                    question: this.spec.pages[pages[p]][i].text.substr(2),
                    label:    this.spec.pages[pages[p]][i + 1].input.label,
                });
            }
        }
    }


    /**
     * Returns the next question to send to the user
     *
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {number}   questionNo - Index of the relevant question
     *
     * @returns {string}   Text of the next question
     */
    async getNextQuestion(ctx, twiml, nextQuestion) {
        let message = '';

        try {
            if (nextQuestion < this.questions.length) {
                //Set cookies
                this.setCookie(ctx, constants.cookies.NEXT_QUESTION, Number(nextQuestion) + 1);
                this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_RESPONSE);

                //Generate message
                message = 'Question ' + (Number(nextQuestion) + 1) + ': ' + this.questions[nextQuestion].question;
            } else {
                //At the end of questions
                //Set cookie
                this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_FINAL);

                //TODO: Get this from YAML
                //Send last text
                const sessionId = this.getCookie(ctx, constants.cookies.SESSION_ID, twiml);
                const report = await Report.get(this.db, sessionId);
                const evidenceToken = report.evidenceToken;
                message = `Thank you for completing the questions. If you have any supplementary information, please send it now. Please go to sms.thewhistle.org/${this.db}/evidence/${evidenceToken} to provide picture, audio or video files. If you would like to amend any of responses, please reply explaining the changes. If you would like to start a new report, please reply 'RESTART'`;
            }
        } catch (e) {
            throw new SmsError('Could not get next message.', false, twiml);
        }

        return message;

    }


    /**
     * Deletes a message from the Twilio message logs
     *
     * @param   {string}   messageId - ID of the message to be deleted
     */
    static deleteMessage(messageId) {
        const accountId = process.env.TWILIO_ACCOUNT_ID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const client = Twilio(accountId, authToken);

        return client.messages(messageId).remove()
            .catch(() => {
                //If the message hasn't been delivered yet, remove() fails
                //Wait a second, then rerun this function
                setTimeout(() => SmsApp.deleteMessage(messageId), 1000);
            })
            .done();
    }


    /**
     * Process the user's response to whether they have used the reporting service before and act accordingly
     * 
     * @param {Object} ctx 
     * @param {Object} twiml 
     * @param {string} incomingSms - text sent by user 
     */
    async processUsedBeforeText(ctx, twiml, incomingSms) {
        switch (this.toYesOrNo(incomingSms)) {
            case constants.YES:
                this.askForAlias(ctx, twiml);
                //User has used reporting service before
                //Ask user for alias
                break;

            case constants.NO:
                await this.generateAliasAndStart(ctx, twiml);
                //User hasn't used reporting service before
                //Generate alias and send it to user with first question
                break;

            case constants.UNKNOWN:
                //Can't interpret user's response.
                //Re-ask user whether they have used the reporting service before
                this.askIfUsedBefore(ctx, twiml, incomingSms, false);
                break;

            default:
                //Didn't fit into one of the predefined categories, so soemthing went wrong
                throw new SmsError('Could not determine if used before.', false, twiml);
        }
    }


    /**
     * Process the user's final text and act accordingly
     * 
     * @param {Object} ctx 
     * @param {Object} twiml 
     * @param {string} incomingSms - text sent by user 
     */
    async processFinalText(ctx, twiml, incomingSms) {
        if (this.isRestart(incomingSms)) {
            //Start a new report
            this.askIfUsedBefore(ctx, twiml, incomingSms, true);
        } else {
            //Add amendments
            await this.addAmendments(ctx, twiml, incomingSms);
        }
    }


    /**
     * Process the user's response to whether they want to continue with the report and act accordingly
     * 
     * @param {Object} ctx 
     * @param {Object} twiml 
     * @param {string} incomingSms - text sent by user 
     */
    async processContinueText(ctx, twiml, incomingSms) {
        switch (this.toYesOrNo(incomingSms)) {
            case constants.YES:
                //User does want to continue with report
                const nextQuestion = this.getCookie(ctx, constants.cookies.NEXT_QUESTION, twiml) - 1;
                await this.sendQuestion(ctx, twiml, nextQuestion);
                break;

            case constants.NO:
                //User doesn't want to continue with report
                this.askIfStore(ctx, twiml);
                break;

            case constants.UNKNOWN:
                //User's response cannot be interpreted
                this.askIfContinue(ctx, twiml, 'Sorry, we didn\'t understand your response.');
                break;

            default:
                //Didn't fit into one of the predefined categories, so soemthing went wrong
                throw new SmsError('Could not determine if you want to continue.', false, twiml);
        }
    }


    /**
     * Process the user's response to whether want to store their report and act accordingly
     * 
     * @param {Object} ctx 
     * @param {Object} twiml 
     * @param {string} incomingSms - text sent by user 
     */
    async processStoreText(ctx, twiml, incomingSms) {
        switch (this.toYesOrNo(incomingSms)) {
            case constants.YES:
                //User wants to store report
                this.sendFinalSms(ctx, twiml, 'Your responses have been stored.');
                break;

            case constants.NO:
                //User wants to delete report
                await this.deleteResponse(ctx, twiml);
                this.sendFinalSms(ctx, twiml, 'Your responses have been deleted.');
                break;

            case constants.UNKNOWN:
                //User's response cannot be interpreted
                this.askIfStore(ctx, twiml, 'Sorry, we didn\'t understand your response.');
                break;

            default:
                //Didn't fit into one of the predefined categories, so soemthing went wrong  
                throw new SmsError('Could not determine if you want to store your report.', false, twiml);
        }
    }


    /**
     * React accordingly to the user's response text
     * Response is determined by the point in the report
     * 
     * @param {Object} ctx 
     * @param {Object} twiml
     * @param {string} nextSmsType - type of the incoming text
     * @param {string} incomingSms - text sent by user 
     */
    processHelpText(ctx, twiml, nextSmsType, incomingSms) {
        switch (nextSmsType) {
            case undefined:
            case constants.SMS_NEW_REPORT:
                //Start new report
                this.askIfUsedBefore(ctx, twiml, incomingSms, true);
                break;

            case constants.SMS_USED_BEFORE:
            case constants.SMS_ALIAS:
                //Give help number, but no option to continue/store report
                this.sendHelpText(ctx, twiml, false);
                break;

            default:
                //Didn't fit into one of the predefined categories, so something went wrong
                //Send help text anyway
                this.sendHelpText(ctx, twiml, true);
        }
    }


    /**
     * Process the user's response when they do not require help
     * 
     * @param {Object} ctx 
     * @param {Object} twiml
     * @param {string} nextSmsType - type of the incoming text
     * @param {string} incomingSms - text sent by user 
     */
    async processNonHelpText(ctx, twiml, nextSmsType, incomingSms) {
        switch (nextSmsType) {
            case undefined:
            case constants.SMS_NEW_REPORT:
                //Start new report
                this.askIfUsedBefore(ctx, twiml, incomingSms, true);
                break;

            case constants.SMS_USED_BEFORE:
                //Determine if the user has an existing alias
                await this.processUsedBeforeText(ctx, twiml, incomingSms);
                break;

            case constants.SMS_ALIAS:
                //Process the user's alias
                await this.processAlias(ctx, twiml, incomingSms);
                break;

            case constants.SMS_FINAL:
                //Process the user's post-report information
                await this.processFinalText(ctx, twiml, incomingSms);
                break;

            case constants.SMS_RESPONSE:
                //Process the user's question response
                //Establish the stage of the report
                await this.receiveResponse(ctx, twiml, incomingSms);
                break;

            case constants.SMS_CONTINUE:
                //Establish whether the user wants to continue with the report
                await this.processContinueText(ctx, twiml, incomingSms);
                break;

            case constants.SMS_STORE:
                //Establish whether the user wants to store their report so far
                await this.processStoreText(ctx, twiml, incomingSms);
                break;

            default:
                //Didn't fit into one of the predefined categories, so something went wrong
                throw new SmsError('Could not interpret incoming text', false, twiml);
        }
    }


    /**
     * Processes and responds to a user's SMS
     *
     * @param   {Object}   ctx
     */
    async receiveText(ctx) {
        //Get user's text
        const incomingSms = ctx.request.body.Body;

        const twiml = new this.MessagingResponse();

        let nextSmsType = '';
        try {
            nextSmsType = this.getCookie(ctx, constants.cookies.NEXT_SMS_TYPE, twiml);
        } catch (e) {
            nextSmsType = undefined;
        }

        if (this.isHelp(incomingSms)) {
            //User requires help
            this.processHelpText(ctx, twiml, nextSmsType, incomingSms);
        } else {
            //Any text other than 'help'
            await this.processNonHelpText(ctx, twiml, nextSmsType, incomingSms);
        }
        ctx.status = 200;
        ctx.headers['Content-Type'] = 'text/xml';
        ctx.body = twiml.toString();
        SmsApp.deleteMessage(ctx.request.body.MessageSid);
    }
}


export default SmsApp;
