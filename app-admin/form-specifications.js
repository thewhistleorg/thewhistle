/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Form specifications handlers.                                                                  */
/*                                                                                 C.Veness 2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import FormSpecification from '../models/form-specification.js';
import FormGenerator     from '../lib/form-generator.js';
import Log from '../lib/log';


class FormSpecificationsHandlers {

    /**
     * GET /form-specifications - Render list form-specifications page.
     */
    static async list(ctx) {
        const db = ctx.state.user.db;

        const formSpecs = await FormSpecification.getAll(db);

        formSpecs.sort((a, b) => { return a.page < b.page ? -1 : 1; });
        await ctx.render('form-specifications-list', { formSpecs });
    }


    /**
     * GET /form-specifications/add - Render add form-specification page.
     */
    static async add(ctx) {
        await ctx.render('form-specifications-add', ctx.flash.formdata);
    }


    /**
     * GET /form-specifications/:id/edit - Render edit form-specification page.
     */
    static async edit(ctx) {
        const db = ctx.state.user.db;

        const formSpec = await FormSpecification.get(db, ctx.params.id);

        if (!formSpec) ctx.throw(404, 'Form specification not found');

        await ctx.render('form-specifications-edit', Object.assign(formSpec, ctx.flash.formdata));
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* POST processing                                                                            */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /form-specifications/add - Process add form-specification.
     *
     * Note common code in password-reset.js.
     */
    static async processAdd(ctx) {
        const db = ctx.state.user.db;
        const body = ctx.request.body;

        body.page = body.page || ''; // don't store null!

        try {

            const id = await FormSpecification.insert(db, body);
            // TODO: validate & undo on fail!
            FormGenerator.build(db, body.project);

            ctx.response.set('X-Insert-Id', id); // for integration tests

            // return to list of form-specifications
            ctx.response.redirect('/form-specifications');

        } catch (e) {
            // stay on same page to report error (with current filled fields)
            ctx.flash = { formdata: body, _error: e.message };
            ctx.response.redirect(ctx.request.url);
        }

    }


    /**
     * POST /form-specifications/:id/edit - Process edit form-specification.
     */
    static async processEdit(ctx) {
        const db = ctx.state.user.db;
        const body = ctx.request.body;

        body.page = body.page || ''; // don't store null!

        try {

            await FormSpecification.update(db, ctx.params.id, body);

            // TODO: validate & undo on fail!
            FormGenerator.build(db, body.project);

            // return to list of form-specifications
            ctx.response.redirect('/form-specifications');

        } catch (e) {
            // stay on current page to report error
            ctx.flash = { formdata: body, _error: e.message };
            ctx.response.redirect(ctx.request.url);
        }
    }


    /**
     * POST /form-specifications/:id/delete - Process delete form-specification.
     */
    static async processDelete(ctx) {
        const db = ctx.state.user.db;

        try {

            await FormSpecification.delete(db, ctx.params.id);

            // return to list of form-specifications
            ctx.response.redirect('/form-specifications');

        } catch (e) {
            // stay on current page to report error
            ctx.flash = { _error: e.message };
            ctx.response.redirect(ctx.request.url);
        }
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * GET /ajax/form-specifications/:id - return form spec identified by id
     */
    static async ajaxFormSpec(ctx) {
        const db = ctx.state.user.db;

        try {
            const formSpec = await FormSpecification.get(db, ctx.params.id);
            ctx.response.status = 200; // Ok
            ctx.response.body = { spec: formSpec };
        } catch (e) {
            ctx.response.status = 500; // Internal Server Error
            ctx.response.body = e;
            await Log.error(ctx, e);
        }
    }
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default FormSpecificationsHandlers;
