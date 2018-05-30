The Whistle Form Generator
==========================

The Whistle uses a form generator to generate the HTML for incident report submission forms.

The final aim is to have an interactive tool for designing forms, along the lines of 
[Google Forms](https://www.google.co.uk/forms/about), [Typeform](https://www.typeform.com/) or 
[textit](https://textit.in/).

This tool would generate an intermediate format form specification in JSON. This specification would 
then be processed to generate html pages.

As an intermediate stage, forms can be specified in [JSON](https://en.wikipedia.org/wiki/JSON) (or 
more likely for better human comprehensibility in [YAML](https://en.wikipedia.org/wiki/YAML)).

Having forms specified in YAML means that form designers do not have to be familiar with HTML, form
specifications can be validated using [JSON Schema](http://json-schema.org/) ()which improves
reporting of errors in forms) and the forms are guaranteed to be consistently styled valid HTML.


Form design aspects specific to The Whistle
-------------------------------------------

The only current use case is Global Rights Nigeria, but the forms have been developed with an 
awareness that future partners will have varying requirements.

From the GRN use case, two specific requirements have emerged:

- radio buttons and/or checkboxes often have subsidiary associated information, which should be
  displayed only when that option is selected (though in some cases the subsidiary information might
  be initially displayed rather than hidden, as with the ‘description’ entry).
- some texts may depend on previously answered questions: specifically, in the case of GRN, the 
  ‘are you reporting on behalf of yourself or someone else’ question.

In the future, entire flow might depend on previously answered questions: the current system does
not try to address this, it will be addressed as and when we have a use case which requires it,
and an implementation of that use case.

The GRN case does not make use of *required* inputs: if this is required for future use cases, the
`attributes` property can be used in the JSON spec, but visual feedback will be required (currently
missing).


Sample ‘rape is a crime’ report
-------------------------------

The initial case is to implement a form spec which will be capable of generating the existing
‘rape is a crime’ report.

The YAML can be viewed here:

- [rape-is-a-crime](/spec/grn/rape-is-a-crime.yaml)
- [rape-is-a-crime-0](/spec/grn/rape-is-a-crime-0.yaml) (intro)
- [rape-is-a-crime-1](/spec/grn/rape-is-a-crime-1.yaml) (used-before)
- [rape-is-a-crime-2](/spec/grn/rape-is-a-crime-2.yaml) (on-behalf-of / survivor-gender/age)
- [rape-is-a-crime-3](/spec/grn/rape-is-a-crime-3.yaml) (when / still-happening)
- [rape-is-a-crime-4](/spec/grn/rape-is-a-crime-4.yaml) (where)
- [rape-is-a-crime-5](/spec/grn/rape-is-a-crime-5.yaml) (who)
- [rape-is-a-crime-6](/spec/grn/rape-is-a-crime-6.yaml) (description)
- [rape-is-a-crime-7](/spec/grn/rape-is-a-crime-7.yaml) (action-taken)
- [rape-is-a-crime-8](/spec/grn/rape-is-a-crime-8.yaml) (extra-notes)
- [rape-is-a-crime-whatnext](/spec/grn/rape-is-a-crime-whatnext.yaml) (resources)

The ‘index’ *rape-is-a-crime* page specifies the other pages in the report, and may include general
report configuration, as we work with other partners with varying requirements.


Specification structure
-----------------------

### Pages

The specification starts with a list of pages, using 
[JSON Reference](https://tools.ietf.org/id/draft-pbryan-zyp-json-ref-03.html)s to specify each page.

The form may be held in a single file, or may be divided into separate files for each page; in
either case, [JSON Reference](https://tools.ietf.org/id/draft-pbryan-zyp-json-ref-03.html)s are
used to identify different pages.

A quirk of JSON is that integer properties will get iterated before string properties, so page ‘0’
will appear before page ‘index’. To get around this, and have integer pages such as 
`grn/rape-is-a-crime/1`, pages prefixed with ‘p’ or ‘page-’ will get translated to integer indexes.

The basic approach is that each page comprises a sequence of (markdown) `text` elements, and `input` 
elements. The `input` elements may have subsidiary parts which will be conditionally displayed below
the input element. The `text` elements may be an object with alternative wordings for e.g. reporting 
on behalf of ‘self’ / ‘other’.

The `text` elements are [markdown](https://daringfireball.net/projects/markdown/syntax), and may 
include [handlebars](https://daringfireball.net/projects/markdown/syntax) embedded expressions.

In the case where alternate texts are to be used depending on previous answers, the `text` element
is an object, with texts identified by the relevant question and answer: e.g. 
[rape-is-a-crime-3](/spec/grn/rape-is-a-crime-3.yaml).


Generation process
------------------

The YAML form specifications are available on report.thewhistle.org/spec – e.g. 
[report.thewhistle.org/spec/grn/rape-is-a-crime.yaml](https://report.thewhistle.org/spec/grn/rape-is-a-crime.yaml).

In the future, these may be taken from any location, so that partners can develop their own form
specifications without requiring the involvement of The Whistle team (the location can be taken from
an environment variable).

The HTML is generated on first request for a page from the relevant report. This minimises app
startup time; on Chris’s development environment, this takes around 250ms – on the production
server, it should be less. The generated HTML is held in `/.generated-reports`.


Recorded details
----------------

For all inputs, the label for the input in the recorded submitted details will be the input label.
For this reason, all input inputs must have a label, even though some (such a subsidiary details)
do not have a label displayed. 


Hardwired assumptions
---------------------


Is is assumed that all forms will have an introductory page, a sequence of numbered pages containing
input fields to be completed, and a final review/submit page which will present back to the 
submitter they information they had entered (transformed from HTML input fields to the more 
presentable form it is stored in the database in) and the results of any geocoding performed.

Each page is expected to have a small number of fields, but there is no actual limit imposed.

Full use will be made of browser validation where available (required fields, numeric fields, etc)
but availability of browser validation will not be assumed. Browser validation will be complemented
by server-side validation (TBC!).

- `used-before` (Alias) must be on page 1 (it is handled by `Report.submissionStart()` rather than
  by `Report.submissionDetails()`)
- there must be a final page 'whatnext' (which is handled differently from other pages)
- on-behalf-of (Myself / Someone else) is mandatory (for subsequent questions), but this is not 
  manifest to user completing form
