/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Incident Reporting handlers - manage submission of incident reports by NGO staff / paralegals. */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Geocoder = require('node-geocoder'); // library for geocoding and reverse geocoding

const Centre = require('../models/centre.js');
const Report = require('../models/report.js');

const autoIdentifier   = require('../lib/auto-identifier.js');
const jsObjectToHtml   = require('../lib/js-object-to-html.js');
const validationErrors = require('../lib/validation-errors.js');
const useragent        = require('../lib/user-agent.js');


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
                throw new Error(`Project ‘${ctx.params.project}’ not found`); // TODO: report on home page when one available
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

        // list of files
        const files = ctx.session.files.map(f => f.name).join(', ');

        // make sure only one of generated-name and existing-name are recorded, and make it 1st property of report TODO: still needed?
        if (ctx.session.report['existing-name']) { delete ctx.session.report['generated-name']; ctx.session.report = Object.assign({ 'existing-name': null }, ctx.session.report); }
        if (ctx.session.report['generated-name']) { delete ctx.session.report['existing-name']; ctx.session.report = Object.assign({ 'generated-name': null }, ctx.session.report); }

        const context = {
            reporter:         ctx.state.user.name,
            reportHtml:       jsObjectToHtml(ctx.session.report),
            geocodeHtml:      jsObjectToHtml(ctx.session.geocode),
            formattedAddress: encodeURIComponent(ctx.session.geocode.formattedAddress),
            files:            files,
        };

        await ctx.render(ctx.state.user.db+'/'+ctx.params.project+'-submit', context);
    }

    /**
     * Render incident report confirm page.
     */
    static async getReportConfirm(ctx) {
        const project = ctx.params.project;
        const id = ctx.params.id;

        const report = await Report.get('test', id);

        report.lat = report.location.coordinates[1];
        report.lon = report.location.coordinates[0];

        const centres = await Centre.getNear('test', report.lat, report.lon, 10e3);
        centres.forEach(centre => {
            const lat1 = report.lat;
            const lon1 = report.lon;
            const lat2 = centre.location.coordinates[1];
            const lon2 = centre.location.coordinates[0];
            const φ1 = lat1*Math.PI/180, φ2 = lat2*Math.PI/180, Δλ = (lon2-lon1)*Math.PI/180, R = 6371e3;
            const d = Math.acos( Math.sin(φ1)*Math.sin(φ2) + Math.cos(φ1)*Math.cos(φ2) * Math.cos(Δλ) ) * R;
            centre.distance = (d/1000).toPrecision(2);
        })

        await ctx.render(ctx.state.user.db+'/'+ctx.params.project+'-confirm', { report, centres });
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
            if (!Array.isArray(body.files['documents'])) body.files['documents'] = [body.files['documents']];
            ctx.session.files = body.files['documents'].filter(f => f.size != 0);
            delete body.files;
        }

        if (body.fields) {
            // multipart/form-data: move body.fields.* to body.* to match

            // file input fields are named 'documents'; move File objects up to be immediately under 'files'
            // TODO: move out of 'report' sub-document to new 'files' sub-document?
            // TODO: implement persistent file storage eg AWS
            body.files = body.files['documents'];
            // normalise files to be array of File objects (koa-body does not provide array if just 1 file uploaded)
            if (!Array.isArray(body.files)) body.files = [body.files];
            // strip out any 0-size files
            for (let f=0; f<body.files.length; f++) if (body.files[f].size == 0) body.files.splice(f, 1);
        }

        if (body['existing-name'] != null) {
            // verify existing name does exist
            const reports = await Report.getBy('test', 'report.name', body['existing-name']);
            if (reports.length == 0) { ctx.flash = 'Name not found'; ctx.redirect(ctx.url); }
            delete body['generated-name'];
        } else {
            // verify generated name does not exist
            if (body['generated-name'] == null) { ctx.flash = 'Name not given'; ctx.redirect(ctx.url); }
            const reports = await Report.getBy('test', 'report.name', body['generated-name']);
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
        const geocoder = Geocoder();
        try {
            [ctx.session.geocode] = await geocoder.geocode(body['location-address']);
        } catch (e) {
            console.error('Geocoder error', e);
            ctx.session.geocode = null;
        }

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

        const id = await Report.insert('test', by, name, ctx.session.report, ctx.params.project, ctx.session.files, ctx.session.geocode);

        // record user-agent
        await useragent.log('test', ctx.ip, ctx.headers);

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
        const reports = await Report.getBy(ctx.state.user.db, 'name', ctx.params.name);

        ctx.body = reports.map(r => r._id.toString());
        ctx.body.root = 'name';
        ctx.status = reports.length==0 && ctx.params.id!='' ? 404 : 200; // Not Found / Ok
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = IncidentReport;
