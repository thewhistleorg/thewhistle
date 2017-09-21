/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Reports handlers - manage reports workflow including dashboard, searching/filtering, editing   */
/* metadata, etc.                                                                                 */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const dateFormat = require('dateformat');  // Steven Levithan's dateFormat()
const MarkdownIt = require('markdown-it'); // markdown parser
const json2csv   = require('json2csv');    // converts json into csv
const pdf        = require('html-pdf');    // HTML to PDF converter
const fs         = require('fs-extra');    // fs with extra functions & promise interface
const handlebars = require('handlebars');  // logicless templating language
const LatLon     = require('geodesy').LatLonSpherical; // spherical earth geodesy functions
const Dms        = require('geodesy').Dms; // degrees/minutes/seconds conversion routines
const moment     = require('moment');      // date library for manipulating dates
const ObjectId   = require('mongodb').ObjectId;

const Report = require('../models/report.js');
const User   = require('../models/user.js');
const Update = require('../models/update.js');

const jsObjectToHtml = require('../lib/js-object-to-html');
const jsObjectToRichHtml = require('../lib/js-object-to-rich-html');


class ReportsHandlers {

    /**
     * GET /reports - Render reports search/list page.
     *
     * Note on filtering: if all filter fields are empty, archived is false, and dates have not been
     * changed, the query is removed from the url for clarity. If the archived flag is changed, then
     * - if oldest is default, it is set to new 'oldest' value; otherwise max of oldest & new 'oldest' value
     * - if latest is default, it is set to new 'latest' value; otherwise min of latest & new 'latest' value
     * (active defaults: oldest-today; archived defaults: oldest-latest)
     */
    static async list(ctx) {
        const db = ctx.state.user.db;

        // ---- filtering
        const { filter, filterDesc, oldest, latest } = await ReportsHandlers.buildFilter(db, ctx.request.query);

        // indicate when filters applied in page title
        const title = 'Reports list' + (filterDesc.size>0 ? ` (filtered by ${[ ...filterDesc ].join(', ')})` : '');


        // ------------ find reports matching search criteria

        const rpts = await Report.find(db, filter.length==0 ? {} : { $and: filter });

        // get list of users (indexed by id) for use in translating id's to usernames
        const users = await User.details(); // note users is a Map

        // geocoded location field or fields to use
        const locationFields = lowestDistinctGeographicLevel(rpts);

        const reports = [];
        for (const rpt of rpts) {
            const lastUpdate = await Update.lastForReport(db, rpt._id);
            if (Object.keys(rpt.geocode).length > 0) {
                for (const field of locationFields) { // if multiple location field candidates, use first available
                    rpt.location = field.split('.').reduce((obj, key) => obj[key], rpt); // stackoverflow.com/questions/6393943
                    if (rpt.location) break;
                }
            } else {
                rpt.location = '—';
            }
            for (let t=0; t<rpt.tags.length; t++) { // style tags in cartouches
                rpt.tags.splice(t, 1, `<span class="tag">${rpt.tags[t]}</span>`);
            }
            if (rpt.tags.length > 2) { // limit displayed tags to 2
                rpt.tags.splice(2, rpt.tags.length, `<span class="nowrap">+${rpt.tags.length-2} more...</span>`);
            }

            const fields = {
                _id:              rpt._id,
                updatedOn:        lastUpdate.on ? lastUpdate.on.toISOString().replace('T', ' ').replace('.000Z', '') : '',
                updatedOnPretty:  lastUpdate.on ? prettyDate(lastUpdate.on.toDateString()) : '',
                updatedAge:       lastUpdate.on ? new Date() - new Date(lastUpdate.on).valueOf() : 0, // for sorting
                updatedAgo:       lastUpdate.on ? ago(lastUpdate.on) : '',
                updatedBy:        lastUpdate.by,
                assignedTo:       rpt.assignedTo ? users.get(rpt.assignedTo.toString()).username : '',
                status:           rpt.status || '', // ensure status is string
                summary:          rpt.summary || `<span title="submitted description">${rpt.submitted['Description']}</span>`,
                submittedDesc:    truncate(rpt.submitted['Description'],140)|| `<i title="submitted description" class="grey">No Description</i>`,
                tags:             rpt.tags,
                reportedOnPretty: prettyDate(rpt._id.getTimestamp()),
                reportedOnFull:   dateFormat(rpt._id.getTimestamp(), 'ddd d mmm yyyy HH:MM'),
                reportedBy:       rpt.by ? '@'+users.get(rpt.by.toString()).username : rpt.name,
                location:         rpt.location,
                name:             rpt.name,
                comments:         rpt.comments,
            };
            reports.push(fields);
        }

        // set sort field & order; if field is appended with '-', normal order is reversed
        const sort = {
            column: ctx.request.query.sort ? ctx.request.query.sort.replace('-', '') : '',
            field:  '',
            asc:    null,
        };
        switch (sort.column) {
            case 'updated':   sort.field = 'updatedAge'; sort.asc = -1; break;
            case 'assigned':  sort.field = 'assignedTo'; sort.asc = -1; break;
            case 'status':    sort.field = 'status';     sort.asc = -1; break;
            case 'summary':   sort.field = 'summary';    sort.asc = -1; break;
            case 'submitted': sort.field = '_id';        sort.asc =  1; break;
            case 'from':      sort.field = 'name';       sort.asc = -1; break;
            default:          sort.field = 'updatedAge'; sort.asc = -1; sort.column = 'updated'; break;
        }
        sort.asc = ctx.request.query.sort && ctx.request.query.sort.slice(-1)=='-' ? -sort.asc : sort.asc;
        reports.sort((a, b) => {
            // if field to be sorted on is string, use lower case to sort
            const aVal = typeof a[sort.field] == 'string' ? a[sort.field].toLowerCase() : a[sort.field];
            const bVal = typeof b[sort.field] == 'string' ? b[sort.field].toLowerCase() : b[sort.field];
            // if sort fields are distinct, return ±1 as appropriate
            if (aVal < bVal) return sort.asc;
            if (aVal > bVal) return -sort.asc;
            // if sort fields are equal, sort by id (ie temporally, most recent first)
            return a._id < b._id ? 1 : -1;
        });

        // ---- filter lists

        const filterLists = await ReportsHandlers.buildFilterLists(db, ctx);

        // show number of reports in results
        const count = reports.length == 0
            ? 'No reports matching specified search'
            : reports.length == 1 ? '1 report' : reports.length+' reports';

        const context = {
            reports:     reports,
            filterLists: filterLists,
            oldest:      oldest,            // to check for change
            latest:      latest,            // to check for change
            title:       title,             // page title indicating filtering
            exportCsv:   ctx.request.href.replace('/reports', '/reports/export-csv'),
            exportPdf:   ctx.request.href.replace('/reports', '/reports/export-pdf'),
            current:     ctx.request.query, // current filter
            sort:        sort,
            count:       count,
        };
        context.current.from = context.current.from || oldest;
        context.current.to = context.current.to || latest;
        context.sort.asc = context.sort.asc=='-1' ? '+' : '-';
        await ctx.render('reports-list', context);
    }

