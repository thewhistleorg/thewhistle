/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handlers for reporting app.                                                C.Veness 2017-2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import fetch                         from 'node-fetch';  // window.fetch in node.js
import querystring                   from 'querystring'; // nodejs.org/api/querystring.html
import dateFormat                    from 'dateformat';  // Steven Levithan's dateFormat()
import { LatLonSpherical as LatLon } from 'geodesy';     // library of geodesy functions
import Debug                         from 'debug';       // small debugging utility

const debug = Debug('app:report'); // submission process

import Report        from '../models/report.js';
import Resource      from '../models/resource.js';
import Submission    from '../models/submission.js';
import UserAgent     from '../models/user-agent.js';
import Notification  from '../models/notification';
import User          from '../models/user';
import FormGenerator from '../lib/form-generator.js';
import Geocoder      from '../lib/geocode.js';
import Log           from '../lib/log.js';
import Ip            from '../lib/ip.js';


class Handlers {

    /**
     * GET / - (home page) list available reporting apps
     */
    static async getHomePage(ctx) {
        // temporarily(?) redirect to /grn/rape-is-a-crime
        return ctx.response.redirect('/grn/rape-is-a-crime');

        const reportApps = { // eslint-disable-line no-unreachable
            GB: [
                { name: 'survivor-centred response', url: 'report.thewhistle.org/test-cam/scr' },
                { name: 'what-where-when-who',       url: 'report.thewhistle.org/test-cam/wwww' },
            ],
            NG: [
                { name: 'GRN sexual assault',        url: 'report.thewhistle.org/grn/rape-is-a-crime' },
            ],
        };
        ctx.app.proxy = true;
        const ip = ctx.request.ip.replace('::ffff:', '');
        const response = ip=='127.0.0.1' ? {} : await fetch(`https://ipinfo.io/${ip}/json`, { method: 'GET' });

        let country = '';
        let appsLocal = {};

        if (response.ok) {
            const ipinfo = await response.json();
            country = ipinfo.country;
            appsLocal = reportApps[country];
            delete reportApps[country];
        }

        const context = { country: country, appsLocal: appsLocal, appsOther: reportApps };
        await ctx.render('x-index', context);
    }


    /**
     * GET /:database/:project/rebuild - rebuild report from specification.
     *
     * This is not useful for specs hosted by The Whistle, as any spec change will trigger an app
     * rebuild, but for specs held in the database (or made available by http), this can be used to
     * trigger regeneration of a report after a spec change.
     */
    static async rebuild(ctx) {
        const org = ctx.params.database;
        const project = ctx.params.project;

        try {
            await FormGenerator.build(org, project);
        } catch (e) {
            if (e instanceof ReferenceError) ctx.throw(404, `Form specification ‘${org}/${project}’ not found`);
            if (e instanceof SyntaxError) ctx.throw(500, `Form specification ‘${org}/${project}’ has invalid syntax (${e.message})`);
            if (e instanceof EvalError) ctx.throw(500, `Form specification ‘${org}/${project}’ failed validation (${e.message})`);
            ctx.throw(500, `Form specification ‘${org}/${project}’ failed to build (${e.message})`);
        }

        ctx.response.redirect(`/${org}/${project}`);
    }


    /**
     * GET /:database/:project - Render incident report index page.
     */
    static async getIndex(ctx) {
        const org = ctx.params.database;
        const project = ctx.params.project;
        debug('getIndex', org, project);
        try {
            if (!FormGenerator.built(org, project)) await FormGenerator.build(org, project);
        } catch (e) {
            if (e instanceof ReferenceError) ctx.throw(404, `Submission form ${org}/${project} not found`);
            ctx.throw(500, e.message);
        }

        // clear previous session
        ctx.session = null;

        // initialise session with various defaults

        ctx.session = {
            id:        null, // submitted report id
            completed: 0,    // number of pages completed; used to prevent users jumping ahead
        };

        // record new submission has been started
        if (ctx.app.env == 'production' || ctx.request.headers['user-agent'].slice(0, 15)=='node-superagent') {
            ctx.session.submissionId = await Submission.insert(ctx.params.database, ctx.params.project, ctx.request.headers['user-agent']);
        }

        await ctx.render(`../../.generated-reports/${org}/${project}-index`, { recaptcha: ctx.app.env!='development' });
    }


