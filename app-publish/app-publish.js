/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'Publish' app - an interface for making data public, particularly for WikiRate. C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Koa        from 'koa';            // koa framework
import Debug      from 'debug';          // small debugging utility
import handlebars from 'koa-handlebars'; // handlebars templating
import serve      from 'koa-static';     // static file serving middleware

const debug = Debug('app:req:p'); // debug each request

import Log        from '../lib/log.js';
import Middleware from '../lib/middleware';

const app = new Koa(); // publish app


// serve static files (html, css, js); allow browser to cache for 1 day
const maxage = app.env=='production' ? 1000*60*60*24 : 1000;
app.use(serve('public', { maxage: maxage }));


// handlebars templating
app.use(handlebars({
    extension: [ 'html' ],
    viewsDir:  'app-publish/templates',
}));


// log requests (into mongodb capped collection)
app.use(async function logAccess(ctx, next) {
    debug(ctx.request.method.padEnd(4) + ' ' + ctx.request.url);
    const t1 = Date.now();
    await next();
    const t2 = Date.now();

    await Log.access(ctx, t2 - t1);
});


// content negotiation: api will respond with html, csv, or json TODO
app.use(async function contentNegotiation(ctx, next) {
    await next();

    if (!ctx.body) return; // no content to return

    // check Accept header or extension for preferred response type
    const type = ctx.accepts('html', 'csv', 'json');

    switch (type) {
        case 'csv':
        default:
            break; // ... koa takes care of type
        case false:
            ctx.throw(406); // "Not acceptable" - can't furnish whatever was requested
            break;
    }
});


// handle thrown or uncaught exceptions anywhere down the line
app.use(async function handleErrors(ctx, next) {
    try {

        await next();

    } catch (err) {
        ctx.response.status = err.status || 500;
        await Log.error(ctx, err);
        if (app.env == 'production') delete err.stack; // don't leak sensitive info!
        switch (ctx.response.status) {
            case 404: // Not Found
                if (err.NotFoundError) err.message = err.NotFoundError;
                if (err.message == 'Not Found') err.message = null; // personalised 404
                await ctx.render('404-not-found',  { err });
                break;
            default:
            case 500: // Internal Server Error (for uncaught or programming errors)
                await ctx.render('500-internal-server-error',  { err });
                // ctx.app.emit('error', err, ctx); // github.com/koajs/koa/wiki/Error-Handling
                break;
        }
    }
});


// ------------ routing


// force use of SSL (redirect http protocol to https)
app.use(Middleware.ssl({ trustProxy: true }));

import routes from './routes.js';
app.use(routes);


// end of the line: 404 status for any resource not found
app.use(function notFound(ctx) { // note no 'next'
    ctx.throw(404);
});

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default app;
