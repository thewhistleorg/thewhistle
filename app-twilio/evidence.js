//One instance for each project/organisation combination
class EvidencePage {


    /**
     * Sets up SMS app for a given organisation/project combination
     *
     * @param   {string}   reportId
     * @returns {Object}   Evidence page object
     */    
    constructor(reportId) {
        this.reportId = reportId;
    }

    async renderEvidencePage(ctx) {
        await ctx.render('upload-evidence');
    }

    static async renderInvalidTokenPage(ctx) {
        await ctx.render('invalid-evidence-token');
    }

}
export default EvidencePage;