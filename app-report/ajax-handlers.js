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
 * Generate a random anonymous name.
 *
 * For efficiency, this doesn't check if the name is already in use (should be very small
 * probability), but such check should be done when submitting report.
 */
handler.getGenerateNewName = async function(ctx) {
    let name = null;
    do {
        name = await autoIdentifier(12);
    } while (name.length > 12); // avoid excessively long names
    ctx.body = { name: name };
    ctx.body.root = 'generateName';
    ctx.status = 200; // Ok
    ctx.set('Cache-Control', 'no-cache'); // stop IE caching generated names.
};


/**
 * Get details of name - currently just used to check if name is available.
 */
handler.getName = async function(ctx) {
    const db = ctx.params.db;
    const id = ctx.params.id.replace('+', ' ');
    const reports = await Report.getBy(db, 'name', id);
    ctx.body = {};
    ctx.body.root = 'name';
    ctx.status = reports.length==0 && ctx.params.id!='' ? 404 : 200; // Not Found / Ok
};


/**
 * Get geocode details for given address.
 */
handler.geocode = async function(ctx) {
    const region = await ip.getCountry(ctx.ip);
    const geocoded = await geocode(ctx.query.address, region);

    if (geocoded) {
        ctx.body = geocoded;
        ctx.body.root = 'geocode';
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
