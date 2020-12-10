/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Library of assorted useful functions.                                           C.Veness 2017  */
/*                                                                                                */
/*                                       © 2017 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

const Lib = {};


/**
 * Log or notify unhandled exception.
 *
 * @param method
 * @param e
 */
Lib.logException = function(method, e) {
    // could eg save to log file or e-mail developer
    console.error('UNHANDLED EXCEPTION', method, e.stack===undefined?e.message:e.stack);
};

/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

export default Lib;
