/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handlers: wwww (what-where-when-who)                                                           */
/*                                                                                                */
/* All functions here either render or redirect, or throw.                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Report = require('../models/report.js');

class Wwww {

    /**
     * GET / - render index page, including README.md.
     */
    static async index(ctx) {
        await ctx.render('index');
    }

    // ---- warning

    static async getWarning(ctx) {
        await ctx.render('wwww/warning');
    }

    static postWarning(ctx) {
        ctx.session.warning = !!ctx.request.body.understood;
        ctx.session.report = {};
        ctx.redirect('/wwww/what');
    }

    // ---- what

    // TODO: set input type=file values
    static async getWhat(ctx) {
        if (!ctx.session.warning) { ctx.redirect('/wwww/warning'); return; }
        await ctx.render('wwww/what', ctx.session.report.what);
    }

    static postWhat(ctx) {
        if (!ctx.session.warning) { ctx.redirect('/wwww/warning'); return; }
        // note what form is multipart, so request.body holds .fields and .files objects
        ctx.session.report.what = ctx.request.body.fields;
        ctx.session.report.what.files = ctx.request.body.files['document[]']; // note cannot use field named 'files'!
        // TODO: delete any files with size=0 - note leaving no file chosen generates object;
        // TODO: selecting a file generates array which identifies as 'object' using typeof, with
        // TODO: 1st element size=0
        ctx.redirect('/wwww/where');
    }

    // ---- where

    static async getWhere(ctx) {
        if (!ctx.session.report || !ctx.session.report.what) { ctx.redirect('/wwww/what'); return; }
        await ctx.render('wwww/where', ctx.session.report.where);
    }

    static postWhere(ctx) {
        if (!ctx.session.warning) { ctx.redirect('/wwww/warning'); return; }
        const next = ctx.request.body['nav-when'] ? 'when' : 'what';
        delete ctx.request.body['nav-'+next];
        ctx.session.report.where = ctx.request.body;
        ctx.redirect('/wwww/'+next);
    }

    // ---- when

    static async getWhen(ctx) {
        if (!ctx.session.report || !ctx.session.report.where) { ctx.redirect('/wwww/where'); return; }
        await ctx.render('wwww/when', ctx.session.report.when);
    }

    static postWhen(ctx) {
        if (!ctx.session.warning) { ctx.redirect('/wwww/warning'); return; }
        const next = ctx.request.body['nav-where'] ? 'where' : 'who';
        delete ctx.request.body['nav-'+next];
        ctx.session.report.when = ctx.request.body;
        ctx.redirect('/wwww/'+next);
    }

    // ---- who

    static async getWho(ctx) {
        if (!ctx.session.report || !ctx.session.report.when) { ctx.redirect('/wwww/when'); return; }
        await ctx.render('wwww/who', ctx.session.report.who);
    }

    static postWho(ctx) {
        if (!ctx.session.warning) { ctx.redirect('/wwww/warning'); return; }
        const next = ctx.request.body['nav-when'] ? 'when' : 'submit';
        delete ctx.request.body['nav-'+next];
        ctx.session.report.who = ctx.request.body;
        ctx.redirect('/wwww/'+next);
    }

    // ---- submit

    static async getSubmit(ctx) {
        if (!ctx.session.report || !ctx.session.report.who) { ctx.redirect('/wwww/who'); return; }
        await ctx.render('wwww/submit', ctx.session.report.submit);
    }

    static async postSubmit(ctx) {
        if (!ctx.session.warning) { ctx.redirect('/wwww/warning'); return; }
        ctx.session.report.submit = ctx.request.body;
        if (ctx.request.body['nav-who']) {
            // back to 'who' page
            ctx.redirect('/wwww/who');
        } else {
            ctx.session.report.corroborate = ctx.request.body;

            // record this report (including uploaded docs)
            delete ctx.request.body['submit'];
            await Report.insert('test', ctx.session.report);
            ctx.session = null;
            ctx.redirect('/wwww/thank-you');
        }
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Wwww;
