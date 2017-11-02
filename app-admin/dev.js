/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Dev tools handlers.                                                             C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import nodeinfo   from 'nodejs-info';         // node info
import dateFormat from 'dateformat';          // Steven Levithan's dateFormat()
import jsdom      from 'jsdom';               // DOM Document interface in Node!
import dns        from 'dns';                 // nodejs.org/api/dns.html
import fs         from 'fs-extra';            // fs with extra functions & promise interface
import markdown   from 'markdown-it';         // markdown parser
import mda        from 'markdown-it-anchor';  // header anchors for markdown-it
import mdi        from 'markdown-it-include'; // include markdown fragment files
const md = markdown();
md.use(mda);
md.use(mdi, 'dev/form-wizard');

import useragent  from '../lib/user-agent.js';
import Report     from '../models/report.js';


class Dev {

    /**
     * Information about current Node versions.
     */
    static nodeinfo(ctx) {
        ctx.body = nodeinfo(ctx.req);
    }


    /**
     * Show access log.
     */
    static async logAccess(ctx) {
        // access logging uses capped collection log-access (size: 1000×1e3, max: 1000)
        const log = global.db.users.collection('log-access');

        // lookup any IP addresses we don't already have (in background) - except when testing
        if (ctx.header.referer != 'mocha') await Dev.ipLookup('log-access');

        const entriesAll = (await log.find({}).sort({ $natural: -1 }).toArray());

        const dbs = [ ...new Set(entriesAll.map(e => e.db)) ].sort();
        const users = [ ...new Set(entriesAll.map(e => e.user)) ].sort();
        const statuses = [ ...new Set(entriesAll.map(e => e.status)) ].sort();

        // 'from' defaults to later of first entry or 1 month ago
        const oldest = entriesAll.reduce((old, e) => e._id.getTimestamp()<old ? e._id.getTimestamp() : old, new Date());
        const monthAgo = new Date(); monthAgo.setMonth(new Date().getMonth() - 1);
        ctx.query.from = ctx.query.from || dateFormat(oldest<monthAgo ? monthAgo : oldest, 'yyyy-mm-dd');

        // 'to' defaults to today
        ctx.query.to = ctx.query.to || dateFormat('yyyy-mm-dd');
        // filter needs 1 day added to 'to' to made it end of the day
        const toFilter = new Date(ctx.query.to); toFilter.setDate(toFilter.getDate() + 1);

        // filter results according to query string
        const entriesFiltered = entriesAll
            .filter(e => ctx.query.from ? e._id.getTimestamp() >= new Date(ctx.query.from) : true)
            .filter(e => ctx.query.to ? e._id.getTimestamp() <= toFilter : true)
            .filter(e => ctx.query.app ? RegExp('^'+ctx.query.app).test(e.host) : true)
            .filter(e => ctx.query.organisation ? e.db==ctx.query.organisation : true)
            .filter(e => ctx.query.time ? e.ms > ctx.query.time : true)
            .filter(e => ctx.query.status ? e.status==ctx.query.status : true);

        // tmp convert old 'platform' back to 'os' TODO: remove once cycled out of log
        entriesFiltered.forEach(e => e.ua.os = e.ua.os || e.ua.platform);

        // add in extra fields to each entry
        const entries = entriesFiltered
            .map(e => { e.time = dateFormat(e._id.getTimestamp(), 'yyyy-mm-dd HH:MM:ss'); return e; })
            .map(e => { e.path = e.url.split('?')[0] + (e.url.split('?').length>1 ? '?…' : ''); return e; })
            .map(e => { e.qs = e.url.split('?')[1]; return e; })
            .map(e => { e.env = e.env=='production' ? '' : (e.env=='development' ? 'dev' : e.env); return e; })
            .map(e => { e.os = Number(e.ua.os.major) ? `${e.ua.os.family} ${e.ua.os.major}` : e.ua.os.family; return e; })
            .map(e => { e.ua = Number(e.ua.major) ? e.ua.family+'-'+ e.ua.major : e.ua.family; return e; })
            .map(e => { e.domain = e.ip ? global.ips.get(e.ip) : null; return e; })
            .map(e => { e.speed = e.ms>500 ? 'slow' : e.ms>100 ? 'medium' : ''; return e; });

        // trim excessively long paths (with full path in 'title' rollover)
        for (const e of entries) {
            if (e.path.length > 36) {
                e.pathFull = e.path;
                e.path = e.path.slice(0, 36)+'…';
            }
        }

        // for display, time defaults to 0
        ctx.query.time = ctx.query.time || '0';

        const context = {
            entries:   entries,
            dbs:       dbs,
            users:     users,
            statuses:  statuses,
            filter:    ctx.query,
            filterMin: dateFormat(oldest, 'yyyy-mm-dd'),
            filterMax: dateFormat('yyyy-mm-dd'),
        };

        await ctx.render('dev-logs-access', context);
    }


