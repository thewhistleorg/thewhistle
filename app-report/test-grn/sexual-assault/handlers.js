/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handlers: test-grn/sexual-assault.                                         C.Veness 2017-2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import dateFormat from 'dateformat'; // Steven Levithan's dateFormat()
import geodesy    from 'geodesy';    // library of geodesy functions
const LatLon = geodesy.LatLonSpherical;

import Report    from '../../../models/report.js';
import Question  from '../../../models/question.js';
import Resource  from '../../../models/resource.js';
import Submission from '../../../models/submission.js';
import UserAgent from '../../../models/user-agent.js';

import jsObjectToHtml from '../../../lib/js-object-to-html.js';
import Geocoder       from '../../../lib/geocode.js';

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

        // record new submission has been started
        if (ctx.app.env == 'production' || ctx.headers['user-agent'].slice(0, 15)=='node-superagent') {
            ctx.session.submissionId = await Submission.insert(ctx.params.database, ctx.params.project, ctx.headers['user-agent']);
        }

        await ctx.render('index');
    }


    /**
     * Render report page.
     */
    static async getPage(ctx) {
        if (!ctx.session.report) { ctx.flash = { expire: 'Your session has expired' }; ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return; }

        const page = ctx.params.num=='*' ? '+' : Number(ctx.params.num); // note '+' is allowed on windows, '*' is not
        if (page > ctx.session.completed+1) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/${ctx.session.completed+1}`); return; }

        // supply any required self/other parameterised questions
        const questions = await Question.get(ctx.params.database, ctx.params.project);
        const q = {};
        questions.forEach(qn => q[qn.questionNo] = ctx.session.report['on-behalf-of']=='someone-else' ? qn.other : qn.self );

        // progress indicator
        const pages = Array(nPages).fill(null).map((p, i) => ({ page: i+1 }));
        pages[page-1].class = 'current'; // to highlight current page

        const validYears = { thisyear: dateFormat('yyyy'), lastyear: dateFormat('yyyy')-1 }; // limit report to current or last year
        const context = Object.assign({ pages: pages }, ctx.session.report, validYears, { q: q });

        await ctx.render('page'+page, context);
    }


    /**
     * Process 'next' / 'previous' page submissions.
     */
    static async postPage(ctx) {
        // getIndex initialises ctx.session.report with date, so for this project ctx.session.report is never empty
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
        const goNum = body['nav-next'] ? page + 1 : page - 1;
        const go = goNum==0 ? '' : goNum>nPages ? 'submit' : goNum;
        delete body['nav-prev'];
        delete body['nav-next'];

        // record current body in session before validation
        ctx.session.report = Object.assign(ctx.session.report, body);

        // if date specified, verify it is valid (to back up client-side validation)
        if (body.when == 'date') {
            const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec' ];
            const time = body.date.time ? body.date.time.split(':') : [ '00', '00', '00' ];
            // const date = new Date(body.date.year, months.indexOf(body.date.month.toLowerCase()), body.date.day, body.date.hour, body.date.minute);
            const date = new Date(body.date.year, months.indexOf(body.date.month.toLowerCase()), body.date.day, time[0], time[1]);
            if (isNaN(date.getTime())) {
                ctx.flash = { validation: [ 'Invalid date' ] };
                ctx.redirect(ctx.url); return;
            }
            if (date.getTime() > Date.now()) {
                ctx.flash = { validation: [ 'Date is in the future' ] };
                ctx.redirect(ctx.url); return;
            }
        }

        // record submission progress
        if (ctx.app.env == 'production' || ctx.headers['user-agent'].slice(0, 15)=='node-superagent') {
            await Submission.progress(ctx.params.database, ctx.session.submissionId, page);
        }

        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/${go}`);
    }


    /* submit  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * Render 'review & submit' page.
     */
    static async getSubmit(ctx) {
        if (!ctx.session.report) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return; }

        // make sure only one of generated-alias and existing-alias are recorded, and make it 1st property of report
        if (ctx.session.report['existing-alias']) { delete ctx.session.report['generated-alias']; ctx.session.report = Object.assign({ 'existing-alias': null }, ctx.session.report); }
        if (ctx.session.report['generated-alias']) { delete ctx.session.report['existing-alias']; ctx.session.report = Object.assign({ 'generated-alias': null }, ctx.session.report); }

        const prettyReport = prettifyReport(ctx.session.report);
        const files = ctx.session.report.files ? ctx.session.report.files.map(f => f.name).join(', ') : null;
        const context = {
            reportHtml: jsObjectToHtml.usingTable(prettyReport),
            files:      files,
        };

        await ctx.render('submit', context);
    }


    /**
     * Process 'review & submit' submission.
     */
    static async postSubmit(ctx) {
        if (!ctx.session.report) { ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return; }
        if (ctx.request.body['nav-prev'] == 'prev') { ctx.redirect(ctx.session.completed); return; }

        // record this report
        delete ctx.request.body['submit'];

        // check generated alias not already used, or existing alias does exist
        switch (ctx.session.report['used-before']) {
            case 'y':
                // verify existing alias does exist
                const reportsY = await Report.getBy(ctx.params.database, 'alias', ctx.session.report['existing-alias']);
                if (reportsY.length == 0) { ctx.flash = { alias: 'Anonymous alias not found' }; ctx.redirect(ctx.url); return; }
                break;
            case 'n':
                // verify generated alias does not exist
                if (ctx.session.report['generated-alias'] == null) { ctx.flash = 'Alias not given'; ctx.redirect(ctx.url); }
                const reportsN = await Report.getBy(ctx.params.database, 'alias', ctx.session.report['generated-alias']);
                if (reportsN.length > 0) { ctx.flash = { alias: 'Generated alias not available: please select another' }; ctx.redirect(ctx.url); return; }
                break;
        }

        const alias = ctx.session.report['existing-alias'] || ctx.session.report['generated-alias'];
        const files = ctx.session.report.files;
        delete ctx.session.report.files;

        const prettyReport = prettifyReport(ctx.session.report);

        const by = ctx.state.user ? ctx.state.user.id : null;
        const id = await Report.insert(ctx.params.database, by, alias, prettyReport, 'sexual-assault', files, ctx.headers['user-agent']);
        ctx.set('X-Insert-Id', id); // for integration tests

        // record user-agent
        await UserAgent.log(ctx.params.database, ctx.ip, ctx.headers);

        // record submission complete
        if (ctx.app.env == 'production' || ctx.headers['user-agent'].slice(0, 15)=='node-superagent') {
            await Submission.complete(ctx.params.database, ctx.session.submissionId, id);
        }

        // remove all session data (to prevent duplicate submission)
        ctx.session = {};

        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}/whatnext`);
    }


    /* what's next - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * Render 'what's next' page.
     *
     * Shows local resources grouped by services they offer.
     */
    static async getWhatnext(ctx) {
        const context = { address: ctx.query.address };

        // if we have a geocode result on the incident location, list local resources
        const geocoded = ctx.query.address ? await Geocoder.geocode(ctx.query.address) : null;

        if (geocoded) {
            // get all resources within 20km of geocoded location
            const resources = await Resource.getNear(ctx.params.database, geocoded.latitude, geocoded.longitude, 20e3);

            // add distance from geocoded location to each resource, & convert phone/email arrays to lists
            const locn = new LatLon(geocoded.latitude, geocoded.longitude);
            for (const resource of resources) {
                const lat = resource.location.coordinates[1];
                const lon = resource.location.coordinates[0];
                resource.dist = locn.distanceTo(new LatLon(lat, lon)); // used for sorting
                resource.distKm = (resource.dist/1000).toPrecision(2); // used for display
                resource.phone = resource.phone.map(p => `<span class="nowrap">${p}</span>`).join(', ');
                resource.email = resource.email.join(' ');
                resource.website = formatUrl(resource.website);
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

            context.categories = Object.keys(resourcesGrouped).length>0 ? resourcesGrouped : null; // readily identify 'no resources' in template
            context.formattedAddress = geocoded.formattedAddress;
        }

        await ctx.render('whatnext', context);
    }


    /**
     * Process 'what next' submission.
     */
    static postWhatnext(ctx) {
        // ignore submitted value, just skip back to beginning
        ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`);
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
 * Note that the admin app expects a field named 'Description'.
 *
 * @param   {Object} report - Report as submitted
 * @returns {Object} Transformed report
 */
function prettifyReport(report) {
    const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec' ];

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
    const time = d.time ? d.time.split(':') : [ '00', '00', '00' ];
    switch (report.when) {
        case 'date':          rpt.Date = new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, time[0], time[1] ); break;
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

    // used-before: set Alias from generated-alias or existing-alias (don't record distinction in
    // order to ensure homogeneous reports)
    rpt['Alias'] = report['used-before']=='y' ? report['existing-alias'] : report['generated-alias'];

    return rpt;
}


/**
 * Format url to be HTML <a> element, with protocol (if any) stripped from displayed text.
 *
 * Duplicated in app-admin/resources.js.
 *
 * @param   {string} url - Website URL.
 * @returns {string} HTML <a> element.
 */
function formatUrl(url) {
    if (!url) return '';
    const href = url.slice(0, 4)=='http' ? url : 'http://'+url;
    url = url.replace(/^https?:\/\//, '');
    return `<a href="${href}">${url}</a>`;
}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Handlers;
