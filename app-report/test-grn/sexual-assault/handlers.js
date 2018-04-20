/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Handlers: test-grn/sexual-assault.                                         C.Veness 2017-2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import fetch       from 'node-fetch';  // window.fetch in node.js
import querystring from 'querystring'; // nodejs.org/api/querystring.html
import dateFormat  from 'dateformat';  // Steven Levithan's dateFormat()
import geodesy     from 'geodesy';     // library of geodesy functions
import Debug       from 'debug';       // small debugging utility

const debug = Debug('app:report'); // submission process

const LatLon = geodesy.LatLonSpherical;

import Report       from '../../../models/report.js';
import Question     from '../../../models/question.js';
import Resource     from '../../../models/resource.js';
import Submission   from '../../../models/submission.js';
import UserAgent    from '../../../models/user-agent.js';
import Notification from '../../../models/notification';
import User         from '../../../models/user';
import Geocoder     from '../../../lib/geocode.js';
import Log          from '../../../lib/log';

const nPages = 8;

class Handlers {

    /**
     * Render incident report index page.
     */
    static async getIndex(ctx) {
        // clear previous session
        ctx.session = null;

        // initialise session with various defaults

        ctx.session = {
            id:        null, // submitted report id
            completed: 0,    // number of pages completed; used to prevent users jumping ahead
        };

        // record new submission has been started
        if (ctx.app.env == 'production' || ctx.headers['user-agent'].slice(0, 15)=='node-superagent') {
            ctx.session.submissionId = await Submission.insert(ctx.params.database, ctx.params.project, ctx.headers['user-agent']);
        }

        await ctx.render('index', { recaptcha: ctx.app.env!='development' });
    }


