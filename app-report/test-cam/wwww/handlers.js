/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handlers: test-cam/wwww (what-where-when-who).                                  C.Veness 2017  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Report = require('../../../models/report.js');

class Handlers {

    /**
     * GET / - render index page, including README.md.
     */
    static async getIndex(ctx) {
        await ctx.render('index');
    }

    // ---- warning

    static async getWarning(ctx) {
        await ctx.render('warning');
    }

    static postWarning(ctx) {
        ctx.session.warning = !!ctx.request.body.understood;
        ctx.session.report = {};
        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/what`);
    }

    // ---- what

    // TODO: set input type=file values
    static async getWhat(ctx) {
        if (!ctx.session.warning) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/warning`); return; }
        await ctx.render('what', ctx.session.report.what);
    }

    static postWhat(ctx) {
        if (!ctx.session.warning) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/warning`); return; }
        // note what form is multipart, so request.body holds .fields and .files objects
        ctx.session.report.what = ctx.request.body.fields;
        ctx.session.report.what.files = ctx.request.body.files['document[]']; // note cannot use field named 'files'!
        // TODO: delete any files with size=0 - note leaving no file chosen generates object;
        // TODO: selecting a file generates array which identifies as 'object' using typeof, with
        // TODO: 1st element size=0
        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/where`);
    }

    // ---- where

    static async getWhere(ctx) {
        if (!ctx.session.report || !ctx.session.report.what) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/what`); return; }
        await ctx.render('where', ctx.session.report.where);
    }

    static postWhere(ctx) {
        if (!ctx.session.warning) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/warning`); return; }
        const next = ctx.request.body['nav-when'] ? 'when' : 'what';
        delete ctx.request.body['nav-'+next];
        ctx.session.report.where = ctx.request.body;
        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/`+next);
    }

    // ---- when

    static async getWhen(ctx) {
        if (!ctx.session.report || !ctx.session.report.where) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/where`); return; }
        await ctx.render('when', ctx.session.report.when);
    }

    static postWhen(ctx) {
        if (!ctx.session.warning) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/warning`); return; }
        const next = ctx.request.body['nav-where'] ? 'where' : 'who';
        delete ctx.request.body['nav-'+next];
        ctx.session.report.when = ctx.request.body;
        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/`+next);
    }

    // ---- who

    static async getWho(ctx) {
        if (!ctx.session.report || !ctx.session.report.when) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/when`); return; }
        await ctx.render('who', ctx.session.report.who);
    }

    static postWho(ctx) {
        if (!ctx.session.warning) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/warning`); return; }
        const next = ctx.request.body['nav-when'] ? 'when' : 'submit';
        delete ctx.request.body['nav-'+next];
        ctx.session.report.who = ctx.request.body;
        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/`+next);
    }

    // ---- submit

    static async getSubmit(ctx) {
        if (!ctx.session.report || !ctx.session.report.who) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/who`); return; }
        await ctx.render('submit', ctx.session.report.submit);
    }

    static async postSubmit(ctx) {
        if (!ctx.session.warning) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/warning`); return; }
        ctx.session.report.submit = ctx.request.body;
        if (ctx.request.body['nav-who']) {
            // back to 'who' page
            ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/who`);
        } else {
            ctx.session.report.corroborate = ctx.request.body;

            // record this report (including uploaded docs)
            delete ctx.request.body['submit'];
            await Report.insert(ctx.params.database, undefined, '—', ctx.session.report, 'wwww', ctx.session.files);
            ctx.session = null;
            ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/thank-you`);
        }
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Handlers;
