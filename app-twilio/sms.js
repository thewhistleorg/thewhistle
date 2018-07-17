import $RefParser     from 'json-schema-ref-parser';
import Report         from '../models/report.js';
import autoIdentifier from '../lib/auto-identifier.js';
import Db             from '../lib/db.js';

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


    /**
     * Returns the name of a particular field in the database.
     *
     * Uses the form's given questions and the given questionNo to return field
     *
     * @param   {number}   questionNo - Question number to return
     * @returns {string}   Field name as it appears in the database
     */
    getField(questionNo) {
        return this.questions[questionNo].label;
    }


    /**
     * Gets the initial SMS to send from the YAML specification file
     */
    getInitialSms() {
        //TODO: Get initial SMS from this.spec
        const initialSms = 'Welcome to The Whistle SMS Reporting. Reply HELP at any time';
        this.initialSms = initialSms;
    }

    /**
     * Carries out the necessary steps to start an SMS report
     *
     * Generates alias, sets cookies, and sends initial text
     *
     * @param   {Object}   ctx
     * @param   {number}   twiml
     * @returns {string}   Randomly generated alias
     */
    async initiateSmsReport(ctx, twiml) {
        const alias = await autoIdentifier();
        const version = this.spec.version;
        //Adds skeleton report to the database
        const sessionId = await Report.submissionStart(this.org, this.project, alias, version, ctx.headers['user-agent']);
        ctx.cookies.set('sessionId', sessionId, { httpOnly: false });
        //Send user initial SMS
        twiml.message({
            action: '/delete-outbound',
            method: 'POST',
        }, alias + '---' + this.initialSms);
        return alias;
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
        const sessionId = ctx.cookies.get('sessionId');
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
        for (let p = 0; p < pages.length; p++) {
            //For each text/input combination on a page
            for (let i = 0; i < this.spec[pages[p]].length; i += 2) {
                this.questions.push({
                    'question': this.spec[pages[p]][i].text.substr(2), 
                    'label':    this.spec[pages[p]][i + 1].input.label,
                });
            }
        }
    }


    /**
     * Sends the user a text with the next question
     * 
     * @param   {Object}   ctx
     * @param   {Object}   twiml
     * @param   {number}   questionNo - Index of the relevant question
     */
    sendNextQuestion(ctx, twiml, nextQuestion) {
        const message = this.questions[nextQuestion].question;
        let next = 0;
        if (Number(nextQuestion) + 1 < Number(this.questions.length)) {
            next = Number(nextQuestion) + 1;
        }
        ctx.cookies.set('nextQuestion', next, { httpOnly: false });
        twiml.message({
            action: '/delete-outbound',
            method: 'POST',
        }, message);
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

    /**
     * Runs when a user sends an SMS
     * 
     * @param   {Object}   ctx
     */
    async receiveText(ctx) {
        //Get user's text
        const incomingSms = ctx.request.body.Body;
        const twiml = new this.MessagingResponse();
        //TODO: Get alias properly
        let alias = '';
        let nextQuestion = 0;
        switch (incomingSms.toLowerCase()) {
            case 'help':
                //TODO: Handle action texts properly
                twiml.message({
                    action: '/delete-outbound',
                    method: 'POST',
                }, 'HELP text');
                break;
            case 'start':
                alias = await this.initiateSmsReport(ctx, twiml);
                this.sendNextQuestion(ctx, twiml, nextQuestion);
                break;
            default:
                if (!ctx.cookies.get('nextQuestion')) {
                    //If this is the first SMS in a new report
                    //Initiate the report
                    alias = await this.initiateSmsReport(ctx, twiml); //TODO: Make sure texts are sent in order
                } else {
                    //If the report has already been started
                    //Establish the stage of the report
                    nextQuestion = ctx.cookies.get('nextQuestion');
                    //Update database with the user's response
                    await this.updateResponse(ctx, nextQuestion - 1, incomingSms);
                }
                this.sendNextQuestion(ctx, twiml, nextQuestion);
        }
        
        ctx.status = 200;
        ctx.headers['Content-Type'] = 'text/xml';
        ctx.body = twiml.toString();
        SmsApp.deleteMessage(ctx.request.body.MessageSid);
    }
}


export default SmsApp;