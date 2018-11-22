/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* 'Publish' app routes.                                                           C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa

const router = new Router();


import handlers from './handlers.js';

router.get('/', async function(ctx) { await ctx.render('index'); }); // home page

router.get('/metrics',                              handlers.getMetricsList);
router.get('/metrics/:org',                         handlers.getMetricsList);
router.get('/metrics/:org/:project',                handlers.getMetricsList);
router.get('/metrics/:org/:project/:year',          handlers.getMetricsList);
router.get('/supply',                               handlers.getSupplyList);
router.get('/supply/:org',                          handlers.getSupplyList);
router.get('/supply/:org/:project',                 handlers.getSupplyList);
router.get('/supply/:org/:project/:year',           handlers.getSupplyList);

router.get('/:org/:project/wikirate/metrics/:year', handlers.getMetrics);
router.get('/:org/:project/wikirate/supply/:year',  handlers.getSupply);

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
