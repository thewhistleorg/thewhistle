/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'report' app - (publicly available) witness reporting parts of the site                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Koa        = require('koa');            // koa framework
const compose    = require('koa-compose');    // middleware composer
const router     = require('koa-router')();   // router middleware for koa
const handlebars = require('koa-handlebars'); // handlebars templating
const flash      = require('koa-flash');      // flash messages
const lusca      = require('koa-lusca');      // security header middleware
const serve      = require('koa-static');     // static file serving middleware
const convert    = require('koa-convert');    // tmp for koa-flash, koa-lusca
const bunyan     = require('bunyan');         // logging
const koaLogger  = require('koa-bunyan');     // logging


const app = new Koa(); // report app


// serve static files (html, css, js); allow browser to cache for 1 hour (note css/js req'd before login)
const maxage = app.env=='development' ? 1000 : 1000*60*60;
app.use(serve('public', { maxage: maxage }));


// handlebars templating (supra database/project)

app.use(handlebars({
    extension:   [ 'html' ],
    viewsDir:    'app-report/templates',
    partialsDir: 'app-report/templates/partials',
}));


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
app.use(convert(flash())); // note koa-flash@1.0.0 is v1 middleware which generates deprecation notice


// lusca security headers
const luscaCspTrustedCdns = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'unpkg.com',
].join(' ');
const luscaCspDefaultSrc = `'self' 'unsafe-inline' ${luscaCspTrustedCdns}`; // 'unsafe-inline' required for <style> blocks
app.use(convert(lusca({ // note koa-lusca@2.2.0 is v1 middleware which generates deprecation notice
    csp:           { policy: { 'default-src': luscaCspDefaultSrc } }, // Content-Security-Policy
    cto:           'nosniff',                                         // X-Content-Type-Options
    hsts:          { maxAge: 60*60*24*365, includeSubDomains: true }, // HTTP Strict-Transport-Security
    xframe:        'SAMEORIGIN',                                      // X-Frame-Options
    xssProtection: true,                                              // X-XSS-Protection
})));


// add the domain (host without subdomain) into koa ctx (used in navpartial template) TODO: check
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

// compose appropriate sub-app for required database / project, in order to maximise modularity

// TODO: any way to invoke project routes directly, rather than composing app?

app.use(require('./ajax-routes.js'));

// TODO: why doesn't router.all('/:database/:project', '/:database/:project/:page', ...) work?
router.all('/:database/:project', async function composeDatabaseProject(ctx) {
    try {
        await compose(require(`./${ctx.params.database}/${ctx.params.project}/app.js`).middleware)(ctx);
    } catch (e) {
        if (e.code == 'MODULE_NOT_FOUND') ctx.throw(404);
        throw e;
    }
});
router.all('/:database/:project/:page', async function composeDatabaseProject(ctx) {
    try {
        await compose(require(`./${ctx.params.database}/${ctx.params.project}/app.js`).middleware)(ctx);
    } catch (e) {
        if (e.code == 'MODULE_NOT_FOUND') ctx.throw(404);
        throw e;
    }
});

app.use(router.routes());

// end of the line: 404 status for any resource not found
app.use(function notFound(ctx) { // note no 'next'
    ctx.throw(404);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = app;