    /**
     * GET /reports-map - Render reports search/map page.
     *
     * Note on filtering: if all filter fields are empty, archived is false, and dates have not been
     * changed, the query is removed from the url for clarity. If the archived flag is changed, then
     * - if oldest is default, it is set to new 'oldest' value; otherwise max of oldest & new 'oldest' value
     * - if latest is default, it is set to new 'latest' value; otherwise min of latest & new 'latest' value
     * (active defaults: oldest-today; archived defaults: oldest-latest)
     */
    static async map(ctx) {
        const db = ctx.state.user.db;

        // ---- filtering
        const { filter, filterDesc } = await ReportsHandlers.buildFilter(db, ctx.request.query);

        // indicate when filters applied in page title
        const title = 'Reports map' + (filterDesc.size>0 ? ` (filtered by ${[ ...filterDesc ].join(', ')})` : '');


        // ------------ find reports matching search criteria

        const rpts = await Report.find(db, filter.length==0 ? {} : { $and: filter });

        // get list of users (indexed by id) for use in translating id's to usernames
        const users = await User.details(); // note users is a Map

        const reports = [];
        const y = 1000*60*60*24*365; // one year
        for (const rpt of rpts) {
            if (!rpt.geocode) continue;
            if (Object.keys(rpt.geocode).length == 0) continue;
            const fields = {
                _id:        rpt._id,
                summary:    rpt.summary || '', // ensure summary is string
                lat:        rpt.geocode.latitude || NaN,
                lon:        rpt.geocode.longitude || NaN,
                assignedTo: rpt.assignedTo ? users.get(rpt.assignedTo.toString()).username : '—',
                status:     rpt.status || '', // ensure status is string
                date:       dateFormat(rpt._id.getTimestamp(), 'd mmm yyyy'),
                highlight:  Math.round(100 * (rpt._id.getTimestamp() - new Date() + y) / y),
            };
            reports.push(fields);
        }

        // ---- chart aggregation

        const reportsByDay = {};
        for (const rpt of rpts) {
            const reported = rpt._id.getTimestamp();
            const day = new Date(reported.getFullYear(), reported.getMonth(), reported.getDate());
            if (reportsByDay[day] == undefined) reportsByDay[day] = 0;
            reportsByDay[day]++;
        }
        const maxReportsByDay = Math.max(...Object.values(reportsByDay)) + 1;

        const reportsByWeek = {};
        for (const rpt of rpts) {
            const reported = rpt._id.getTimestamp();
            const week = new Date(reported.getFullYear(), reported.getMonth(), reported.getDate());
            week.setDate(week.getDate() - week.getDay() + 1);
            if (reportsByWeek[week] == undefined) reportsByWeek[week] = 0;
            reportsByWeek[week]++;
        }
        const maxReportsByWeek = Math.max(...Object.values(reportsByWeek)) + 1; // TODO

        // show number of reports in results
        const count = reports.length == 0
            ? 'No reports matching specified search'
            : reports.length == 1 ? '1 report' : reports.length+' reports';

        const context = {
            reports:         reports,
            title:           title,             // page title indicating filtering
            reportsByDay:    reportsByDay,      // for time-based chart
            maxReportsByDay: maxReportsByDay,   // for chart gridlines
            exportCsv:       ctx.request.href.replace('/reports', '/reports/export-csv'),
            count:           count,
        };
        await ctx.render('reports-map', context);
    }


    /**
     * GET /reports/export-csv - download CSV file of current list of reports.
     */
    static async exportCsv(ctx) {
        const db = ctx.state.user.db;

        // ---- filtering
        const { filter, filterDesc } = await ReportsHandlers.buildFilter(db, ctx.request.query);


        // ------------ find reports matching search criteria

        const rpts = await Report.find(db, { $and: filter });

        // get list of users (indexed by id) for use in translating id's to usernames
        const users = await User.details(); // note users is a Map

        const reports = [];
        for (const rpt of rpts) {
            const lastUpdate = await Update.lastForReport(db, rpt._id);
            const fields = {
                updatedOn:    lastUpdate.on ? lastUpdate.on.toISOString().replace('T', ' ').replace('.000Z', '') : '',
                updatedBy:    lastUpdate.by,
                assignedTo:   rpt.assignedTo ? users.get(rpt.assignedTo.toString()).username : '', // replace 'assignedTo' ObjectId with username
                status:       rpt.status,
                summary:      rpt.summary,
                tags:         rpt.tags.join(', '),
                reportedOn:   rpt._id.getTimestamp().toISOString().replace('T', ' ').replace('.000Z', ''),
                reportedBy:   rpt.by ? '@'+(await User.get(rpt.by)).username : rpt.name,
                reporterName: rpt.name,
                archived:     rpt.archived,
                url:          ctx.origin + '/reports/'+rpt._id,
            };
            reports.push(fields);
        }

        reports.sort((a, b) => a.reportedOn < b.reportedOn ? 1 : -1); // sort in reverse chronological order (match main list default)

        const csv = json2csv({ data: reports });
        const filenameFilter = filterDesc.size>0 ? ` (filtered by ${[ ...filterDesc ].join(', ')}) ` : ' ';
        const filename = 'the whistle incident reports' + filenameFilter +  dateFormat('yyyy-mm-dd HH:MM') + '.csv';
        ctx.status = 200;
        ctx.body = csv;
        ctx.attachment(filename);

    }


