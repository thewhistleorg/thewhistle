/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* WWW handlers (invoked by router to render templates)                                           */
/*                                                                                                */
/* All functions here either render or redirect, or throw.                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Report = require('../models/report.js');

class Scr {

    static async getPage(ctx) {
        const page = ctx.params.num;

        if (page==1 && !ctx.session.report) ctx.session.report = {};

        const context = { ['xxx']: 'checked' }; // TODO: ???

        await ctx.render('scr/'+page, ctx.session.report);
    }

    static postPage(ctx) {
        if (!ctx.session.report) { ctx.redirect('/scr/1'); return; }
        const go = ctx.request.body['nav-next'] ? Number(ctx.params.num) + 1 : Number(ctx.params.num) - 1;

        delete ctx.request.body['nav-prev'];
        delete ctx.request.body['nav-next'];

        ctx.session.report = Object.assign(ctx.session.report, ctx.request.body);
        ctx.redirect('/scr/'+(go<=7 ? go : 'submit'));
    }

    // ---- submit

    static async getSubmit(ctx) {
        await ctx.render('scr/submit', ctx.session.report.submit);
    }

    static async postSubmit(ctx) {
        // record this report
        delete ctx.request.body['submit'];
        await Report.insert('test', ctx.session.report);
        ctx.session = null;
        ctx.redirect('/scr/');
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Scr;
