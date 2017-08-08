/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'report' app - (publicly available) witness reporting parts of the site                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Koa        = require('koa');            // koa framework
const router     = require('koa-router')();   // router middleware for koa
const handlebars = require('koa-handlebars'); // handlebars templating
const flash      = require('koa-flash');      // flash messages
const lusca      = require('koa-lusca');      // security header middleware
const serve      = require('koa-static');     // static file serving middleware
const bunyan     = require('bunyan');         // logging
const koaLogger  = require('koa-bunyan');     // logging
const document   = new (require('jsdom')).JSDOM().window.document; // DOM Document interface in Node!
const MongoClient = require('mongodb').MongoClient;


const app = new Koa(); // report app


// serve static files (html, css, js); allow browser to cache for 1 hour (note css/js req'd before login)
const maxage = app.env=='development' ? 1000 : 1000*60*60;
app.use(serve('public', { maxage: maxage }));


// handlebars templating

const hbsCheckedHelperV1 = function(value, test) { // return 'checked' if value matches test
    if (value == undefined) return '';
    return value==test ? 'checked' : '';
};

const hbsCheckedHelper = function(value, options) {
    const div = document.createElement('div'); // create a container div
    div.innerHTML = options.fn(this);          // parse content into dom
    if (typeof value == 'string') {
        div.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(function(input) {
            // if input value matches supplied value, check it
            if (input.value == value) input.defaultChecked = true;
        });
    }
    if (typeof value == 'object') {
        div.querySelectorAll('input[type=checkbox]').forEach(function(input) {
            // if input value is included in supplied value, check it
            if (value.includes(input.value)) input.defaultChecked = true;
        });
    }
    return div.innerHTML;
};

app.use(handlebars({
    extension:   [ 'html', 'handlebars' ],
    viewsDir:    'app-report/templates',
    partialsDir: 'app-report/templates',
    helpers:     { checked: hbsCheckedHelper },
}));


// get database connection if not already available TODO: get database from URL component
app.use(async function getDbConnection(ctx, next) {
    if (!global.db['test']) {
        try {
            const connectionString = process.env['DB_TEST'];
            global.db['test'] = await MongoClient.connect(connectionString);
        } catch (e) {
            const context500 = app.env=='production' ? {} : { e: e };
            await ctx.render('500-internal-server-error', context500);
            return;
        }
    }
    await next();
});


// handle thrown or uncaught exceptions anywhere down the line
app.use(async function handleErrors(ctx, next) {
    try {

        await next();

    } catch (e) {
        ctx.status = e.status || 500;
        switch (ctx.status) {
            case 404: // Not Found
                const context404 = { msg: e.message=='Not Found'?null:e.message };
                await ctx.render('404-not-found', context404);
                break;
            default:
            case 500: // Internal Server Error
                console.error(ctx.status, e.message);
                const context500 = app.env=='production' ? {} : { e: e };
                await ctx.render('500-internal-server-error', context500);
                ctx.app.emit('error', e, ctx); // github.com/koajs/koa/wiki/Error-Handling
                break;
        }
    }
});


// clean up post data - trim & convert blank fields to null
app.use(async function cleanPost(ctx, next) {
    // koa-body puts multipart/form-data form fields in request.body.{fields,files}
    const body = 'fields' in ctx.request.body && 'files' in ctx.request.body ? ctx.request.body.fields : ctx.request.body;
    if (body !== undefined) {
        for (const key in body) {
            if (typeof body[key] == 'string') {
                body[key] = body[key].trim();
                if (body[key] == '') body[key] = null;
            }
        }
    }
    await next();
});


// flash messages
app.use(flash());


// lusca security headers
const luscaCspTrustedCdns = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'unpkg.com',
].join(' ');
const luscaCspDefaultSrc = `'self' 'unsafe-inline' ${luscaCspTrustedCdns}`; // 'unsafe-inline' required for <style> blocks
app.use(lusca({
    csp:           { policy: { 'default-src': luscaCspDefaultSrc } }, // Content-Security-Policy
    cto:           'nosniff',                                         // X-Content-Type-Options
    hsts:          { maxAge: 31536000, includeSubDomains: true },     // HTTP Strict-Transport-Security (1 year)
    xframe:        'SAMEORIGIN',                                      // X-Frame-Options
    xssProtection: true,                                              // X-XSS-Protection
}));


// add the domain (host without subdomain) into koa ctx (used in navpartial template)
app.use(async function ctxAddDomain(ctx, next) {
    ctx.state.domain = ctx.host.replace('report.', '');
    await next();
});


// logging
const access = { type: 'rotating-file', path: './logs/report-access.log', level: 'trace', period: '1d', count: 4 };
const error  = { type: 'rotating-file', path: './logs/report-error.log',  level: 'error', period: '1d', count: 4 };
const logger = bunyan.createLogger({ name: 'report', streams: [ access, error ] });
app.use(koaLogger(logger, {}));


// ------------ routing

router.get( '/', ctx => ctx.render('index'));
app.use(router.routes());

app.use(require('./wwww-routes.js'));
app.use(require('./scr-routes.js'));
app.use(require('./grn-routes.js'));
app.use(require('./email-routes.js'));
app.use(require('./ajax-routes.js'));

// end of the line: 404 status for any resource not found
app.use(function notFound(ctx) { // note no 'next'
    ctx.throw(404);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = app;
