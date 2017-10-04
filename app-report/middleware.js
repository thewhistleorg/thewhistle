/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Middleware relevant to the incident report submission sub-app                   .              */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

'use strict';

const MongoClient = require('mongodb').MongoClient; // official MongoDB driver for Node.js

class ReportMiddleware {

    /**
     * If no database connection for ctx.params.database already saved in global.db, then establish
     * one. If the connection has already been made, this is a no-op; the connection will remain
     * available in global.db until next application restart.
     *
     * The database connection string is expected to be found in an environment variable matching
     * the :database URL component (upper-cased, with hyphen replace by underscore, prefixed by DB_;
     * e.g. for report.thewhistle.org/test-cam/my-project, the env var will be DB_TEST_CAM.
     *
     * If no matching environment variable is found, this will throw a 404.
     */
    static mongoConnect() {
        return async function(ctx, next) {
            if (!global.db[ctx.params.database]) {
                try {
                    const dbEnvironmentVariable = 'DB_'+ctx.params.database.toUpperCase().replace('-', '_');
                    const connectionString = process.env[dbEnvironmentVariable];
                    if (connectionString == undefined) ctx.throw(404, `No configuration available for organisation ‘${ctx.params.database}’`);
                    global.db[ctx.params.database] = await MongoClient.connect(connectionString);
                } catch (e) {
                    ctx.throw(e);
                }
            }
            await next();
        };
    }

}

module.exports = ReportMiddleware;
