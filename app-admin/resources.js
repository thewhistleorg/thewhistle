/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Resources handlers - manage adding, editing, deleting rape/crisis resources.                   */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Resource = require('../models/resource.js');

const validationErrors = require('../lib/validation-errors.js');


const validation = {
    name: 'required',
    lat:  'type=number required',
    lon:  'type=number required',
};

class ResourcesHandlers {

    /**
     * GET /resources/add - Render add resource page.
     */
    static async add(ctx) {
        const availableDatabases = Object.keys(global.db).filter(db => db!='resources');
        const context = Object.assign({ availableDatabases }, ctx.flash.formdata);
        await ctx.render('resources-add', context);
    }


    /**
     * GET /resources - Render list resources page.
     */
    static async list(ctx) {
        const db = ctx.state.user.db;

        const resources = await Resource.getAll(db);
        resources.forEach(c => {
            c.lat = c.location.coordinates[1].toFixed(4);
            c.lon = c.location.coordinates[0].toFixed(4);
        });
        resources.sort((a, b) => a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
        await ctx.render('resources-list', { resources });
    }


    /**
     * GET /resources/edit - Render edit resource page.
     */
    static async edit(ctx) {
        const db = ctx.state.user.db;
        const resource = await Resource.get(db, ctx.params.id);

        const context = Object.assign(resource, ctx.flash.formdata);
        await ctx.render('resources-edit', context);
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* POST processing                                                                            */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /resources/add - Process add resource.
     */
    static async processAdd(ctx) {
        const db = ctx.state.user.db;

        if (validationErrors(ctx.request.body, validation)) {
            ctx.flash = { validation: validationErrors(ctx.request.body, validation) };
            ctx.redirect(ctx.url); return;
        }

        try {

            const id = await Resource.insert(db, ctx.request.body);
            ctx.set('X-Insert-Id', id); // for integration tests

            // return to list of resources
            ctx.redirect('/resources');

        } catch (e) {
            // stay on same page to report error (with current filled fields)
            console.error(e);
            ctx.flash = { formdata: ctx.request.body, _error: e.message };
            ctx.redirect(ctx.url);
        }

    }


    /**
     * POST /resources/:resourcename/edit - Process edit resource.
     */
    static async processEdit(ctx) {
        const db = ctx.state.user.db;

        try {

            await Resource.update(db, ctx.params.id, ctx.request.body);

            // return to list of resources
            ctx.redirect('/resources');

        } catch (e) {
            // stay on current page to report error
            console.error(e);
            ctx.flash = { _error: e.message };
            ctx.redirect(ctx.url);
        }
    }


    /**
     * POST /resources/:id/delete - Process delete resource.
     */
    static async processDelete(ctx) {
        const db = ctx.state.user.db;

        try {

            await Resource.delete(db, ctx.params.id);

            // return to list of resources
            ctx.redirect('/resources');

        } catch (e) {
            // stay on current page to report error
            console.error(e);
            ctx.flash = { _error: e.message };
            ctx.redirect(ctx.url);
        }
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = ResourcesHandlers;
