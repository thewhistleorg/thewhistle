import Koa from 'koa';            // koa framework
import Router     from 'koa-router';
import $RefParser from 'json-schema-ref-parser';
import serve      from 'koa-static';
import dotProp    from 'dot-prop';
import Report       from '../models/report.js';

import { CostExplorer } from 'aws-sdk';
import autoIdentifier from '../lib/auto-identifier.js';

const MessagingResponse = require('twilio').twiml.MessagingResponse;
const app = new Koa();
const router = new Router();
const spec = async () => {
    //Set spec to object containing yaml specifications
    return await $RefParser.dereference('http://e1a5f067.ngrok.io/spec/grn/rape-is-a-crime.yaml');
};


const generateSmsQuestions = async () => {
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
};

app.use(serve('public', { maxage: 1000*60*60*24 }));

router.get('/sms', async (ctx) => {
    console.log('receiving');
    const incomingSms = ctx.request.body.Body;

    const twiml = new MessagingResponse();
    let alias = '';
    if (incomingSms === 'HELP') {
        twiml.message('HELP text');
    } else {
        let sessionID = '';
        let nextQuestion = 1;
        if (!ctx.cookies.get('nextQuestion')) {
            const org = 'grn';
            const project = 'rape-is-a-crime';
            alias = await autoIdentifier();
            const version = 0; // TODO: Work out what this should be - undefined in web form
            sessionID = await Report.submissionStart(org, project, alias, version, ctx.headers['user-agent']);
            ctx.cookies.set('sessionID', sessionID, { httpOnly: false });
            ctx.cookies.set('nextQuestion', 1, { httpOnly: false });
            twiml.message('START REPORT. Reply HELP at any time.');
        } else {
            sessionID = ctx.cookies.get('sessionID');
            nextQuestion = ctx.cookies.get('nextQuestion');
        }
        console.log('NEXT', nextQuestion);
        console.log('ID', ctx.session.id);
        //Load questions from memory if they exist, else generate them and store in memory
        const questions = global.smsQuestions ? global.smsQuestions : await generateSmsQuestions();
        const message = questions[nextQuestion];
        ctx.cookies.set('nextQuestion', nextQuestion + 1, { httpOnly: false });
        twiml.message(message);
    }
    
    ctx.status = 200;
    ctx.headers['Content-Type'] = 'text/xml';
    ctx.body = twiml.toString();
    console.log('AAA', ctx.body);
    console.log('WORK', ctx.response.body);
});

router.get('/send-sms', function (ctx) {
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
        .then(m => console.log(m.sid))
        .done();
    console.log('Sent to us: ', message);
});

app
    .use(router.routes())
    .use(router.allowedMethods());

export default app;
