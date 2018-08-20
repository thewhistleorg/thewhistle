/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Dev tools handlers.                                                        C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import nodeinfo           from 'nodejs-info';         // node info
import dateFormat         from 'dateformat';          // Steven Levithan's dateFormat()
import json2csv           from 'json2csv';            // converts json into csv
import { JSDOM }          from 'jsdom';               // JavaScript implementation of DOM and HTML standards
import fs         from 'fs-extra';            // fs with extra functions & promise interface
import markdown           from 'markdown-it';         // markdown parser
import mda                from 'markdown-it-anchor';  // header anchors for markdown-it
const md = markdown();
md.use(mda);

import UserAgent   from '../models/user-agent.js';
import Report      from '../models/report.js';
import Submission  from '../models/submission.js';
import Db          from '../lib/db.js';
import Ip          from '../lib/ip.js';
import Environment from '../lib/environment';


class Dev {

    /**
     * Information about current Node versions.
     */
    static nodeinfo(ctx) {
        ctx.response.body = nodeinfo(ctx.req);
    }


    /**
     * Heroku dyno metadata.
     */
    static async dyno(ctx) {
        const herokuEnvKeyValArr = Object.entries(process.env).filter(v => v[0].slice(0, 7) == 'HEROKU_');
        const vars = herokuEnvKeyValArr.reduce((acc, val) => { acc[val[0].slice(7).replace(/_/g, '-').toLowerCase()] = val[1]; return acc; }, {});
        await ctx.render('dev-dyno', { vars, created: dateFormat(vars['release-created-at'], 'default') });
    }


    /**
     * Show access log.
     */
    static async logAccess(ctx) {
        // access logging uses capped collection log-access (size: 1000×1e3, max: 1000)
        const log = await Db.collection('users', 'log-access');

        const entriesAll = (await log.find({}).sort({ $natural: -1 }).toArray());

        const dbs = [ ...new Set(entriesAll.map(e => e.db)) ].sort();
        const users = [ ...new Set(entriesAll.map(e => e.user)) ].sort();
        const statuses = [ ...new Set(entriesAll.map(e => e.status)) ].sort();

        // 'from' defaults to later of first entry or 1 month ago
        const oldest = entriesAll.reduce((old, e) => e._id.getTimestamp()<old ? e._id.getTimestamp() : old, new Date());
        const monthAgo = new Date(); monthAgo.setMonth(new Date().getMonth() - 1);
        ctx.request.query.from = ctx.request.query.from || dateFormat(oldest<monthAgo ? monthAgo : oldest, 'yyyy-mm-dd');

        // 'to' defaults to today
        ctx.request.query.to = ctx.request.query.to || dateFormat('yyyy-mm-dd');
        // filter needs 1 day added to 'to' to made it end of the day
        const toFilter = new Date(ctx.request.query.to); toFilter.setDate(toFilter.getDate() + 1);

        // filter results according to query string
        const entriesFiltered = entriesAll
            .filter(e => ctx.request.query.from ? e._id.getTimestamp() >= new Date(ctx.request.query.from) : true)
            .filter(e => ctx.request.query.to ? e._id.getTimestamp() <= toFilter : true)
            .filter(e => ctx.request.query.app ? RegExp('^'+ctx.request.query.app).test(e.host) : true)
            .filter(e => ctx.request.query.organisation ? ctx.request.query.organisation=='-' ? e.db==undefined : e.db==ctx.request.query.organisation : true)
            .filter(e => ctx.request.query.user ? ctx.request.query.user=='-' ? e.user==undefined : e.user==ctx.request.query.user : true)
            .filter(e => ctx.request.query.time ? e.ms > ctx.request.query.time : true)
            .filter(e => ctx.request.query.status ? e.status==ctx.request.query.status : true);

        // tmp convert old 'platform' back to 'os' TODO: remove once cycled out of log
        entriesFiltered.forEach(e => e.ua.os = e.ua.os || e.ua.platform);

        // add in extra fields to each entry (note cannot use Array.map due to async Ip.getDomain function)
        const entries = [];
        for (const e of entriesFiltered) {
            const fields = {
                time:   dateFormat(e._id.getTimestamp(), 'UTC:yyyy-mm-dd HH:MM:ss'),
                path:   e.url.split('?')[0] + (e.url.split('?').length>1 ? '?…' : ''),
                qs:     e.url.split('?')[1],
                env:    e.env=='production' ? '' : (e.env=='development' ? 'dev' : e.env),
                os:     Number(e.ua.os.major) ? `${e.ua.os.family} ${e.ua.os.major}` : e.ua.os.family,
                ua:     Number(e.ua.major) ? e.ua.family+'-'+ e.ua.major : e.ua.family,
                domain: await Ip.getDomain(e.ip) || e.ip,
                speed:  e.ms>500 ? 'slow' : e.ms>100 ? 'medium' : '',
            };
            entries.push(Object.assign({}, e, fields));
        }

        // trim excessively long paths (with full path in 'title' rollover)
        for (const e of entries) {
            if (e.path.length > 36) {
                e.pathFull = e.path;
                e.path = e.path.slice(0, 36)+'…';
            }
        }

        // for display, time defaults to 0
        ctx.request.query.time = ctx.request.query.time || '0';

        const context = {
            entries:   entries,
            dbs:       dbs,
            users:     users,
            statuses:  statuses,
            filter:    ctx.request.query,
            filterMin: dateFormat(oldest, 'yyyy-mm-dd'),
            filterMax: dateFormat('yyyy-mm-dd'),
        };

        await ctx.render('dev-logs-access', context);
    }