    /**
     * Show error log.
     */
    static async logError(ctx) {
        // error logging uses capped collection log-error (size: 1000×4e3, max: 1000)
        const log = global.db.users.collection('log-error');

        // lookup any IP addresses we don't already have (in background) - except when testing
        if (ctx.header.referer != 'mocha') await Dev.ipLookup('log-error');

        const entriesAll = (await log.find({}).sort({ $natural: -1 }).toArray());

        const dbs = [ ...new Set(entriesAll.map(e => e.db)) ].sort();
        const users = [ ...new Set(entriesAll.map(e => e.user)) ].sort();
        const statuses = [ ...new Set(entriesAll.map(e => e.status)) ].sort();

        // 'from' defaults to later of first entry or 1 month ago
        const oldest = entriesAll.reduce((old, e) => e._id.getTimestamp()<old ? e._id.getTimestamp() : old, new Date());
        const monthAgo = new Date(); monthAgo.setMonth(new Date().getMonth() - 1);
        ctx.query.from = ctx.query.from || dateFormat(oldest<monthAgo ? monthAgo : oldest, 'yyyy-mm-dd');

        // 'to' defaults to today
        ctx.query.to = ctx.query.to || dateFormat('yyyy-mm-dd');
        // filter needs 1 day added to 'to' to made it end of the day
        const toFilter = new Date(ctx.query.to); toFilter.setDate(toFilter.getDate() + 1);

        // filter results according to query string
        const entriesFiltered = entriesAll
            .filter(e => ctx.query.from ? e._id.getTimestamp() >= new Date(ctx.query.from) : true)
            .filter(e => ctx.query.to ? e._id.getTimestamp() <= toFilter : true)
            .filter(e => ctx.query.organisation ? e.db==ctx.query.organisation : true)
            .filter(e => ctx.query.status ? e.status==ctx.query.status : true);

        // tmp convert old 'platform' back to 'os' TODO: remove once cycled out of log
        entriesFiltered.forEach(e => e.ua.os = e.ua.os || e.ua.platform);

        // add in extra fields to each entry
        const entries = entriesFiltered
            .map(e => { e.time = dateFormat(e._id.getTimestamp(), 'yyyy-mm-dd HH:MM:ss'); return e; })
            .map(e => { e.path = e.url.split('?')[0] + (e.url.split('?').length>1 ? '?…' : ''); return e; })
            .map(e => { e.qs = e.url.split('?')[1]; return e; })
            .map(e => { e.env = e.env=='production' ? '' : (e.env=='development' ? 'dev' : e.env); return e; })
            .map(e => { e.os = Number(e.ua.os.major) ? `${e.ua.os.family} ${e.ua.os.major}` : e.ua.os.family; return e; })
            .map(e => { e.ua = Number(e.ua.major) ? e.ua.family+'-'+ e.ua.major : e.ua.family; return e; })
            .map(e => { e.domain = e.ip ? global.ips.get(e.ip) : null; return e; })
            .map(e => { e['status-colour'] = e.status==500 ? 'red' : ''; return e; });

        // for display, time defaults to 0
        ctx.query.time = ctx.query.time || '0';

        const context = {
            entries:   entries,
            dbs:       dbs,
            users:     users,
            statuses:  statuses,
            filter:    ctx.query,
            filterMin: dateFormat(oldest, 'yyyy-mm-dd'),
            filterMax: dateFormat('yyyy-mm-dd'),
        };

        await ctx.render('dev-logs-error', context);
    }


