SMS Reporting
=============

Motivation for Development
--------------------------

SMS reporting had been considered for previous projects, but had not been a priority until we started work on the Humans For Rights Network use-case. This project was designed to allow people in refugee camps to report human rights violations against refugees. Since internet access was not widely available across the camps, we could not solely rely on a web report form, as we had with other projects. As many residents in refugee camps have mobile phones, we decided to develop a system which allowed users to submit reports via SMS.

Implementation
--------------

Twilio is a platform that allows software developers to create applications that can programmatically send and receive text messages. Due to the wide range of countries it can be used in, its competitive pricing and its extensive documentation, we decided to use the Twilio API to implement the Whistle's SMS reporting system. Great dependence on third party software can have negative consequences for a system built on it (for example the third party software prices may dramatically increase). This necessitated highly modular development of the SMS system, meaning that we are not tied into the Twilio API.

Testing
-------

Because sending and receiving texts using Twilio incurs costs, we developed an SMS emulator web app which allowed the SMS reporting system to be tested for free (without using Twilio). This was made possible by the modular development style adopted.