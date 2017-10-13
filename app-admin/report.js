/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Incident Reporting handlers - manage submission of incident reports by NGO staff / paralegals. */
/*                                                                                 C.Veness 2017  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Report   = require('../models/report.js');
const Resource = require('../models/resource.js');

const autoIdentifier   = require('../lib/auto-identifier.js');
const jsObjectToHtml   = require('../lib/js-object-to-html.js');
const validationErrors = require('../lib/validation-errors.js');
const useragent        = require('../lib/user-agent.js');
const geocode          = require('../lib/geocode.js');


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
            reporter:            ctx.state.user.name,
            reportHtml:          jsObjectToHtml.usingTable(prettyReport),
            formattedAddress:    ctx.session.geocode ? ctx.session.geocode.formattedAddress : '[unrecognised address]',
            formattedAddressUrl: encodeURIComponent(ctx.session.geocode ? ctx.session.geocode.formattedAddress : ''),
            files:               ctx.session.files.map(f => f.name).join(', '),
        };

        await ctx.render(ctx.state.user.db+'/'+ctx.params.project+'-submit', context);
    }

    /**
     * Render incident report confirm page.
     */
    static async getReportConfirm(ctx) {
        const report = await Report.get(ctx.state.user.db, ctx.params.id);

        report.lat = report.location.coordinates[1];
        report.lon = report.location.coordinates[0];

        const resources = await Resource.getNear(ctx.state.user.db, report.lat, report.lon, 10e3);
        resources.forEach(resource => {
            const lat1 = report.lat;
            const lon1 = report.lon;
            const lat2 = resource.location.coordinates[1];
            const lon2 = resource.location.coordinates[0];
            const φ1 = lat1*Math.PI/180, φ2 = lat2*Math.PI/180, Δλ = (lon2-lon1)*Math.PI/180, R = 6371e3;
            const d = Math.acos( Math.sin(φ1)*Math.sin(φ2) + Math.cos(φ1)*Math.cos(φ2) * Math.cos(Δλ) ) * R;
            resource.distance = (d/1000).toPrecision(2);
        });

        await ctx.render(ctx.state.user.db+'/'+ctx.params.project+'-confirm', { report, resources });
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

        if (body['existing-name'] != null) {
            // verify existing name does exist
            const reports = await Report.getBy(ctx.state.user.db, 'report.name', body['existing-name']);
            if (reports.length == 0) { ctx.flash = 'Name not found'; ctx.redirect(ctx.url); }
            delete body['generated-name'];
        } else {
            // verify generated name does not exist
            if (body['generated-name'] == null) { ctx.flash = 'Name not given'; ctx.redirect(ctx.url); }
            const reports = await Report.getBy(ctx.state.user.db, 'report.name', body['generated-name']);
            if (reports.length > 0) { ctx.flash = 'Generated name not available'; ctx.redirect(ctx.url); }
            delete body['existing-name'];
        }

        body['perpetrator-gender'] = body['perpetrator-gender'] || null;

        if (validationErrors(body, validation)) {
            ctx.flash = { validation: validationErrors(body, validation) };
            ctx.redirect(ctx.url); return;
        }
        delete body['nav-next'];

        ctx.session.report = body;

        // geocode location
        ctx.session.geocode = body['location-address']
            ? await geocode(body['location-address'])
            : null;

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
        const name = ctx.session.report['existing-name'] || ctx.session.report['generated-name'];
        const prettyReport = prettifyReport(ctx.session.report);

        const id = await Report.insert(ctx.state.user.db, by, name, prettyReport, ctx.params.project, ctx.session.files, ctx.session.geocode);

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
     * GET /ajax/report/names/new - Generate a random adjective-noun name..
     */
    static async getGenerateNewName(ctx) {
        const name = await autoIdentifier(12);
        // TODO: verify not already used

        ctx.body = { name: name };
        ctx.body.root = 'generateName';
        ctx.status = 200; // Ok
    }


    /**
     * GET /ajax/report/names/:name - Get list of reports reported by name; return 404 if name
     * not used.
     */
    static async getName(ctx) {
        const reports = await Report.getBy(ctx.state.user.db, 'name', ctx.params.name.replace('+', ' '));

        ctx.body = reports.map(r => r._id.toString());
        ctx.body.root = 'name';
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

    if (report['existing-name']) {
        rpt['Existing name'] = report['existing-name'];
    } else {
        rpt['Generated name'] = report['generated-name'];
    }

    return rpt;
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = IncidentReport;