    /**
     * Reverse lookup IP addresses in log and add to global.ips map.
     *
     * This returns immediately, having queued dns lookups to be performed in the background; so the
     * first log page view may be missing domains. Any given IP will only be looked up once within
     * the app lifetime (will subsequently get held in global.ips).
     *
     * @param {string} collection - The log collection to search ('log-access' or 'log-error')
     */
    static async ipLookup(collection) {
        const log = global.db.users.collection(collection);

        const entries = await log.find({}).toArray();

        if (global.ips == undefined) global.ips = new Map(); // ip:domain mapping

        // reverse lookup domain for all ips in log (if not already available)
        for (const e of entries) {
            if (!e.ip) continue;                // no ip recorded to look up
            if (global.ips.has(e.ip)) continue; // already have domain looked up for this ip
            if (e.domain) {                     // domain already recorded in logs
                global.ips.set(e.ip, e.domain);
                continue;
            }
            // otherwise, look up domain now (without bothering to wait for result
            if ([ '127.0.0.1', '::ffff:127.0.0.1' ].includes(e.ip)) continue;
            dns.reverse(e.ip.trim(), function(err, domains) { // TODO: remove trim() once test flushed out of logs 2017-11-01
                if (err != null) console.error(err);
                global.ips.set(e.ip, domains[0]);
            });
        }
    }


    /**
     * User agents used in submitting incident reports.
     *
     * Note this uses the useragents collection within each organisation database, and is
     * potentially redundant following the more recent access/error logging.
     */
    static async userAgentsV1(ctx) {
        const context = await useragent.counts(ctx.state.user.db, ctx.query.since);
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
        const log = global.db.users.collection('log-access');

        const entriesAll = (await log.find({}).sort({ $natural: -1 }).toArray());
        const entries = entriesAll
            .filter(e => e.host.split('.')[0] == app)
            .filter(e => ctx.query.organisation ? e.db==ctx.query.organisation : true);

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
     * Development notes index page.
     */
    static async notesIndex(ctx) {
        const index = await fs.readFile('dev/index.md', 'utf8');
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
            const document = new jsdom.JSDOM(content).window.document;
            await ctx.render('dev-notes', { content, title: document.querySelector('h1').textContent });
        } catch (e) {
            switch (e.code) {
                case 'ENOENT': ctx.throw(404, 'Notes not found'); break;
                default:       throw e;
            }
        }
    }


    /**
     * Development notes relating to plans about form wizards.
     */
    static async notesFormWizard(ctx) {
        const notesFile = `dev/form-wizard/${ctx.params.notes}.md`;
        try {
            const notesMarkdown = await fs.readFile(notesFile, 'utf8');
            const content = md.render(notesMarkdown);
            const document = new jsdom.JSDOM(content).window.document;
            const title = document.querySelector('h1') ? document.querySelector('h1').textContent : 'The Whistle Development Notes';
            await ctx.render('dev-notes', { content, title });
        } catch (e) {
            switch (e.code) {
                case 'ENOENT': ctx.throw(404, 'Notes not found'); break;
                default:       throw e;
            }
        }
    }


    /**
     * Invoke exception (for testing).
     */
    static throw(ctx) {
        const status = ctx.query.status || 500;
        ctx.throw(Number(status), 'This is a test error!');
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Dev;
