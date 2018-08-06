/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routing for incident submission report pages.                                   C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint space-in-parens: off */

import Router from 'koa-router'; // router middleware for koa
const router = new Router();

import handlers from './report-handlers.js';
import SmsApp        from '../app-sms/sms.js';
import FormGenerator from '../lib/form-generator.js';
import EvidencePage  from '../app-sms/evidence.js'
import Report        from '../models/report.js';

// JUST FOR TESTING: supertest doesn't appear to manage to pass koa:jwt cookie between apps on
// different ports, so provide a way for the test suite to explicitly log in to the report app
import adminLogin from '../app-admin/login.js';
router.post('/:database/:project/login', adminLogin.postLogin);

// redirect /test-grn/sexual-assault to /grn/rape-is-a-crime; GRN launched /test-grn/sexual-assault
// as the reporting URL, but this has now been corrected to /grn/rape-is-a-crime
router.get( '/test-grn/sexual-assault', ctx => ctx.response.redirect('/grn/rape-is-a-crime'));

router.get( '/',                           handlers.getHomePage);   // home page

//Serve SMS test web app
//EMULATOR STARTS
const smsRoutes = {};
const evidenceRoutes = {};
//On receiving a text
router.post('/:org/:project', async function (ctx) {
    console.log('receive');
    //If the organisation/project combination is valid
    if (FormGenerator.exists(ctx.params.org, ctx.params.project)) {
        //If this is the first request for the organisation/project combination (since server start)
        if (!smsRoutes[ctx.url]) {
            smsRoutes[ctx.url] = new SmsApp(ctx.params.org, ctx.params.project);
            await smsRoutes[ctx.url].parseSpecifications();
            await smsRoutes[ctx.url].setupDatabase();
        }
        await smsRoutes[ctx.url].receiveText(ctx);
    }

    
});

//Delete a message sent by the system
router.post('/delete-outbound', function (ctx) {
    console.log('delete');
    if (ctx.request.body.SmsStatus === 'delivered') {
        SmsApp.deleteMessage(ctx.request.body.MessageSid);
    }
    ctx.status = 200;
    ctx.headers['Content-Type'] = 'text/xml';
});

//Direct user to the page allowing them to upload evidence
router.get('/:org/evidence/:token', async function (ctx) {
    console.log('evidence');
    //TODO: Try not providing token
    if (!evidenceRoutes[ctx.params.token]) {
        const reports = await Report.getBy(ctx.params.org, 'evidenceToken', ctx.params.token);
        if (reports.length > 0) {
            evidenceRoutes[ctx.params.token] = new EvidencePage(reports[0]);
            await evidenceRoutes[ctx.params.token].renderEvidencePage(ctx);
        } else {
            await EvidencePage.renderInvalidTokenPage(ctx);
        }
    } else {
        await evidenceRoutes[ctx.params.token].renderEvidencePage(ctx);
    }
});
router.get('/sms-emulator',                handlers.getEmulator);
//EMULATOR ENDS
router.get( '/:database/:project/rebuild', handlers.rebuild);       // rebuild report from spec
router.get( '/:database/:project',         handlers.getIndex);      // render incident report index page
router.post('/:database/:project',         handlers.postIndex);     // process index page submission
router.get( '/:database/:project/:page',   handlers.getPage);       // render report page
router.post('/:database/:project/:page',   handlers.postPage);      // process page submission


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
