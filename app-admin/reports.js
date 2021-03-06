/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Reports handlers - manage reports workflow including dashboard, searching/filtering, editing   */
/* metadata, etc.                                                             C.Veness 2017-2018  */
/*                                                                                                */
/* GET functions render template pages; POST functions process post requests then redirect.       */
/*                                                                                                */
/* Ajax functions set body & status, and should not throw (as that would  invoke the generic      */
/* admin exception handler which would return an html page).                                      */
/*                                                                                                */
/*                                  © 2017-2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import dateFormat         from 'dateformat';  // Steven Levithan's dateFormat()
import MarkdownIt         from 'markdown-it'; // markdown parser
import XLSX               from 'xlsx';        // parser and writer for various spreadsheet formats
import pdf                from 'html-pdf';    // HTML to PDF converter
import fs           from 'fs-extra';    // fs with extra functions & promise interface
import handlebars         from 'handlebars';  // logicless templating language
import moment             from 'moment';      // date library for manipulating dates
import { ObjectId }                       from 'mongodb';     // MongoDB driver for Node.js
import { LatLonSpherical as LatLon, Dms } from 'geodesy';     // library of geodesy functions

import Report from '../models/report.js';
import User   from '../models/user.js';
import Update from '../models/update.js';
import Group  from '../models/group.js';

import jsObjectToHtml from '../lib/js-object-to-html';
import Geocoder       from '../lib/geocode';
import Weather        from '../lib/weather';
import Log            from '../lib/log';
import Notification   from '../models/notification';


class ReportsHandlers {


    static async getReportsForGroups(db, groups) {
        let ret = await Group.getReports(db, new ObjectId(groups[0]));
        for (let i = 1; i < groups.length; i++) {
            const reports = await Group.getReports(db, new ObjectId(groups[i]));
            ret = ret.filter(value => String(reports).indexOf(String(value)) !== -1);
        }
        return ret;
    }


    static async getFilteredReports(db, query) {
        const { filter, filterDesc, oldest, latest  } = await ReportsHandlers.buildFilter(db, query);
        let rpts = await Report.find(db, filter.length==0 ? {} : { $and: filter });
        if (query.group) {
            if (!Array.isArray(query.group)) {
                query.group = [ query.group ];
            }
            const reports = await ReportsHandlers.getReportsForGroups(db, query.group);
            rpts = rpts.filter(value => String(reports).indexOf(String(value._id)) !== -1);
        }
        return { rpts, filterDesc, oldest, latest };
    }


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
        const { rpts, filterDesc, oldest, latest } = await ReportsHandlers.getFilteredReports(db, ctx.request.query);
        // indicate when filters applied in page title
        const title = 'Reports list' + (filterDesc.size>0 ? ` (filtered by ${[ ...filterDesc ].join(', ')})` : '');

        // get list of users (indexed by id) for use in translating id's to usernames
        const users = await User.details(); // note users is a Map

        // geocoded location field or fields to use
        const lowestCommonLevel = lowestCommonGeographicLevel(rpts);

        const reports = [];
        for (const rpt of rpts) {
            const lastUpdate = await Update.lastForReport(db, rpt._id);
            const lastViewed = rpt.views[ctx.state.user.id];

            if (rpt.location.geocode && Object.keys(rpt.location.geocode).length > 0) {
                rpt.locn = findBestLocnBelow(lowestCommonLevel, rpt);
            } else {
                rpt.locn = '—';
            }
            for (let t=0; t<rpt.tags.length; t++) { // style tags in cartouches
                rpt.tags.splice(t, 1, `<span class="tag" title="filter by tag=‘${rpt.tags[t]}’">${rpt.tags[t]}</span>`);
            }
            if (rpt.tags.length > 2) { // limit displayed tags to 2
                rpt.tags.splice(2, rpt.tags.length, `<span class="nowrap">+${rpt.tags.length-2} more...</span>`);
            }

            const desc = rpt.submitted['Description'] || rpt.submitted['brief-description']; // TODO: transition code until all early test report are deleted
            const assignedTo = rpt.assignedTo ? users.get(rpt.assignedTo.toString()) : null;
            const notAssigned = '<i class="pale-grey">Not assigned</i>';
            const assignedMissing = '<span title="assignee no longer available">??</span>';
            const assignedToText = rpt.assignedTo==null ? notAssigned : assignedTo==undefined ? assignedMissing : '@'+assignedTo.username;
            const fields = {
                _id:             rpt._id,
                updatedOn:       lastUpdate.on ? lastUpdate.on.toISOString().replace('T', ' ').replace('.000Z', '') : '',
                updatedOnPretty: lastUpdate.on ? prettyDate(lastUpdate.on.toDateString()) : '',
                updatedAge:      lastUpdate.on ? new Date() - new Date(lastUpdate.on).valueOf() : 0, // for sorting
                updatedAgo:      lastUpdate.on ? 'Updated ' + ago(lastUpdate.on) : '',
                viewed:          !!lastViewed,
                updatedBy:       lastUpdate.by,
                assignedTo:      assignedToText, // note equivalent logic in ajaxReportsWithin()
                status:          rpt.status ||  '<i class="pale-grey">None</i>',
                summary:         rpt.summary || `<span title="submitted description">${desc}</span>`,
                submittedDesc:   truncate(desc, 140)|| `<i title="submitted description" class="pale-grey">No Description</i>`, // eslint-disable-line quotes
                tags:            rpt.tags,
                reportedOnDay:   prettyDate(rpt._id.getTimestamp()),
                reportedOnFull:  dateFormat(rpt._id.getTimestamp(), 'ddd d mmm yyyy HH:MM'),
                reportedBy:      rpt.by ? 'by @'+users.get(rpt.by.toString()).username : '',
                locn:            rpt.locn,
                alias:           rpt.alias,
                comments:        rpt.comments,
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
            case 'from':      sort.field = 'alias';       sort.asc = -1; break;
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
            exportXls:   ctx.request.href.replace('/reports', '/reports/export-xls'),
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
        const { rpts, filterDesc } = await ReportsHandlers.getFilteredReports(db, ctx.request.query);

        // indicate when filters applied in page title
        const title = 'Reports map' + (filterDesc.size>0 ? ` (filtered by ${[ ...filterDesc ].join(', ')})` : '');


        // get list of users (indexed by id) for use in translating id's to usernames
        const users = await User.details(); // note users is a Map

        const reports = [];
        const y = 1000*60*60*24*365; // one year
        for (const rpt of rpts) {
            if (!rpt.location.geocode) continue;
            if (Object.keys(rpt.location.geocode).length == 0) continue;
            const assignedTo = rpt.assignedTo ? users.get(rpt.assignedTo.toString()) : null;
            const fields = {
                _id:        rpt._id,
                summary:    rpt.summary || '', // ensure summary is string
                lat:        rpt.location.geocode.latitude || NaN,
                lon:        rpt.location.geocode.longitude || NaN,
                assignedTo: assignedTo ? assignedTo.username : '—',
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
        // const maxReportsByWeek = Math.max(...Object.values(reportsByWeek)) + 1; // TODO

        // show number of reports in results
        const count = reports.length == 0
            ? 'No reports matching specified search'
            : reports.length == 1 ? '1 report' : reports.length+' reports';

        const context = {
            reports:         reports,
            title:           title,             // page title indicating filtering
            reportsByDay:    reportsByDay,      // for time-based chart
            maxReportsByDay: maxReportsByDay,   // for chart gridlines
            exportXls:       ctx.request.href.replace('/reports', '/reports/export-xls'),
            count:           count,
        };
        await ctx.render('reports-map', context);
    }


    static getAllQuestions(rpts) {
        const questions = new Set();
        for (let i = 0; i < rpts.length; i++) {
            for (const question in rpts[i].submitted) {
                questions.add(question);
            }
        }
        return questions;
    }


    static exportUngroupedXls(rpts) {
        const questions = ReportsHandlers.getAllQuestions(rpts);
        return [ ...questions ];
    }


    /**
     * GET /reports/export-xls - download XLS spreadsheet file of current list of reports.
     */
    static async exportXls(ctx) {
        const db = ctx.state.user.db;

        // ---- filtering
        const { rpts, filterDesc } = await ReportsHandlers.getFilteredReports(db, ctx.request.query);

        // get list of users (indexed by id) for use in translating id's to usernames
        const users = await User.details(); // note users is a Map

        // get list of distinct report questions - each group of distinct questions will go in a separate worksheet
        const questions = db.startsWith('everyday-racism') ? ReportsHandlers.exportUngroupedXls(rpts) : distinctQuestions(rpts);

        // sort reports in reverse chronological order (to match main list default) - this will put
        // more recent reports at the top of each worksheet, and more recent worksheets at the start
        // of the list of sheets
        rpts.sort((a, b) => a._id.getTimestamp() < b._id.getTimestamp() ? 1 : -1);


        // perform various mappings to prettify the listings - reports is an associative array
        // indexed by project, each project being an associative array indexed by 'group' which is
        // the report questions; each group will be a worksheet in the workbook, and the 'project'
        // index is used to generate the worksheet name
        const reports = {};
        for (const rpt of rpts) {
            const lastUpdate = await Update.lastForReport(db, rpt._id);
            const assignedTo = rpt.assignedTo ? users.get(rpt.assignedTo.toString()) : null;
            // rpt.submitted.Happened may be undefined, null, a date, or a description; if it's a date,
            // format will depend on whether time was recorded or not (midnight is assumed to be no time)
            const isDate = !isNaN(rpt.submitted.Happened) && rpt.submitted.Happened!=null;
            const dateFmt = dateFormat(isDate ? rpt.submitted.Happened : null, 'HH:MM:ss:l') == '00:00:00:000' ? 'd mmm yyyy' : 'd mmm yyyy HH:MM';
            const incidentDate = isDate ? dateFormat(rpt.submitted.Happened, dateFmt) : rpt.submitted.Happened;
            const fields = {
                'project':       rpt.project,
                'alias':         rpt.alias,
                'incident date': rpt.submitted.Happened ? incidentDate : '',
                'reported on':   rpt._id.getTimestamp(),
                'reported by':   rpt.by ? (await User.get(rpt.by)).username : '',
                'assigned to':   assignedTo ? assignedTo.username : '', // replace 'assignedTo' ObjectId with username
                'status':        rpt.status,
                'tags':          rpt.tags.join(', '),
                'updated on':    lastUpdate.on,
                'updated by':    lastUpdate.by,
                'active?':       rpt.archived ? 'archived' : 'active',
                'url':           ctx.request.origin + '/reports/'+rpt._id,
            };
            // get the questions in this report from the object keys (using wacky ␝/␟ separator
            // characters as an easy guarantee they won't be included in question texts)
            const rptQuestions = rpt.project+'␝'+Object.keys(rpt.submitted).join('␟');
            // a 'group' is reports with the same questions (including partial submissions)
            const group = questions.find(el => el.startsWith((rptQuestions)));
            // add this report to the relevant group (with a blank column to separate metadata from submitted report)
            if (!reports[rpt.project]) reports[rpt.project] = {};
            if (!reports[rpt.project][group]) reports[rpt.project][group] = [];
            reports[rpt.project][group].push(Object.assign(fields, { '—': '' }, rpt.submitted));
        }

        // create spreadsheet workbook from reports
        const wb = XLSX.utils.book_new();
        for (const project in reports) {
            let wsNumber = 1;
            for (const group in reports[project]) {
                const ws = XLSX.utils.json_to_sheet(reports[project][group]);
                XLSX.utils.book_append_sheet(wb, ws, `${project} – ${wsNumber}`);
                wsNumber++;
            }
        }

        const filenameFilter = filterDesc.size>0 ? `(filtered by ${[ ...filterDesc ].join(', ')}) ` : '';
        const timestamp = dateFormat('yyyy-mm-dd HH:MM');
        const filename = `the whistle ${ctx.state.user.db} incident reports ${filenameFilter}${timestamp.replace(':', '.')}.xls`;
        ctx.response.body = XLSX.write(wb, { type: 'buffer', bookType: 'biff8' });
        ctx.response.set('X-Timestamp', timestamp); // for integration tests
        ctx.response.attachment(filename);
        // ------------

        // return list of permutations of answered questions
        function distinctQuestions(rptsList) {
            const qstns = new Set();

            // build set of distinct questions: use wacky ␝ unit separator / ␟ group separator
            // characters as an easy guarantee they won't be included in question texts
            for (const rpt of rptsList) {
                qstns.add(rpt.project+'␝'+Object.keys(rpt.submitted).join('␟'));
            }

            // eliminate question sets which are subsets of others (i.e. uncompleted reports)
            for (const q of qstns.values()) {
                for (const r of qstns.values()) {
                    if (q.startsWith(r) && q!=r) qstns.delete(r);
                }
            }

            return [ ...qstns ].sort(); // convert set to array and sort it
        }
    }


    /**
     * GET /reports/export-pdf - download PDF file of current list of reports.
     */
    static async exportPdf(ctx) {
        const db = ctx.state.user.db;

        // ---- filtering
        const { rpts, filterDesc } = await ReportsHandlers.getFilteredReports(db, ctx.request.query);

        // get list of users (indexed by id) for use in translating id's to usernames
        const users = await User.details(); // note users is a Map

        // geocoded location field or fields to use
        const lowestCommonLevel = lowestCommonGeographicLevel(rpts);

        const reports = [];
        for (const rpt of rpts) {
            const lastUpdate = await Update.lastForReport(db, rpt._id);
            if (rpt.location.geocode && Object.keys(rpt.location.geocode).length > 0) {
                rpt.locn = findBestLocnBelow(lowestCommonLevel, rpt);
            } else {
                rpt.locn = '—';
            }
            for (let t=0; t<rpt.tags.length; t++) { // style tags in cartouches
                rpt.tags.splice(t, 1, `<span class="tag">${rpt.tags[t]}</span>`);
            }
            for (const comment of rpt.comments) {
                comment.onDate = dateFormat(comment.on, 'd mmm yyyy');
                comment.onTime = dateFormat(comment.on, 'HH:MM');
                comment.comment = comment.comment ? MarkdownIt().render(comment.comment) : null;
            }
            const assignedTo = rpt.assignedTo ? users.get(rpt.assignedTo.toString()) : null;
            const fields = {
                _id:           rpt._id,
                reportHtml:    jsObjectToHtml.usingTable(rpt.submitted),
                updatedDate:   lastUpdate.on ? dateFormat(lastUpdate.on, 'd mmm yyyy') : '—',
                updatedTime:   lastUpdate.on ? dateFormat(lastUpdate.on, 'HH:MM') : '',
                updatedBy:     lastUpdate.by ? '@'+lastUpdate.by : '',
                assignedTo:    assignedTo ? assignedTo.username : '—', // replace 'assignedTo' ObjectId with username
                status:        rpt.status,
                summary:       rpt.summary,
                summaryQuoted: rpt.summary ? `‘${rpt.summary}’` : '',
                tags:          rpt.tags,
                reportedDate:  dateFormat(rpt._id.getTimestamp(), 'd mmm yyyy'),
                reportedTime:  dateFormat(rpt._id.getTimestamp(), 'HH:MM'),
                reportedBy:    rpt.by ? '@'+(await User.get(rpt.by)).username : rpt.alias,
                locn:          rpt.locn,
                alias:         rpt.alias,
                comments:      rpt.comments,
                geocode:       rpt.location.geocode,
                url:           ctx.request.origin + '/reports/'+rpt._id,
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
                for (const f of ctx.request.query[q]) filters.push(q.slice(0, 6)=='field:' ? `field <i>${q.slice(6)}</i>: ${f}` : `${q}: ${f}`);
            } else {
                filters.push(q.slice(0, 6)=='field:' ? `field <i>${q.slice(6)}</i>: ${ctx.request.query[q]}` : `${q}: ${ctx.request.query[q]}`);
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
        const filenameFilter = filterDesc.size>0 ? ` (filtered by ${[ ...filterDesc ].join(', ')}) ` : '';
        const timestamp = dateFormat('yyyy-mm-dd HH:MM');
        const filename = `the whistle incident reports ${filenameFilter}${timestamp.replace(':', '.')}.pdf`;
        ctx.response.status = 200;
        ctx.response.body = await reportsPdf.toBufferPromise();
        ctx.response.set('X-Timestamp', timestamp); // for integration tests
        ctx.response.attachment(filename);
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
        const assignedTo = rpt.assignedTo ? users.get(rpt.assignedTo.toString()) : null;
        const fields = { // as per exportPdf()
            _id:           rpt._id,
            reportHtml:    jsObjectToHtml.usingTable(rpt.submitted),
            updatedDate:   lastUpdate.on ? dateFormat(lastUpdate.on, 'd mmm yyyy') : '—',
            updatedTime:   lastUpdate.on ? dateFormat(lastUpdate.on, 'HH:MM') : '',
            updatedBy:     lastUpdate.by ? '@'+lastUpdate.by : '',
            assignedTo:    assignedTo ? assignedTo.username : '—', // replace 'assignedTo' ObjectId with username
            status:        rpt.status,
            summaryQuoted: rpt.summary ? `‘${rpt.summary}’` : '',
            tags:          rpt.tags,
            reportedDate:  dateFormat(rpt._id.getTimestamp(), 'd mmm yyyy'),
            reportedTime:  dateFormat(rpt._id.getTimestamp(), 'HH:MM'),
            reportedBy:    rpt.by ? '@'+(await User.get(rpt.by)).username : '',
            comments:      rpt.comments,
            geocode:       rpt.location.geocode,
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
        const timestamp = dateFormat('yyyy-mm-dd HH:MM');
        const filename = `the whistle incident report ${timestamp.replace(':', '.')}.pdf`;
        ctx.response.status = 200;
        ctx.response.body = await reportsPdf.toBufferPromise();
        ctx.response.set('X-Timestamp', timestamp); // for integration tests
        ctx.response.attachment(filename);
    }


    /**
     * Build arrays representing filter selection options.
     *
     * These arrays are used to create the drop-down lists on the reports-list filter options.
     *
     * @param   {string} db - Reports database to use.
     * @param   {Object} ctx - Koa context.
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

        const groups = await Group.getAll(db);
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

        return { activeAlt, activeNow, projects, assignees, statuses, tags, groups, fields };
    }


    /**
     * Constructs MongoDB filter query object from query-string filter spec.
     *
     * This takes query-string arguments and builds MongoDB filter object to use in database querying.
     *
     * Possible filters are:
     *  - description: report.submitted.Description contains argument
     *  - active:      report.archived false/true/either for argument active/archived/all
     *  - project:     report.project equals argument
     *  - updated:     ??
     *  - submitted:   report._id between given dates
     *  - assigned:    report.assignedTo = id of username given as argument
     *  - status:      report.status equals argument
     *  - tags:        report.tags array includes argument
     *  - groups:      group (corresponding to argument) contains report._id in its reportId field
     *  - field:       identified field within report.submitted object includes argument
     *
     * @param   {string} db - Reports database to use.
     * @param   {string} q - Request query string.
     * @returns { filter: Object[], filterDesc: Set, oldest: string, latest: string }
     */
    static async buildFilter(db, q) {
        const filter = [];
        const filterDesc = new Set();

        for (const arg in q) { // trap ?qry=a&qry=b, which will return an array
            if ([ 'tag', 'summary', 'group' ].includes(arg)) continue; // multiple filters for tag, summary and group are allowed & catered for
            if (Array.isArray(q[arg])) [ q[arg] ] = q[arg].slice(-1); // if query key multiply defined, use the last one
            if (typeof q[arg] != 'string') throw new Error(`query string argument ${arg} is not a string`); // !!
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

        // description filtering (a bit like field filter but just for Description)
        if (q.description) {
            const fld = 'submitted.Description';
            const val = q.description || '.+';
            filter.push({ [fld]: { $regex: val, $options: 'i' } });
            filterDesc.add('description');
        }

        // assigned filtering: filter by assignee username - if there is no assigned query argument,
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

        // summary filtering: filter by reports which include query argument within summary field [not currently used]
        //if (q.summary) {
        //    if (Array.isArray(q.summary)) {
        //        for (const s of q.summary) filter.push({ ['summary']: new RegExp(`.*${s}.*`, 'i') });
        //    } else {
        //        filter.push({ ['summary']: new RegExp(`.*${q.summary}.*`, 'i') });
        //    }
        //    filterDesc.add('summary');
        //}

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
        const reportId = ctx.params.id;

        // report details
        const report = await Report.get(db, reportId);
        if (!report) ctx.throw(404, 'Report not found');

        report.reported = dateFormat(report._id.getTimestamp(), 'yyyy-mm-dd HH:MM');
        report.archived = report.archived ? 'y' : 'n';
        report.country =  report.country? report.country.replace('GB', 'UK') : report.country;

        const users = await User.getAll(); // for assigned-to select
        users.sort((a, b) => { a = (a.firstname+a.lastname).toLowerCase(); b = (b.firstname+b.lastname).toLowerCase(); return a < b ? -1 : 1; });

        const statuses = await Report.statuses(db); // for status datalist

        // other reports from same reporter
        const otherReports = await Report.find(db, { $and: [ { alias: report.alias }, { _id: { $ne: ObjectId(reportId) } } ] });
        for (const rpt of otherReports) {
            rpt.reported = dateFormat(rpt._id.getTimestamp(), 'd mmm yyyy HH:MM');
            rpt.desc = truncate(rpt.submitted.Description, 24);
        }

        // list of all available tags (for autocomplete input)
        const tagList = await Report.tags(db);
        const groupList = await Group.getAll(db);
        let selectedGroups = await Group.getReportGroups(db, new ObjectId(reportId));
        selectedGroups = selectedGroups.map(g => g._id);
        // convert @mentions & #tags to links, and add various useful properties to comments
        const comments = report.comments.map(c => {
            if (!c.comment) return; // shouldn't happen, but...

            // make links for #tags...
            let comment = c.comment;
            for (const tag of tagList) comment = comment.replace('#'+tag, `[#${tag}](/reports?tag=${tag})`);
            // ... and convert stored [@mention](id) references to actual links
            const reMention = /\[@([a-z0-9]+)\]\(([0-9a-f]{24})\)/;
            comment = comment.replace(reMention, '[@$1](/users/$2)');
            // (note there is a certain inconsistency here, as non-existent #tags will not be made into
            // links, but invalid @mentions will be turned into 404 links; this is probably the most
            // valid affordance, in fact)

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
                owner:    c.byId == ctx.state.user.id,
                comment:  MarkdownIt().render(comment),
            };
        });

        // audit trail
        const updates = await Update.getByReport(db, reportId);

        const y = 1000*60*60*24*365;
        const desc = report.submitted['Description'] || report.submitted['brief-description']; // TODO: transition code until all early test report are deleted
        const reportedBy = report.by ? await User.get(report.by) : '';
        const extra = {
            reportedOnDay:    dateFormat(report.reported, 'd mmm yyyy'),
            reportedOnTz:     dateFormat(report.reported, 'Z'),
            reportedBy:       report.by ? `${report.alias} / @${reportedBy.username}` : report.alias,
            reportHtml:       jsObjectToHtml.usingTable(report.submitted, [ 'Anonymous id', 'files' ], 'h3'),
            geocodeHtml:      jsObjectToHtml.usingTable(report.location.geocode),
            formattedAddress: report.location.geocode ? encodeURIComponent(report.location.geocode.formattedAddress) : 'report.location.address',
            lat:              report.location.geojson ? report.location.geojson.coordinates[1]  : 0,
            lon:              report.location.geojson ? report.location.geojson.coordinates[0] : 0,
            highlight:        Math.max(Math.round(100 * (report._id.getTimestamp() - new Date() + y) / y), 0),
            comments:         comments,
            location:         report.location,
            users:            users,           // for select
            statuses:         statuses,        // for datalist
            otherReports:     otherReports,
            tagList:          tagList,         // for autocomplete datalist
            groupList:        groupList,
            selectedGroups:   selectedGroups,
            updates:          updates,
            exportPdf:        ctx.request.href.replace('/reports', '/reports/export-pdf'),
            submittedDesc:    truncate(desc, 70) || `<i title="submitted description" class="grey">No Description</i>`, // eslint-disable-line quotes
            showDeleteButton: ctx.app.env != 'production',
            referrer:         ctx.request.headers.referer || '/reports', // for 'back' button
        };
        extra.reportDescription = report.summary
            ? `Report: ‘${report.summary}’, ${extra.reportedOnDay}`
            : `Report by ${extra.reportedBy}, ${extra.reportedOnDay}`;

        // uploaded files
        if (report.files) {
            const incidentLocn = report.location.geocode ? new LatLon(report.location.geocode.latitude, report.location.geocode.longitude) : null;
            const incidentTime = new Date(report.submitted.Date);
            const submissionTime = report._id.getTimestamp();
            for (const file of report.files) {
                // get analysis data
                const [ fileAnalysis ] = report.analysis && report.analysis.files ? report.analysis.files.filter(f => f.exif.name == file.name) : [];
                if (!fileAnalysis) continue;
                // proxy url
                fileAnalysis.url = `/uploaded/${report.project}/${dateFormat(report._id.getTimestamp(), 'yyyy-mm')}/${report._id}/${file.name}`;
                fileAnalysis.isImage = file.type.slice(0, 5) == 'image';
                // exif location
                if (fileAnalysis.exif && incidentLocn) {
                    const d = incidentLocn.distanceTo(new LatLon(fileAnalysis.exif.GPSLatitude, fileAnalysis.exif.GPSLongitude));
                    fileAnalysis.distance = d > 1e3 ? Number(d.toPrecision(2)) / 1e3 + ' km' : Number(d.toPrecision(2)) + ' metres';
                    fileAnalysis.bearing = incidentLocn.bearingTo(new LatLon(fileAnalysis.exif.GPSLatitude, fileAnalysis.exif.GPSLongitude));
                    fileAnalysis.direction = Dms.compassPoint(fileAnalysis.bearing);
                }
                // exif date
                if (fileAnalysis.exif && fileAnalysis.exif.CreateDate) {
                    const date = fileAnalysis.exif.CreateDate;
                    fileAnalysis.time = new Date(Date.UTC(date.year, date.month-1, date.day, date.hour, date.minute - date.tzoffsetMinutes)); // TODO: exif tz?
                    if (fileAnalysis.time) {
                        fileAnalysis.timeDesc = !isNaN(incidentTime)
                            ? moment(fileAnalysis.time).from(incidentTime)+' from incident'
                            : moment(fileAnalysis.time).from(submissionTime)+' from submission';
                    }
                }
                Object.assign(file, fileAnalysis);
            }
        }

        // TODO: ??
        //if (Object.keys(report.location.geocode).length == 0) report.location.geocode = false;

        // dismiss any notifications for this report for current user
        await Notification.dismissForUserReport(db, ctx.state.user.id, reportId);

        try {
            await Report.flagView(db, reportId, ctx.state.user.id);
        } catch (e) {
            ctx.response.status = 500; // force notification e-mail
            // for failed validations, log the report instead of the error stack trace
            await Log.error(ctx, e.message.match(/failed validation/) ? { stack: report } : e);
            extra.error = e.message; // display the error similarly to flash errors
        }
        await ctx.render('reports-view', Object.assign(report, extra));
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* POST processing                                                                            */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * POST /reports/:id - Process report update summary / assigned-to / status / etc
     */
    static async processView(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.response.redirect('/login'+ctx.request.url);
        const db = ctx.state.user.db;
        const reportId = ctx.params.id;

        try {
            if (ctx.request.body.summary !== undefined) {
                await Report.update(db, reportId, { summary: ctx.request.body.summary }, ctx.state.user.id);
            }

            // update assigned-to
            if (ctx.request.body['assigned-to'] !== undefined) {
                const assignedTo = ctx.request.body['assigned-to']==null ? null : ObjectId(ctx.request.body['assigned-to']);
                await Report.update(db, reportId, { assignedTo }, ctx.state.user.id);

                // cancel any current 'new report submitted' notification
                const [ notfcnNewReportSubmitted ] = await Notification.listForReport(db, 'new report submitted', reportId);
                if (notfcnNewReportSubmitted) await Notification.cancel(db, notfcnNewReportSubmitted._id);
                // cancel any current 'report assigned to user' notification
                const [ notfcnReportAssigned ] = await Notification.listForReport(db, 'report assigned to user', reportId);
                if (notfcnReportAssigned) await Notification.dismiss(db, notfcnReportAssigned._id, notfcnReportAssigned.users[0]);

                // create 'report assigned to user' notification (unless self-assigned)
                if (assignedTo != ctx.state.user.id) await Notification.notify(db, 'report assigned to user', assignedTo, reportId);
            }

            // update status
            if (ctx.request.body.status !== undefined) {
                if (ctx.request.body.status == '*') throw new Error('Cannot use ‘*’ for status');
                await Report.update(db, reportId, { status: ctx.request.body.status }, ctx.state.user.id);
            }

            // update archived
            if (ctx.request.body.archived !== undefined) {
                await Report.update(db, reportId, { archived: ctx.request.body.archived=='y' }, ctx.state.user.id);
                // cancel any notifications associated with report
                await Notification.cancelForReport(db, reportId);
            }

            // remain on same page
            ctx.response.redirect(ctx.request.url);

        } catch (e) {
            // stay on same page to report error (with current filled fields)
            ctx.flash = { formdata: ctx.request.body, _error: e.message };
            ctx.response.redirect(ctx.request.url);
        }
    }


    /**
     * POST /reports/:id/delete - Process delete report
     */
    static async processDelete(ctx) {
        if (!ctx.state.user.roles.includes('admin')) return ctx.response.redirect('/login'+ctx.request.url);
        const db = ctx.state.user.db;
        const reportId = ctx.params.id;

        try {

            await Report.delete(db, reportId);

            // cancel any outstanding notifications concerning this report
            await Notification.cancelForReport(db, reportId);

            // return to list of reports
            ctx.response.redirect('/reports');

        } catch (e) {
            // go to reports list to report error (there is no GET /reports/:id/delete)
            ctx.flash = { _error: e.message };
            ctx.response.redirect('/reports');
        }
    }


    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
    /* Ajax functions                                                                             */
    /* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


    /**
     * GET /ajax/reports/latest-timestamp - Timestamp of most recently submitted report (for ajax
     * call to automatically update reports list), as ISO timestamp.
     */
    static async ajaxReportLatestTimestamp(ctx) {
        const db = ctx.state.user.db;

        try {
            const latest = await Report.getLatestTimestamp(db);
            ctx.response.status = 200;
            ctx.response.body = { latest: { timestamp: latest } };
        } catch (e) {
            await Log.error(ctx, e);
            ctx.response.status = 500; // Internal Server Error
            ctx.response.body = e;
        }
        ctx.response.body.root = 'reports';
    }


    /**
     * GET /ajax/reports/within/:s,:w\::n,:e - List of reports within given SW/NE bounds.
     */
    static async ajaxReportsWithin(ctx) {
        const db = ctx.state.user.db;

        try {
            const bounds = { s: Number(ctx.params.s), w: Number(ctx.params.w), n: Number(ctx.params.n), e: Number(ctx.params.e) };
            const coords = [ [ [ bounds.w, bounds.s ], [ bounds.w, bounds.n ], [ bounds.e, bounds.n ], [ bounds.e, bounds.s ], [ bounds.w, bounds.s ] ] ];
            const query = { 'location.geojson': { $geoWithin: { $geometry: { type: 'Polygon', coordinates: coords } } } };
            const reports = await Report.find(db, query);
            const y = 1000*60*60*24*365;
            // get list of users (indexed by id) for use in translating assigned-to id's to usernames
            const users = await User.details(); // note users is a Map
            for (const report of reports) {
                const assignedTo = report.assignedTo ? users.get(report.assignedTo.toString()) : null;
                const notAssigned = 'Not assigned';
                const assignedMissing = 'Assigned to: ??';
                const assignedToText = report.assignedTo==null ? notAssigned : assignedTo==undefined ? assignedMissing : 'Assigned to: '+assignedTo.username;
                report.lat = report.location.geojson.coordinates[1];
                report.lng = report.location.geojson.coordinates[0];
                report.reported = reported(report._id.getTimestamp());
                report.highlight = Math.round(100 * (report._id.getTimestamp() - new Date() + y) / y);
                report.assignedToText = assignedToText; // note equivalent logic in list()
            }
            ctx.response.status = 200;
            ctx.response.body = { reports };
        } catch (e) {
            await Log.error(ctx, e);
            ctx.response.status = 500; // Internal Server Error
            ctx.response.body = e;
        }
        ctx.response.body.root = 'reports';

        // format date according to how far it is in the past: time, weekday, day/month, month/year
        function reported(date) {
            if (dateFormat(date, 'yyyy-mm-dd') == dateFormat('yyyy-mm-dd')) return dateFormat(date, 'HH:MM'); // today
            if ((new Date() - date) < 1000*60*60*24*7)  return dateFormat(date, 'ddd');                       // within past week
            if ((new Date() - date) < 1000*60*60*24*365)  return dateFormat(date, 'd mmm');                   // within past year
            return dateFormat(date, 'mmm yyyy');                                                              // over a year
        }
    }


    /**
     * POST /ajax/reports/:id/tags - Add tag to report.
     */
    static async ajaxReportPostTag(ctx) {
        const db = ctx.state.user.db;

        try {
            await Report.insertTag(db, ctx.params.id, ctx.request.body.tag, ctx.state.user.id);
            ctx.response.status = 201;
            ctx.response.body = {};
        } catch (e) {
            await Log.error(ctx, e);
            ctx.response.status = 500; // Internal Server Error
            ctx.response.body = e;
        }
        ctx.response.body.root = 'reports';
    }


    /**
     * DELETE /ajax/reports/:id/tags/:tag - Delete tag from report.
     */
    static async ajaxReportDeleteTag(ctx) {
        const db = ctx.state.user.db;

        try {
            await Report.deleteTag(db, ctx.params.id, ctx.params.tag, ctx.state.user.id);
            ctx.response.status = 200;
            ctx.response.body = {};
        } catch (e) {
            await Log.error(ctx, e);
            ctx.response.status = 500; // Internal Server Error
            ctx.response.body = e;
        }
        ctx.response.body.root = 'reports';
    }


    /**
     * POST /ajax/reports/:report/comments - Add comment to report.
     */
    static async ajaxReportPostComment(ctx) {
        // qv similar code in reports.js / viewCommentary()
        const db = ctx.state.user.db;
        const reportId = ctx.params.id;

        if (!ctx.request.body.comment) { ctx.response.status = 403; return; } // Forbidden

        // record the comment
        const comment = await Report.insertComment(db, reportId, ctx.request.body.comment, ctx.state.user.id);

        // notify @mentioned users (except current user)
        const mentions = [];
        const users = await User.getAll();
        for (const user of users) {
            if (comment.comment.match(user._id) && user._id!=ctx.state.user.id) mentions.push(user._id);
        }
        if (mentions.length > 0) Notification.notifyMultiple(db, 'user mentioned in comment', mentions, reportId);

        // and notify assignee of report (if not current user)
        const rpt = await Report.get(db, reportId);
        if (rpt.assignedTo && rpt.assignedTo != ctx.state.user.id) {
            Notification.notify(db, 'user’s report received new comment', rpt.assignedTo, reportId);
        }

        // for returned comment, make links for #tags...
        const tagList = await Report.tags(db);
        for (const tag of tagList) comment.comment = comment.comment.replace('#'+tag, `[#${tag}](/reports?tag=${tag})`);

        // ... and convert stored [@mention](id) references to actual links
        const reMention = /\[@([a-z0-9]+)\]\(([0-9a-f]{24})\)/;
        comment.comment = comment.comment.replace(reMention, '[@$1](/users/$2)');
        // (note there is a certain inconsistency here, as non-existent #tags will not be made into
        // links, but invalid @mentions will be turned into 404 links; this is probably the most
        // valid affordance, in fact)

        const body = {
            id:       ctx.request.body.userid + '-' + comment.on.valueOf().toString(36), // commentary id = user id + timestamp
            byId:     ctx.request.body.userid,
            byName:   ctx.request.body.username,
            on:       comment.on.toISOString(),
            onPretty: dateFormat(comment.on, 'HH:MM'),
            onFull:   dateFormat(comment.on, 'd mmm yyyy, HH:MM Z'),
            comment:  MarkdownIt().render(comment.comment), // render any markdown formatting
        };
        ctx.response.status = 201;
        ctx.response.body = body;

        ctx.response.body.root = 'reports';
    }


    /**
     * PUT /ajax/reports/:report/comments - Update comment.
     */
    static async ajaxReportPutComment(ctx) {
        const db = ctx.state.user.db;
        const [ by, onBase36 ] = ctx.params.comment.split('-');
        const on = new Date(parseInt(onBase36, 36));

        if (!ctx.request.body.comment) { ctx.response.status = 403; return; } // Forbidden

        await Report.updateComment(db, ctx.params.id, ObjectId(by), on, ctx.request.body.comment, ctx.state.user.id);

        ctx.response.status = 200;
        ctx.response.body = { comment: ctx.request.body.comment };
        ctx.response.body.root = 'reports';
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

        await Report.deleteComment(db, ctx.params.id, ObjectId(by), on, ctx.state.user.id);

        ctx.response.status = 200;
        ctx.response.body = {};
        ctx.response.body.root = 'reports';
    }


    /**
     * GET /ajax/reports/:id/updates - List audit trail update records for given report.
     *
     * This is just for testing purposes.
     */
    static async ajaxReportGetUpdates(ctx) {
        const db = ctx.state.user.db;

        try {
            const updates = await Update.getByReport(db, ctx.params.id);
            ctx.response.status = 200;
            ctx.response.body = { updates: updates };
        } catch (e) {
            await Log.error(ctx, e);
            ctx.response.status = 500; // Internal Server Error
            ctx.response.body = { message: e.message };
        }
        ctx.response.body.root = 'reports';
    }



    /**
     * PUT /ajax/reports/:report/location - geocode reported incident location.
     *
     * This records the original entered address, the geocoded details, and the GeoJSON index in
     * report.location.{ address, geocode, geojson }. It also sets the weather conditions if the
     * submitted details have a specific date.
     *
     * If geocoding fails, current values are not changed and 404 is returned.
     */
    static async ajaxReportPutLocation(ctx) {
        const db = ctx.state.user.db;
        const address = ctx.request.body.address;
        const reportId = ctx.params.id;

        const geocoded = await Geocoder.geocode(address);

        if (geocoded) {
            // set location
            const geojson = {
                type:        'Point',
                coordinates: [ Number(geocoded.longitude), Number(geocoded.latitude) ],
            };
            const location = { address, geocode: geocoded, geojson };
            await Report.update(db, reportId, { location: location }, ctx.state.user.id);

            // if we have a precise date for the incident, record weather conditions at location & date of incident
            // TODO: remove dependency on project-specific field name 'Happened'!
            const report = await Report.get(db, reportId);
            if (report.submitted.Happened && report.submitted.Happened.getTime) {
                const weather = await Weather.fetchWeatherConditions(geocoded.latitude, geocoded.longitude, report.submitted.Happened);
                await Report.update(db, reportId, { 'analysis.weather': weather }, ctx.state.user.id);
            }

            ctx.response.status = 200; // Ok
            ctx.response.body = { formattedAddress: geocoded.formattedAddress };
            ctx.response.body.root = 'reports';
        } else {
            ctx.response.status = 404; // Not Found
        }
    }



    /**
     * PUT /ajax/reports/:report/latlon - update reported incident latitude/longitude.
     *
     * When the marker representing an incident location is dragged on the map, this will update the
     * report's location.geojson and reverse geocode the location in order to have location.geocode
     * details available.
     */
    static async ajaxReportPutLatLon(ctx) {
        const db = ctx.state.user.db;
        const { lat, lon } = ctx.request.body;

        try {
            const geocoded = await Geocoder.reverse(lat, lon);

            const address = geocoded.formattedAddress;

            const geojson = {
                type:        'Point',
                coordinates: [ Number(lon), Number(lat) ], // note this will normally differ from geocoded lat/lon
            };

            const location = { address, geocode: geocoded, geojson };

            await Report.update(db, ctx.params.id, { location: location }, ctx.state.user.id);

            // note: don't bother re-fetching weather, most likely location won't have changed enough to matter

            ctx.response.status = 200; // Ok
            ctx.response.body = { lat, lon };
            ctx.response.body.root = 'reports';
        } catch (e) {
            await Log.error(ctx, e);
            ctx.response.status = 500; // Internal Server Error
            ctx.response.body = { message: e.message };
        }
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


/**
 * Format supplied date showing just time if it is today, de-emphasing year if it is current year,
 * de-emphasing day/month if older.
 *
 * @param {Date} date - Date to be formatted.
 * @returns {string} Formatted date.
 *
 * TODO: timezone?
 */
function prettyDate(date) {
    // today
    if (new Date(date).toDateString() == new Date().toDateString()) {
        return dateFormat(date, 'HH:MM &#8199;&#8199;&#8199;&#8199;'); // figure spaces to match year spacing
    }

    // this year
    if (new Date(date).getFullYear() == new Date().getFullYear()) {
        return `${dateFormat(date, 'd mmm')} <span style="opacity:0.6">${dateFormat(date, 'yyyy')}</span>`;
    }

    // before this year
    return `<span style="opacity:0.6">${dateFormat(date, 'd mmm')}</span> ${dateFormat(date, 'yyyy')}`;
}


/**
 * Converts date to period-ago relative to now (approximates months and years).
 *
 * @param   {Date|string} date - Date interval is to be given for.
 * @param   {boolean}     [short=false] - Short format (just 1st letter of period).
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
            return short ? n + period.slice(0, 1) : n + ' ' + period + (n>1 ? 's' : '') + ' ago';
        }
    }

    return 'now';
}


/**
 * Geocoded fields with lowest-level distinct values within the report set.
 *
 * The list of reports needs to show the location to the best granularity for the listed set of reports.
 * For a geographically broad list, this might be cities; for a limited list, it might be street names.
 *
 * Google geocoding returns quite variable information; the relevant hierarchy seems to be
 *  - country
 *  - administrativeLevels.level1long
 *  - city
 *  - administrativeLevels.level2long / extra.neighborhood
 *  - streetName
 *  - extra.establishment
 *
 * Various combinations of these seem to be returned. See geocode-tests.js for some examples.
 *
 * @param   {Object[]} reports - Array of reports to be examined.
 * @returns {string} Lowest geographic level which is common to all reports.
 */
function lowestCommonGeographicLevel(reports) {
    const rpts = reports.filter(rpt => rpt.location && rpt.location.geocode && Object.keys(rpt.location.geocode).length > 0); // ignore reports with no geocoding available

    // common street name?
    const street = [ ...new Set(rpts.map(rpt => rpt.location.geocode.streetName ? rpt.location.geocode.streetName : undefined)) ].filter(str => str != undefined);
    if (street.length == 1) return 'streetName';

    // common level2 address?
    const level2 = [ ...new Set(rpts.map(rpt => rpt.location.geocode.administrativeLevels.level2long ? rpt.location.geocode.administrativeLevels.level2long : undefined)) ].filter(l2 => l2 != undefined);
    if (level2.length == 1) return 'level2long';

    // common city?
    const city = [ ...new Set(rpts.map(rpt => rpt.location.geocode.city ? rpt.location.geocode.city : undefined)) ].filter(c => c != undefined);
    if (city.length == 1) return 'city';

    // common level1 address?
    const level1 = [ ...new Set(rpts.map(rpt => rpt.location.geocode.administrativeLevels.level1long ? rpt.location.geocode.administrativeLevels.level1long : undefined)) ].filter(l1 => l1 != undefined);
    if (level1.length == 1) return 'level1long';

    // common country?
    const country = [ ...new Set(rpts.map(rpt => rpt.location.geocode.country ? rpt.location.geocode.country : undefined)) ].filter(c => c != undefined);
    if (country.length == 1) return 'country';

    return ''; // multiple countries!
}


/**
 * Best location below given level for specific report.
 *
 * If available, city is *probably* preferred (TBD) over level1long despite being lower in hierarchy
 * (eg Cambridge vs Cambridgeshire).
 *
 * @param   {string} level - Lowest level with common value, as returned by lowestCommonGeographicLevel().
 * @param   {Object} report - Report location is to be returned for.
 * @returns {string} Value of best location below given level.
 */
function findBestLocnBelow(level, report) {
    switch (level) {
        case '':
            return report.location.geocode.country;
        case 'country':
            if (report.location.geocode.city) return report.location.geocode.city;
            if (report.location.geocode.administrativeLevels.level1long) return report.location.geocode.administrativeLevels.level1long;
            break;
        case 'level1long':
            if (report.location.geocode.city) return report.location.geocode.city;
            if (report.location.geocode.administrativeLevels.level2long) return report.location.geocode.administrativeLevels.level2long;
            if (report.location.geocode.streetName) return report.location.geocode.streetName;
            break;
        case 'city':
            if (report.location.geocode.administrativeLevels.level2long) return report.location.geocode.administrativeLevels.level2long;
            if (report.location.geocode.extra.establishment) return report.location.geocode.extra.establishment;
            if (report.location.geocode.streetName) return report.location.geocode.streetName;
            if (report.location.geocode.extra.neighborhood) return report.location.geocode.extra.neighborhood;
            break;
        case 'level2long':
        case 'extra.neighborhood':
            if (report.location.geocode.streetName) return report.location.geocode.streetName;
            if (report.location.geocode.extra.establishment) return report.location.geocode.extra.establishment;
            break;
        case 'streetName':
            if (report.location.geocode.extra.establishment) return report.location.geocode.extra.establishment;
            return report.location.geocode.streetNumber + ' ' + report.location.geocode.streetName;
    }
    return '!!'; // shouldn't happen!
}


/**
 * If string is longer than given length, truncate it and append ellipsis.
 *
 * @param   {string} string - String to be truncated
 * @param   {number} length - Length to truncate to
 * @returns {string} Formatted string.
 */
function truncate(string, length) {
    if (!string && string!==0) return '';

    const str = String(string);

    if (str.length <= length) return string;

    return str.slice(0, length) + '…';
}

export default ReportsHandlers;
