/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Cypress plugins.                                                                C.Veness 2018  */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

require('dotenv').config();

module.exports = (on, config) => {
    // set Cypress environment variables from dotenv environment variables
    config.env.TESTUSER = process.env.TESTUSER;
    config.env.TESTPASS = process.env.TESTPASS;

    return config;
};
