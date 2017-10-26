/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes for dev tools.                                                           C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router     from 'koa-router';  // router middleware for koa
import nodeinfo   from 'nodejs-info'; // node info
import dateFormat from 'dateformat';  // Steven Levithan's dateFormat()
import jsdom      from 'jsdom';       // DOM Document interface in Node!

import useragent  from '../lib/user-agent.js';

const router = new Router();


router.get('/dev/nodeinfo', function(ctx) {
    ctx.body = nodeinfo(ctx.req);
});


router.get('/dev/user-agents', async function(ctx) {
    const context = await useragent.counts(ctx.state.user.db, ctx.query.since);
    context.sinceDate = context.since ? dateFormat(context.since, 'd mmm yyyy') : '–';

    await ctx.render('user-agents', context);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Route to handle log-access / log-error pages                                                   */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

router.get('/dev/log-access', async function(ctx) {
    // access logging uses capped collection log-access (size: 1000×1e3, max: 1000)
    const log = global.db.users.collection('log-access');

    const entriesAll = (await log.find({}).sort({ $natural: -1 }).toArray());

    const dbs = [ ...new Set(entriesAll.map(e => e.db)) ].sort();
    const users = [ ...new Set(entriesAll.map(e => e.user)) ].sort();
    const statuses = [ ...new Set(entriesAll.map(e => e.status)) ].sort();

    // from defaults to 1 month ago, to defaults to true
    const monthAgo = new Date().setMonth(new Date().getMonth() - 1);
    ctx.query.from = ctx.query.from || dateFormat(monthAgo, 'yyyy-mm-dd');

    // filter results according to query string
    const entriesFiltered = entriesAll
        .filter(e => ctx.query.from ? e._id.getTimestamp() >= new Date(ctx.query.from) : true)
        .filter(e => ctx.query.to ? e._id.getTimestamp() <= new Date(ctx.query.to) : true)
        .filter(e => ctx.query.organisation ? e.db==ctx.query.organisation : true)
        .filter(e => ctx.query.time ? e.ms > ctx.query.time : true)
        .filter(e => ctx.query.status ? e.status==ctx.query.status : true);

    // add in extra fields to each entry
    const entries = entriesFiltered
        .map(e => { e.time = dateFormat(e._id.getTimestamp(), 'yyyy-mm-dd HH:MM'); return e; })
        .map(e => { e.path = e.url.split('?')[0] + (e.url.split('?').length>1 ? '?…' : ''); return e; })
        .map(e => { e.qs = e.url.split('?')[1]; return e; })
        .map(e => { e.env = e.env=='production' ? '' : (e.env=='development' ? 'dev' : e.env); return e; })
        .map(e => { e.os = Number(e.ua.platform.major) ? `${e.ua.platform.family} ${e.ua.platform.major}` : e.ua.platform.family; return e; })
        .map(e => { e.ua = Number(e.ua.major) ? e.ua.family+'-'+ e.ua.major : e.ua.family; return e; });

    for (const e of entries) {
        if (e.path.length > 48) {
            e.pathFull = e.path;
            e.path = e.path.slice(0, 48)+'…';
        }
    }

    // for display, to defaults to today
    ctx.query.to = ctx.query.to || dateFormat('yyyy-mm-dd');
    // for display, time defaults to 0
    ctx.query.time = ctx.query.time || '0';

    const context = {
        entries:  entries,
        dbs:      dbs,
        users:    users,
        statuses: statuses,
        filter:   ctx.query,
    };

    await ctx.render('logs-access', context);
});

router.get('/dev/log-error', async function(ctx) {
    // error logging uses capped collection log-error (size: 1000×4e3, max: 1000)
    const log = global.db.users.collection('log-error');

    const entriesAll = (await log.find({}).sort({ $natural: -1 }).toArray());

    const dbs = [ ...new Set(entriesAll.map(e => e.db)) ].sort();
    const users = [ ...new Set(entriesAll.map(e => e.user)) ].sort();
    const statuses = [ ...new Set(entriesAll.map(e => e.status)) ].sort();

    // from defaults to 1 month ago, to defaults to true
    const monthAgo = new Date().setMonth(new Date().getMonth() - 1);
    ctx.query.from = ctx.query.from || dateFormat(monthAgo, 'yyyy-mm-dd');

    // filter results according to query string
    const entriesFiltered = entriesAll
        .filter(e => ctx.query.from ? e._id.getTimestamp() >= new Date(ctx.query.from) : true)
        .filter(e => ctx.query.to ? e._id.getTimestamp() <= new Date(ctx.query.to) : true)
        .filter(e => ctx.query.organisation ? e.db==ctx.query.organisation : true)
        .filter(e => ctx.query.status ? e.status==ctx.query.status : true);

    // add in extra fields to each entry
    const entries = entriesFiltered
        .map(e => { e.time = dateFormat(e._id.getTimestamp(), 'yyyy-mm-dd HH:MM'); return e; })
        .map(e => { e.path = e.url.split('?')[0] + (e.url.split('?').length>1 ? '?…' : ''); return e; })
        .map(e => { e.qs = e.url.split('?')[1]; return e; })
        .map(e => { e.env = e.env=='production' ? '' : (e.env=='development' ? 'dev' : e.env); return e; })
        .map(e => { e.os = Number(e.ua.platform.major) ? `${e.ua.platform.family} ${e.ua.platform.major}` : e.ua.platform.family; return e; })
        .map(e => { e.ua = Number(e.ua.major) ? e.ua.family+'-'+ e.ua.major : e.ua.family; return e; })
        .map(e => { e['status-colour'] = e.status==500 ? 'red' : ''; return e; });

    // for display, to defaults to today
    ctx.query.to = ctx.query.to || dateFormat('yyyy-mm-dd');
    // for display, time defaults to 0
    ctx.query.time = ctx.query.time || '0';

    const context = {
        entries:  entries,
        dbs:      dbs,
        users:    users,
        statuses: statuses,
        filter:   ctx.query,
    };

    await ctx.render('logs-error', context);
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Route to handle dev-notes pages                                                                */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import fs       from 'fs-extra';           // fs with extra functions & promise interface
import markdown from 'markdown-it';        // markdown parser
import mda      from 'markdown-it-anchor'; // header anchors for markdown-it

const md = markdown();

md.use(mda);

router.get('/dev/notes', async function getIndexPage(ctx) {
    const index = await fs.readFile('dev/index.md', 'utf8');
    const content = md.render(index);
    await ctx.render('dev-notes', { content, title: 'The Whistle Development Notes' });
});

router.get('/dev/notes/readme', async function getReadMePage(ctx) {
    const readme = await fs.readFile('README.md', 'utf8');
    const content = md.render(readme);
    await ctx.render('dev-notes', { content, title: 'The Whistle README' });
});

router.get('/dev/notes/:notes', async function getNotesPage(ctx) {
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
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Invoke exception (for testing)                                                                 */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

router.get('/dev/throw', function throwException(ctx) {
    const status = ctx.query.status || 500;
    ctx.throw(Number(status), 'This is a test error!');
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
