/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Centres handlers - manage adding, editing, deleting rape/crisis centres.                       */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Centre = require('../models/centre.js');

const validationErrors = require('../lib/validation-errors.js');


const validation = {
    name: 'required',
    lat:  'type=number required',
    lon:  'type=number required',
};

class CentresHandlers {

    /**
     * GET /centres/add - Render add centre page.
     */
    static async add(ctx) {
        const availableDatabases = Object.keys(global.db).filter(db => db!='centres');
        const context = Object.assign({ availableDatabases }, ctx.flash.formdata);
        await ctx.render('centres-add', context);
    }


    /**
     * GET /centres - Render list centres page.
     */
    static async list(ctx) {
        const db = ctx.state.user.db;

        const centres = await Centre.getAll(db);
        centres.forEach(c => {
            c.lat = c.location.coordinates[1].toFixed(4);
            c.lon = c.location.coordinates[0].toFixed(4);
        });
        centres.sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
        await ctx.render('centres-list', { centres });
    }


    /**
     * GET /centres/edit - Render edit centre page.
     */
    static async edit(ctx) {
        const db = ctx.state.user.db;
        const centre = await Centre.get(db, ctx.params.id);

        const context = Object.assign(centre, ctx.flash.formdata);
        await ctx.render('centres-edit', context);
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* POST processing                                                                            */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /centres/add - Process add centre.
     */
    static async processAdd(ctx) {
        const db = ctx.state.user.db;

        if (validationErrors(ctx.request.body, validation)) {
            ctx.flash = { validation: validationErrors(ctx.request.body, validation) };
            ctx.redirect(ctx.url); return;
        }

        try {

            const id = await Centre.insert(db, ctx.request.body);
            ctx.set('X-Insert-Id', id); // for integration tests

            // return to list of centres
            ctx.redirect('/centres');

        } catch (e) {
            // stay on same page to report error (with current filled fields)
            console.error(e);
            ctx.flash = { formdata: ctx.request.body, _error: e.message };
            ctx.redirect(ctx.url);
        }

    }


    /**
     * POST /centres/:centrename/edit - Process edit centre.
     */
    static async processEdit(ctx) {
        const db = ctx.state.user.db;

        try {

            await Centre.update(db, ctx.params.id, ctx.request.body);

            // return to list of centres
            ctx.redirect('/centres');

        } catch (e) {
            // stay on current page to report error
            console.error(e);
            ctx.flash = { _error: e.message };
            ctx.redirect(ctx.url);
        }
    }


    /**
     * POST /centres/:id/delete - Process delete centre.
     */
    static async processDelete(ctx) {
        const db = ctx.state.user.db;

        try {

            await Centre.delete(db, ctx.params.id);

            // return to list of centres
            ctx.redirect('/centres');

        } catch (e) {
            // stay on current page to report error
            console.error(e);
            ctx.flash = { _error: e.message };
            ctx.redirect(ctx.url);
        }
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = CentresHandlers;