    /**
     * GET /reports/export-pdf - download PDF file of current list of reports.
     */
    static async exportPdf(ctx) {
        const db = ctx.state.user.db;

        // ---- filtering
        const { filter, filterDesc } = await ReportsHandlers.buildFilter(db, ctx.request.query);


        // ------------ find reports matching search criteria

        const rpts = await Report.find(db, { $and: filter });

        // get list of users (indexed by id) for use in translating id's to usernames
        const users = await User.details(); // note users is a Map

        // geocoded location field or fields to use
        const locationFields = lowestDistinctGeographicLevel(rpts);

        const reports = [];
        for (const rpt of rpts) {
            const lastUpdate = await Update.lastForReport(db, rpt._id);
            for (const field of locationFields) { // if multiple location field candidates, use first available
                rpt.location = field.split('.').reduce((obj, key) => obj[key], rpt); // stackoverflow.com/questions/6393943
                if (rpt.location) break;
            }
            for (let t=0; t<rpt.tags.length; t++) { // style tags in cartouches
                rpt.tags.splice(t, 1, `<span class="tag">${rpt.tags[t]}</span>`);
            }
            for (const comment of rpt.comments) {
                comment.onDate = dateFormat(comment.on, 'd mmm yyyy');
                comment.onTime = dateFormat(comment.on, 'HH:MM');
                comment.comment = comment.comment ? MarkdownIt().render(comment.comment) : null;
            }
            const fields = {
                _id:           rpt._id,
                reportHtml:    jsObjectToHtml(rpt.submitted),
                updatedDate:   lastUpdate.on ? dateFormat(lastUpdate.on, 'd mmm yyyy') : '—',
                updatedTime:   lastUpdate.on ? dateFormat(lastUpdate.on, 'HH:MM') : '',
                updatedBy:     lastUpdate.by ? '@'+lastUpdate.by : '',
                assignedTo:    rpt.assignedTo ? '@'+users.get(rpt.assignedTo.toString()).username : '—', // replace 'assignedTo' ObjectId with username
                status:        rpt.status,
                summary:       rpt.summary,
                summaryQuoted: rpt.summary ? `‘${rpt.summary}’` : '',
                tags:          rpt.tags,
                reportedDate:  dateFormat(rpt._id.getTimestamp(), 'd mmm yyyy'),
                reportedTime:  dateFormat(rpt._id.getTimestamp(), 'HH:MM'),
                reportedBy:    rpt.by ? '@'+(await User.get(rpt.by)).username : rpt.name,
                location:      rpt.location,
                name:          rpt.name,
                comments:      rpt.comments,
                geocode:       rpt.geocode,
                url:           ctx.origin + '/reports/'+rpt._id,
            };
            reports.push(fields);
        }
        // TODO: show images

        reports.sort((a, b) => a._id < b._id ? -1 : 1); // sort in chronological order


        // show number of reports in results
        const count = reports.length == 0
            ? 'No reports matching specified search'
            : reports.length == 1 ? '1 report' : reports.length+' reports';

        // show applied filters
        const filters = [];
        for (const q in ctx.request.query) {
            if (Array.isArray(ctx.request.query[q])) {
                // if filter given multiple times eg tag=a&tag=b;
                for (const filter of ctx.request.query[q]) filters.push(q.slice(0,6)=='field:' ? `field <i>${q.slice(6)}</i>: ${filter}` : `${q}: ${filter}`);
            } else {
                filters.push(q.slice(0,6)=='field:' ? `field <i>${q.slice(6)}</i>: ${ctx.request.query[q]}` : `${q}: ${ctx.request.query[q]}`);
            }
        }

        const context = {
            nowFull: dateFormat('d mmm yyyy HH:MM'),
            reports: reports,
            filters: filters,
            current: ctx.request.query, // current filter
            count:   count,
            title:   'The Whistle submitted incident reports',
        };

        if (ctx.request.query.preview != undefined) { // for development/debugging
            await ctx.render('reports-list.pdf.html', context);
            return;
        }

        // read, compile, and evaluate handlebars template
        const templateHtml = await fs.readFile('app-admin/templates/reports-list.pdf.html', 'utf8');
        const templateHbs = handlebars.compile(templateHtml);
        const html = templateHbs(context);

        // create PDF
        const options = {
            format: 'A4',
            base:   'file:/'+__dirname+'/public/',
        };
        const reportsPdf = pdf.create(html, options);

        // promisify the toBuffer method
        reportsPdf.__proto__.toBufferPromise = function() { // TODO: must be a cleaner way to do this!
            return new Promise(function(resolve, reject) {
                this.toBuffer(function (err, buffer) {
                    if (err) return reject(err);
                    resolve(buffer);
                });
            }.bind(this));
        };

        // return PDF as attachment
        const filenameFilter = filterDesc.size>0 ? ` (filtered by ${[ ...filterDesc ].join(', ')}) ` : ' ';
        const filename = 'the whistle incident reports' + filenameFilter +  dateFormat('yyyy-mm-dd HH:MM') + '.pdf';
        ctx.status = 200;
        ctx.body = await reportsPdf.toBufferPromise();
        ctx.attachment(filename);
    }


