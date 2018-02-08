/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'Report' app - (publicly available) witness reporting parts of the site.   C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Koa        from 'koa';            // koa framework
import compose    from 'koa-compose';    // middleware composer
import Router     from 'koa-router';     // router middleware for koa
import handlebars from 'koa-handlebars'; // handlebars templating
import flash      from 'koa-flash';      // flash messages
import lusca      from 'koa-lusca';      // security header middleware
import serve      from 'koa-static';     // static file serving middleware
import fetch      from 'node-fetch';     // window.fetch in node.js
import convert    from 'koa-convert';    // tmp for koa-flash, koa-lusca
const router = new Router();

import log from '../lib/log.js';
import ssl from '../lib/ssl.js';


const app = new Koa(); // report app


// serve static files (html, css, js); allow browser to cache for 1 hour (note css/js req'd before login)
const maxage = app.env=='production' ? 1000*60*60 : 1000;
app.use(serve('public', { maxage: maxage }));


// log requests (excluding static files, into capped collection)
app.use(async function logAccess(ctx, next) {
    const t1 = Date.now();
    await next();
    const t2 = Date.now();

    await log(ctx, 'access', t1, t2);
});


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
                // TODO: fix!
                try { await ctx.render('404-not-found', context404); } catch (e) { }
                break;
            default:
            case 500: // Internal Server Error TODO: 500-internal-server-error gets looked for within individual project
                console.error('handleErrors', ctx.status, e.message, e.stack);
                const context500 = app.env=='production' ? {} : { e: e };
                await ctx.render('500-internal-server-error', context500);
                ctx.app.emit('error', e.message); // github.com/koajs/koa/wiki/Error-Handling
                break;
        }
        await log(ctx, 'error', null, null, e);
    }
});


// clean up post data - trim & convert blank fields to null
app.use(async function cleanPost(ctx, next) {
    if (ctx.request.method == 'POST') {
        // koa-body puts multipart/form-data form fields in request.body.{fields,files}
        const multipart = 'fields' in ctx.request.body && 'files' in ctx.request.body;
        const body =  multipart ? ctx.request.body.fields : ctx.request.body;
        for (const key in body) {
            if (typeof body[key] == 'string') {
                body[key] = body[key].trim();
                if (body[key] == '') body[key] = null;
            }
        }
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
    'www.googletagmanager.com',
    'www.google-analytics.com',
].join(' ');
const luscaCspDefaultSrc = `'self' 'unsafe-inline' ${luscaCspTrustedCdns}`; // 'unsafe-inline' required for <style> blocks
app.use(convert(lusca({ // note koa-lusca@2.2.0 is v1 middleware which generates deprecation notice
    csp:           { policy: { 'default-src': luscaCspDefaultSrc } }, // Content-Security-Policy
    cto:           'nosniff',                                         // X-Content-Type-Options
    hsts:          { maxAge: 60*60, includeSubDomains: true }, // HTTP Strict-Transport-Security
    xframe:        'SAMEORIGIN',                                      // X-Frame-Options
    xssProtection: true,                                              // X-XSS-Protection
})));


// add the domain (host without subdomain) into koa ctx (used in navpartial template) TODO: check
app.use(async function ctxAddDomain(ctx, next) {
    ctx.state.domain = ctx.host.replace('report.', '');
    await next();
});


// ------------ routing


// force use of SSL (redirect http protocol to https)
app.use(ssl({ trustProxy: true }));


// compose appropriate sub-app for required database / project, in order to maximise modularity

// TODO: any way to invoke project routes directly, rather than composing app?

import ajaxRoutes from './ajax-routes.js';
app.use(ajaxRoutes);


// home page - list available reporting apps
router.get('/', async function indexPage(ctx) {
    const reportApps = {
        GB: [
            { name: 'survivor-centred response', url: 'report.thewhistle.org/test-cam/scr' },
            { name: 'what-where-when-who',       url: 'report.thewhistle.org/test-cam/wwww' },
        ],
        NG: [
            { name: 'GRN sexual assault',        url: 'report.thewhistle.org/test-grn/sexual-assault' },
        ],
    };
    ctx.app.proxy = true;
    const ip = ctx.request.ip.replace('::ffff:', '');
    const response = ip=='127.0.0.1' ? {} : await fetch(`https://ipinfo.io/${ip}/json`, { method: 'GET' });

    let country = '';
    let appsLocal = {};

    if (response.ok) {
        const ipinfo = await response.json();
        country = ipinfo.country;
        appsLocal = reportApps[country];
        delete reportApps[country];
    }

    const context = { country: country, appsLocal: appsLocal, appsOther: reportApps };
    await ctx.render('index', context);
});


// logout page - replicates admin logout, but simpler to have it here than to redirect to admin.
router.get('/logout', function logout(ctx) {
    const domain = ctx.request.hostname.replace('report.', '');

    // delete the cookie holding the JSON Web Token
    ctx.cookies.set('koa:jwt', null, { signed: true, domain: domain });
    ctx.redirect('/');
});


// TODO: why doesn't router.all('/:database/:project', '/:database/:project/:page', ...) work?
router.all('/:database/:project', async function composeDbProject(ctx) {
    try {
        const appReport = await import(`./${ctx.params.database}/${ctx.params.project}/app.js`);
        await compose(appReport.default.middleware)(ctx);
    } catch (e) {
        if (e.code == 'ERR_MISSING_MODULE') ctx.throw(404);
        throw e;
    }
});
router.all('/:database/:project/:page', async function composeDbProjectPage(ctx) {
    try {
        const appReport = await import(`./${ctx.params.database}/${ctx.params.project}/app.js`);
        await compose(appReport.default.middleware)(ctx);
    } catch (e) {
        if (e.code == 'ERR_MISSING_MODULE') ctx.throw(404);
        throw e;
    }
});

app.use(router.routes());

// end of the line: 404 status for any resource not found
app.use(function notFound(ctx) { // note no 'next'
    ctx.throw(404);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default app;
