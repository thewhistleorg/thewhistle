/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* The Whistle technology trial app.                                               C.Veness 2017  */
/*                                                                                                */
/* App comprises three (composed) sub-apps:                                                       */
/*  - report. (public incident reporting pages)                                                   */
/*  - admin.  (pages for interactively managing data)                                             */
/*  - twilio. (RESTful API for Twilio webhooks)                                                   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';
/* eslint no-shadow:off *//* app is already declared in the upper scope */

const Koa         = require('koa');            // Koa framework
const body        = require('koa-body');       // body parser
const compose     = require('koa-compose');    // middleware composer
const compress    = require('koa-compress');   // HTTP compression
const session     = require('koa-session');    // session for flash messages
const dateFormat  = require('dateformat');     // Steven Levithan's dateFormat()
const MongoClient = require('mongodb').MongoClient;
const fs          = require('fs-extra');       // fs with extra functions & promise interface
const debug       = require('debug')('app');   // small debugging utility

require('dotenv').config(); // loads environment variables from .env file (if available - eg dev env)

const app = new Koa();


// TODO: TMP load messages into global.messages from db/messages.json
fs.readFile('./db/messages.json').then(data => global.messages = data ? JSON.parse(data) : []).catch(() => global.messages = []);


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
    ctx.set('X-Response-Time', Math.ceil(t2-t1)+'ms');
});


// HTTP compression
app.use(compress({}));


// only search-index report subdomain
app.use(async function robots(ctx, next) {
    await next();
    if (ctx.hostname.slice(0,3) != 'report') ctx.response.set('X-Robots-Tag', 'noindex, nofollow');
});


// parse request body into ctx.request.body
// - multipart allows parsing of enctype=multipart/form-data
app.use(body({ multipart: true }));


// set signed cookie keys for JWT cookie & session cookie; keys are rotated monthly with 3-month
// lifetime, stem is taken from environment variable to protect against source code leak; note keys
// are set on app startup, which on Heroku happens at least daily
app.keys = [ 0, 1, 2 ].map(x => process.env.COOKIE_KEY + dateFormat(new Date(new Date().getFullYear(), new Date().getMonth()-x, 1), '-yyyy-mm'));

// session for flash messages (uses signed session cookies, with no server storage)
app.use(session(app));


// sometimes useful to be able to track each request...
app.use(async function(ctx, next) {
    debug(ctx.method + ' ' + ctx.url);
    await next();
});


// get database connection to 'users' database if not already available (only done on first request
// after app startup)
global.db = {}; // initialise global.db to empty object on app startup
app.use(async function(ctx, next) {
    if (!global.db.users) {
        try {
            global.db.users = await MongoClient.connect(process.env.DB_USERS);
        } catch (e) {
            console.error('Mongo connection error', e.toString());
            process.exit(1);
        }
    }
    await next();
});


// select sub-app (admin/api) according to host subdomain (could also be by analysing request.url);
// separate sub-apps can be used for modularisation of a large system, for different login/access
// rights for public/protected elements, and also for different functionality between api & web
// pages (content negotiation, error handling, handlebars templating, etc).

app.use(async function subApp(ctx, next) {
    // use subdomain to determine which app to serve: report. as default, or admin. or api
    ctx.state.subapp = ctx.hostname.split('.')[0]; // subdomain = part before first '.' of hostname
    // note: could use root part of path instead of sub-domains e.g. ctx.request.url.split('/')[1]
    await next();
});

app.use(async function composeSubapp(ctx) { // note no 'next' after composed subapp
    switch (ctx.state.subapp) {
        case 'admin':  await compose(require('./app-admin/app-admin.js').middleware)(ctx);   break;
        case 'report': await compose(require('./app-report/app-report.js').middleware)(ctx); break;
        case 'twilio': await compose(require('./app-twilio/app-twilio.js').middleware)(ctx); break;
        case 'textit': await compose(require('./app-textit/app-textit.js').middleware)(ctx); break;
        default: // no recognised subdomain
            if (process.env.SUBAPP) {
                // eg for Heroku review apps where subdomain cannot be supplied, take subapp from env
                const subapp = process.env.SUBAPP;
                await compose(require(`./app-${subapp}/app-${subapp}.js`).middleware)(ctx); break;
            }
            if (ctx.state.subapp == 'localhost') { ctx.status = 403; break; } // avoid redirect loop
            // otherwise redirect to www static site (which should not be this app)
            ctx.redirect(ctx.protocol+'://'+'www.'+ctx.host+ctx.path);
            break;
    }
});


/* create server - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

app.listen(process.env.PORT || 3000);
console.info(`${process.version} listening on port ${process.env.PORT || 3000} (${app.env})`);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = app;