    static async logAccessCsv(ctx) {
        const log = await Db.collection('users', 'log-access');
        const entriesAll = (await log.find({}).sort({ $natural: -1 }).toArray());

        // tmp convert old 'platform' back to 'os' TODO: remove once cycled out of log
        entriesAll.forEach(e => e.ua.os = e.ua.os || e.ua.platform);

        const entries = [];
        for (const e of entriesAll) {
            const fields = {
                env:       e.env=='production' ? '' : (e.env=='development' ? 'dev' : e.env),
                timestamp: dateFormat(e._id.getTimestamp(), 'UTC:yyyy-mm-dd HH:MM:ss'),
                host:      e.host,
                url:       e.url,
                org:       e.db,
                user:      e.user,
                status:    e.status,
                referrer:  e.referer,
                domain:    await Ip.getDomain(e.ip),
                ua:        Number(e.ua.major) ? e.ua.family+'-'+ e.ua.major : e.ua.family,
                os:        Number(e.ua.os.major) ? `${e.ua.os.family} ${e.ua.os.major}` : e.ua.os.family,
                ms:        e.ms,
            };
            entries.push(fields);
        }

        const csv = json2csv.parse(entries);
        const filename = 'the whistle access log ' + dateFormat('UTC:yyyy-mm-dd HH.MM') + '.csv';
        ctx.response.status = 200;
        ctx.response.body = csv;
        ctx.response.attachment(filename);
    }


