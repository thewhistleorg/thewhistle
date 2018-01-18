/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Middleware relevant to the incident report submission sub-app.                  C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import MongoDB from 'mongodb'; // MongoDB driver for Node.js
const MongoClient = MongoDB.MongoClient;

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
     *
     * qv lib/middleware.js.
     */
    static mongoConnect() {
        return async function(ctx, next) {
            const db = ctx.params.database;
            if (!global.db[db]) {
                try {
                    const connectionString = process.env['DB_'+ctx.params.database.toUpperCase().replace('-', '_')];
                    if (connectionString == undefined) ctx.throw(404, `No configuration available for organisation ‘${ctx.params.database}’`);
                    const client = await MongoClient.connect(connectionString);
                    global.db[db] = client.db(client.s.options.dbName);
                } catch (e) {
                    ctx.throw(e); // TODO: or redirect? (qv lib/middleware.js)
                }
            }
            await next();
        };
    }

}

export default ReportMiddleware;
