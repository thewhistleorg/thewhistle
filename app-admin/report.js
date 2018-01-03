/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Incident Reporting handlers - manage submission of incident reports by NGO staff / paralegals. */
/*                                                                                 C.Veness 2017  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Report   from '../models/report.js';

import autoIdentifier   from '../lib/auto-identifier.js';
import jsObjectToHtml   from '../lib/js-object-to-html.js';
import validationErrors from '../lib/validation-errors.js';
import useragent        from '../lib/user-agent.js';


const validation = {
    date:                'type=date required',
    time:                'type=time required',
    'brief-description': 'required',
    'location-address':  'required',
};


class IncidentReport {

    /**
     * GET /report/:project - Render incident report entry page.
     */
    static async getReportEntry(ctx) {
        try {
            await ctx.render(ctx.state.user.db+'/'+ctx.params.project+'-entry', ctx.session.report);
        } catch (e) {
            if (e.message.slice(0, 21) == 'unable to render view') {
                ctx.throw(404, `Project ‘${ctx.params.project}’ not found`); // TODO: report on home page when one available
            } else {
                throw e;
            }
        }
    }


    /**
     * GET /report/:project/submit - Render incident report review+submit page.
     */
    static async getReportSubmit(ctx) {
        if (!ctx.session.report) { ctx.flash = { expire: 'Your session has expired' }; ctx.redirect(`/report/${ctx.params.project}`); return; }

        const prettyReport = prettifyReport(ctx.session.report);

        const context = {
            reporter:   ctx.state.user.name,
            reportHtml: jsObjectToHtml.usingTable(prettyReport),
            files:      ctx.session.files.map(f => f.name).join(', '),
        };

        await ctx.render(ctx.state.user.db+'/'+ctx.params.project+'-submit', context);
    }


    /**
     * Render incident report confirm page.
     */
    static async getReportConfirm(ctx) {
        await ctx.render(ctx.state.user.db+'/'+ctx.params.project+'-confirm');
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* POST processing                                                                            */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /report/:project - process 'Next' link to review & submit).
     */
    static async processReportEntry(ctx) {
        const body = ctx.request.body;

        if (typeof body.fields=='object' && typeof body.files=='object') { // enctype = multipart/form-data
            // move body.fields.* to body.* to match x-www-form-urlencoded forms (note cannot use field named 'files'!)
            for (const field in body.fields) body[field] = body.fields[field];
            delete body.fields;

            // file input fields are named 'documents'; move File objects from body up to session
            if (!Array.isArray(body.files['documents'])) body.files['documents'] = [ body.files['documents'] ];
            ctx.session.files = body.files['documents'].filter(f => f.size != 0);
            delete body.files;
        }

        if (body['existing-alias'] != null) {
            // verify existing alias does exist
            const reports = await Report.getBy(ctx.state.user.db, 'report.alias', body['existing-alias']);
            if (reports.length == 0) { ctx.flash = 'Alias not found'; ctx.redirect(ctx.url); }
            delete body['generated-alias'];
        } else {
            // verify generated alias does not exist
            if (body['generated-alias'] == null) { ctx.flash = 'Alias not given'; ctx.redirect(ctx.url); }
            const reports = await Report.getBy(ctx.state.user.db, 'report.alias', body['generated-alias']);
            if (reports.length > 0) { ctx.flash = 'Generated alias not available'; ctx.redirect(ctx.url); }
            delete body['existing-alias'];
        }

        body['perpetrator-gender'] = body['perpetrator-gender'] || null;

        if (validationErrors(body, validation)) {
            ctx.flash = { validation: validationErrors(body, validation) };
            ctx.redirect(ctx.url); return;
        }
        delete body['nav-next'];

        ctx.session.report = body;

        ctx.redirect(`/report/${ctx.params.project}/submit`);
    }


    /**
     * POST /report/:project/submit - process 'review & submit' submission.
     */
    static async processReportSubmit(ctx) {
        if (!ctx.session.report) { ctx.flash = { expire: 'Your session has expired' }; ctx.redirect(`/report/${ctx.params.project}`); return; }
        if (ctx.request.body['nav-prev']) { ctx.redirect(`/report/${ctx.params.project}`); return; }

        // record this report

        const by = ctx.state.user.id;
        const alias = ctx.session.report['existing-alias'] || ctx.session.report['generated-alias'];
        const prettyReport = prettifyReport(ctx.session.report);

        const id = await Report.insert(ctx.state.user.db, by, alias, prettyReport, ctx.params.project, ctx.session.files, ctx.headers['user-agent']);

        // record user-agent
        await useragent.log(ctx.state.user.db, ctx.ip, ctx.headers);

        ctx.set('X-Insert-Id', id); // for integration tests

        ctx.session = null;
        ctx.redirect(`/report/${ctx.params.project}/${id}/confirm`);
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * GET /ajax/report/:db/aliases/new - Generate a random adjective-noun alias.
     *
     * For efficiency, this doesn't check if the alias is already in use (should be very small
     * probability), but such check should be done when submitting report.
     */
    static async getNewAlias(ctx) {
        const alias = await autoIdentifier(12);

        ctx.body = { alias: alias };
        ctx.body.root = 'generateName';
        ctx.status = 200; // Ok
    }


    /**
     * GET /ajax/report/aliases/:alias - Get list of reports reported by alias; return 404 if alias
     * not used.
     */
    static async getAlias(ctx) {
        const reports = await Report.getBy(ctx.state.user.db, 'alias', ctx.params.alias.replace('+', ' '));

        ctx.body = reports.map(r => r._id.toString());
        ctx.body.root = 'alias';
        ctx.status = reports.length==0 && ctx.params.id!='' ? 404 : 200; // Not Found / Ok
    }

}


/**
 * Convert fields as defined in form input fields to presentation-friendly fields.
 *
 * This includes
 *  - renaming fields for attractive presentation
 *  - converting dd-mmm-yyyy hh:mm fields to date value
 *
 * @param   {Object} report - Report as submitted
 * @returns {Object} Transformed report
 */
function prettifyReport(report) {

    const rpt = {
        Name:                            report.name,
        Gender:                          report.gender=='m' ? 'Male' : 'Female',
        Age:                             report.age,
        Employment:                      report.employment,
        Contact:                         report['client-contact'],
        'Assistance sought':             report['assistance-sought-elsewhere'],
        'Summary of problem':            report['problem-summary'],
        'Desired outcome':               report['desired-outcome'],
        'Nature of assault':             report['nature-of-assault'],
        'Date':                          new Date(report.date+' '+report.time),
        Description:                     report['brief-description'],
        Address:                         report['location-address'],
        Location:                        report['location-description'],
        'Perpetrator identity':          report['perpetrator-identity'],
        'Relationship with perpetrator': report['perpetrator-relationship'],
        'Age of perpetrator':            report['perpetrator-age'],
        'Gender of perpetrator':         report['perpetrator-gender']=='m' ? 'Male' : 'Female',
        'Action taken':                  report['action-taken'],
        'Assistance requested':          report['assistance-requested'],
    };

    if (report['existing-alias']) {
        rpt['Existing alias'] = report['existing-alias'];
    } else {
        rpt['Generated alias'] = report['generated-alias'];
    }

    return rpt;
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default IncidentReport;
