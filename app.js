/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* The Whistle technology trial app.                                          C.Veness 2017-2018  */
/*                                                                                                */
/* App comprises following (composed) sub-apps:                                                   */
/*  - report.  (public incident reporting pages)                                                  */
/*  - admin.   (pages for interactively managing data)                                            */
/*  - publish. (publicly available aggregated metreics)                                           */
/*  - sms.     (sms incident reporting)                                                           */
/*  - twilio.  (RESTful API for Twilio webhooks)                                                  */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint no-shadow:off *//* app is already declared in the upper scope */

import Koa             from 'koa';            // Koa framework
import body            from 'koa-body';       // body parser
import compose         from 'koa-compose';    // middleware composer
import compress        from 'koa-compress';   // HTTP compression
import session         from 'koa-session';    // session for flash messages
import dateFormat      from 'dateformat';     // Steven Levithan's dateFormat()
import dotenv          from 'dotenv';         // load environment variables from a .env file into process.env

dotenv.config();

import FormGenerator from './lib/form-generator.js';

// models are imported to invoke their init() methods
import FormSpecification from './models/form-specification.js';
import Notification      from './models/notification.js';
import Report            from './models/report.js';
import Resource          from './models/resource.js';
import Submission        from './models/submission.js';
import Update            from './models/update.js';
import User              from './models/user.js';
import Group             from './models/group.js';
import ReportSession     from './models/report-session.js';


const app = new Koa();


// for user-agents reporting
app.proxy = true;
global.start = new Date(); // to report counts since given timestamp
global.userAgents = [];


/* set up middleware which will be applied to each request - - - - - - - - - - - - - - - - - - -  */


// return response time in X-Response-Time header
app.use(async function responseTime(ctx, next) {
    const t1 = Date.now();
    await next();
    const t2 = Date.now();
    ctx.response.set('X-Response-Time', Math.ceil(t2-t1)+'ms');
});


// HTTP compression
app.use(compress({}));


// only search-index report subdomain
app.use(async function robots(ctx, next) {
    await next();
    if (ctx.request.hostname.slice(0, 6) != 'report') ctx.response.set('X-Robots-Tag', 'noindex, nofollow');
});


// parse request body into ctx.request.body
// - multipart allows parsing of enctype=multipart/form-data
app.use(body({ multipart: true }));


// set signed cookie keys for JWT cookie & session cookie; keys are rotated monthly with 3-month
// lifetime, stem is taken from environment variable to protect against source code leak; note keys
// are set on app startup (which on Heroku happens at least daily), not per request
const date = { y: new Date().getFullYear(), m: new Date().getMonth(), d: 1 };
app.keys = [ 0, 1, 2 ].map(x => process.env.COOKIE_KEY + dateFormat(new Date(date.y, date.m-x, date.d), '-yyyy-mm'));

// ctx.session uses signed session cookies, with no server storage; it is used for holding submitted
// report details in the report sub-app, and for flash messages across all apps
app.use(session({ maxAge: 1000*60*60*24*7 }, app));


// invoke model init() methods to ensure current validation is applied to all databases (in
// development or staging environments, all databases ending with '-test'; in production environment,
// all databases not ending in '-test'; 'user' database is initialised in all cases)
async function initModels() {
    if (global.it) return 0; // don't bother reinitialising within mocha tests

    const t1 = Date.now();

    const databases = Object.keys(process.env)
        .filter(env => env.slice(0, 3)=='DB_' && env!='DB_USERS')
        .map(db => db.slice(3).toLowerCase().replace(/_/g, '-'))
        .filter(db => app.env=='production' ? !/-test$/.test(db) : /-test$/.test(db));

    // set up array of init methods...
    const initMethods = [];
    for (const db of databases) {
        initMethods.push(FormSpecification.init(db));
        initMethods.push(Notification.init(db));
        initMethods.push(Report.init(db));
        initMethods.push(Resource.init(db));
        initMethods.push(Submission.init(db));
        initMethods.push(Update.init(db));
        initMethods.push(Group.init(db));
        initMethods.push(ReportSession.init(db));
    }
    initMethods.push(User.init());

    // ... so that we can run all init methods in parallel
    try {
        await Promise.all(initMethods);
    } catch (e) {
        throw new Error(`Model initialisation failed: ${e.message}`);
    }

    return Date.now() - t1;
}
// model initialisation runs asynchronously and won't complete until after app startup, but that's
// fine: we've no reason to wait on model init's before responding to requests
initModels()
    .then(t => console.info(t?`${app.env=='production'?'live':'test'} database collections re-initialised (${t}ms)`:''))
    .catch(err => console.error(err));


async function buildForms() {
    const t1 = Date.now();
    await FormGenerator.buildAll();
    return Date.now() - t1;
}
// form building runs asynchronously and won't complete until after app startup, but that's fine:
// we've no reason to wait on form builds before responding to requests (a request will initiate a
// form build, and await on completion)
buildForms()
    .then(t => console.info(`All forms built (${t}ms)`))
    .catch(err => console.error('ERR (buildForms):', err.message));


// select sub-app (admin/api) according to host subdomain (could also be by analysing request.url);
// separate sub-apps can be used for modularisation of a large system, for different login/access
// rights for public/protected elements, and also for different functionality between api & web
// pages (content negotiation, error handling, handlebars templating, etc).

app.use(async function subApp(ctx, next) {
    // use subdomain to determine which app to serve: report. as default, or admin. or api
    ctx.state.subapp = ctx.request.hostname.split('.')[0]; // subdomain = part before first '.' of hostname
    // note: could use root part of path instead of sub-domains e.g. ctx.request.url.split('/')[1]
    await next();
});

import appAdmin   from './app-admin/app-admin.js';
import appReport  from './app-report/app-report.js';
import appSms     from './app-sms/app-sms.js';
import appTextit  from './app-textit/app-textit.js';
import appPublish from './app-publish/app-publish.js';


app.use(async function composeSubapp(ctx) { // note no 'next' after composed subapp
    switch (ctx.state.subapp) {
        case 'admin':  await compose(appAdmin.middleware)(ctx);   break;
        case 'report': await compose(appReport.middleware)(ctx); break;
        case 'sms': await compose(appSms.middleware)(ctx); break;
        case 'textit': await compose(appTextit.middleware)(ctx); break;
        case 'publish': await compose(appPublish.middleware)(ctx); break;
        default: // no recognised subdomain
            if (process.env.SUBAPP) {
                // eg for Heroku review apps where subdomain cannot be supplied, take subapp from env
                const subapp = await import(`./app-${process.env.SUBAPP}/app-${process.env.SUBAPP}.js`);
                await compose(subapp.default.middleware)(ctx); break;
            }
            if (ctx.state.subapp == 'localhost') { ctx.response.status = 403; break; } // avoid redirect loop
            // otherwise redirect to www static site (which should not be this app)
            ctx.response.redirect(ctx.request.protocol+'://'+'www.'+ctx.request.host+ctx.request.path);
            break;
    }
});


/* create server - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

app.listen(process.env.PORT || 3000);
console.info(`${process.version} listening on port ${process.env.PORT || 3000} (${app.env})`);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default app;
