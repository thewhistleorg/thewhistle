/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'Admin' app - basic pages for reviewing reports & messages.                C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Koa        from 'koa';            // koa framework
import handlebars from 'koa-handlebars'; // handlebars templating
import flash      from 'koa-flash';      // flash messages
import lusca      from 'koa-lusca';      // security header middleware
import serve      from 'koa-static';     // static file serving middleware
import convert    from 'koa-convert';    // tmp for koa-flash, koa-lusca
import koaRouter  from 'koa-router';     // router middleware for koa
import Debug      from 'debug';          // small debugging utility

const debug  = Debug('app:req:a'); // debug each request
const router = koaRouter();

import HandlebarsHelpers from '../lib/handlebars-helpers.js';
import log               from '../lib/log.js';
import Middleware        from '../lib/middleware.js';

const app = new Koa(); // admin app


// handlebars templating
app.use(handlebars({
    extension:   [ 'html' ],
    viewsDir:    'app-admin/templates',
    partialsDir: 'app-admin/templates/partials',
    helpers:     { selected: HandlebarsHelpers.selected, checked: HandlebarsHelpers.checked, contains: HandlebarsHelpers.contains },
}));


// koa-static will throw 400 Malicious Path (from resolve-path) on URL starting with '//', so trap that
// case before using serve() middleware and return 404 instead (as with '//' anywhere else in url)
app.use(async function trapMaliciousPath(ctx, next) {
    if (ctx.url.slice(0, 2) == '//') { await ctx.render('404-not-found'); return; }
    await next();
});


// serve static files (html, css, js); allow browser to cache for 1 day (note css/js req'd before login)
// note that these files held in /public are included in the repository and served without constraint,
// as opposed to files in /static which are outside the repository and may be large and/or sensitive
const maxage = app.env=='production' ? 1000*60*60*24 : 1000;
app.use(serve('public', { maxage: maxage }));


// log requests (excluding static files, into capped collection)
app.use(async function logAccess(ctx, next) {
    debug(ctx.method.padEnd(4) + ' ' + ctx.url);
    const t1 = Date.now();
    await next();
    const t2 = Date.now();

    await log(ctx, 'access', t1, t2);
});


// handle thrown or uncaught exceptions anywhere down the line
app.use(async function handleErrors(ctx, next) {
    try {

        await next();

    } catch (e) {
        ctx.status = e.status || 500;
        switch (ctx.status) {
            case 401: // Unauthorised (eg invalid JWT auth token)
                ctx.redirect('/login'+ctx.url);
                break;
            case 404: // Not Found
                const context404 = { msg: e.message=='Not Found'?null:e.message };
                await ctx.render('404-not-found', context404);
                break;
            case 403: // Forbidden
            case 409: // Conflict
                await ctx.render('400-bad-request', e);
                break;
            default:
            case 500: // Internal Server Error
                const context500 = app.env=='production' ? {} : { e: e };
                await ctx.render('500-internal-server-error', context500);
                // ctx.app.emit('error', e, ctx); // github.com/koajs/koa/wiki/Error-Handling
                break;
        }
        await log(ctx, 'error', null, null, e);
    }
});


// clean up post data - trim & convert blank fields to null
app.use(async function cleanPost(ctx, next) {
    if (ctx.request.body !== undefined) {
        // enctype=multipart/form-data puts fields in body.fields, otherwise in body
        const body = typeof ctx.request.body.fields=='object' ? ctx.request.body.fields : ctx.request.body;
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
    '*.googleapis.com',
    '*.gstatic.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'unpkg.com',
    'maxcdn.bootstrapcdn.com',
    'developers.google.com',
    'cdn.rawgit.com',
    'raw.githubusercontent.com',
    'www.googletagmanager.com',
    'www.google-analytics.com',
].join(' ');
const luscaCspDefaultSrc = `'self' 'unsafe-inline' 'unsafe-eval' ${luscaCspTrustedCdns}`; // 'unsafe-inline' req'd for <style> blocks !!! unsave-eval req'd for google charts !!!
app.use(convert(lusca({ // note koa-lusca@2.2.0 is v1 middleware which generates deprecation notice
    csp:           { policy: { 'default-src': luscaCspDefaultSrc } }, // Content-Security-Policy
    cto:           'nosniff',                                         // X-Content-Type-Options
    hsts:          { maxAge: 60*60*24*365, includeSubDomains: true }, // HTTP Strict-Transport-Security
    xframe:        'SAMEORIGIN',                                      // X-Frame-Options
    xssProtection: true,                                              // X-XSS-Protection
})));


// add the domain (host without subdomain) into koa ctx (used in index.html)
app.use(async function ctxAddDomain(ctx, next) {
    ctx.state.domain = ctx.host.replace('admin.', '');
    await next();
});


// ------------ routing


// force use of SSL (redirect http protocol to https)
app.use(Middleware.ssl({ trustProxy: true }));


// check if user is signed in; leaves id in ctx.status.user.id if JWT verified
// (do this before login routes, as login page indicates if user is already logged in)
app.use(Middleware.verifyJwt());


// public (unsecured) modules first (index, login)

import routesPublic from './routes-public.js';
app.use(routesPublic);


// verify user is signed in...

app.use(async function isSignedIn(ctx, next) {
    if (ctx.state.user) {
        await next();
    } else {
        // authentication failed: redirect to login page
        ctx.flash = { loginfailmsg: 'Session expired: please sign in again' };
        ctx.redirect('/login'+ctx.url);
    }
});


// ... as subsequent modules require authentication

// serve report documents (uploaded from 'what' page of witness reporting app)
app.use(serve('static', { maxage: maxage }));

import routesApp  from './routes-app.js';
import routesDev  from './routes-dev.js';

app.use(routesApp);
app.use(routesDev);


// 404 status for any unrecognised ajax requests (don't throw as don't want to return html page)
router.all(/^\/ajax\/(.*)/, function(ctx) {
    ctx.body = { message: 'Not Found' };
    ctx.body.root = 'error';
    ctx.status = 404; // Not Found
});
app.use(router.routes());


// end of the line: 404 status for any resource not found
app.use(function notFound(ctx) { // note no 'next'
    ctx.throw(404);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default app;
