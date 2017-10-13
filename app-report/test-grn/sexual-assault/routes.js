/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes: test-grn/sexual-assault.                                                C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const Koa    = require('koa');          // koa framework
const router = require('koa-router')(); // router middleware for koa

const handlers = require('./handlers.js');


const app = new Koa(); // report app

router.get( '/:database/:project',          handlers.getIndex);
router.post('/:database/:project',          handlers.postPage);
router.get( '/:database/:project/submit',   handlers.getSubmit);
router.post('/:database/:project/submit',   handlers.postSubmit);
router.get( '/:database/:project/reset', function(ctx) { ctx.session.report = {}; ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return;  }); // TODO; for testing only
router.get( '/:database/:project/whatnext', handlers.getWhatnext);
router.get( '/:database/:project/:num',     handlers.getPage);
router.post('/:database/:project/:num',     handlers.postPage);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
