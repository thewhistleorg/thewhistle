/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'Admin' app - basic pages for reviewing reports & messages                                     */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';


const Koa         = require('koa');            // koa framework
const handlebars  = require('koa-handlebars'); // handlebars templating
const flash       = require('koa-flash');      // flash messages
const lusca       = require('koa-lusca');      // security header middleware
const serve       = require('koa-static');     // static file serving middleware
const jwt         = require('jsonwebtoken');   // JSON Web Token implementation
const bunyan      = require('bunyan');         // logging
const koaLogger   = require('koa-bunyan');     // logging
const convert     = require('koa-convert');    // tmp for koa-flash, koa-lusca
const router      = require('koa-router')();   // router middleware for koa
const MongoClient = require('mongodb').MongoClient;

const HandlebarsHelpers = require('../lib/handlebars-helpers.js');

const app = new Koa(); // admin app


// serve static files (html, css, js); allow browser to cache for 1 day (note css/js req'd before login)
// note that these files held in /public are included in the repository and served without constraint,
// as opposed to files in /static which are outside the repository and may be large and/or sensitive
const maxage = app.env=='production' ? 1000*60*60*24 : 1000;
app.use(serve('public', { maxage: maxage }));


// handlebars templating
app.use(handlebars({
    extension:   [ 'html' ],
    viewsDir:    'app-admin/templates',
    partialsDir: 'app-admin/templates/partials',
    helpers:     { selected: HandlebarsHelpers.selected, checked: HandlebarsHelpers.checked },
}));


// handle thrown or uncaught exceptions anywhere down the line
app.use(async function handleErrors(ctx, next) {
    try {

        await next();

    } catch (e) {
        ctx.status = e.status || 500;
        switch (ctx.status) {
            case 401: // Unauthorised
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
    'maps.googleapis.com',
    'maps.gstatic.com',
    'www.gstatic.com',
    'csi.gstatic.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
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


// logging
const access = { type: 'rotating-file', path: './logs/admin-access.log', level: 'trace', period: '1d', count: 4 };
const error  = { type: 'rotating-file', path: './logs/admin-error.log',  level: 'error', period: '1d', count: 4 };
const logger = bunyan.createLogger({ name: 'admin', streams: [ access, error ] });
app.use(koaLogger(logger, {}));


// ------------ routing


// check if user is signed in; leaves id in ctx.status.user.id if JWT verified
// (do this before login routes, as login page indicates if user is already logged in)
app.use(verifyJwt);


// public (unsecured) modules first (index, login)

app.use(require('./routes-public.js'));


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

app.use(require('./routes-app.js'));

app.use(require('./routes-logs.js'));
app.use(require('./routes-dev.js'));


// 404 status for any unrecognised ajax requests (don't throw as don't want to return html page)
router.all(/\/ajax\/(.*)/, function(ctx) {
    ctx.body = { message: 'Not Found' };
    ctx.body.root = 'error';
    ctx.status = 404; // Not Found
});


// end of the line: 404 status for any resource not found
app.use(function notFound(ctx) { // note no 'next'
    ctx.throw(404);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


/**
 * Verify the JSON Web Token authentication supplied in (signed) cookie.
 *
 * If the token verifies, record the payload in ctx.state.user: the user id is held in ctx.state.user.id.
 *
 * Issued tokens have 24-hour validity. If the cookie contains an expired token, and the user logged
 * with using the 'remember-me' option, then issue a replacement 24-hour token, and renew the cookie
 * for a further 7 days. The 'remember-me' function will lapse after 7 days inactivity.
 */
async function verifyJwt(ctx, next) {
    const token = ctx.cookies.get('koa:jwt', { signed: true });

    if (token) {
        try {
            const  payload = jwt.verify(token, 'koa-sample-app-signature-key'); // throws on invalid token

            // valid token: accept it...
            await setupUser(ctx, payload);
        } catch (err) {
            // verify failed - retry with ignore expire option
            try {
                const payload = jwt.verify(token, 'koa-sample-app-signature-key', { ignoreExpiration: true });

                // valid token except for exp: accept it...
                await setupUser(ctx, payload);

                // ... and re-issue a replacement token for a further 24 hours
                delete payload.exp;
                const replacementToken = jwt.sign(payload, 'koa-sample-app-signature-key', { expiresIn: '24h' });
                const options = { signed: true };
                if (payload.remember) options.expires = new Date(Date.now() + 1000*60*60*24*7); // remember-me for 7d
                ctx.cookies.set('koa:jwt', replacementToken, options);
            } catch (e) {
                if (e.message == 'invalid token') ctx.throw(401, 'Invalid authentication'); // verify (both!) failed
                console.error(e);
                ctx.throw(e.status||500, e.message); // Internal Server Error
            }
        }
    }

    await next();
}

async function setupUser(ctx, jwtPayload) {
    const roles = { g: 'guest', u: 'user', a: 'admin', r: 'reporter', s: 'su' };

    ctx.state.user = Object.assign({}, jwtPayload);                           // for user id  to look up user details
    if (!ctx.state.user.roles) ctx.state.user.roles = '';                     // avoid risk of exception due to unset roles!
    ctx.state.user.roles = ctx.state.user.roles.split('').map(r => roles[r]); // abbreviated string -> array
    ctx.state.user.isAdmin = ctx.state.user.roles.includes('admin');          // for nav menu
    //ctx.state.user.jwt = token;                                             // for ajax->api calls

    // if we don't have db connection for this user's (current) db, get it now (qv login.js)
    // (these will remain in global for entire app, this doesn't happen per request)
    const db = ctx.state.user.db;
    if (!global.db[db]) {
        try {
            const connectionString = process.env[`DB_${db.toUpperCase().replace('-', '_')}`];
            global.db[db] = await MongoClient.connect(connectionString);
        } catch (e) {
            const loginfailmsg = `Invalid database credentials for ‘${db}’`;
            ctx.flash = { username: ctx.state.user.email, loginfailmsg: loginfailmsg };
            ctx.redirect('/login');
            return;
        }
    }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = app;
