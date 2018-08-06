//One instance for each project/organisation combination
class EvidencePage {


    /**
     * Sets up SMS app for a given organisation/project combination
     *
     * @param   {string}   reportId
     * @returns {Object}   Evidence page object
     */    
    constructor(report) {
        this.report = report;
    }

    async renderEvidencePage(ctx) {
        let date = new Date();
        date.setDate(date.getDate() - 7)
        if (date < this.report.lastUpdated) {
            //Report last updated within the last week
            await ctx.render(`evidence-${this.report.project}`);
        } else {
            //Report last updated more than a week ago
            await ctx.render(`evidence-timeout-${this.report.project}`);
        }
    }

    static async renderInvalidTokenPage(ctx) {
        await ctx.render(`evidence-invalid-token-${this.report.project}`);
    }

}
export default EvidencePage;