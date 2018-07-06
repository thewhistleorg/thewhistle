import Koa            from 'koa';
import Router         from 'koa-router';
import $RefParser     from 'json-schema-ref-parser';
import serve          from 'koa-static';
import dotProp        from 'dot-prop';
import Report         from '../models/report.js';
import autoIdentifier from '../lib/auto-identifier.js';


const MessagingResponse = require('twilio').twiml.MessagingResponse;
const app = new Koa();
const router = new Router();
const spec = async () => {
    //Set spec to object containing yaml specifications
    return await $RefParser.dereference('http://e1a5f067.ngrok.io/spec/grn/rape-is-a-crime.yaml'); //TODO: change this to relative URL?
};


/**
 * Returns the name of a particular field in the database.
 *
 * Uses the form's given questions and the given questionNo to return field
 *
 * @param   {Object}   questions - (Will it be an object?) Questions of the relevant form
 * @param   {number}   questionNo - Question number to return
 * @returns {string}   Field name as it appears in the database
 */
function getField(questions, questionNo) {
    return ''; //TODO: Implement this
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
async function initiateSmsReport(ctx, twiml) {
    const org = 'grn'; //TODO: Make class and use value from the class?
    const project = 'rape-is-a-crime'; //TODO: Make class and use value from the class?
    const alias = await autoIdentifier();
    const version = 0; // TODO: Work out what this should be - undefined in web form
    //Adds skeleton report to the database
    const sessionID = await Report.submissionStart(org, project, alias, version, ctx.headers['user-agent']);
    ctx.cookies.set('sessionID', sessionID, { httpOnly: false });
    ctx.cookies.set('nextQuestion', 1, { httpOnly: false });
    //Send user initial SMS
    twiml.message('START REPORT. Reply HELP at any time.'); //TODO: Improve initial SMS
    return alias;
}


/**
 * Updates the appropriate database with a user's response
 *
 * @param   {Object}   ctx
 * @param   {Object}   questions - (Will it be an object?) Questions of the relevant form
 * @param   {number}   questionNo - Index of the relevant question
 * @param   {string}   input - User's response to the relevant question
 */
async function updateResponse(ctx, questions, questionNo, input) {
    const db = 'grn'; //TODO: Make class and use value from the class?
    const reports = global.db[db].collection('reports');
    const sessionID = ctx.cookies.get('sessionID');
    const field = getField(questions, questionNo - 1);
    await reports.updateOne({ _id: sessionID }, { $set: { [`submitted.${field}`]: input } });
}

/**
 * Gets the questions from the yaml specifications
 *
 * @returns {Object} - (Will it be an object?) Questions of the relevant form
 */
async function generateSmsQuestions() {
    //TODO: Edit this to work with generic yaml specifications (at least for hfrn)
    const specifications = await spec();
    let t = '';
    const questions = [];
    for (const p in specifications.pages) {
        for (const i in dotProp.get(specifications, `pages.${p}`)) {
            t = dotProp.get(specifications, `pages.${p}`)[i].text;
            if (t != undefined && typeof t === 'string' && t.startsWith('#') && !t.startsWith('##')) {
                questions.push(t);
            }
        }
    }
    global.smsQuestions = questions;
    return questions;
}


/**
 * Sends the user a text with the next question
 * 
 * @param   {Object}   ctx
 * @param   {Object}   twiml
 * @param   {Object}   questions - (Will it be an object?) Questions of the relevant form
 * @param   {number}   questionNo - Index of the relevant question
 */
function sendNextQuestion(ctx, twiml, questions, nextQuestion) {
    const message = questions[nextQuestion];
    ctx.cookies.set('nextQuestion', nextQuestion + 1, { httpOnly: false });
    twiml.message(message);
}


app.use(serve('public', { maxage: 1000*60*60*24 }));


router.get('/sms', async (ctx) => {
    //Get user's text
    const incomingSms = ctx.request.body.Body;
    const twiml = new MessagingResponse();
    //Load questions from memory if they exist, else generate them and store in memory
    const questions = global.smsQuestions ? global.smsQuestions : await generateSmsQuestions();
    //TODO: Get alias properly
    let alias = '';
    switch (incomingSms) {
        case 'HELP':
            //TODO: Handle action texts properly
            twiml.message('HELP text');
            break;
        default:
            let nextQuestion = 1;
            if (!ctx.cookies.get('nextQuestion')) {
                //If this is the first SMS in a new report
                //Initiate the report
                //TODO: Should we use the user's text in their first message for anything?
                alias = await initiateSmsReport(ctx, twiml);
            } else {
                //If the report has already been started
                //Establish the stage of the report
                nextQuestion = ctx.cookies.get('nextQuestion');
                //Update database with the user's response
                await updateResponse(ctx, questions, nextQuestion - 1, incomingSms);
            }
            sendNextQuestion();
    }
    
    ctx.status = 200;
    ctx.headers['Content-Type'] = 'text/xml';
    ctx.body = twiml.toString();
});


router.get('/send-sms', function (ctx) {
    //TODO: Make this work
    const message = ctx.request.url.substr(ctx.request.url.indexOf('?') + 1);
    const accountSid = 'AC5b0cc5f45e749f10d9b2cc6a100fda77';
    const authToken = '9d6466d60d1e3316e3e9abacebdcd21c';
    const client = require('twilio')(accountSid, authToken);

    client.messages
        .create({
            body: message,
            from: '+15005550006', //Good test phone number provided by Twilio
            to:   '+441727260269', //The Whistle's Twilio phone number
        })
        .done();
});


app
    .use(router.routes())
    .use(router.allowedMethods());


export default app;
