import $RefParser     from 'json-schema-ref-parser';
import Report         from '../models/report.js';
import autoIdentifier from '../lib/auto-identifier.js';
import Db             from '../lib/db.js';


const constants = {
    SMS_NEW_REPORT:  'new_report',
    SMS_USED_BEFORE: 'used_before',
    SMS_ALIAS:       'alias',
    SMS_FINAL:       'final',
    SMS_RESPONSE:    'response',

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


class SmsApp {


    /**
     * Sets up SMS app for a given organisation/project combination
     *
     * @param   {string}   org - Organisation name
     * @param   {string}   project - Project name
     * @returns {Object}   SMS app object
     */    
    constructor(org, project) {
        this.MessagingResponse = require('twilio').twiml.MessagingResponse;
        this.db = org;
        this.yamlFile = 'public/spec/' + org.replace('-test', '') + '/' + project + '.yaml';
        this.org = org;
        this.project = project;
    }


    /**
     * Sets this.spec by parsing the .yaml file
     */
    async getSpecifications() {
        //Set this.spec to object containing yaml specifications
        this.spec = await $RefParser.dereference(this.yamlFile);
    }


    /**
     * Parses the .yaml specifications, then sets this.spec, this.initialSms
     * and this.questions using the specifications.
     */
    async parseSpecifications() {
        await this.getSpecifications();
        this.getInitialSms();
        this.generateSmsQuestions();
    }


    sendSms(twiml, message) {
        console.log('Sending', message);
        twiml.message({
            action: '/delete-outbound',
            method: 'POST',
        }, message);
    }


    async aliasExists(alias) {
        const reports = await Report.getBy(this.db, 'alias', alias);
        const ret = reports.length != 0;
        return ret;
    }


    async generateUniqueAlias() {
        let alias = '';

        do {
            alias = await autoIdentifier();
        }
        while (await this.aliasExists(alias));

        return alias;
    }


    setCookie(ctx, key, value) {
        ctx.cookies.set(key, value, { httpOnly: false });
    }


    clearCookie(ctx, key) {
        //TODO: Make this work or remove it
        ctx.cookies.set(key, '', { httpOnly: false });
    }


    clearAllCookies(ctx) {
        for (let i = 0; i < Object.keys(constants.cookies).length; i++) {
            this.clearCookie(ctx, Object.keys(constants.cookies)[i]);
        }
    }


    sendInitialSms(ctx, twiml, incomingSms) {
        this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_USED_BEFORE);
        this.setCookie(ctx, constants.cookies.FIRST_TEXT, incomingSms);
        this.sendSms(twiml, this.initialSms);
    }


    askForAlias(ctx, twiml, opening) {
        let message = opening ? opening + ' ': '';
        message += 'Please enter your anonymous alias. To use a new alias, please reply \'NEW\'';
        this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_ALIAS);
        this.sendSms(twiml, message); //TODO: Get this from somewhere else?
    }


    async generateAliasAndStart(ctx, twiml) {
        const alias = await this.generateUniqueAlias();
        await this.initiateSmsReport(ctx, alias);
        const question = this.getNextQuestion(ctx, 0);
        this.sendSms(twiml, 'Your new anonymous alias is ' + alias + '.\n' + question);
    }


    async processAlias(ctx, twiml, alias) {
        alias = this.cleanResponse(alias);
        if (alias === 'new') {
            await this.generateAliasAndStart(ctx, twiml);
        } else {
            //Does alias need correct capitalisation? shown as lower case on web form
            if (await this.aliasExists(alias)) {
                await this.initiateSmsReport(ctx, alias);
                this.sendSms(twiml, this.getNextQuestion(ctx, 0));
            } else {
                this.askForAlias(ctx, twiml, 'Sorry, that alias hasn\'t been used before.');
            }
        }
    }


    async receiveResponse(ctx, twiml, incomingSms) {
        const nextQuestion = ctx.cookies.get(constants.cookies.NEXT_QUESTION);
        //Update database with the user's response
        await this.updateResponse(ctx, nextQuestion - 1, incomingSms);
        const question = this.getNextQuestion(ctx, nextQuestion);
        this.sendSms(twiml, question);
    }


    async addAmendments(ctx, twiml, incomingSms) {
        const sessionId = ctx.cookies.get(constants.cookies.SESSION_ID);
        const report = await Report.get(this.db, sessionId);
        let info = report.submitted['Supplimentary information'] ? report.submitted['Supplimentary information'] : '';
        info = info ==='' ? incomingSms : info + ' | ' + incomingSms;
        Report.updateField(this.db, sessionId, 'Supplimentary information', info);
        this.sendSms(twiml, 'Thank you for this extra information. You can send more if you wish. To start a new report, reply \'RESTART\'');
    }



    cleanResponse(message) {
        message = message.toLowerCase();
        message = message.trim();
        message = message.replace(/[~`!@#$%^&*(){}[\];:"'|,.>?/\\|\-_+=]/g, '');
        return message;
    }


    startsWithElement(message, starts) {
        for (let i = 0; i < starts.length; i++) {
            if (message.startsWith(starts[i])) {
                return true;
            }
        }
    }


    isNo(message) {
        const starts = [ 'no', 'na', 'i have not', 'i havent' ];
        return this.startsWithElement(message, starts) || message === 'n';
    }


    isYes(message) {
        const starts = [ 'ye', 'i have' ];
        return this.startsWithElement(message, starts) || message === 'y';
    }


    toYesOrNo(message) {
        message = this.cleanResponse(message);
        if (this.isNo(message)) {
            return constants.NO;
        } else if (this.isYes(message)) {
            return constants.YES;
        }
        return constants.UNKNOWN;
    }


    resolveKeyWords(message) {
        return message;
        //TODO: Implement properly
    }


    isRestart(message) {
        message = this.cleanResponse(message);
        return message === 'restart';
    }


    /**
     * Returns the name of a particular field in the database.
     *
     * Uses the form's given questions and the given questionNo to return field
     *
     * @param   {number}   questionNo - Question number to return
     * @returns {string}   Field name as it appears in the database
     */
    getField(questionNo) {
        return questionNo == -1 ? 'Initial SMS' : this.questions[questionNo].label;
    }


    /**
     * Gets the initial SMS to send from the YAML specification file
     */
    getInitialSms() {
        //TODO: Get initial SMS from this.spec
        const initialSms = 'By completing this form, you consent to xxxxx.\nPlease reply with the keywords SKIP, HELP and STOP at any point.\nHave you used this reporting service before?';
        this.initialSms = initialSms;
    }

    /**
     * Carries out the necessary steps to start an SMS report
     *
     * Generates alias, sets cookies, and sends initial text
     *
     * @param   {Object}   ctx
     * @param   {number}   twiml
     * 
     * @returns {string}   Randomly generated alias
     */
    async initiateSmsReport(ctx, alias) {
        const version = this.spec.version;
        //Adds skeleton report to the database
        const sessionId = await Report.submissionStart(this.org, this.project, alias, version, ctx.headers['user-agent']);
        Report.updateField(this.db, sessionId, 'First Text', ctx.cookies.get(constants.cookies.FIRST_TEXT));
        ctx.cookies.set(constants.cookies.SESSION_ID, sessionId, { httpOnly: false });
        ctx.cookies.set(constants.cookies.ALIAS, alias, { httpOnly: false });
    }


    /**
     * Setup the database connection
     */
    async setupDatabase() {
        try {
            await Db.connect(this.db);
        } catch (e) {
            console.error(e.message);
        }
    }


    /**
     * Updates the appropriate database with a user's response
     *
     * @param   {Object}   ctx
     * @param   {number}   questionNo - Index of the relevant question
     * @param   {string}   input - User's response to the relevant question
     */
    async updateResponse(ctx, questionNo, input) {
        await this.setupDatabase();
        const sessionId = ctx.cookies.get(constants.cookies.SESSION_ID);
        const field = this.getField(questionNo);
        try {
            Report.updateField(this.db, sessionId, field, input);
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * Gets the questions from the yaml specifications
     */
    generateSmsQuestions() {
        this.questions = [];
        const re = new RegExp('^p[0-9]+$');
        //Set pages list to all pages given in the .yaml specifications
        const pages = Object.keys(this.spec.pages).filter(key => re.test(key));
        for (let p = 1; p < pages.length; p++) {
            //For each text/input combination on a page
            for (let i = 0; i < this.spec[pages[p]].length; i += 2) {
                this.questions.push({
                    'question': this.spec[pages[p]][i].text.substr(2), 
                    'label':    this.spec[pages[p]][i + 1].input.label,
                });
            }
        }
        this.questions = this.questions.slice(0, 3);
    }


    /**
     * Sends the user a text with the next question
     * 
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {number}   questionNo - Index of the relevant question
     */
    getNextQuestion(ctx, nextQuestion) {
        let message = '';

        if (Number(nextQuestion) < this.questions.length) {
            this.setCookie(ctx, constants.cookies.NEXT_QUESTION, Number(nextQuestion) + 1);
            this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_RESPONSE);
            message = (Number(nextQuestion) + 1) + '. ' + this.questions[nextQuestion].question;
        } else {
            this.setCookie(ctx, constants.cookies.NEXT_SMS_TYPE, constants.SMS_FINAL);
            //TODO: Get this from YAML
            message = 'Thank you for completing the questions. If you have any supplimentary information, please send it now. You can use MMS or a URL to provide picture, audio or video files. If you would like to amend any of responses, please reply explaining the changes. If you would like to start a new report, please reply \'RESTART\'';
        }

        return message;
        
    }


    static deleteMessage(messageId) {
        const accountId = 'AC5da0166da2047a8e4d3b3709982ebaae';
        const authToken = '0c34505d5eff527a6b67038b9b7f4a11';
        const client = require('twilio')(accountId, authToken);
        client.messages(messageId)
            .remove()
            .catch(() => {
                setTimeout(() => SmsApp.deleteMessage(messageId), 1000);
            })
            .done();
    }

    
    async receiveText(ctx) {
        console.log('receive text');
        //this.clearAllCookies(ctx);
        //Get user's text
        const incomingSms = ctx.request.body.Body;
        console.log('Beach', ctx.request.body);
        const twiml = new this.MessagingResponse();
        switch (this.resolveKeyWords(incomingSms)) { //TODO: Ignore spaces, punctuation and case
            case 'help':
                //TODO: Implement this
                break;
            case 'stop':
                //TODO: Implement this
                break;
            default:
                const nextSmsType = ctx.cookies.get(constants.cookies.NEXT_SMS_TYPE);
                //const nextSmsType = constants.SMS_NEW_REPORT;
                switch (nextSmsType) {
                    case undefined:
                    case constants.SMS_NEW_REPORT:
                        //Start new report
                        this.sendInitialSms(ctx, twiml, incomingSms);
                        break;
                    case constants.SMS_USED_BEFORE:
                        //Determine if the user has an existing alias
                        switch (this.toYesOrNo(incomingSms)) {
                            case constants.YES:
                                this.askForAlias(ctx, twiml);
                                //User has used reporting service before
                                //TODO: Ask user for alias
                                break;
                            case constants.NO:
                                await this.generateAliasAndStart(ctx, twiml);
                                //User hasn't used reporting service before
                                //TODO: Generate alias and send it to user with first question
                                break;
                            case constants.UNKNOWN:
                                //Can't interpret user's response.
                                //TODO: Re-ask user whether they have used the reporting service before
                                break;
                            default:
                                //Throw error?
                        }
                        break;
                    case constants.SMS_ALIAS:
                        //TODO: Process the user's alias
                        await this.processAlias(ctx, twiml, incomingSms);
                        break;
                    case constants.SMS_FINAL:
                        //Process the user's post-report information
                        if (this.isRestart(incomingSms)) {
                            //TODO: Start a new report
                            this.sendInitialSms(ctx, twiml, incomingSms);
                        } else {
                            //TODO: Add amendments
                            //TODO: Allow for MMS
                            await this.addAmendments(ctx, twiml, incomingSms);
                        }
                        //TODO: Also cover MMS evidence (will this come here or not?)
                        break;
                    case constants.SMS_RESPONSE:
                        //Process the user's question response
                        //Establish the stage of the report
                        await this.receiveResponse(ctx, twiml, incomingSms);
                        break;
                    default:
                        //Throw error?
                }
        }
        ctx.status = 200;
        ctx.headers['Content-Type'] = 'text/xml';
        ctx.body = twiml.toString();
        SmsApp.deleteMessage(ctx.request.body.MessageSid);
    }
}


export default SmsApp;