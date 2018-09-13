/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Twilio app - RESTful API for handling Twilio SMS messages.                 C.Veness 2017-2018  */
/*                                                                                                */
/* The API provides GET / POST / PATCH / DELETE methods on a variety of resources.                */
/*                                                                                                */
/* 2xx responses honour the request Accept type (json/xml/yaml/text) for the response body;       */
/* 4xx/5xx responses provide a simple text message in the body.                                   */
/*                                                                                                */
/* A GET on a collection which returns no results returns a 204 / No Content response.            */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Koa       from 'koa';          // Koa framework
import xmlify    from 'xmlify';       // JS object to XML
import yaml      from 'js-yaml';      // JS object to YAML

import Log from '../lib/log.js';
import Db from  '../lib/db.js';


const app = new Koa(); // twilio app


// log requests (excluding static files, into capped collection)
app.use(async function logAccess(ctx, next) {
    const t1 = Date.now();
    await next();
    const t2 = Date.now();

    await Log.access(ctx, t2 - t1);
});


// content negotiation: api will respond with json, xml, or yaml
app.use(async function contentNegotiation(ctx, next) {
    await next();

    if (!ctx.body) return; // no content to return

    // check Accept header for preferred response type
    const type = ctx.accepts('xml', 'json', 'yaml', 'text');

    switch (type) {
        case 'json':
        default:
            delete ctx.body.root; // xml root element
            break; // ... koa takes care of type
        case 'xml':
            ctx.type = type;
            const root = ctx.body.root; // xml root element
            delete ctx.body.root;
            ctx.body = xmlify(ctx.body, root);
            break;
        case 'yaml':
        case 'text':
            delete ctx.body.root; // xml root element
            ctx.type = 'yaml';
            ctx.body = yaml.dump(ctx.body);
            break;
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
        ctx.status = err.status || 500;
        switch (ctx.status) {
            case 204: // No Content
                break;
            case 401: // Unauthorized
                ctx.set('WWW-Authenticate', 'Basic');
                break;
            case 403: // Forbidden
            case 404: // Not Found
            case 406: // Not Acceptable
            case 409: // Conflict
                ctx.body = { message: err.message, root: 'error' };
                break;
            default:
            case 500: // Internal Server Error (for uncaught or programming errors)
                console.error(ctx.status, err.message);
                ctx.body = { message: err.message, root: 'error' };
                if (app.env != 'production') ctx.body.stack = err.stack;
                // ctx.app.emit('error', err, ctx); // github.com/koajs/koa/wiki/Error-Handling
                break;
        }
        await Log.error(ctx, err);
    }
});


// set up database connection: relationship between Twilio and organisation/project would have to be
// considered if we were to use this app; perhaps it will be consumed into the textit app or
// something... for now we'll just hardwire the grn-test db
app.use(async function(ctx, next) {
    if (!Db.databases['grn-test']) {
        try {
            await Db.connect('grn-test', { useNewUrlParser: true });
        } catch (e) {
            console.error(e.message);
            process.exit(1);
        }
    }
    await next();
});


// ------------ routing

// public (unsecured) modules first

import routesRoot from './routes-root.js';
app.use(routesRoot);

// should remaining routes require authentication?

import routesPostEventWebhooks from './routes-post-event-webhooks.js';
app.use(routesPostEventWebhooks);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default app;