    /**
     * GET /reports/export-pdf/:id - download PDF file of single report.
     *
     * TODO: decide what common code between this and exportPdf() is worth factoring out
     */
    static async exportPdfSingle(ctx) {
        const db = ctx.state.user.db;

        const rpt = await Report.get(db, ctx.params.id);

        // supplementary information (as per exportPdf())

        // get list of users (indexed by id) for use in translating id's to usernames
        const users = await User.details(); // note users is a Map

        const lastUpdate = await Update.lastForReport(db, rpt._id);
        for (let t=0; t<rpt.tags.length; t++) { // style tags in cartouches
            rpt.tags.splice(t, 1, `<span class="tag">${rpt.tags[t]}</span>`);
        }
        for (const comment of rpt.comments) {
            comment.onDate = dateFormat(comment.on, 'd mmm yyyy');
            comment.onTime = dateFormat(comment.on, 'HH:MM');
            comment.comment = comment.comment ? MarkdownIt().render(comment.comment) : null;
        }
        const fields = { // as per exportPdf()
            _id:           rpt._id,
            reportHtml:    jsObjectToHtml(rpt.submitted),
            updatedDate:   lastUpdate.on ? dateFormat(lastUpdate.on, 'd mmm yyyy') : '—',
            updatedTime:   lastUpdate.on ? dateFormat(lastUpdate.on, 'HH:MM') : '',
            updatedBy:     lastUpdate.by ? '@'+lastUpdate.by : '',
            assignedTo:    rpt.assignedTo ? '@'+users.get(rpt.assignedTo.toString()).username : '—', // replace 'assignedTo' ObjectId with username
            status:        rpt.status,
            summaryQuoted: rpt.summary ? `‘${rpt.summary}’` : '',
            tags:          rpt.tags,
            reportedDate:  dateFormat(rpt._id.getTimestamp(), 'd mmm yyyy'),
            reportedTime:  dateFormat(rpt._id.getTimestamp(), 'HH:MM'),
            reportedBy:    rpt.by ? '@'+(await User.get(rpt.by)).username : rpt.name,
            comments:      rpt.comments,
            geocode:       rpt.geocode,
        };

        const context = {
            reports: [ fields ],
            nowFull: dateFormat('d mmm yyyy HH:MM'),
            single:  true,
            title:   'The Whistle submitted incident report',
        };
        if (ctx.request.query.preview != undefined) { // for debugging
            await ctx.render('reports-list.pdf-single.html', context);
            return;
        }

        // read, compile, and evaluate handlebars template
        const templateHtml = await fs.readFile('app-admin/templates/reports-list.pdf-single.html', 'utf8');
        const templateHbs = handlebars.compile(templateHtml);
        const html = templateHbs(context);

        // create PDF
        const options = {
            format: 'A4',
            base:   'file:/'+__dirname+'/public/',
        };
        const reportsPdf = pdf.create(html, options);

        // promisify the toBuffer method
        reportsPdf.__proto__.toBufferPromise = function() { // TODO: must be a cleaner way to do this!
            return new Promise(function(resolve, reject) {
                this.toBuffer(function (err, buffer) {
                    if (err) return reject(err);
                    resolve(buffer);
                });
            }.bind(this));
        };

        // return PDF as attachment
        const filename = 'the whistle incident report ' +  dateFormat('yyyy-mm-dd HH:MM') + '.pdf';
        ctx.status = 200;
        ctx.body = await reportsPdf.toBufferPromise();
        ctx.attachment(filename);
    }


    /**
     * Build arrays representing filter selection options.
     * @param {string} db - Reports database to use.
     * @param {Object} ctx - Koa context.
     * @returns { projects[], assignees[], statuses[], tags[], fields[] }
     */
    static async buildFilterLists(db, ctx) {
        const active = ctx.request.query.active || 'active';
        const allReports = await Report.getAll(db, active); // all active/archived reports, not filtered

        // show searching in active, archived, or active+archived
        const activeAlt = {
            active:   { value: '',         display: 'active' },
            archived: { value: 'archived', display: 'archived' },
            all:      { value: 'all',      display: 'active + archived' },
        };
        const activeNow = activeAlt[active].display;
        delete activeAlt[active];

        const projectsSet = new Set();
        for (const report of allReports) {
            projectsSet.add(report.project);
        }
        const projects = [ ...projectsSet ].sort();

        // list of users (with reports assigned to them)
        const assigneesSet = new Set();
        for (const report of allReports) {
            assigneesSet.add(report.assignedTo==null ? null : report.assignedTo.toString()); // toString req'd to remove dups
        }

        // get user details for users with reports assigned
        const assignees = (await Promise.all([ ...assigneesSet ].map(u => User.get(u)))).map(u => u==null ? {} : u);
        assignees.sort((a, b) => {
            if (a._id!=undefined && a._id.toString() == ctx.state.user.id) { a.fmt = 'bold'; return -1; } // current user to top of list
            if (b._id!=undefined && b._id.toString() == ctx.state.user.id) { b.fmt = 'bold'; return  1; } // current user to top of list
            if (a._id == undefined) { a.firstname = '<not assigned>'; a.fmt = 'grey'; return -1; } // unassigned next
            if (b._id == undefined) { b.firstname = '<not assigned>'; b.fmt = 'grey'; return  1; } // unassigned next
            a = (a.firstname+a.lastname).toLowerCase();
            b = (b.firstname+b.lastname).toLowerCase();
            return a < b ? -1 : 1;
        });

        // list of statuses used (for select)
        const statusesSet = new Set();
        for (const report of allReports) {
            statusesSet.add(report.status);
        }
        // undefined or null should be represented as empty string
        if (statusesSet.has(null)) {
            statusesSet.delete(null);
            statusesSet.add('');
        }
        if (statusesSet.has(undefined)) {
            statusesSet.delete(undefined);
            statusesSet.add('');
        }

        const statuses = [ ...statusesSet ].sort().map(s => s==''
            ? { status: s, display: '<span class="grey">&lt;not set&gt;</span>' }
            : { status: s, display: s }
        );

        // list of tags used (for select)
        const tagsSet = new Set();
        for (const report of allReports) {
            for (const tag of report.tags) tagsSet.add(tag);
        }
        const tags = [ ...tagsSet ].sort();

        // ---- list of report fields

        // all values in all reports fields
        const fieldValues = {};
        for (const report of allReports) {
            for (const field in report.submitted) {
                if (fieldValues[field] == undefined) fieldValues[field] = new Set();
                if (report.submitted[field]) fieldValues[field].add(report.submitted[field]);
            }
        }
        // remove fields with nothing filled in in any reports
        for (const field in fieldValues) {
            if (fieldValues[field].size == 0) delete fieldValues[field];
        }
        // TODO: remove non-text fields?
        // convert set of values for each field to array, & sort
        for (const field in fieldValues) {
            fieldValues[field] = [ ...fieldValues[field] ].sort();
        }

        // sorted list of field names
        const fields = Object.keys(fieldValues).sort();

        return { activeAlt, activeNow, projects, assignees, statuses, tags, fields };
    }