    /**
     * Show error log.
     */
    static async logError(ctx) {
        // error logging uses capped collection log-error (size: 1000×4e3, max: 1000)
        const log = await Db.collection('users', 'log-error');

        const entriesAll = (await log.find({}).sort({ $natural: -1 }).toArray());

        const dbs = [ ...new Set(entriesAll.map(e => e.db)) ].sort();
        const users = [ ...new Set(entriesAll.map(e => e.user)) ].sort();
        const statuses = [ ...new Set(entriesAll.map(e => e.status)) ].sort();

        // 'from' defaults to later of first entry or 1 month ago
        const oldest = entriesAll.reduce((old, e) => e._id.getTimestamp()<old ? e._id.getTimestamp() : old, new Date());
        const monthAgo = new Date(); monthAgo.setMonth(new Date().getMonth() - 1);
        ctx.request.query.from = ctx.request.query.from || dateFormat(oldest<monthAgo ? monthAgo : oldest, 'yyyy-mm-dd');

        // 'to' defaults to today
        ctx.request.query.to = ctx.request.query.to || dateFormat('yyyy-mm-dd');
        // filter needs 1 day added to 'to' to made it end of the day
        const toFilter = new Date(ctx.request.query.to); toFilter.setDate(toFilter.getDate() + 1);

        // filter results according to query string
        const entriesFiltered = entriesAll
            .filter(e => ctx.request.query.from ? e._id.getTimestamp() >= new Date(ctx.request.query.from) : true)
            .filter(e => ctx.request.query.to ? e._id.getTimestamp() <= toFilter : true)
            .filter(e => ctx.request.query.organisation ? ctx.request.query.organisation=='-' ? e.db==undefined : e.db==ctx.request.query.organisation : true)
            .filter(e => ctx.request.query.user ? ctx.request.query.user=='-' ? e.user==undefined : e.user==ctx.request.query.user : true)
            .filter(e => ctx.request.query.status ? e.status==ctx.request.query.status : true);

        // tmp convert old 'platform' back to 'os' TODO: remove once cycled out of log
        entriesFiltered.forEach(e => e.ua.os = e.ua.os || e.ua.platform);

        // add in extra fields to each entry (note cannot use Array.map due to async Ip.getDomain function)
        const entries = [];
        for (const e of entriesFiltered) {
            const fields = {
                time:            dateFormat(e._id.getTimestamp(), 'UTC:yyyy-mm-dd HH:MM:ss'),
                path:            e.url.split('?')[0] + (e.url.split('?').length>1 ? '?…' : ''),
                qs:              e.url.split('?')[1],
                env:             e.env=='production' ? '' : (e.env=='development' ? 'dev' : e.env),
                os:              Number(e.ua.os.major) ? `${e.ua.os.family} ${e.ua.os.major}` : e.ua.os.family,
                ua:              Number(e.ua.major) ? e.ua.family+'-'+ e.ua.major : e.ua.family,
                domain:          await Ip.getDomain(e.ip),
                'status-colour': e.status==500 ? 'red' : '',
            };
            entries.push(Object.assign({}, e, fields));
        }

        // trim excessively long paths (with full path in 'title' rollover)
        for (const e of entries) {
            if (e.path.length > 36) {
                e.pathFull = e.path;
                e.path = e.path.slice(0, 36)+'…';
            }
        }

        // for display, time defaults to 0
        ctx.request.query.time = ctx.request.query.time || '0';

        const context = {
            entries:   entries,
            dbs:       dbs,
            users:     users,
            statuses:  statuses,
            filter:    ctx.request.query,
            filterMin: dateFormat(oldest, 'yyyy-mm-dd'),
            filterMax: dateFormat('yyyy-mm-dd'),
        };

        await ctx.render('dev-logs-error', context);
    }


    /**
     * User agents used in submitting incident reports.
     *
     * Note this uses the useragents collection within each organisation database, and is
     * potentially redundant following the more recent access/error logging.
     */
    static async userAgentsV1(ctx) {
        const context = await UserAgent.counts(ctx.state.user.db, ctx.request.query.since);
        context.sinceDate = context.since ? dateFormat(context.since, 'd mmm yyyy') : '–';

        await ctx.render('dev-user-agents', context);
    }


    /**
     * User agents used in accessing the admin app.
     */
    static async userAgentsAdmin(ctx) {
        await Dev.userAgents(ctx, 'admin');
    }


    /**
     * User agents used in accessing the report app.
     */
    static async userAgentsReport(ctx) {
        await Dev.userAgents(ctx, 'report');
    }


