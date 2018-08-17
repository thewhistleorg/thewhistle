/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Routes for dev tools.                                                      C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import Router from 'koa-router'; // router middleware for koa

const router = new Router();


import Dev from './dev.js';


router.get('/dev',                       Dev.index);

router.get('/dev/nodeinfo',              Dev.nodeinfo);

router.get('/dev/dyno',                  Dev.dyno);

router.get('/dev/user-agents',           Dev.userAgentsV1);      // original user agents reporting on report submission
router.get('/dev/user-agents/admin',     Dev.userAgentsAdmin);   // user agents from admin.thewhistle.org
router.get('/dev/user-agents/report',    Dev.userAgentsReport);  // user agents from reports.thewhistle.org
router.get('/dev/user-agents/reports',   Dev.userAgentsReports); // user agents from submitted reports

router.get('/dev/log-access',            Dev.logAccess);
router.get('/dev/log-error',             Dev.logError);
router.get('/dev/log-access/export-csv', Dev.logAccessCsv);

router.get('/dev/notes',                 Dev.notesIndex);
router.get('/dev/notes/readme',          Dev.notesReadme);
router.get('/dev/notes/:notes',          Dev.notes);

router.get('/dev/submissions',           Dev.submissions);

router.get('/dev/throw',                 Dev.throw);             // invoke exception

router.put('/dev/set-env/:env',          Dev.setEnv);            // reset app environment

router.get('/dev/ip-cache', function(ctx) { // for debug
    ctx.response.body = `countries (${global.ipsCountry.size})\n`;
    for (const [ key, val ] of global.ipsCountry) ctx.response.body += ` ${key} => ${val}\n`;
    ctx.response.body += `domains (${global.ipsDomain.size})\n`;
    for (const [ key, val ] of global.ipsDomain) ctx.response.body += ` ${key} => ${val}\n`;
});

// reinitialise collections: sets indexes, document validation, etc: this is normally done on app
// startup, this is only likely to be needed to e.g. set validation on production databases from
// development environment
import Notification from '../models/notification';
import Report       from '../models/report.js';
import Resource     from '../models/resource';
import Submission   from '../models/submission';
import Update       from '../models/update';
router.get('/dev/init', async ctx => {
    await Notification.init(ctx.state.user.db);
    await Report.init(ctx.state.user.db);
    await Resource.init(ctx.state.user.db);
    await Submission.init(ctx.state.user.db);
    await Update.init(ctx.state.user.db);
    ctx.response.body = 'ok';
});


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default router.middleware();
