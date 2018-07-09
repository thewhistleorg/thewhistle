import Koa            from 'koa';
import Router         from 'koa-router';
import $RefParser     from 'json-schema-ref-parser';
import serve          from 'koa-static';
import dotProp        from 'dot-prop';
import Report         from '../models/report.js';
import autoIdentifier from '../lib/auto-identifier.js';
import Db             from '../lib/db.js';
import { ObjectId }   from 'mongodb';

const MessagingResponse = require('twilio').twiml.MessagingResponse;
const app = new Koa();
const router = new Router();
const yamlFile = 'public/spec/hfrn/hfrn-en.yaml';
const db = 'hfrn-test'; //TODO: Make class and use value from the class?
const spec = async () => {
    //Set spec to object containing yaml specifications
    return await $RefParser.dereference(yamlFile);
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
    console.log('NONO', questionNo, questions);
    return questions[questionNo].label;
}


/**
 * Gets the initial SMS to send from the YAML specification file
 *
 * @returns {string} - Initial SMS to send
 */
async function getInitialSms() {
    const specifications = await spec(); //TODO: Get initial SMS from YAML
    const initialSms = 'Welcome to The Whistle SMS Reporting. Reply HELP at any time';
    global.initialSms = initialSms;
    return initialSms;
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
    const org = 'hfrn-test'; //TODO: Make class and use value from the class?
    const project = 'hfrn'; //TODO: Make class and use value from the class?
    const alias = await autoIdentifier();
    const version = 0; // TODO: Work out what this should be - undefined in web form
    //Adds skeleton report to the database
    const sessionID = await Report.submissionStart(org, project, alias, version, ctx.headers['user-agent']);
    ctx.cookies.set('sessionID', sessionID, { httpOnly: false });
    console.log('ID', sessionID);
    //ctx.cookies.set('nextQuestion', 1, { httpOnly: false });
    //Get initial SMS text
    const initialSms = global.initialSms ? global.initialSms : await getInitialSms();
    //Send user initial SMS
    console.log(initialSms);
    twiml.message(alias + '---' + initialSms); //TODO: Improve initial SMS
    return alias;
}


async function setupDatabase() {
    // set up database connection: relationship between Twilio and organisation/project would have to be
    // considered if we were to use this app; perhaps it will be consumed into the textit app or
    // something... for now we'll just hardwire the grn-test db
    console.log('Connecting...');
    try {
        await Db.connect(db);
    } catch (e) {
        console.error(e.message);
    }
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
    if (!global.db[db]) {
        await setupDatabase();
    }
    const reports = global.db[db].collection('reports');
    const sessionID = ctx.cookies.get('sessionID');
    const field = getField(questions, questionNo);
    console.log('id', sessionID, field, input);
    try {
        await reports.updateOne(
            { _id: ObjectId(sessionID) },
            { $set: { [`submitted.${field}`]: input } }
        );
        console.log(
            { _id: ObjectId(sessionID) },
            { $set: { [`submitted.${field}`]: input } }
        );
    } catch (e) {
        console.log(e);
    }
    console.log('UPDATED');
}

/**
 * Gets the questions from the yaml specifications
 *
 * @returns {Object} - (Will it be an object?) Questions of the relevant form
 */
async function generateSmsQuestions() {
    //TODO: Edit this to work with generic yaml specifications (at least for hfrn)
    const specifications = await spec();
    const questions = [];
    const re = new RegExp('^p[0-9]+$');
    const pages = Object.keys(specifications.pages).filter(key => re.test(key));
    for (let p = 0; p < pages.length; p++) {
        for (let i = 0; i < specifications[pages[p]].length; i += 2) {
            questions.push({
                'question': specifications[pages[p]][i].text.substr(2), 
                'label':    specifications[pages[p]][i + 1].input.label, //TODO: Make this label
            });
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
    console.log('Next', nextQuestion);
    const message = questions[nextQuestion].question;
    ctx.cookies.set('nextQuestion', Number(nextQuestion) + 1, { httpOnly: false });
    twiml.message(message);
}


app.use(serve('public', { maxage: 1000*60*60*24 }));


router.post('/sms', async (ctx) => {
    //Get user's text
    const incomingSms = ctx.request.body.Body;
    const twiml = new MessagingResponse();
    //Load questions from memory if they exist, else generate them and store in memory
    //const questions = global.smsQuestions ? global.smsQuestions : await generateSmsQuestions();
    const questions = await generateSmsQuestions();
    //TODO: Get alias properly
    let alias = '';
    switch (incomingSms) {
        case 'HELP':
            //TODO: Handle action texts properly
            twiml.message('HELP text');
            break;
        default:
            console.log('default');
            let nextQuestion = 0;
            if (!ctx.cookies.get('nextQuestion')) {
                console.log('cook');
                //If this is the first SMS in a new report
                //Initiate the report
                //TODO: Should we use the user's text in their first message for anything?
                alias = await initiateSmsReport(ctx, twiml);
            } else {
                console.log('coooook');
                //If the report has already been started
                //Establish the stage of the report
                nextQuestion = ctx.cookies.get('nextQuestion');
                //Update database with the user's response
                await updateResponse(ctx, questions, nextQuestion - 1, incomingSms);
            }
            sendNextQuestion(ctx, twiml, questions, nextQuestion);
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
