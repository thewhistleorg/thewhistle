/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handlers: test-cam/scr (survivor-centred response.                              C.Veness 2017  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/*                                       © 2017 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Report from '../../../models/report.js';

class Handlers {

    static async getPage(ctx) {
        const page = ctx.params.num;

        if (page==1 && !ctx.session.report) ctx.session.report = {};

        // const context = { ['xxx']: 'checked' }; // TODO: ???

        await ctx.render('page'+page, ctx.session.report);
    }

    static postPage(ctx) {
        if (!ctx.session.report) { ctx.response.redirect('/scr/1'); return; }
        const go = ctx.request.body['nav-next'] ? Number(ctx.params.num) + 1 : Number(ctx.params.num) - 1;

        delete ctx.request.body['nav-prev'];
        delete ctx.request.body['nav-next'];

        ctx.session.report = Object.assign(ctx.session.report, ctx.request.body);
        ctx.response.redirect('/test-cam/scr/'+(go<=7 ? go : 'submit'));
    }

    // ---- submit

    static async getSubmit(ctx) {
        await ctx.render('submit', ctx.session.report.submit);
    }

    static async postSubmit(ctx) {
        // record this report
        delete ctx.request.body['submit'];
        const files = ctx.session.files;
        delete ctx.session.files;
        await Report.insert(ctx.params.database, undefined, '—', ctx.session.report, 'scr', files, ctx.request.headers['user-agent']);
        ctx.session = null;
        ctx.response.redirect('/test-cam/scr');
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Handlers;
