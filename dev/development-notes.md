Development notes
=================

Local testing
-------------

For local testing, incoming HTTP requests from Twilio must be allowed.

- set up an A-record for twilio.dev.movable-type.co.uk to 82.69.8.1
- set router port forwarding for incoming TCP port 80 -> 192.168.1.xxx:3000
- allow port 3000 through *ufw*: `sudo ufw allow 3000`

After testing close port 80 in *ufw*: `sudo ufw delete allow 3000`

When development complete, remove port forwarding in router.

### Twilio

Set up Twilio callbacks to make a POST requests to twilio.dev.movable-type.co.uk.

- configure with `Webhooks/TwiML`
- when a message comes in, use `Webhook` to `POST` to `http://twilio.dev.movable-type.co.uk/message`

https://www.twilio.com/console/sms/getting-started/basics

https://www.twilio.com/console/phone-numbers/incoming

https://support.twilio.com/hc/en-us/articles/223136107-How-does-Twilio-s-Free-Trial-work-

Non-twilio numbers must Be [verified](https://www.twilio.com/console/phone-numbers/verified) before sending or receiving SMS messages.
