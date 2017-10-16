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
    const context = await useragent.counts('test', ctx.query.since);
    context.sinceDate = context.since ? dateFormat(context.since, 'd mmm yyyy') : '–';

    await ctx.render('user-agents', context);
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
        if (e.code != 'ENOENT') console.error(e);
        ctx.throw(404, 'Notes not found');
    }
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
