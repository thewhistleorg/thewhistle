/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes for dev tools.                                                           C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa
import send   from 'koa-send';   // static file serving

const router = new Router();


import Dev from './dev.js';


router.get('/dev/nodeinfo', Dev.nodeinfo);

router.get('/dev/user-agents', Dev.userAgents);

router.get('/dev/log-access', Dev.logAccess);
router.get('/dev/log-error',  Dev.logError);


router.get('/dev/notes',        Dev.notesIndex);
router.get('/dev/notes/readme', Dev.notesReadme);
router.get('/dev/notes/:notes', Dev.notes);

router.get('/dev/throw', Dev.throw);


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
