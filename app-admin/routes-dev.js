/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Routes for dev tools                                                                          */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const router     = require('koa-router')(); // router middleware for koa
const nodeinfo   = require('nodejs-info');  // node info
const dateFormat = require('dateformat');   // Steven Levithan's dateFormat()

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

module.exports = router.middleware();
