/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Routes for dev tools                                                                          */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router     = require('koa-router')(); // router middleware for koa
const nodeinfo   = require('nodejs-info');  // node info
const dateFormat = require('dateformat');   // Steven Levithan's dateFormat()
const JsDom      = require('jsdom').JSDOM;  // JavaScript implementation of DOM and HTML standards

const useragent  = require('../lib/user-agent.js');


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

const fs  = require('fs-extra');           // fs with extra functions & promise interface
const md  = require('markdown-it')();      // markdown parser
const mda = require('markdown-it-anchor'); // header anchors for markdown-it

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
        const document = new JsDom(content).window.document;
        await ctx.render('dev-notes', { content, title: document.querySelector('h1').textContent });
    } catch (e) {
        if (e.code != 'ENOENT') console.error(e);
        ctx.throw(404, 'Notes not found');
    }
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
