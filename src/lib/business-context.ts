/**
 * ─────────────────────────────────────────────────────────────────────
 * EDIT THIS FILE. It is the whole point of step 5.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Priority is only worth anything if it reflects how THIS business actually
 * works. A generic "does the email contain the word urgent" rule is what a
 * contact form does. What makes this different is that Claude is told what
 * matters to you specifically — what a good enquiry looks like, what your
 * lead times are, what is a waste of your time — and reasons from that.
 *
 * The text below is a starting point written from limited information.
 * Replace it with the real thing. The more concrete and honest it is
 * (including the unflattering parts), the better the triage gets.
 */
export const BUSINESS_CONTEXT = `
ABOUT THE BUSINESS
Storyworks is a Singapore-based corporate training and communications practice.
The main work is designing and delivering storytelling and communication
workshops for organisations — corporate teams, leadership groups, and
government agencies — plus related consulting.

WHAT A HIGH-VALUE ENQUIRY LOOKS LIKE
- A named organisation with a real budget, or a budget range stated outright.
- Group or cohort training rather than one individual seeking coaching.
- A specific date, quarter, or deadline attached.
- Government agencies, statutory boards, and large regional employers: these
  have real procurement budgets and tend to become repeat clients.
- Anything referencing a referral from a past client.

WHAT IS LOW PRIORITY
- Vendors, agencies, and SaaS companies selling something.
- Generic partnership or collaboration proposals with no specific offer.
- Requests to speak for free or for "exposure".
- Students or individuals asking for career advice. Worth a courteous reply,
  but not urgent.
- Recruitment and staffing outreach.

TIMING REALITIES
- Workshop delivery needs roughly 4-6 weeks of lead time to design well.
  An enquiry asking for delivery sooner than that is genuinely time-critical,
  because the decision to accept or decline has to be made quickly.
- Corporate training budgets are often use-it-or-lose-it by fiscal year end.
  An enquiry late in a budget cycle is more likely to convert and should be
  treated as more urgent than its tone suggests.
- Procurement processes at large organisations are slow. An early-stage
  enquiry from one is still worth responding to promptly, because the clock
  on their side has already started.
`.trim();
