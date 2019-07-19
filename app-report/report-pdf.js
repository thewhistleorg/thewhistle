/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Generate PDF of report.                                                         C.Veness 2018  */
/*                                                                                                */
/*                                       © 2018 Cambridge University / The Whistle | MIT licence  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import pdf          from 'html-pdf';   // HTML to PDF converter
import fs           from 'fs-extra';   // fs with extra functions & promise interface
import handlebars   from 'handlebars'; // handlebars templating
import dateFormat   from 'dateformat'; // Steven Levithan's dateFormat()
import Debug        from 'debug';      // small debugging utility

const debug = Debug('app:report'); // submission process

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
     * @param   {Object[]} reports
     * @returns {Buffer} PDF of submitted report(s)
     */
    static async generate(db, project, reports) {
        debug('ReportPdf.generate', db, project, reports.map(rpt => rpt._id));

        reports.sort((a, b) => a._id.getTimestamp() > b._id.getTimestamp() ? -1 : 1); // most recent first

        const context = {
            org:      db,
            project:  project,
            root:     process.cwd(),
            lastdate: dateFormat(reports[0]._id.getTimestamp(), 'd mmm yyyy HH:MM'),
            s:        reports.length > 1 ? 's' : '',
            reports:  reports.map(rpt => ({
                timestamp:  dateFormat(rpt._id.getTimestamp(), 'ddd d mmm yyyy HH:MM'),
                alias:      rpt.alias,
                reportHtml: jsObjectToHtml.usingTable(rpt.submitted), // this is simply a <table>
            })),
        };

        // read, compile, and evaluate handlebars template
        const templateHtml = await fs.readFile('app-report/templates/report-pdf.html', 'utf8');
        const templateHbs = handlebars.compile(templateHtml);
        const html = templateHbs(context);

        // create PDF
        const reportPdfObj = pdf.create(html, { format: 'A4' });

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