    /**
     * POST /:database/:project - process index page submission (verify recaptcha & go to page 1).
     */
    static async postIndex(ctx) {
        const org = ctx.params.database;
        const project = ctx.params.project;
        debug('postIndex', org, project);
        try {
            if (!FormGenerator.built(org, project)) await FormGenerator.build(org, project);
        } catch (e) {
            if (e instanceof ReferenceError) ctx.throw(404, `Submission form ${org}/${project} not found`);
            ctx.throw(500, e.message);
        }

        // verify client-side reCAPTCHA: developers.google.com/recaptcha/docs/verify
        if (ctx.app.env != 'development') {
            const params = {
                secret:   process.env.RECAPTCHA_SECRET_KEY,
                response: ctx.request.body['g-recaptcha-response'],
                remoteip: ctx.request.ip,
            };
            const qs = querystring.stringify(params);
            const response = await fetch(`https://www.google.com/recaptcha/api/siteverify?${qs}`);
            if (response.ok) {
                const responseJs = await response.json();
                if (responseJs.success == false) {
                    console.error('reCAPTCHA verification failed (response.ok)', params, responseJs);
                    ctx.flash = { error: `reCAPTCHA verification failed: ${responseJs['error-codes']} – are you a bot?` };
                    ctx.response.set('X-Redirect-Reason', 'reCAPTCHA verification failed'); // for smoke tests
                    return ctx.response.redirect(ctx.request.url);
                }
            } else {
                console.error('reCAPTCHA verification failed (!response.ok)', params, response);
                ctx.flash = { error: `reCAPTCHA verification failed: ${response.status} / ${response.statusText}` };
                ctx.response.set('X-Redirect-Reason', 'reCAPTCHA verification failed'); // for smoke tests
                return ctx.response.redirect(ctx.request.url);
            }
        }

        // record user-agent
        await UserAgent.log(org, ctx.request.ip, ctx.request.headers);

        // redirect to page 1 of the submission
        ctx.response.redirect(`/${org}/${project}/1`);
    }


    /**
     * GET /:database/:project/:page - render report page.
     *
     * For single-page report, ctx.params.page is '*', which gets  translated to page '+'.
     *
     * TODO: uploaded files requires more work: when returning to page, already uploaded files should
     *   be displayed (thumbnails), and when using the 'back' button, the 'choose file' should be
     *   reset, not left with the previous uploaded file.
     */
    static async getPage(ctx) {
        const org = ctx.params.database;
        const project = ctx.params.project;
        debug('getPage ', `${org}/${project}/${ctx.params.page}`, 'id:'+ctx.session.id);
        try {
            if (!FormGenerator.built(org, project)) await FormGenerator.build(org, project);
        } catch (e) {
            if (e instanceof ReferenceError) ctx.throw(404, `Submission form ${org}/${project} not found`);
            ctx.throw(500, e.message);
        }

        if (org == 'spec') {
            // a request has been made for a (static) form spec page which doesn't exist, and has
            // hence matched the path to this page
            ctx.throw(404, `Form spec ${project}/${ctx.params.page} not found`); // Not Found
        }

        if (!FormGenerator.forms[`${org}/${project}`].inputs[ctx.params.page] && ctx.params.page!='*') {
            ctx.throw(404); // Not Found
        }

        if (ctx.params.page == 'whatnext') {
            await whatnext(ctx); // TODO: more generic way of handling this?
            return;
        }

        if (ctx.session.isNew) { ctx.flash = { error: 'Your session has expired' }; return ctx.response.redirect(`/${org}/${project}`); }

        const page = ctx.params.page=='*' ? '+' : Number(ctx.params.page); // note '+' is allowed in windows filenames, '*' is not
        if (page > ctx.session.completed+1) { ctx.flash = { error: 'Cannot jump ahead' }; return ctx.response.redirect(`/${org}/${project}/${ctx.session.completed+1}`); }

        // fetch already entered information to fill in defaults for this page if it is being revisited
        const report = await Report.get(org, ctx.session.id);

        // default the incident report date to today if 'exactly when it happened' is selected: this
        // is a natural default, is quite easy to change to yesterday, or to any other day
        const today = { day: dateFormat('d'), month: dateFormat('mmm'), year: dateFormat('yyyy') };
        const defaultIncidentDate = { date: today };

        // get alias for alias confirmation message
        const alias = report ? report.alias : null;

        // default input values from entered information (with today as default for incident date if not entered)
        const submitted = Object.assign(defaultIncidentDate, { alias: alias }, report ? report.submittedRaw : {});

        // if e.g. 'anonymous alias not found' is thrown on single-page report, there is no
        // submitted report to get values from, so assign values from flash.formdata
        Object.assign(submitted, ctx.flash.formdata);

        // set up values for date select elements
        const incidentDate = {
            days:   Array(31).fill(null).map((day, i) => i + 1),
            months: [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ],
            years:  Array(60).fill(null).map((year, i) => new Date().getFullYear() - i),
            hours:  Array(24).fill(null).map((d, i) => i.toString().padStart(2, '0')+':00'),
        };

        // record 'steps' for progress indicator
        const steps = FormGenerator.forms[`${org}/${project}`].steps;
        if (page != '+') steps[page].class = 'current'; // to highlight current page

        // record 'defaults' for default selections (for alternate texts)
        const defaults = FormGenerator.forms[`${org}/${project}`].defaults;

        const context = Object.assign({ steps: steps }, defaults, submitted, { incidentDate: incidentDate });

        // users are not allowed to go 'back' to 'used-before' page
        if (page==1 && ctx.session.saved) { ctx.flash = { error: 'Please continue with your current alias' }; return ctx.response.redirect(`/${org}/${project}/2`); }

        await ctx.render(`../../.generated-reports/${org}/${project}-${page}`, context);

        if (page != '+') delete steps[page].class; // remove highlight for move to another page
    }


