/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes: test-grn/sexual-assault.                                                C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa
const router = new Router();

import handlers from './handlers.js';


router.get( '/:database/:project',            handlers.getIndex);
router.post('/:database/:project',            handlers.postPage);
router.get( '/:database/:project/:num(\\d+)', handlers.getPage);
router.post('/:database/:project/:num(\\d+)', handlers.postPage);
router.get( '/:database/:project/submit',     handlers.getSubmit);
router.post('/:database/:project/submit',     handlers.postSubmit);
router.get( '/:database/:project/whatnext',   handlers.getWhatnext);
router.get( '/:database/:project/reset', function(ctx) { ctx.session.report = {}; ctx.redirect(`/${ctx.params.database}/${ctx.params.project}`); return;  }); // TODO; for testing only


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