    /**
     * Constructs MongoDb filter query object from query-string filter spec.
     *
     * @param {string} db - Reports database to use.
     * @param {string} q - Request query string.
     * @returns { filter: Object[], filterDesc: Set, oldest: string, latest: string }
     */
    static async buildFilter(db, q) {
        const filter = [];
        const filterDesc = new Set();

        for (const arg in q) { // trap ?qry=a&qry=b, which will return an array
            if ([ 'tag', 'summary' ].includes(arg)) continue; // multiple filters for tag & summary are allowed & catered for
            if (typeof q[arg] != 'string') throw new Error(`query string argument ${arg} is not a string`);
        }

        switch (q.active) {
            default:         filter.push({ archived: false }); break; // active
            case 'archived': filter.push({ archived: true });  break; // archived
            case 'all':      /* no filter */                   break; // active + archived
        }

        // project filtering: if a project is given, list reports belonging to that project
        if (q.project) {
            filter.push({ 'project': q.project });
            filterDesc.add('project');
        }

        // assigned filtering: filter by assignee user name - if there is no assigned query argument,
        // then all reports are listed; if it is an empty string, unassigned reports are  listed;
        // otherwise reports assigned to given user
        if (q.assigned != undefined) {
            if (q.assigned != '') { // list reports for given user
                const [ user ] = await User.getBy('username', q.assigned);
                if (user) {
                    filter.push({ ['assignedTo']: user._id });
                    filterDesc.add('assigned');
                }
            } else { // list unassigned reports
                filter.push({ ['assignedTo']: null });
                filterDesc.add('assigned-to');
            }
        }

        // status filtering: if there is no status query argument, or if it is ‘*’, then all reports
        // are listed; if it is an empty string, report with no status are listed; otherwise reports
        // with given status
        switch (q.status) {
            case undefined: // list all reports
            case '*':
                break;
            case '':        // list reports with no status set (nominally null, but also undefined or '')
                filter.push({ $or: [ { status: null }, { status: '' } ] });
                filterDesc.add('status');
                break;
            default:        // list reports with given status
                filter.push({ status: q.status });
                filterDesc.add('status');
                break;
        }

        // summary filtering: filter by reports which include query argument within summary field
        if (q.summary) {
            if (Array.isArray(q.summary)) {
                for (const s of q.summary) filter.push({ ['summary']: new RegExp(`.*${s}.*`, 'i') });
            } else {
                filter.push({ ['summary']: new RegExp(`.*${q.summary}.*`, 'i') });
            }
            filterDesc.add('summary');
        }

        // tag filtering: if a tag is given, list reports which include that tag
        if (q.tag) {
            if (Array.isArray(q.tag)) {
                for (const t of q.tag) filter.push({ ['tags']: t });
            } else {
                filter.push({ ['tags']: q.tag });
            }
            filterDesc.add('tag');
        }

        // free-text filtering: if free-text search is required, list reports which include that text
        // in the original submitted incident report TODO: incorporate in 'field:' search?
        if (q['free-text']) filter.push({ $text: { $search: q['free-text'] } });

        // filter by text within submitted incident reports
        for (const key in q) {
            if (key.slice(0, 6) == 'field:') {
                const field = key.slice(6);
                const fld = 'submitted.' + [ field ];
                const val = q[key] || '.+';
                filter.push({ [fld]: { $regex: val, $options: 'i' } });
                filterDesc.add('report content');
            }
        }

        // date filtering: reports submitted between given dates
        // defaults: oldest-active...today for active, oldest...latest-archived for archived,
        // oldest-today for all
        // TODO: for better performance, this could be done from allReports rather than further db rount-trips?
        const oldest = (await Report.getOldestTimestamp(db, q.active)).slice(0, 10);
        const latest = q.active=='archived'
            ? (await Report.getLatestTimestamp(db, q.active)).slice(0, 10)
            : dateFormat('yyyy-mm-dd');
        if (q.submitted) {
            const [ from, to ] = q.submitted.split('–');
            if (from != oldest) {
                const secs = ((new Date(from))/1000).toString(16);
                filter.push({ _id: { $gte: ObjectId(secs+'000000'+'0000'+'000000') } });
                filterDesc.add('date');
            }
            if (to != latest) {
                const secs = ((new Date(to))/1000 + 60*60*24).toString(16); // note: though to end of given date
                filter.push({ _id: { $lte: ObjectId(secs+'000000'+'0000'+'000000') } });
                filterDesc.add('date');
            }
        }

        return { filter, filterDesc, oldest, latest };
    }


