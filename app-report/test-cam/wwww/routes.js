/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes: test-cam/wwww (what-where-when-who).                                    C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

/* eslint space-in-parens: off */

import Router from 'koa-router'; // router middleware for koa
const router = new Router();

import handlers from './handlers.js';


router.get( '/:database/:project',           handlers.getIndex);
router.get( '/:database/:project/warning',   handlers.getWarning);
router.post('/:database/:project/warning',   handlers.postWarning);
router.get( '/:database/:project/what',      handlers.getWhat);
router.post('/:database/:project/what',      handlers.postWhat);
router.get( '/:database/:project/where',     handlers.getWhere);
router.post('/:database/:project/where',     handlers.postWhere);
router.get( '/:database/:project/when',      handlers.getWhen);
router.post('/:database/:project/when',      handlers.postWhen);
router.get( '/:database/:project/who',       handlers.getWho);
router.post('/:database/:project/who',       handlers.postWho);
router.get( '/:database/:project/submit',    handlers.getSubmit);
router.post('/:database/:project/submit',    handlers.postSubmit);
router.get( '/:database/:project/thank-you', ctx => ctx.render('thank-you'));


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