    /**
     * Process index page submission - just goes to page 1.
     */
    static async postIndex(ctx) {
        const org = ctx.params.database;
        const project = ctx.params.project;

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
                    ctx.flash = { error: `reCAPTCHA verification failed: ${responseJs['error-codes']} – are you a bot?` };
                    ctx.set('X-Redirect-Reason', 'reCAPTCHA verification failed'); // for smoke tests
                    return ctx.redirect(ctx.url);
                }
            } else {
                ctx.flash = { error: `reCAPTCHA verification failed: ${response.status} / ${response.statusText}` };
                ctx.set('X-Redirect-Reason', 'reCAPTCHA verification failed'); // for smoke tests
                return ctx.redirect(ctx.url);
            }
        }

        // record user-agent
        await UserAgent.log(org, ctx.ip, ctx.headers);

        // redirect to page 1 of the submission
        ctx.redirect(`/${org}/${project}/1`);
    }


    /**
     * Render report page.
     *
     * For single-page report, ctx.params.num is '*', which gets  translated to page '+'.
     *
     * TODO: uploaded files requires more work: when returning to page, already uploaded files should
     *   be displayed (thumbnails), and when using the 'back' button, the 'choose file' should be
     *   reset, not left with the previous uploaded file.
     */
    static async getPage(ctx) {
        debug('getPage', 'p'+ctx.params.num, 'id:'+ctx.session.id);

        const org = ctx.params.database;
        const project = ctx.params.project;

        if (ctx.session.isNew) { ctx.flash = { error: 'Your session has expired' }; return ctx.redirect(`/${org}/${project}`); }

        const page = ctx.params.num=='*' ? '+' : Number(ctx.params.num); // note '+' is allowed in windows filenames, '*' is not
        if (page > ctx.session.completed+1) { ctx.flash = { error: 'Cannot jump ahead' }; return ctx.redirect(`/${org}/${project}/${ctx.session.completed+1}`); }

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

        // supply any required self/other parameterised questions
        const questions = await Question.get(org, project);
        const q = {};
        questions.forEach(qn => q[qn.questionNo] = submitted['on-behalf-of']=='someone-else' ? qn.other : qn.self);

        // set up values for date select elements
        const incidentDate = {
            days:   Array(31).fill(null).map((day, i) => i + 1),
            months: [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ],
            years:  Array(60).fill(null).map((year, i) => new Date().getFullYear() - i),
            hours:  Array(24).fill(null).map((d, i) => i.toString().padStart(2, '0')+':00'),
        };

        // progress indicator
        const pages = Array(nPages).fill(null).map((p, i) => ({ page: i+1 }));
        if (page != '+') pages[page-1].class = 'current'; // to highlight current page
        const context = Object.assign({ pages: pages }, submitted, { incidentDate: incidentDate }, { q: q });

        // users are not allowed to go 'back' to 'used-before' page
        if (page==1 && ctx.session.saved) { ctx.flash = { error: 'Please continue with your current alias' }; return ctx.redirect(`/${org}/${project}/2`); }

        await ctx.render('page'+page, context);
    }


    /**
     * Process page submissions.
     *
     * For single-page submissions, ctx.params.num is '*', which gets  translated to page '+'.
     */
    static async postPage(ctx) {
        debug('postPage', 'p'+ctx.params.num, 'id:'+ctx.session.id, Object.keys(ctx.request.body));

        const org = ctx.params.database;
        const project = ctx.params.project;

        if (ctx.session.isNew) { ctx.flash = { error: 'Your session has expired' }; return ctx.redirect(`/${org}/${project}`); }

        // page number, or '+' for single-page submission
        const page = ctx.params.num=='*' ? '+' : Number(ctx.params.num);

        // don't allow jumping further forward than 'next' page
        if (page > ctx.session.completed+1) { ctx.flash = { error: 'Cannot jump ahead' }; return ctx.redirect(`/${org}/${project}/${ctx.session.completed+1}`); }

        const body = ctx.request.body;

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

        if (page==1 & ctx.session.id) { ctx.flash = { error: 'Trying to save already saved report!' }; return ctx.redirect(ctx.url); }

        if (page==1 || page=='+') { // create the skeleton report (with alias)
            let alias = null;

            switch (body['used-before']) {
                case 'y':
                    // verify existing alias does exist
                    alias = body['existing-alias'];
                    const reportsY = await Report.getBy(org, 'alias', alias);
                    const reportsYExclCurr = reportsY.filter(r => r._id != ctx.session.id); // exclude current report
                    const errorY = `Anonymous alias ‘${alias}’ not found`;
                    const flashY = Object.assign({ error: errorY }, { formdata: body }); // include formdata for single-page report
                    if (reportsYExclCurr.length == 0) { ctx.flash = flashY; return ctx.redirect(ctx.url); }
                    break;
                case 'n':
                    // verify generated alias does not exist
                    if (body['generated-alias'] == null) { ctx.flash = { error: 'Alias not given' }; return ctx.redirect(ctx.url); }
                    alias = body['generated-alias'];
                    const reportsN = await Report.getBy(org, 'alias', alias);
                    const reportsNExclCurr = reportsN.filter(r => r._id != ctx.session.id); // exclude current report
                    const errorN = `Generated alias ‘${alias}’ not available: please select another`;
                    const flashN = Object.assign({ error: errorN }, { formdata: body }); // include formdata for single-page report
                    if (reportsNExclCurr.length > 0) { ctx.flash = flashN; return ctx.redirect(ctx.url); }
                    break;
                default:
                    ctx.flash = { error: 'used-before must be y or n' }; return ctx.redirect(ctx.url);
            }

            // save the skeleton report
            ctx.session.id = await Report.submissionStart(org, project, alias, ctx.headers['user-agent']);
            // TODO? suspend complete/incomplete tags await Report.insertTag(org, ctx.session.id, 'incomplete', null);

            // notify users of 'new report submitted'
            const users = await User.getForDb(org);
            await Notification.notifyMultiple(org, 'new report submitted', users.map(u => u._id), ctx.session.id);

            ctx.set('X-Insert-Id', ctx.session.id); // for integration tests
            debug('submissionStart', ctx.session.id);
        }

        // remember if we're going forward or back, then delete nav from body
        const goNum = body['nav-next'] ? page + 1 : page - 1;
        const go = goNum==0 ? '' : goNum>nPages || page=='+' ? 'whatnext' : goNum;
        delete body['nav-prev'];
        delete body['nav-next'];

        // if date specified, verify it is valid (to back up client-side validation)
        if (body.when == 'date') {
            // (note for some reason test suite leaves date as a string)
            const d = typeof body.date=='object' ? body.date : JSON.parse(body.date);
            const time = d.time ? d.time.split(':') : [ '00', '00', '00' ];
            const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'nov', 'dec' ];
            // const date = new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, d.hour, d.minute);
            const date = new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, time[0], time[1]);
            if (isNaN(date.getTime())) { ctx.flash = { validation: [ 'Invalid date' ] }; return ctx.redirect(ctx.url); } // TODO: formdata
            if (date.getTime() > Date.now()) { ctx.flash = { validation: [ 'Date is in the future' ] }; return ctx.redirect(ctx.url); }
        }

        const prettyReport = prettifyReport(page, body);

        if (page>1 || page=='+') await Report.submissionDetails(org, ctx.session.id, prettyReport, body);

        if (body.files) {
            for (const file of body.files) {
                try {
                    await Report.submissionFile(org, ctx.session.id, file);
                } catch (e) {
                    await Log.error(ctx, e);
                    ctx.flash = { error: e.message };
                }
            }
        }

        // record user-agent
        await UserAgent.log(org, ctx.ip, ctx.headers);

        if (page != '+') ctx.session.completed = page;

        // record submission progress
        if (ctx.app.env == 'production' || ctx.headers['user-agent'].slice(0, 15)=='node-superagent') {
            await Submission.progress(org, ctx.session.submissionId, page);
        }

        ctx.redirect(`/${org}/${project}/${go}`);
    }


    /* whatnext - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - */


    /**
     * Render 'what's next' page.
     *
     * Shows local resources grouped by services they offer.
     */
    static async getWhatnext(ctx) {
        const org = ctx.params.database;

        if (!ctx.session.isNew) {
            // tag report as complete
            // suspend complete/incomplete tags await Report.deleteTag(org, ctx.session.id, 'incomplete', null);
            // suspend complete/incomplete tags await Report.insertTag(org, ctx.session.id, 'complete', null);

            // record submission complete
            if (ctx.app.env == 'production' || ctx.headers['user-agent'].slice(0, 15)=='node-superagent') {
                await Submission.complete(org, ctx.session.submissionId, ctx.session.id);
            }

            // remove all session data (to prevent duplicate submission)
            ctx.session = null; // note on next request, ctx.session will be {} not null, but session.isNew will be true

        }
        const context = { address: ctx.query.address };

        // if we have a geocode result on the incident location, list local resources
        const geocoded = ctx.query.address ? await Geocoder.geocode(ctx.query.address, 'ng') : null;

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
 * @param   {Object} page - Page number to be converted, or '+' for single-page submission.
 * @param   {Object} report - Report as submitted.
 * @returns {Object} Transformed report.
 */
function prettifyReport(page, report) {

    const rpt = {};

    // if no selection is made for checkboxes / radio-buttons (which are not preselected) they will
    // not appear in the post body, so set initial values here (retaining correct sequence) - this
    // is probably not the best way to do this, but since this is all still in flux, this is the
    // easiest for now...
    const nulls = {
        '1a': 'used-before',
        '2a': 'on-behalf-of',
        '2b': 'survivor-gender',
        '2c': 'survivor-age',
        '3a': 'when',
        '3b': 'date',
        '3c': 'still-happening',
        '4a': 'where',
        '5a': 'who',
        '6a': 'description', // TODO: what about files?
        '7a': 'action-taken',
        '8a': 'extra-notes',
        '8b': 'contact-email',
        '8c': 'contact-phone',
    };
    // if (nulls[page] && report[nulls[page]]==undefined) report[nulls[page]] = null; // kludgy or what!
    if (page == '+') {
        const defaults = Object.values(nulls).reduce(function(prev, curr) {
            prev[curr] = null;
            return prev;
        }, {});
        report = Object.assign(defaults, report);
    } else {
        const defaults = Object.entries(nulls).reduce(function(prev, curr) {
            const [ key, val ] = curr;
            if (parseInt(key)==page) prev[val] = null;
            return prev; }, {});
        report = Object.assign(defaults, report);
    }

    for (const field in report) {
        switch (field) {
            case 'used-before':
                // set Alias from generated-alias or existing-alias (don't record distinction in
                // order to ensure homogeneous reports)
                rpt['Alias'] = report['used-before']=='y' ? report['existing-alias'] : report['generated-alias'];
                break;
            case 'on-behalf-of':
                const onbehalfof = {
                    'myself':       'Myself',
                    'someone-else': 'Someone else',
                    null:           null,
                };
                rpt['On behalf of'] = onbehalfof[report['on-behalf-of']];
                break;
            case 'date': // may be date object or string
                // (note for some reason test suite leaves date as a string)
                const d = typeof report.date=='object' ? report.date : JSON.parse(report.date);
                const time = d.time ? d.time.split(':') : [ '00', '00', '00' ];
                const months = [ 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec' ];
                const dateVal =  new Date(d.year, months.indexOf(d.month.toLowerCase()), d.day, time[0], time[1]);
                switch (report.when) {
                    case 'date':          rpt.Happened = dateVal; break;
                    case 'within':        rpt.Happened = report['within-options']; break;
                    case 'dont-remember': rpt.Happened = 'Don’t remember'; break;
                    case 'skip':          rpt.Happened = 'Skipped'; break;
                    case null:            rpt.Happened = null; break;
                }
                break;
            case 'still-happening':
                const stillHappening = {
                    y:    'yes',
                    n:    'no',
                    skip: 'Skipped',
                    null: null,
                };
                rpt['Still happening?'] = stillHappening[report['still-happening']];
                break;
            case 'where':
                const where = {
                    'at':            report['at-address'],
                    'dont-remember': 'Don’t remember',
                    'dont-know':     'Don’t know',
                    'skip':          'Skipped',
                    null:            null,
                };
                rpt['Where'] = where[report['where']];
                break;
            case 'who':
                const who = {
                    y:    'Known: ' + (report['who-relationship'] || '–'),
                    n:    'Not known: ' + (report['who-description'] || '–'),
                    skip: 'Skipped',
                    null: null,
                };
                rpt['Who'] = who[report['who']];
                break;
            case 'action-taken':
                // create array of responses matching form labels
                const action = {
                    police:       'Police or government officials',
                    organisation: 'Somebody within an organisation',
                    teacher:      'Teacher/tutor/lecturer',
                    friends:      'Friends, family',
                    others:       'Others',
                    skip:         'Skipped',
                    null:         null, // no checkboxes ticked
                };
                if (report['action-taken'] == null) report['action-taken'] = [ null ]; // no value: convert to array
                if (typeof report['action-taken'] == 'string') report['action-taken'] = [ report['action-taken'] ]; // single value: convert to array
                rpt['Spoken to anybody?'] = report['action-taken'].map(a => action[a] + (report[`action-taken-${a}-details`] ? ` (${report[`action-taken-${a}-details`]})` : ''));
                if (report['action-taken'].includes('skip')) rpt['Spoken to anybody?'] = [ 'Skipped' ]; // skipped cancels other values
                if (JSON.stringify(rpt['Spoken to anybody?']) == '["null"]') rpt['Spoken to anybody?'] = []; // kludge alert!
                break;
            case 'description':
                // description is a textarea (always submitted), skip is a radio button (only
                // submitted if selected), so if description is an array, 'skip' was selected
                rpt.Description = Array.isArray(report.description) ? 'Skipped' : report.description;
                // note that if a description is entered, then 'skip' selected and the page submitted,
                // then 'back' is selected, the description will have ',skip' appended!
                break;
            case 'survivor-gender':
                const gender = {
                    m:    'male',
                    f:    'female',
                    skip: 'Skipped',
                    null: null,
                };
                rpt['Survivor gender'] = gender[report['survivor-gender']];
                break;
            case 'survivor-age':
                // age is a select (always submitted), skip is a radio button (only submitted if
                // selected), so if survivor-age is an array, 'skip' was selected
                rpt['Survivor age'] = Array.isArray(report['survivor-age']) ? 'Skipped' : report['survivor-age'];
                break;
            case 'extra-notes':
                rpt['Extra notes'] = report['extra-notes'];
                break;
            case 'contact-email':
                rpt['Contact e-mail'] = report['contact-email'];
            case 'contact-details':
                rpt['Contact phone'] = report['contact-phone'];
                break;
        }
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
