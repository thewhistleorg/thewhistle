Form Generation Wizard
======================

The long-term objective is that incident report submission forms should be created by created by NGO
staff with potentially no technical expertise at all.

Achieving that goal will be approached in stages:

- Stage 0 (where we are now): currently, creating (or even updating) a form requires knowledge of 
  HTML and JavaScript. This is a useful baseline, as it gives us a target for the required 
  capabilities of the wizard.
- Stage 1: specifying the forms, and the processing that needs to be done to submitted data, in a
  declarative form, most likely using JSON format. This will remain in the final wizard as an 
  intermediate code format.
- Stage 2: a form generation wizard which can be used by entirely non-technical people to create new
  forms (from scratch or by adapting library forms), and to update existing forms.

These stages are expected to be overlapping rather than sequential, with later development informing
earlier stages in a flexible, agile way.


Form specification documents
----------------------------

Initially we propose to use JSON as a declarative forms specification. It is reasonably 
comprehensible to fairly non-technical people, and has good support for using within JavaScript-based
toolchains (compared with e.g. XML).

The initial version will target the capabilities required to specify the GRN *sexual assault* 
use-case, and the Cambridge *survivor-centred response* and *what-where-when-who* sample forms.

It will be valuable to extend these examples with more alpha-partners’ requirements, to be sure we
have a truly flexible and extensible model which will serve as-yet unknown requirements with minimal
further development (especially breaking changes).

Ultimately, we can set out a *JSON Schema* to document (as well as validate) the intermediate format.


Requirements and constraints
----------------------------

Is is assumed that all forms will have an introductory page, a sequence of numbered pages containing
input fields to be completed, and a final review/submit page which will present back to the 
submitter they information they had entered (transformed from HTML input fields to the more 
presentable form it is stored in the database in) and the results of any geocoding performed.

Each page is expected to have a small number of fields, but there is no actual limit imposed.

Full use will be made of browser validation where available (required fields, numeric fields, etc)
but availability of browser validation will not be assumed. Browser validation will be complemented
by server-side validation.

There will be a limited range of layout options for labels, explanatory texts, checkboxes and radio
buttons, etc, and a limited range of overall page layout (title, prev/next buttons, progress 
indicator, etc).

For compatibility with older / less capable browsers, date or date-time elements will be 
entered into separate fields which will be processed into a single *Date* object. We might like to 
offer an alternative which uses html `date` or `datetime-local` input types, hence leveraging native
browser widgits.


Sample cases
------------

- [GRN sexual assault](form-wizard/sexual-assault)


Common library code
-------------------

[Common library code](form-wizard/common-library-code) which will be identical for all projects.
