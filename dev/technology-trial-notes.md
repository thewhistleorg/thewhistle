The Whistle Project technology trial: notes
==========================================


These notes form a living/working document to set out my understanding of the objectives and 
priorities of *The Whistle* development, and to document my progress in developing it.

My intention is to make sure we have a clear common understanding of my planned contributions to the 
project.


Overview
--------

*The Whistle* will likely comprise many components or subsystems, for various users or user-groups, 
working through various communication channels.

*The Whistle* components will include
 - incident reporting tools for victims/survivors to use directly
 - incident reporting tools for agencies to use on behalf of (e.g. while interviewing) victims/survivors
 - administrative tools for agencies (e.g. NGOs) to use to label, tag, classify, etc incident reports
 - aggregated reporting facilities for agencies to have overviews of incident reports relevant to them
 - aggregated reporting facilities for *The Whistle* team to have complete overviews

Options for incident reporting tools include
 - web-based form filling for agencies interviewing victims/survivors
 - web-based form filling for victims/survivors
 - SMS interactions with a ‘bot’, using e.g. [TextIt](http://www.textit.in) programmed 
   ‘[flows](http://docs.textit.in/#topic_6)’ via e.g. [Twilio](https://www.twilio.com), 
   [Africa’s Talking](https://www.africastalking.com/)
 - other TextIt ‘flow’ interactions including [Facebook messenger](http://docs.textit.in/#topic_11), 
   [Twitter](http://docs.textit.in/#topic_13), [Telegram](http://docs.textit.in/#topic_12), 
   [IVR](http://docs.textit.in/#topic_9) (interactive voice response)
 - SMS interactions with a person, using e.g. Twilio directly

Current components: initial technology trials are available at
 - [report.thewhistle.dev.movable-type.co.uk](http://report.thewhistle.dev.movable-type.co.uk) for 
   web-based incident reporting trials (both victim/supporter and agencies)
 - [admin.thewhistle.dev.movable-type.co.uk](http://admin.thewhistle.dev.movable-type.co.uk) for 
   trials of aggregated reporting facilities, and (currently) for Twilio direct SMS interactions

These are currently hosted as free-tier Heroku instances; they sandbox environments and are 
completely reset on a daily basis.

### Motivations

Beneficiaries of *The Whistle* will be
 - victims/survivors who will be offered information about what information, support packs, etc are 
   available to them, what material help may be available to them, what options they have for 
   prosecution, etc
 - agencies who support victims who may have improved tools to offer that support
 - agencies who wish to have overview data on prevalence and forms of sexual harassment/assault (and 
   more general human-rights violations or corporate misconduct)

No-one will be obliged to use *The Whistle* to report incidents, so I believe we need to clear on
what benefits we are offering to encourage such usage, and how well we are achiving those.

### Anonymity

Victims/survivors may wish to remain anonymous, but to recontact *The Whistle* to follow up on a 
report they made.

To this end, they could be allocated a random identifier such as with 
[adjective-adjective-animal](https://www.npmjs.com/package/adjective-adjective-animal). This might 
have to be used in conjunction with a password, to avoid abuse?

If *The Whistle* wanted to be able to contact victims/survivors, we would have to collect either a 
telephone number or an e-mail. This would be entirely at the discretion of the victim/survivor.

For the Cambridge University trial, there is some conflict between a requirement for anonymity and
a requirement to verify students are attending Cambridge University.


*The Whistle* Development
-------------------------

Trials to date have been done on a [Node.js](https://nodejs.org/en/) JavaScript platform, using the
[Koa](http://koajs.com/) framework, hosted on [Heroku](https://www.heroku.com/).

This development stack facilitates fast prototyping. I believe it can be a good basis for final 
development, but I am quite happy to be open to other potential platforms.

### Web-based reporting

Currently I have developed two trial web-based incident report trials:
 - [report.thewhistle.dev.movable-type.co.uk/wwww](http://report.thewhistle.dev.movable-type.co.uk/wwww),
   based on the what-where-when-who form from the Chain React deliverable 3.2 document
 - [report.thewhistle.dev.movable-type.co.uk/scr](http://report.thewhistle.dev.movable-type.co.uk/scr),
   based on the Survivor-Centred Response form in the Appendix of the SGBV Response Tool-Pack

These are hand-coded; ultimately, they need to be specified in as non-technical a way as possible;
at very least using a JSON-formatted specification, and perhaps ultimately using a graphical design
tool along the lines of TextIt’s *flow* creator. These hand-coded examples should be useful to
understand the required functionality of easier-to-use tools.

Once completed and submitted, these reports can be viewed in the [reports](/reports) section (the 
reports are wiped from the sandbox environment on a daily basis).

#### Web-based reporting requirements for forms

Identifying requirements for web-based reporting forms is important both for evaluating suitability
of Typeform, or any available alternative, or planning capabilities if I create some kind of tool.

Considerations include:
 - auto show/hide of eg ‘other’ detail fields, and similar cases such as ‘penetration involved’ 
   details.
 - conditional logic: should e.g. pages be skipped conditionally on previous answers?

(Note: Typeform has conditional logic, but it looks clumsy; I need to spend more time looking into it).


### SMS person-to-person reporting

#### Twilio

I have set up a (free) trial Twilio account for trials. This can only be accessed by registered
phone numbers, hence I have registered phone numbers of the team.

If a text is sent to 01702 683045 it will appear in the [messages](/messages) section. If messages
are filtered to a specific number (by clicking on the number), a response can be sent back.

#### TextIt

I have set up a (free) trial TextIt account for trials. This is linked to Twilio. Having a TextIt
account linked to Twilio requires a separate phone number from the pure Twilio test, so I have
registered a second number (@ $1/month).

I am working on creating a TextIt ‘flow’ for a chatbot with something like the following interaction:

- receive request to report incident
- ask ‘when did this happen?’
- parse natural-language response (including e.g. ‘yesterday’) to full date
- confirm parsed date is correct (otherwise ask again)
- ask ‘where did it happen?’
- geocode response to formatted address (& confirm?)
- ask for brief description
- ask if victim wishes to be contacted by ??? (if so, ask for name & phone number)
- thank victim & provide links to resources based on textual analysis of description

This operates through ‘webhooks’ by which mechanism TextIt makes calls to a REST API which I am 
building as part of the trial, which performs e.g. date parsing, geocoding, and some form of textual
analysis (details TBD).


### Cambridge University *Raven* authentication service

The Cambridge University trial will be available to Cambridge University students only, which may
involve authenticating against the *Raven* central web authentication service. Details and options
for this will need to be investigated.


### Dashboard reports

#### Geographic reporting

The current trial simply uses [Google Maps](https://developers.google.com/maps/documentation/javascript)
to plot incident locations (using 
[marker clustering](https://developers.google.com/maps/documentation/javascript/marker-clustering) 
for dense markers).

Google Maps could also be used with 
[circle markers](https://developers.google.com/maps/documentation/javascript/earthquakes#circle_size), 
perhaps to display aggregate data. One could imagine grouping incident reports by postcode area or 
outcode, using circle size to indicate incidence, colour to indicate (maximum) severity, and opacity 
to indicate age, for example.

Another possibility would be to use Google’s
[Marker GeoCharts](https://developers.google.com/chart/interactive/docs/gallery/geochart#marker-geocharts),
though while this has an attractive zoom feature, it seems less flexible.

#### Timeline reporting

Various options for timeline reporting could be envisaged.

The obvious timeline reporting would be a histogram of incidence frequencies within time chunks 
(numbers of incidents per month, for instance). Coloured series could be used to indicate category,
severity, etc.

Other possibilities for the y-axis could include distance from a specified location, using 
[bubble charts](https://developers.google.com/chart/interactive/docs/gallery/bubblechart) to 
represent other variables such as severity, category, etc.


### Development checklist

This is a list of developments I plan to work on, more-or-less ordered by priority.

Let me know if there are items to be added or removed, or if the priorities need adjusting.

 - develop initial SMS reporting using TextIt (based on GRN data collection)
 - develop further facilities to tag / label / classify reports and/or messages
 - develop further geographic (map-based) reporting
 - consider how dashboard structure will work with different organisations; initial model GRN & Camb Uni
 - look into Raven authentication options
 - look into WikiRate integration?
 - research linking TextIt to Facebook (with Richard?)
 - research linking TextIt to Twitter, Telegram
 - set up trial TextIt flow (waiting on proposed bot interaction from Ricky?)
 - look into suitability of [Typeform](https://www.typeform.com) (with Richard?)
 - look into suitability of [Ushahidi](https://www.ushahidi.com) (with Vignesh)
 - look into JSON form spec
 - look into UI tools for creating forms
 - integrate support resources / links

Deadline for presentable / demonstrable version: early June.
Review meeting: 10 July.
