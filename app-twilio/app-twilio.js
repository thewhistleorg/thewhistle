/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Twilio app - Pages and API for running and testing SMS reporting.           Louis Slater 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


import Koa           from 'koa';
import Router        from 'koa-router';
import handlebars    from 'koa-handlebars'; 
import serve         from 'koa-static';
import SmsApp        from '../app-twilio/sms.js';
import FormGenerator from '../lib/form-generator.js';
import EvidencePage  from '../app-twilio/evidence.js'
import Report        from '../models/report.js';


const app = new Koa();
const router = new Router();


app.use(serve('public', { maxage: 1000*60*60*24 }));

// handlebars templating
app.use(handlebars({
    extension: [ 'html' ],
    viewsDir:  'app-twilio/templates',
}));

const smsRoutes = {};
const evidenceRoutes = {};

//Serve SMS test web app
router.get('/sms-emulator', async function(ctx) {
    if (ctx.app.env === 'production') {
        ctx.status = 404;
    } else {
        await ctx.render('test-chat');
    }
});

//On receiving a text
router.post('/:org/:project', async function (ctx) {
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
    if (ctx.request.body.SmsStatus === 'delivered') {
        SmsApp.deleteMessage(ctx.request.body.MessageSid);
    }
    ctx.status = 200;
    ctx.headers['Content-Type'] = 'text/xml';
});

//Direct user to the page allowing them to upload evidence
router.get('/:org/evidence/:token', async function (ctx) {
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

app.use(router.routes());


export default app;