    /**
     * GET /reports/:id - Render view-report page.
     */
    static async viewReport(ctx) {
        const db = ctx.state.user.db;

        // report details
        const report = await Report.get(db, ctx.params.id);
        if (!report) ctx.throw(404, 'Report not found');

        report.reported = dateFormat(report._id.getTimestamp(), 'yyyy-mm-dd HH:MM');
        report.archived = report.archived ? 'y' : 'n';

        const users = await User.getAll(); // for assigned-to select
        users.sort((a, b) => { a = (a.firstname+a.lastname).toLowerCase(); b = (b.firstname+b.lastname).toLowerCase(); return a < b ? -1 : 1; });

        const statuses = await Report.statuses(db); // for status datalist

        // other reports from same reporter
        const otherReports = await Report.find(db, { $and: [ { name: report.name }, { _id: { $ne: ObjectId(ctx.params.id) } } ] });
        for (const rpt of otherReports) {
            rpt.reported = dateFormat(rpt._id.getTimestamp(), 'yyyy-mm-dd HH:MM');
        }

        // list of all available tags (for autocomplete input)
        const tagList = await Report.tags(db);

        // convert @mentions & #tags to links, and add various useful properties to comments
        const comments = report.comments.map(c => {
            if (!c.comment) return; // shouldn't happen, but...

            // make links for #tags and @mentions
            let comment = c.comment;
            for (const user of users) comment = comment.replace('@'+user.username, `[@${user.username}](/users/${user.username})`);
            for (const tag of tagList) comment = comment.replace('#'+tag, `[#${tag}](/reports?tag=${tag})`);

            // use appropriate date format for today, this year, older
            let format = 'd mmm yyyy';
            if (new Date(c.on).getFullYear() == new Date().getFullYear()) format = 'd mmm';   // this year
            if (new Date(c.on).toDateString() == new Date().toDateString()) format = 'HH:MM'; // today
            return {
                id:       c.byId + '-' + new Date(c.on).valueOf().toString(36), // commentary id = user id + timestamp
                byId:     c.byId,
                byName:   c.byName,
                on:       c.on,
                onPretty: dateFormat(c.on, format),
                onFull:   dateFormat(c.on, 'd mmm yyyy, HH:MM Z'),
                owner:    c.byId == ctx.state.user._id,
                comment:  MarkdownIt().render(comment),
            };
        });

        // audit trail
        const updates = await Update.getByReport(db, ctx.params.id);

        const y = 1000*60*60*24*365;
        const extra = {
            reportedOnDay:    dateFormat(report.reported, 'd mmm yyyy'),
            reportedOnFull:   dateFormat(report.reported, 'ddd d mmm yyyy HH:MM'),
            reportedOnTz:     dateFormat(report.reported, 'Z'),
            reportedBy:       report.by ? '@'+(await User.get(report.by)).username : report.name,
            reportHtml:       jsObjectToRichHtml(report.submitted,['Anonymous id','files']), // submitted incident report
            geocodeHtml:      jsObjectToHtml(report.geocode),
            formattedAddress: encodeURIComponent(report.geocode.formattedAddress),
            lat:              report.geocode ? report.geocode.latitude  : null,
            lng:              report.geocode ? report.geocode.longitude : null,
            highlight:        Math.max(Math.round(100 * (report._id.getTimestamp() - new Date() + y) / y), 0),
            comments:         comments,
            users:            users,                  // for select
            statuses:         statuses,               // for datalist
            otherReports:     otherReports,
            tagList:          tagList,                // for autocomplete datalist
            files:            report.submitted.files, // for tabs
            updates:          updates,
            exportPdf:        ctx.request.href.replace('/reports', '/reports/export-pdf'),
            submittedDesc:    truncate(report.submitted['Description'],70) || `<i title="submitted description" class="grey">No Description</i>`
        };
        extra.reportDescription = report.summary
            ? `Report: ‘${report.summary}’, ${extra.reportedOnDay}`
            : `Report by ${extra.reportedBy}, ${extra.reportedOnDay}`;

        // uploaded files
        if (report.analysis.files) {
            const incidentLocn = new LatLon(report.geocode.latitude, report.geocode.longitude);
            const incidentTime = new Date(report.submitted.Date);
            const submissionTime = report._id.getTimestamp();
            for (const file of report.analysis.files) {
                file.isImage = file.type.slice(0, 5) == 'image';
                if (file.exif && incidentLocn.lat && incidentLocn.lon) {
                    const d = incidentLocn.distanceTo(new LatLon(file.exif.GPSLatitude, file.exif.GPSLongitude));
                    file.distance = d > 1e3 ? Number(d.toPrecision(2)) / 1e3 + ' km' : Number(d.toPrecision(2)) + ' metres';
                    file.bearing = incidentLocn.bearingTo(new LatLon(file.exif.GPSLatitude, file.exif.GPSLongitude));
                    file.direction = Dms.compassPoint(file.bearing);
                }
                if (file.exif && file.exif.CreateDate) {
                    const date = file.exif.CreateDate;
                    file.time = new Date(Date.UTC(date.year, date.month-1, date.day, date.hour, date.minute - date.tzoffsetMinutes)); // TODO: exif tz?
                    if (file.time) file.timeDesc = !isNaN(incidentTime)
                        ? moment(file.time).from(incidentTime)+' from incident'
                        : moment(file.time).from(submissionTime)+' from submission';
                }
            }
        }

        await ctx.render('reports-view', Object.assign(report, extra));
        Report.flagView(db, ctx.params.id, ctx.state.user.id);
    }