    /**
     * Private function to show user agents used for report/admin app.
     *
     * This works from the (capped) log-access collection.
     */
    static async userAgents(ctx, app) {
        const log = await Db.collection('users', 'log-access');

        const entriesAll = (await log.find({}).sort({ $natural: -1 }).toArray());
        const entries = entriesAll
            .filter(e => e.host.split('.')[0] == app)
            .filter(e => ctx.request.query.organisation ? e.db==ctx.request.query.organisation : true);

        // tmp convert old 'platform' back to 'os' TODO: remove once cycled out of log
        entries.forEach(e => e.ua.os = e.ua.os || e.ua.platform);

        const uas = entries
            .map(e => ({ month: dateFormat(e._id.getTimestamp(), 'yyyy-mm'), ua: e.ua }))
            .map(e => { e.os = Number(e.ua.os.major) ? `${e.ua.os.family} ${e.ua.os.major}` : e.ua.os.family; return e; })
            .map(e => { e.ua = Number(e.ua.major) ? e.ua.family+'-'+ e.ua.major : e.ua.family; return e; })
            .map(e => { e.ua = e.ua + '<br>' + e.os; return e; });

        const counts = {};
        for (const rpt of uas) {
            if (!counts[rpt.month]) counts[rpt.month] = {};
            if (!counts[rpt.month][rpt.ua]) counts[rpt.month][rpt.ua] = 0;
            counts[rpt.month][rpt.ua]++;
        }

        const monthsList = Array.from(new Set(uas.map(e => e.month))).sort().reverse();
        const uasList = Array.from(new Set(uas.map(e => e.ua))).sort();

        const context = { uasList, monthsList, counts, app: app+' app' };

        await ctx.render('dev-ua', context);
    }


    /**
     * User agents used in submitting reports.
     *
     * This data is associated with submitted reports themselves and hence is persistent, unlike the
     * report/admin app user agents pages which are based of the transient logs. It can therefore be
     * used to track user agent usage over time.
     */
    static async userAgentsReports(ctx) {
        const db = ctx.state.user.db;
        const reports = (await Report.getAll(db, 'all')).filter(r => r.ua);
        const uas = reports
            .map(r => ({ month: dateFormat(r._id.getTimestamp(), 'yyyy-mm'), ua: r.ua }))
            .map(r => { r.os = Number(r.ua.os.major) ? `${r.ua.os.family} ${r.ua.os.major}` : r.ua.os.family; return r; })
            .map(r => { r.ua = Number(r.ua.major) ? r.ua.family+'-'+ r.ua.major : r.ua.family; return r; })
            .map(r => { r.ua = r.ua + '<br>' + r.os; return r; });

        const counts = [];
        for (const rpt of uas) {
            if (!counts[rpt.month]) counts[rpt.month] = [];
            if (!counts[rpt.month][rpt.ua]) counts[rpt.month][rpt.ua] = 0;
            counts[rpt.month][rpt.ua]++;
        }

        const monthsList = Array.from(new Set(uas.map(e => e.month))).sort().reverse();
        const uasList = Array.from(new Set(uas.map(e => e.ua))).sort();

        const context = { uasList, monthsList, counts, app: db+' submitted reports' };

        await ctx.render('dev-ua', context);
    }


