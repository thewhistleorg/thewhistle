/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Generate PDF of report.                                                         C.Veness 2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import pdf          from 'html-pdf';   // HTML to PDF converter
import fs           from 'fs-extra';   // fs with extra functions & promise interface
import handlebars   from 'handlebars'; // handlebars templating
import dateFormat   from 'dateformat'; // Steven Levithan's dateFormat()
import { ObjectId } from 'mongodb';    // MongoDB driver for Node.js
import Debug        from 'debug';      // small debugging utility

const debug = Debug('app:report'); // submission process

import Report         from '../models/report.js';
import jsObjectToHtml from '../lib/js-object-to-html';


class ReportPdf {

    /**
     * Return submitted report details as PDF.
     *
     * The returned value can be assigned to ctx.response.body to be downloaded: eg
     *   const filename = `the whistle incident report ${org}/${project}.pdf`;
     *   ctx.response.body = await ReportPdf.generate(db, project, rptId);
     *   ctx.response.attachment(filename);
     *
     * @param   {string} db
     * @param   {string} project
     * @param   {string} reportId
     * @returns {Buffer} PDF of submitted report
     */
    static async generate(db, project, reportId) {
        debug('ReportPdf.generate', db, reportId);

        const rpt = await Report.get(db, reportId);

        if (!rpt) return null;

        // TODO: what security is worth including to restrict unauthorised access?
        // The id has too much entropy to be guessed, but might be leaked; would it be worth
        // requiring the alias to be supplied as an extra check, or would that be redundant (if the
        // id has leaked, would the alias also be known?). In the meantime, having the project in
        // the url matches the format for other urls, and provides slight extra security.
        if (rpt.project != project) return null;

        const reportHtmlTable = jsObjectToHtml.usingTable(rpt.submitted); // this is simply a <table>

        const submissionDate = ObjectId(reportId).getTimestamp();

        const context = {
            database:   db,
            project:    project,
            timestamp:  dateFormat(submissionDate, 'd mmm yyyy HH:MM'),
            alias:      rpt.alias,
            reportHtml: reportHtmlTable,
            root:       process.cwd(),
        };

        // read, compile, and evaluate handlebars template
        const templateHtml = await fs.readFile('app-report/templates/report-pdf.html', 'utf8');
        const templateHbs = handlebars.compile(templateHtml);
        const html = templateHbs(context);

        // create PDF
        const options = {
            format: 'A4',
        };
        const reportPdfObj = pdf.create(html, options);

        // promisify the toBuffer method
        reportPdfObj.__proto__.toBufferPromise = function() { // TODO: must be a cleaner way to do this!
            return new Promise(function(resolve, reject) {
                this.toBuffer(function (err, buffer) {
                    if (err) return reject(err);
                    resolve(buffer);
                });
            }.bind(this));
        };

        const reportPdfBuff = await reportPdfObj.toBufferPromise();

        return reportPdfBuff;
    }

}


/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */


export default ReportPdf;
