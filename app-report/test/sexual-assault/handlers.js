/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handlers: test/sexual-assault                                                                  */
/*                                                                                                */
/* All functions here either render or redirect, or throw.                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Geocoder   = require('node-geocoder'); // library for geocoding and reverse geocoding
const dateFormat = require('dateformat');    // Steven Levithan's dateFormat()
const LatLon     = require('geodesy').LatLonSpherical; // spherical earth geodesy functions

const Report   = require('../../../models/report.js');
const Resource = require('../../../models/resource.js');

const jsObjectToHtml   = require('../../../lib/js-object-to-html.js');
const useragent        = require('../../../lib/user-agent.js');

const nPages = 7;

class Handlers {

    /**
     * Render incident report index page.
     */
    static async getIndex(ctx) {
        // default the incident report date to today: this is a natural default, is quite easy to
        // change to yesterday, or to any other day; it also maximises the chances of getting an
        // actual date, rather than leaving the option blank or selecting a 'within' option
        const today = { day: dateFormat('d'), month: dateFormat('mmm'), year: dateFormat('yyyy') };
        ctx.session.report = { when: 'date', date: today };

        ctx.session.completed = 0; // number of pages completed; used to prevent users jumping ahead

        await ctx.render('index');
    }


    /**
     * Render report page.
     */
    static async getPage(ctx) {
        if (!ctx.session.report) { ctx.flash = { expire: 'Your session has expired' }; ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return; }

        const page = ctx.params.num=='*' ? '+' : Number(ctx.params.num); // note '+' is allowed on windows, '*' is not
        if (page > ctx.session.completed+1) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/${ctx.session.completed+1}`); return; }

        const validYears = { thisyear: dateFormat('yyyy'), lastyear: dateFormat('yyyy')-1 }; // limit report to current or last year
        const context = Object.assign({ p: page, n: nPages }, ctx.session.report, validYears);

        await ctx.render('page'+page, context);
    }


    /**
     * Process 'next' / 'previous' page submissions.
     */
    static postPage(ctx) {
        if (!ctx.session.report) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return; }
        const page = ctx.params.num==undefined ? 0 : Number(ctx.params.num);
        ctx.session.completed = Number(page);

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

        // remember if we're going forward or back, then delete nav from body
        const go = body['nav-next'] ? page + 1 : page - 1;
        delete body['nav-prev'];
        delete body['nav-next'];

        // record current body in session before validation
        ctx.session.report = Object.assign(ctx.session.report, body);

        // if date specified, verify it is valid (to back up client-side validation)
        if (body.when == 'date') {
            const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec' ];
            const date = new Date(body.date.year, months.indexOf(body.date.month.toLowerCase()), body.date.day, body.date.hour, body.date.minute);
            if (isNaN(date.getTime())) {
                ctx.flash = { validation: [ 'Invalid date' ] };
                ctx.redirect(ctx.url); return;
            }
            if (date.getTime() > Date.now()) {
                ctx.flash = { validation: [ 'Date is in the future' ] };
                ctx.redirect(ctx.url); return;
            }
        }

        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/`+(go<=nPages ? go : 'submit'));
    }


    /* submit  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * Render 'review & submit' page.
     */
    static async getSubmit(ctx) {
        if (!ctx.session.report) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return; }

        // geocode location
        const geocoder = Geocoder();
        ctx.session.geocode = null;
        try {
            if (ctx.session.report['at-address']) {
                [ ctx.session.geocode ] = await geocoder.geocode(ctx.session.report['at-address']);
            }
        } catch (e) {
            console.error('Handlers.getSubmit: Geocoder error', e.message);
        }
        // make sure only one of generated-name and existing-name are recorded, and make it 1st property of report
        if (ctx.session.report['existing-name']) { delete ctx.session.report['generated-name']; ctx.session.report = Object.assign({ 'existing-name': null }, ctx.session.report); }
        if (ctx.session.report['generated-name']) { delete ctx.session.report['existing-name']; ctx.session.report = Object.assign({ 'generated-name': null }, ctx.session.report); }

        const prettyReport = prettifyReport(ctx.session.report);
        const formattedAddress = ctx.session.geocode ? ctx.session.geocode.formattedAddress : '[unrecognised address]';
        const files = ctx.session.report.files.map(f => f.name).join(', ');
        const context = { reportHtml: jsObjectToHtml(prettyReport), formattedAddress, files };

        await ctx.render('submit', context);
    }


    /**
     * Process 'review & submit' submission.
     */
    static async postSubmit(ctx) {
        if (!ctx.session.report) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return; }
        if (ctx.request.body['nav-prev'] == 'prev') { ctx.redirect(nPages); return; }

        // record this report
        delete ctx.request.body['submit'];

        // check generated name not already used, or existing name does exist
        switch (ctx.session.report['used-before']) {
            case 'y':
                // verify existing name does exist
                const reportsY = await Report.getBy('test', 'name', ctx.session.report['existing-name']);
                if (reportsY.length == 0) { ctx.flash = { name: 'Anonymous name not found' }; ctx.redirect(ctx.url); return; }
                break;
            case 'n':
                // verify generated name does not exist
                if (ctx.session.report['generated-name'] == null) { ctx.flash = 'Name not given'; ctx.redirect(ctx.url); }
                const reportsN = await Report.getBy('test', 'name', ctx.session.report['generated-name']);
                if (reportsN.length > 0) { ctx.flash = { name: 'Generated name not available: please select another' }; ctx.redirect(ctx.url); return; }
                break;
        }

        const name = ctx.session.report['existing-name'] || ctx.session.report['generated-name'];

        const prettyReport = prettifyReport(ctx.session.report);

        const id = await Report.insert('test', undefined, name, prettyReport, 'sexual-assault', ctx.session.report.files, ctx.session.geocode);
        ctx.set('X-Insert-Id', id); // for integration tests

        // record user-agent
        await useragent.log('test', ctx.ip, ctx.headers);

        // remove all session data (to prevent duplicate submission)
        // except geocoding result (to present local resources)
        ctx.session = { geocode: ctx.session.geocode };

        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/whatnext`);
    }


    /* what's next - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * Render 'what's next' page.
     *
     * Shows local resources grouped by services they offer.
     */
    static async getWhatnext(ctx) {
        const context = {};

        // if we have a geocode result on the incident location, list local resources
        if (ctx.session.geocode) {
            const geocode = ctx.session.geocode;

            // get all resources within 20km of geocoded location
            const resources = await Resource.getNear('test', geocode.latitude, geocode.longitude, 20e3);

            // add distance from geocoded location to each resource, & convert phone/email arrays to lists
            const locn = new LatLon(geocode.latitude, geocode.longitude);
            for (const resource of resources) {
                const lat = resource.location.coordinates[1];
                const lon = resource.location.coordinates[0];
                resource.dist = locn.distanceTo(new LatLon(lat, lon)); // used for sorting
                resource.distKm = (resource.dist/1000).toPrecision(2); // used for display
                resource.phone = resource.phone.map(p => `<span class="nowrap">${p}</span>`).join(', ');
                resource.email = resource.email.join(' ');
                resource.services = resource.services.join('; ');
            }

            // extract list of distinct services from local resources - not currently used
            //const servicesDups = resources.map(r => r.services).reduce((a, b) => a.concat(b), []);
            //const servicesDedup = [ ...new Set(servicesDups) ];
            //const services = servicesDedup.sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);

            // make a list of resources grouped by services they offer - not currently used
            //const resourcesGrouped = {};
            //for (const service of services) {
            //    resourcesGrouped[service] = resources.filter(r => r.services.includes(service));
            //    resourcesGrouped[service].sort((a, b) => a.dist < b.dist ? -1 : 1);
            //    resourcesGrouped[service] = resourcesGrouped[service].slice(0, 3);
            //}

            // extract list of distinct categories from local resources (currently just legal, medical,
            // counselling, but keep it flexible...)
            const categoriesDups = resources.map(r => r.category);
            const categoriesDedup = [ ...new Set(categoriesDups) ];
            const categories = categoriesDedup.sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1);

            // make list of resources grouped by category
            const resourcesGrouped = {};
            for (const category of categories) {
                resourcesGrouped[category] = resources.filter(r => r.category == category);
                resourcesGrouped[category].sort((a, b) => a.dist < b.dist ? -1 : 1);
                resourcesGrouped[category] = resourcesGrouped[category].slice(0, 3); // TODO: ??
            }

            context.categories = resourcesGrouped;
        }

        await ctx.render('whatnext', context);
    }

}


/**
 * Convert fields as defined in form input fields to presentation-friendly fields.
 *
 * This includes
 *  - renaming fields for attractive presentation
 *  - converting dd-mmm-yyyy hh:mm fields to date value
 *  - merging radio-button fields ('where', 'who', 'used-before') with supplementary information to
 *    monotonic fields
 *  - merging checkbox fields ('action') to full texts integrating 'other' field
 *  - setting undefined fields resulting from checkboxes / radio buttons with nothing checked
 *
 * @param   {Object} report - Report as submitted
 * @returns {Object} Transformed report
 */
function prettifyReport(report) {
    const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec' ];

    const rpt = {};

    // on-behalf-of
    const onbehalfof = {
        myself:         'myself',
        'someone-else': 'someone else',
        undefined:      null,
    };
    rpt['On behalf of'] = onbehalfof[report['on-behalf-of']];

    // date gets allocated to either Date (if it's an actual date) or Happened for other options
    const d = report.date;
    switch (report.when) {
        case 'date':          rpt.Date = new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, d.hour, d.minute); break;
        case 'within':        rpt.Happened = report['within-options']; break;
        case 'dont-remember': rpt.Happened = 'Don’t remember'; break;
        case 'dont-know':     rpt.Happened = 'Don’t know'; break;
    }

    // still-happening
    const stillHappening = {
        y:         'yes',
        n:         'no',
        undefined: null,
    };
    rpt['Still happening'] = stillHappening[report['still-happening']];

    // description
    rpt.Description = report.description;

    //where
    const where = {
        at:              report['at-address'],
        'dont-remember': 'Don’t remember',
        'dont-know':     'Don’t know',
        undefined:       null,
    };
    rpt['Where'] = where[report['where']];

    // who
    const who = {
        y:         'Known: ' + report['who-relationship'],
        n:         'Not known: ' + report['who-description'],
        undefined: null,
    };
    rpt['Who'] = who[report['who']];

    // action-taken: create array of responses matching form labels
    const action = {
        police:       'I have told the police',
        organisation: 'I have told somebody within an organisation',
        friends:      'I spoke to friends or other people I know',
        teacher:      'I spoke to a teacher',
        other:        report['action-taken-other-details'],
        unset:        null, // no checkboxes ticked
    };
    if (report['action-taken'] == undefined) report['action-taken'] = 'unset';
    if (typeof report['action-taken'] == 'string') report['action-taken'] = [ report['action-taken'] ];
    rpt['Action taken'] = report['action-taken'].map(a => action[a]);

    // used-before: either Generated name or Existing name is set as appropriate
    switch (report['used-before']) {
        case 'n': rpt['Generated name'] = report['generated-name']; break;
        case 'y': rpt['Existing name'] = report['existing-name']; break;
    }

    return rpt;
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = Handlers;