    /**
     * Submission progress page.
     */
    static async submissions(ctx) {
        const db = ctx.state.user.db;
        const submissions = await Submission.getAll(db);

        // TODO: implement filtering by date and/or by project?

        // get page counts in array indexed by month, project
        const counts = {};
        for (const s in submissions) {
            const month = dateFormat(submissions[s]._id.getTimestamp(), 'yyyy-mm');
            if (!counts[month]) counts[month] = {};
            const project = submissions[s].project;
            if (!counts[month][project]) counts[month][project] = { pages: { index: { count: 0 } }, completionTimes: [], completedReports: [] };
            counts[month][project].pages.index.count++;
            for (const p in submissions[s].progress) {
                const page = p=='complete' ? p : 'p'+p; // use string to force insertion order for keys
                if (!counts[month][project].pages[page]) counts[month][project].pages[page] = { count: 0 };
                counts[month][project].pages[page].count++;
                if (p=='complete') {
                    // record time to complete report (in ms)
                    counts[month][project].completionTimes.push(submissions[s].progress[p] - submissions[s]._id.getTimestamp());
                    // and report id (purely for testing)
                    counts[month][project].completedReports.push(submissions[s].reportId.toString());
                }
            }
        }

        // get min/max/avg completion times per month/project, and overall total max counts for count bar widths
        let maxCounts = 0;
        for (const month in counts) {
            for (const project in counts[month]) {
                const completionTimes = counts[month][project].completionTimes;
                if (completionTimes.length == 0) continue; // TODO: why is it possible to get an empty array?
                const times = {
                    min: dateFormat(completionTimes.reduce((prev, curr) => Math.min(prev, curr)), 'UTC:HH:MM:ss'),
                    max: dateFormat(completionTimes.reduce((prev, curr) => Math.max(prev, curr)), 'UTC:HH:MM:ss'),
                    avg: dateFormat(completionTimes.reduce((prev, curr) => prev + curr) / completionTimes.length, 'UTC:HH:MM:ss'),
                };
                counts[month][project].times = times;
                delete counts[month][project].completionTimes;
                maxCounts = Math.max(maxCounts, counts[month][project].pages.index.count);
            }
        }

        // convert page counts to widths with maximum 8em
        const width = 8;
        for (const month in counts) {
            for (const project in counts[month]) {
                for (const page in counts[month][project].pages) {
                    counts[month][project].pages[page].width = counts[month][project].pages[page].count / maxCounts * width;
                }
            }
        }

        const context = { months: counts };

        await ctx.render('dev-submissions', context);
    }


    /**
     * Development index page.
     */
    static async index(ctx) {
        const index = await fs.readFile('dev/index.md', 'utf8');
        const content = md.render(index);
        await ctx.render('dev-notes', { content, title: 'The Whistle Dev Functions' });
    }


    /**
     * Development notes index page.
     */
    static async notesIndex(ctx) {
        const index = await fs.readFile('dev/notes.md', 'utf8');
        const content = md.render(index);
        await ctx.render('dev-notes', { content, title: 'The Whistle Development Notes' });
    }


    /**
     * Development notes readme page.
     */
    static async notesReadme(ctx) {
        const readme = await fs.readFile('README.md', 'utf8');
        const content = md.render(readme);
        await ctx.render('dev-notes', { content, title: 'The Whistle README' });
    }


    /**
     * Development notes pages (note is obtained from url).
     */
    static async notes(ctx) {
        const notesFile = `dev/${ctx.params.notes}.md`;
        try {
            const notesMarkdown = await fs.readFile(notesFile, 'utf8');
            const content = md.render(notesMarkdown);
            const document = new JSDOM(content).window.document;
            await ctx.render('dev-notes', { content, title: document.querySelector('h1').textContent });
        } catch (e) {
            switch (e.code) {
                case 'ENOENT': ctx.throw(404, 'Notes not found'); break;
                default:       throw e;
            }
        }
    }


    /**
     * /dev/throw - Invoke exception (for testing).
     */
    static throw(ctx) {
        const status = ctx.request.query.status || 500;
        ctx.throw(Number(status), 'This is a test error!');
    }


    /**
     * PUT /dev/env - Set app environment.
     *
     * When there is a need to test production functionality, this can be used to reset ctx.app.env.
     */
    static setEnv(ctx) {
        try {
            Environment.set(ctx, ctx.request.body.environment);
            ctx.status = 200;
        } catch (e) {
            // don't just throw, as thrown exceptions outside of dev will get notified by e-mail!
            ctx.status = 403;
            ctx.body = `Invalid environment ‘${ctx.request.body.environment}’`;
        }
    }


    /**
     * GET /dev/env - Return current app environment.
     */
    static getEnv(ctx) {
        const env = Environment.get(ctx);
        ctx.body = env;
    }

}

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Dev;
