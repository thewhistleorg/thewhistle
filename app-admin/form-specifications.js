/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Form specifications handlers.                                                                  */
/*                                                                                 C.Veness 2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import FormSpecification from '../models/form-specification.js';


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

            // return to list of form-specifications
            ctx.response.redirect('/form-specifications');

        } catch (e) {
            // stay on current page to report error
            ctx.flash = { _error: e.message };
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
}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default FormSpecificationsHandlers;
