/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Ajax handlers (invoked by router to return JSON data).                          C.Veness 2017  */
/*                                                                                                */
/* All functions here should set body, and status if not 200, and should not throw (as that would */
/* invoke the generic admin exception handler which would return an html page).                   */
/*                                                                                                */
/* Generic ajax functionality gets passed through to be handled by the API via the                */
/* ajaxApiPassthrough() function.                                                                 */
/*                                                                                                */
/* Being placed after auth test in the middleware stack, ajax calls are password-protected.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Report         from '../models/report.js';
import autoIdentifier from '../lib/auto-identifier.js';
import geocode        from '../lib/geocode.js';
import ip             from '../lib/ip.js';

const handler = {};


/**
 * Generate a random anonymous alias.
 *
 * For efficiency, this doesn't check if the alias is already in use (should be very small
 * probability), but such check should be done when submitting report.
 */
handler.getNewAlias = async function(ctx) {
    let alias = null;
    do {
        alias = await autoIdentifier(12);
    } while (alias.length > 12); // avoid excessively long aliases
    ctx.body = { alias: alias };
    ctx.body.root = 'generateAlias';
    ctx.status = 200; // Ok
    ctx.set('Cache-Control', 'no-cache'); // stop IE caching generated aliases.
};


/**
 * Get details of alias - currently just used to check if alias is available.
 */
handler.getAlias = async function(ctx) {
    const db = ctx.params.db;
    const id = ctx.params.alias.replace('+', ' ');
    const reports = await Report.getBy(db, 'alias', id);
    ctx.body = {};
    ctx.body.root = 'alias';
    ctx.status = reports.length==0 && ctx.params.id!='' ? 404 : 200; // Not Found / Ok
};


/**
 * Get geocode details for given address. Results are weighted to country of originating request,
 * determined from IP address.
 *
 * This only returns the formattedAddress field, as otherwise it could be used as a free
 * authenticated proxy for Google's geolocation service.
 */
handler.geocode = async function(ctx) {
    const region = ctx.query.region ? ctx.query.region : await ip.getCountry(ctx.ip);
    const geocoded = await geocode(ctx.query.address, region);

    if (geocoded) {
        ctx.body = { formattedAddress: geocoded.formattedAddress };
        ctx.body.root = 'geocode';
        // if region is specified, treat it as a requirement not just as bias as Google does (after CORS check!)
        if (ctx.query.region && ctx.query.region.toUpperCase()!=geocoded.countryCode) { ctx.status = 404; return; }
        ctx.status = 200; // Ok
    } else {
        ctx.status = 404; // Not Found
    }
};


/*
 * 404 Not Found.
 */
handler.ajax404 = function(ctx) {
    ctx.body = { message: 'Not Found' };
    ctx.body.root = 'error';
    ctx.status = 404; // Not Found
};


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default handler;