    /**
     * POST /:database/:project/:page - process page submission.
     *
     * For single-page submissions, ctx.params.page is '*', which gets  translated to page '+'.
     */
    static async postPage(ctx) {
        const org = ctx.params.database;
        const project = ctx.params.project;
        debug('postPage', `${org}/${project}/${ctx.params.page}`, 'id:'+ctx.session.id);
        try {
            if (!FormGenerator.built(org, project)) await FormGenerator.build(org, project);
        } catch (e) {
            if (e instanceof ReferenceError) ctx.throw(404, `Submission form ${org}/${project} not found`);
            ctx.throw(500, e.message);
        }

        const version = FormGenerator.forms[`${org}/${project}`].version;
        const nPages = Object.keys(FormGenerator.forms[`${org}/${project}`].steps).length;

        if (ctx.session.isNew) { ctx.flash = { error: 'Your session has expired' }; return ctx.response.redirect(`/${org}/${project}`); }

        // page number, or '+' for single-page submission
        const page = ctx.params.page=='*' ? '+' : Number(ctx.params.page);

        // don't allow jumping further forward than 'next' page
        if (page > ctx.session.completed+1) { ctx.flash = { error: 'Cannot jump ahead' }; return ctx.response.redirect(`/${org}/${project}/${ctx.session.completed+1}`); }

        const body = ctx.request.body;

        if (ctx.request.files) {
            // normalise files to be array of File objects (koa-body does not provide array if just 1 file uploaded)
            if (!Array.isArray(ctx.request.files)) ctx.request.files = [ ctx.request.files ];

            // file input fields are named 'documents'; move File objects up to be immediately under 'files'
            ctx.request.files = ctx.request.files.map(f => f.documents);

            // strip out any 0-size files
            ctx.request.files = ctx.request.files.filter(f => f.size > 0);
            debug('... files', ctx.request.files.map(f => f.name));
        }

        if (page==1 & ctx.session.id) { ctx.flash = { error: 'Trying to save already saved report!' }; return ctx.response.redirect(ctx.request.url); }

        if (page==1 || page=='+') { // create the skeleton report (with alias)
            let alias = null;

            switch (body['used-before']) {
                case 'Yes':
                    // verify existing alias does exist
                    alias = body['used-before-existing-alias'];
                    const reportsY = await Report.getBy(org, 'alias', alias);
                    const reportsYExclCurr = reportsY.filter(r => r._id != ctx.session.id); // exclude current report
                    const errorY = `Used-before anonymous alias ‘${alias}’ not found`;
                    const flashY = Object.assign({ error: errorY }, { formdata: body }); // include formdata for single-page report
                    if (reportsYExclCurr.length == 0) { ctx.flash = flashY; return ctx.response.redirect(ctx.request.url); }
                    break;
                case 'No':
                    // verify generated alias does not exist
                    if (body['used-before-generated-alias'] == null) { ctx.flash = { error: 'Not-used-before generated alias not given' }; return ctx.response.redirect(ctx.request.url); }
                    alias = body['used-before-generated-alias'];
                    const reportsN = await Report.getBy(org, 'alias', alias);
                    const reportsNExclCurr = reportsN.filter(r => r._id != ctx.session.id); // exclude current report
                    const errorN = `Generated alias ‘${alias}’ not available: please select another`;
                    const flashN = Object.assign({ error: errorN }, { formdata: body }); // include formdata for single-page report
                    if (reportsNExclCurr.length > 0) { ctx.flash = flashN; return ctx.response.redirect(ctx.request.url); }
                    break;
                default:
                    ctx.flash = { error: 'used-before must be Yes or No' }; return ctx.response.redirect(ctx.request.url);
            }

            // save the skeleton report
            const ua = ctx.request.headers['user-agent'];
            const country = await Ip.getCountry(ctx.request.ip);
            ctx.session.id = await Report.submissionStart(org, project, alias, version, ua, country);
            // TODO: ?? suspend complete/incomplete tags await Report.insertTag(org, ctx.session.id, 'incomplete', null);

            // notify users of 'new report submitted'
            const users = await User.getForDb(org);
            await Notification.notifyMultiple(org, 'new report submitted', users.map(u => u._id), ctx.session.id);

            ctx.response.set('X-Insert-Id', ctx.session.id); // for integration tests
            debug('submissionStart', org, project, page, ctx.session.id);
        }

        // remember if we're going forward or back, then delete nav from body
        const goNum = body['nav-next'] ? page + 1 : page - 1;
        const go = goNum==0 ? '' : goNum>nPages || page=='+' ? 'whatnext' : goNum;
        delete body['nav-prev'];
        delete body['nav-next'];

        // if date specified, verify it is valid (to back up client-side validation)
        if (body.date) {
            // (note for some reason test suite leaves date as a string)
            const d = typeof body.date=='object' ? body.date : JSON.parse(body.date);
            const time = d.time ? d.time.split(':') : [ '00', '00', '00' ];
            const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec' ];
            // const date = new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, d.hour, d.minute);
            const date = new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, time[0], time[1]);
            if (isNaN(date.getTime())) { ctx.flash = { validation: [ 'Invalid date' ] }; return ctx.response.redirect(ctx.request.url); } // TODO: formdata
            if (date.getTime() > Date.now()) { ctx.flash = { validation: [ 'Date is in the future' ] }; return ctx.response.redirect(ctx.request.url); }
        }

