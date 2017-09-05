/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/*  Routes: test/sexual-assault                                                                   */
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
router.get( '/:database/:project/whatnext', handlers.getWhatnext);
router.get( '/:database/:project/:num',     handlers.getPage);
router.post('/:database/:project/:num',     handlers.postPage);

app.use(router.routes());


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

module.exports = router.middleware();
