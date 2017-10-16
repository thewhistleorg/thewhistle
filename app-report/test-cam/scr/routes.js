/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes: scr (survivor-centred response).                                        C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Koa    from 'koa';          // koa framework
import Router from 'koa-router'; // router middleware for koa
const router = new Router();

import handlers from './handlers.js';


const app = new Koa(); // report app


router.get( '/:database/:project',           ctx => ctx.render('index'));
router.get( '/:database/:project/submit',    handlers.getSubmit);
router.post('/:database/:project/submit',    handlers.postSubmit);
router.get( '/:database/:project/thank-you', ctx => ctx.render('thank-you'));
router.get( '/:database/:project/:num',      handlers.getPage);
router.post('/:database/:project/:num',      handlers.postPage);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
