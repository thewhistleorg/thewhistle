/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'Report' app - (publicly available) witness reporting parts of the site.   C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Koa        from 'koa';            // koa framework
import handlebars from 'koa-handlebars'; // handlebars templating
import flash      from 'koa-flash';      // flash messages
import lusca      from 'koa-lusca';      // security header middleware
import serve      from 'koa-static';     // static file serving middleware
import convert    from 'koa-convert';    // tmp for koa-flash, koa-lusca
import Debug      from 'debug';          // small debugging utility

const debug = Debug('app:req:r'); // debug each request

import Log               from '../lib/log.js';
import Middleware        from '../lib/middleware.js';
import HandlebarsHelpers from '../lib/handlebars-helpers';


const app = new Koa(); // report app


// serve static files (html, css, js); allow browser to cache for 1 hour (note css/js req'd before login)
const maxage = app.env=='production' ? 1000*60*60 : 1000;
app.use(serve('public', { maxage: maxage }));


// don't cache, so that flash messages will get displayed correctly
app.use(async function noCache(ctx, next) {
    await next();
    ctx.response.set('Cache-Control', 'no-cache');
});


// log requests (excluding static files, into capped collection)
app.use(async function logAccess(ctx, next) {
    debug(ctx.request.method.padEnd(4) + ' ' + ctx.request.url);
    const t1 = Date.now();
    await next();
    const t2 = Date.now();

    await Log.access(ctx, t2 - t1);
});


// handlebars templating (supra database/project)

app.use(handlebars({
    extension:   [ 'html' ],
    viewsDir:    'app-report/templates',
    partialsDir: 'app-report/templates/partials',
    helpers:     {
        selected: HandlebarsHelpers.selected,
        checked:  HandlebarsHelpers.checked,
        show:     HandlebarsHelpers.show,
    },
}));


// handle thrown or uncaught exceptions anywhere down the line
app.use(async function handleErrors(ctx, next) {
    try {

        await next();

    } catch (err) {
        ctx.response.status = err.status || 500;
        if (app.env == 'production') delete err.stack; // don't leak sensitive info!
        switch (ctx.response.status) {
            case 404: // Not Found
                if (err.message == 'Not Found') err.message = null; // personalised 404
                await ctx.render('404-not-found', { err });         // 404 from app-report
                break;
            case 410: // Gone
                await ctx.render('4xx-bad-request', { err });       // 410 from form-generator
                break;
            default:
            case 500: // Internal Server Error (for uncaught or programming errors)
                await ctx.render('500-internal-server-error', { err });
                // ctx.app.emit('error', err, ctx); // github.com/koajs/koa/wiki/Error-Handling
                break;
        }
        await Log.error(ctx, err);
    }
});


// clean up post data - trim & convert blank fields to null
app.use(async function cleanPost(ctx, next) {
    if (ctx.request.body != undefined && Object.keys(ctx.request.body).length > 0) {
        const body =  ctx.request.body;
        for (const key in body) {
            if (typeof body[key] == 'string') {
                body[key] = body[key].trim();
                if (body[key] == '') body[key] = null;
            }
        }
        debug('cleanPost', body);
    }
    await next();
});


// for x-www-form-urlencoded, koa-body will convert dotted keys to nested arrays (per co-body), but
// for multipart/form-data, formidable doesn't convert, so we have to do it manually
app.use(async function allowPostDots(ctx, next) {
    if (ctx.request.method == 'POST') {
        const multipart = 'fields' in ctx.request.body && 'files' in ctx.request.body;
        const body = multipart ? ctx.request.body.fields : ctx.request.body;
        for (const key in body) {
            if (key.includes('.')) { // dotted key: convert to nested object
                const obj = {};
                let part = obj;
                const keys = key.split('.');
                for (let k=0; k<keys.length-1; k++) {
                    part[keys[k]] = {};
                    part = part[keys[k]];
                }
                part[keys[keys.length-1]] = body[key];
                delete body[key];
                mergeDeep(body, obj);
            }
        }
    }
    await next();
});

// deep merge equivalent of Object.assign; qv stackoverflow.com/questions/27936772.
function mergeDeep(target, ...sources) {
    if (sources.length == 0) return target;
    const source = sources.shift();

    for (const key in source) {
        if (source[key] && typeof source[key] == 'object') {
            if (!target[key]) Object.assign(target, { [key]: {} });
            mergeDeep(target[key], source[key]);
        } else {
            Object.assign(target, { [key]: source[key] });
        }
    }

    return mergeDeep(target, ...sources);
}

// flash messages
app.use(convert(flash())); // note koa-flash@1.0.0 is v1 middleware which generates deprecation notice


// lusca security headers
const luscaCspTrustedCdns = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'unpkg.com',
    'www.google.com',
    'www.gstatic.com',
    'www.googletagmanager.com',
    'www.google-analytics.com',
].join(' ');
const luscaCspDefaultSrc = `'self' 'unsafe-inline' ${luscaCspTrustedCdns}`; // 'unsafe-inline' required for <style> blocks
app.use(convert(lusca({ // note koa-lusca@2.2.0 is v1 middleware which generates deprecation notice
    csp:            { policy: { 'default-src': luscaCspDefaultSrc } }, // Content-Security-Policy
    cto:            'nosniff',                                         // X-Content-Type-Options
    hsts:           { maxAge: 60*60*24*365, includeSubDomains: true }, // HTTP Strict-Transport-Security
    xframe:         'SAMEORIGIN',                                      // X-Frame-Options
    xssProtection:  true,                                              // X-XSS-Protection
    referrerPolicy: 'strict-origin-when-cross-origin',                 // Referrer-Policy
})));


// add the domain (host without subdomain) and hostAdmin (report. replaced by admin.) into koa ctx
app.use(async function ctxAddDomain(ctx, next) {
    ctx.state.domain = ctx.request.host.replace('report.', '');
    ctx.state.hostAdmin = ctx.request.host.replace('report.', 'admin.');
    await next();
});


// force use of SSL (redirect http protocol to https)
app.use(Middleware.ssl({ trustProxy: true }));


// check if user is signed in; leaves id in ctx.state.user.id if JWT verified;
// this is used to show username & return to admin link in nav bar
app.use(Middleware.verifyJwt());


// ------------ routing


// ajax routes are handled separately as they have different response structure
import ajaxRoutes from './ajax-routes.js';
app.use(ajaxRoutes);

// routes for the incident submission reporting
import reportRoutes from './report-routes.js';
app.use(reportRoutes);


// end of the line: 404 status for any resource not found
app.use(function notFound(ctx) { // note no 'next'
    ctx.throw(404);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default app;