        const formattedReport = formatReport(org, project, page, body);

        if (page>1 || page=='+') await Report.submissionDetails(org, ctx.session.id, formattedReport, body);

        if (ctx.request.files) {
            for (const file of ctx.request.files) {
                try {
                    await Report.submissionFile(org, ctx.session.id, file);
                } catch (e) {
                    await Log.error(ctx, e);
                    ctx.flash = { error: e.message };
                }
            }
        }

        // record user-agent
        await UserAgent.log(org, ctx.request.ip, ctx.request.headers);

        if (page != '+') ctx.session.completed = page;

        // record submission progress
        if (ctx.app.env == 'production' || ctx.request.headers['user-agent'].slice(0, 15)=='node-superagent') {
            await Submission.progress(org, ctx.session.submissionId, page);
        }

        ctx.response.redirect(`/${org}/${project}/${go}`);
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


/**
 * Render 'what's next' page.
 *
 * Shows local resources grouped by services they offer.
 */
async function whatnext(ctx) {
    const org = ctx.params.database;
    const project = ctx.params.project;

    if (!ctx.session.isNew) {
        // TODO: ?? tag report as complete
        // suspend complete/incomplete tags await Report.deleteTag(org, ctx.session.id, 'incomplete', null);
        // suspend complete/incomplete tags await Report.insertTag(org, ctx.session.id, 'complete', null);

        // record submission complete
        if (ctx.app.env == 'production' || ctx.request.headers['user-agent'].slice(0, 15)=='node-superagent') {
            await Submission.complete(org, ctx.session.submissionId, ctx.session.id);
        }

        // remove all session data (to prevent duplicate submission)
        ctx.session = null; // note on next request, ctx.session will be {} not null, but session.isNew will be true

    }
    const context = { address: ctx.request.query.address };

    // if we have a geocode result on the incident location, list local resources
    const geocoded = ctx.request.query.address ? await Geocoder.geocode(ctx.request.query.address, 'ng') : null;

    if (geocoded) {
        // get all resources within 20km of geocoded location
        const resources = await Resource.getNear(org, geocoded.latitude, geocoded.longitude, 20e3);

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

    await ctx.render(`../../.generated-reports/${org}/${project}-whatnext`, context);
}


/**
 * Convert fields as defined in form input fields to presentation-friendly fields.
 *
 * The name-value pairs of the submitted body are converted as follows:
 *  - the name is changed to the displayed label for the input
 *  - for text/textarea, the value will be the entered value (no processing)
 *  - for radio/checkbox, the value will be the selected value, equal to the option label (no processing)
 *  - if a checkbox input has multiple selections, they are recorded as an array
 *  - if a radio/checkbox inputs have subsidiary inputs, the value(s) will be appended in parentheses
 *
 * The input labels are obtained from FormGenerator.forms, as set up by FormGenerator.build().
 *
 * Since radio buttons / checkboxes with no value selected don't appear in post data, the processing
 * is driven by the FormGenerator.forms (which is generated by FormGenerator.build on first request
 * to report), and an n-dash recorded against that input.
 *
 * @param   {string}     org - Organisation report is for.
 * @param   {string}     project - Project (aka campaign).
 * @param   {number|'+'} page - Page number (or '+' for single-page submission).
 * @param   {Object}     body - Submitted POST body.
 * @returns {Object} Associative array of prettified-label : entered-value pairs.
 */
function formatReport(org, project, page, body) {
    const inputs = FormGenerator.forms[`${org}/${project}`].inputs;
    const pageInputs = page=='+'
        ? [ ...Object.values(inputs) ].reduce((acc, val) => Object.assign(acc, val), {}) // inputs from all pages
        : inputs[page];                                                                  // inputs from this page

    const rpt = {}; // the processed version of body

    for (const inputName in pageInputs) {
        if (inputName.match(/-skip$/) && !body[inputName]) continue; // unless 'skip' option is selected, ignore it
        if (inputName == 'used-before') continue;                    // 'used-before' (Alias) is handled separately
        if (inputName == 'address') continue;                        // 'address' (from whatnext) is ignored

        const label = pageInputs[inputName].label;

        if (Array.isArray(body[inputName])) { // multiple inputs withe same name: multiple response to checkboxes or 'Skip'
            // note copy body[inputName] rather than reference it otherwise it gets polluted with subsidiary value
            rpt[label] = body[inputName].slice();
        } else {
            // plain string
            rpt[label] = body[inputName];
        }

        // multiple inputs of same name one of which is 'Skip'? - ignore other inputs & record 'Skip'
        if (Array.isArray(rpt[label]) && body[inputName].filter(val => val=='Skip').length>0) {
            rpt[label] = 'Skip';
        }

        // check for any subsidiary inputs: if there are, append the subsidiary value within quotes
        if (Array.isArray(rpt[label])) { // multiple response to checkboxes
            for (let i=0; i<rpt[label].length; i++) {
                const subsidiaryFieldName = pageInputs[inputName].subsidiary[body[inputName][i]];
                if (body[subsidiaryFieldName]) rpt[label][i] += ` (${body[subsidiaryFieldName]})`;
            }
        } else {                         // radio button or single checkbox, or select
            const subsidiaryFieldName = pageInputs[inputName].subsidiary ? pageInputs[inputName].subsidiary[body[inputName]] : '';
            if (body[subsidiaryFieldName]) rpt[label] += ` (${body[subsidiaryFieldName]})`;
        }

        // special treatment for library-date
        if (inputName == 'when' && body.date) { // TODO: this is depending on naming within yaml, not on use of library-date!
            const d = typeof body.date=='object' ? body.date : JSON.parse(body.date);
            const time = d.time ? d.time.split(':') : [ '00', '00', '00' ];
            const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec' ];
            // const date = new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, d.hour, d.minute);
            const date = new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, time[0], time[1]);
            rpt[label] = date;
        }

        debug('...', `${inputName} => ${label}: “${rpt[label]}”`);
    }

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
