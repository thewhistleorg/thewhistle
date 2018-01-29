/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handlers: test-grn/sexual-assault/internal (single-page logged-in reporting).   C.Veness 2017  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()

class Handlers {

    /**
     * Render report page.
     */
    static async getPage(ctx) {
        // default the incident report date to today: this is a natural default, is quite easy to
        // change to yesterday, or to any other day; it also maximises the chances of getting an
        // actual date, rather than leaving the option blank or selecting a 'within' option
        const today = { day: dateFormat('d'), month: dateFormat('mmm'), year: dateFormat('yyyy') };
        ctx.session.report = { when: 'date', date: today };

        ctx.session.completed = 'internal'; // kludgy way to get back to report page from review/submit page

        const validYears = { thisyear: dateFormat('yyyy'), lastyear: dateFormat('yyyy')-1 }; // limit report to current or last year
        const context = Object.assign({}, ctx.session.report, validYears);

        await ctx.render('-internal', context);
    }


    /**
     * Process 'next' / 'previous' page submissions.
     */
    static postPage(ctx) {
        // getIndex initialises ctx.session.report with date, so for this project ctx.session.report is never empty
        if (!ctx.session.report) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/internal`); return; }

        const body = ctx.request.body; // shorthand

        if (body.fields) {
            // multipart/form-data: move body.fields.* to body.* to match
            // x-www-form-urlencoded forms (note cannot use field named 'files'!)
            for (const field in body.fields) body[field] = body.fields[field];
            delete body.fields;

            // file input fields are named 'documents'; move File objects up to be immediately under 'files'
            body.files = body.files['documents'];
            // normalise files to be array of File objects (koa-body does not provide array if just 1 file uploaded)
            if (!Array.isArray(body.files)) body.files = [ body.files ];
            // strip out any 0-size files
            for (let f=0; f<body.files.length; f++) if (body.files[f].size == 0) body.files.splice(f, 1);
        }

        // record current body in session before validation
        ctx.session.report = Object.assign(ctx.session.report, body);

        // if date specified, verify it is valid (to back up client-side validation)
        if (body.when == 'date') {
            // (for some reason, test suite leaves date as a string)
            const d = typeof body.date=='object' ? body.date : JSON.parse(body.date);

            const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec' ];
            const time = d.time ? d.time.split(':') : [ '00', '00', '00' ];
            const date = new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, time[0], time[1]);
            if (isNaN(date.getTime())) {
                ctx.flash = { validation: [ 'Invalid date' ] };
                ctx.redirect(ctx.url); return;
            }
            if (date.getTime() > Date.now()) {
                ctx.flash = { validation: [ 'Date is in the future' ] };
                ctx.redirect(ctx.url); return;
            }
        }

        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/submit`);
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Handlers;