    /**
     * GET /reports/:id/edit - Render edit-report page. TODO: unused?
     */
    static async edit(ctx) {
        const db = ctx.state.user.db;

        // report details
        const report = await Report.get(db, ctx.params.id);
        if (!report) ctx.throw(404, 'Report not found');
        if (ctx.flash.formdata) Object.assign(report, ctx.flash.formdata); // failed validation? fill in previous values

        await ctx.render('reports-edit', report);
        Report.flagView(db, ctx.params.id, ctx.state.user.id);
    }


    /**
     * GET /reports/:id/delete - Render delete-report page.
     */
    static async delete(ctx) {
        const db = ctx.state.user.db;

        const report = await Report.get(db, ctx.params.id);
        if (!report) ctx.throw(404, 'Report not found');

        await ctx.render('reports-delete', report);
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* POST processing                                                                            */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /reports/:id - Process report update summary / assigned-to / status / etc
     */
    static async processView(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.redirect('/login'+ctx.url);
        const db = ctx.state.user.db;

        try {
            if (ctx.request.body.summary !== undefined) {
                await Report.update(db, ctx.params.id, { summary: ctx.request.body.summary }, ctx.state.user.id);
            }

            if (ctx.request.body['assigned-to'] !== undefined) {
                const assignedTo = ctx.request.body['assigned-to']==null ? null : ObjectId(ctx.request.body['assigned-to']);
                await Report.update(db, ctx.params.id, { assignedTo }, ctx.state.user.id);
            }

            if (ctx.request.body.status !== undefined) {
                if (ctx.request.body.status == '*') throw new Error('Cannot use ‘*’ for status');
                await Report.update(db, ctx.params.id, { status: ctx.request.body.status }, ctx.state.user.id);
            }

            if (ctx.request.body.archived !== undefined) {
                await Report.update(db, ctx.params.id, { archived: ctx.request.body.archived=='y' }, ctx.state.user.id);
            }

            // remain on same page
            ctx.redirect(ctx.url);

        } catch (e) {
            // stay on same page to report error (with current filled fields)
            ctx.flash = { formdata: ctx.request.body, _error: e.message };
            ctx.redirect(ctx.url);
        }
    }


    /**
     * POST /reports/:id/edit - Process edit-report
     */
    static async processEdit(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.redirect('/login'+ctx.url);
        const db = ctx.state.user.db;

        // update report details
        if ('firstname' in ctx.request.body) {
            try {

                ctx.request.body.Active = ctx.request.body.Active ? true : false;

                await Report.update(db, ctx.params.id, ctx.request.body, ctx.state.user.id);

                // return to list of reports
                ctx.redirect('/reports');

            } catch (e) {
                // stay on same page to report error (with current filled fields)
                ctx.flash = { formdata: ctx.request.body, _error: e.message };
                ctx.redirect(ctx.url);
            }
        }
    }


    /**
     * POST /reports/:id/delete - Process delete report
     */
    static async processDelete(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.redirect('/login'+ctx.url);
        const db = ctx.state.user.db;

        try {

            await Report.delete(db, ctx.params.id);

            // return to list of reports
            ctx.redirect('/reports');

        } catch (e) {
            // go to reports list to report error (there is no GET /reports/:id/delete)
            ctx.flash = { _error: e.message };
            ctx.redirect('/reports');
        }
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * GET /ajax/reports/within/:s,:w\::n,:e - List of reports within given SW/NE bounds.
     */
    static async ajaxReportsWithin(ctx) {
        const db = ctx.state.user.db;

        try {
            const bounds = { s: Number(ctx.params.s), w: Number(ctx.params.w), n: Number(ctx.params.n), e: Number(ctx.params.e) };
            const coords = [ [ [ bounds.w, bounds.s ], [ bounds.w, bounds.n ], [ bounds.e, bounds.n ], [ bounds.e, bounds.s ], [ bounds.w, bounds.s ] ] ];
            const query = { location: { $geoWithin: { $geometry: { type: 'Polygon', coordinates: coords } } } };
            const reports = await Report.find(db, query);
            const y = 1000*60*60*24*365;
            for (const report of reports) {
                report.lat = report.location.coordinates[1];
                report.lng = report.location.coordinates[0];
                report.reported = dateFormat(report._id.getTimestamp(), 'd mmm yyyy');
                report.highlight = Math.round(100 * (report._id.getTimestamp() - new Date() + y) / y);
            }
            ctx.status = 200;
            ctx.body = { reports };
        } catch (e) {
            ctx.status = 500;
            ctx.body = e;
        }
        ctx.body.root = 'reports';
    }


    /**
     * POST /ajax/reports/:id/tags - Add tag to report.
     */
    static async ajaxReportPostTag(ctx) {
        const db = ctx.state.user.db;

        try {
            await Report.insertTag(db, ctx.params.id, ctx.request.body.tag, ctx.state.user.id);
            ctx.status = 201;
            ctx.body = {};
        } catch (e) {
            ctx.status = 500;
            ctx.body = e;
        }
        ctx.body.root = 'reports';
    }


    /**
     * DELETE /ajax/reports/:id/tags/:tag - Delete tag from report.
     */
    static async ajaxReportDeleteTag(ctx) {
        const db = ctx.state.user.db;

        try {
            await Report.deleteTag(db, ctx.params.id, ctx.params.tag, ctx.state.user.id);
            ctx.status = 201;
            ctx.body = {};
        } catch (e) {
            ctx.status = 500;
            ctx.body = e;
        }
        ctx.body.root = 'reports';
    }


    /**
     * POST /ajax/reports/:report/comments - Add comment to report.
     */
    static async ajaxReportPostComment(ctx) {
        // qv similar code in reports.js / viewCommentary()
        const db = ctx.state.user.db;

        if (!ctx.request.body.comment) { ctx.status = 403; return; } // Forbidden

        try {
            const timestamp = new Date();
            await Report.insertComment(db, ctx.params.report, ctx.request.body.comment, ctx.state.user.id);

            // make links for #tags and @mentions
            const users = await User.getAll();
            const tagList = await Report.tags(db);
            let comment = ctx.request.body.comment;
            for (const user of users) comment = comment.replace('@'+user.username, `[@${user.username}](/users/${user.username})`);
            for (const tag of tagList) comment = comment.replace('#'+tag, `[#${tag}](/reports?tag=${tag})`);

            const body = {
                id:       ctx.request.body.userid + '-' + timestamp.valueOf().toString(36), // commentary id = user id + timestamp
                byId:     ctx.request.body.userid,
                byName:   ctx.request.body.username,
                on:       timestamp.toISOString(),
                onPretty: dateFormat(timestamp, 'HH:MM'),
                onFull:   dateFormat(timestamp, 'd mmm yyyy, HH:MM Z'),
                comment:  MarkdownIt().render(comment),
            };
            ctx.status = 201;
            ctx.body = body;
        } catch (e) {
            console.error(e);
            ctx.status = 500;
            ctx.body = { message: e.message };
        }
        ctx.body.root = 'reports';
    }


    /**
     * DELETE /ajax/reports/:report/comments/:comment - Delete comment from report.
     *
     * Comment is identified by id of user making comment, and timestamp of comment in base 36.
     */
    static async ajaxReportDeleteComment(ctx) {
        const db = ctx.state.user.db;
        const [ by, onBase36 ] = ctx.params.comment.split('-');
        const on = new Date(parseInt(onBase36, 36));

        try {
            await Report.deleteComment(db, ctx.params.report, ObjectId(by), on, ctx.state.user.id);
            ctx.status = 200;
            ctx.body = {};
        } catch (e) {
            ctx.status = 500;
            ctx.body = { message: e.message };
        }
        ctx.body.root = 'reports';
    }


    /**
     * DELETE /ajax/reports/update/:id - Delete audit trail update records for given report.
     *
     * This is just for testing purposes.
     */
    static async ajaxReportDeleteUpdates(ctx) {
        const db = ctx.state.user.db;

        try {
            await Update.deleteForReport(db, ctx.params.id);
            ctx.status = 200;
            ctx.body = {};
        } catch (e) {
            ctx.status = 500;
            ctx.body = { message: e.message };
        }
        ctx.body.root = 'reports';
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


/**
 * Format supplied date as hh:mm if it is today, or d mmm yyyy otherwise.
 *
 * @param {Date} date - Date to be formatted.
 * @returns {string} Formatted date.
 *
 * TODO: timezone?
 */
function prettyDate(date) {
    // use appropriate date format for today, this year, older
    let format = 'd mmm yyyy';                                                        // before this year
    if (new Date(date).getFullYear() == new Date().getFullYear()) format = 'd mmm';   // this year
    if (new Date(date).toDateString() == new Date().toDateString()) format = 'HH:MM'; // today
    return dateFormat(date, format);
}


/**
 * Converts date to period-ago relative to now (approximates months and years).
 *
 * @param {Date|string} date - Date interval is to be given for.
 * @param {boolean}     short - Short format (just 1st letter of period).
 * @returns {string} Description of interval between date and now.
 */
function ago(date, short=false) {
    const duration = {
        year:  1000 * 60 * 60 * 24 * 365,
        month: 1000 * 60 * 60 * 24 * 30,
        week:  1000 * 60 * 60 * 24 * 7,
        day:   1000 * 60 * 60 * 24,
        hour:  1000 * 60 * 60,
        min:   1000 * 60,
        sec:   1000,
    };

    const interval = Date.now() - new Date(date).valueOf();

    for (const period in duration) {
        if (interval > duration[period]) {
            const n = Math.floor(interval / (duration[period]));
            return short ? n + period.slice(0,1) : n + ' ' + period + (n>1 ? 's' : '') + ' ago';
        }
    }

    return 'now';
}


/**
 * Geocoded fields with lowest-level distinct values within the report set.
 *
 * There may be more than one: if all level2long values are the same, best address may be in either
 * streetName or extra.establishment.
 *
 * @param {Object[]} reports - Array of reports to be examined.
 * @returns {string[]} Candidate geocoded fields to give distinct values.
 */
function lowestDistinctGeographicLevel(reports) {
    const adminLevels = reports.map(r => r.geocode.administrativeLevels);

    // level 2 addresses identical? use streetName or establishment, whichever is available
    const l2 = [ ...new Set(adminLevels.map(al => al ? al.level2long : undefined)) ].filter(l2 => l2 != undefined);
    if (l2.length == 1) return [ 'geocode.streetName', 'geocode.extra.establishment' ];

    // level 1 addresses identical? use level 2
    const l1 = [ ...new Set(adminLevels.map(al => al ? al.level1long : undefined)) ].filter(l1 => l1 != undefined);
    if (l1.length == 1) return [ 'geocode.administrativeLevels.level2long' ];

    // countries identical? use level 1
    const countries = [ ...new Set(reports.map(r => r.geocode.country)) ].filter(c => c != undefined);
    if (countries.length == 1) return [ 'geocode.administrativeLevels.level1long' ];

    // reports from more than one country!
    return [ 'geocode.country' ];
}


/**
 * Truncate string
 *
 * @param {string} string - String to be truncated
 * @param {number} limit - limit
 * @returns {string} Formatted string.
 *
 */

function truncate(string, limit){
   if ((typeof string === 'undefined') || (string === null))
      return false
   if (string.length > limit)
      return string.substring(0,limit)+'...';
   else
      return string;
};

module.exports = ReportsHandlers;
