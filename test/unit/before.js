/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Set up database connections for unit tests.                                     C.Veness 2017  */
/*                                                                                                */
/* Because of the way 'before' works, this is best defined once & require'd within each separate  */
/* test, rather than being defined within each one. It only gets invoked once on calling          */
/* 'mocha test/unit/*.js'!                                                                        */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import MongoDB from 'mongodb'; // MongoDB driver for Node.js
const MongoClient = MongoDB.MongoClient;

before(async function() {
    this.timeout(10e3); // 10 sec
    try {
        global.db = {};
        for (const db of [ 'users', 'test-cam' ]) {
            const connectionString = process.env['DB_'+db.toUpperCase().replace('-', '_')];
            const client = await MongoClient.connect(connectionString);
            global.db[db] = client.db(client.s.options.dbName);
        }
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
});

export default before;
