/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Ajax handlers (invoked by router to return JSON data).                     C.Veness 2017-2018  */
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
import Geocoder       from '../lib/geocode.js';
import Ip             from '../lib/ip.js';

class AjaxHandlers {

    /**
     * Generate a random anonymous alias.
     *
     * For efficiency, this doesn't check if the alias is already in use (should be very small
     * probability), but such check should be done when submitting report.
     */
    static async getNewAlias(ctx) {
        let alias = null;
        do {
            alias = await autoIdentifier(12);
        } while (alias.length > 12); // avoid excessively long aliases
        ctx.response.body = { alias: alias };
        ctx.response.body.root = 'generateAlias';
        ctx.response.status = 200; // Ok
        ctx.response.set('Cache-Control', 'no-cache'); // stop IE caching generated aliases.
    }


    /**
     * Get details of alias - currently just used to check if alias is available.
     */
    static async getAlias(ctx) {
        const db = ctx.params.db;
        const id = ctx.params.alias.replace('+', ' ');
        const reports = await Report.getBy(db, 'alias', id);
        ctx.response.body = {};
        ctx.response.body.root = 'alias';
        ctx.response.status = reports.length==0 && ctx.params.id!='' ? 404 : 200; // Not Found / Ok
    }


    /**
     * Get geocode details for given address. Results are weighted to country of originating request,
     * determined from IP address.
     *
     * This only returns the formattedAddress field, as otherwise it could be used as a free
     * authenticated proxy for Google's geolocation service.
     *
     * Mirrors similar function in admin app.
     */
    static async geocode(ctx) {
        const corsAllow = [ 'http://rapeisacrime.org', 'http://www.rapeisacrime.org', 'http://www.movable-type.co.uk', 'http://mtl.local' ];
        const region = ctx.request.query.region ? ctx.request.query.region : await Ip.getCountry(ctx.request.ip);
        const geocoded = await Geocoder.geocode(ctx.request.query.address, region);

        if (geocoded) {
            ctx.response.body = { formattedAddress: geocoded.formattedAddress };
            ctx.response.body.root = 'geocode';
            // if this is a CORS request, check it comes from acceptable source
            if (corsAllow.includes(ctx.request.get('Origin'))) {
                ctx.response.set('Vary', 'Origin');
                ctx.response.set('Access-Control-Allow-Origin', ctx.request.get('Origin'));
            }
            // if region is specified, treat it as a requirement not just as bias as Google does (after CORS check!)
            if (ctx.request.query.region && ctx.request.query.region.toUpperCase()!=geocoded.countryCode) { ctx.response.status = 404; return; }
            ctx.response.status = 200; // Ok
        } else {
            ctx.response.status = 404; // Not Found
        }
    }


    /*
     * 404 Not Found.
     */
    static ajax404(ctx) {
        ctx.response.body = { message: 'Not Found' };
        ctx.response.body.root = 'error';
        ctx.response.status = 404; // Not Found
    }

}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default AjaxHandlers;
