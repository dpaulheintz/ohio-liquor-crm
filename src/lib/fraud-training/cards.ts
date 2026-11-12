// "Scam or Legit?" fraud training — the card bank. EDIT THIS FILE to change the game.
//
// How it works
// - 5 rounds. Each play deals 6 cards per round (30 total): 1 or 2 legit, the rest scams, in random
//   order. The server grades answers from this file, so a change here takes effect on the next deploy.
// - Keep about 12 cards per round and about 1 in 4 legit, so people learn not everything is a scam.
// - Card ids must be unique and should never be reused for a different card (old attempts and the
//   admin "most missed" list refer to them). To retire a card, delete it; to change one a lot, give it
//   a new id.
// - Keep explanations short, kind and specific (one or two lines). No lectures.
//
// Card fields
//   id        unique, e.g. 'r1-adam-giftcards'
//   round     1 Texts & DMs · 2 Phone Calls · 3 At the Door · 4 Email & Payroll · 5 On the Floor
//   format    'text' | 'call' | 'email' | 'door' | 'floor' (how the card is drawn)
//   sender    who it looks like it's from (contact, caller, email name, person at the door, scene title)
//   content   the message, call transcript, email body, what they say, or what you see
//   answer    'scam' | 'legit'
//   redFlag   (scams) what gives it away       whyLegit (legit) why it's fine
//   whatToDo  what to do next
//   rule      optional: which Golden Rule it teaches (1-6)
// Optional look-and-feel fields
//   app       text: 'sms' (default) | 'imessage' | 'instagram' | 'group'
//   from      text/call: phone number shown; email: the address
//   subject   email subject line
//   look      door: 'suit' | 'badge' | 'uniform' | 'driver' | 'casual' | 'inspector'
//   scene     floor: 'qr' | 'reader' | 'cash' | 'counterfeit' | 'cards' | 'phone' | 'tap' | 'receipt' | 'pos'

export type CardFormat = 'text' | 'call' | 'email' | 'door' | 'floor';
export type Answer = 'scam' | 'legit';

export interface FraudCard {
  id: string;
  round: 1 | 2 | 3 | 4 | 5;
  format: CardFormat;
  sender: string;
  content: string;
  answer: Answer;
  redFlag?: string;
  whyLegit?: string;
  whatToDo: string;
  rule?: 1 | 2 | 3 | 4 | 5 | 6;
  app?: 'sms' | 'imessage' | 'instagram' | 'group';
  from?: string;
  subject?: string;
  look?: 'suit' | 'badge' | 'uniform' | 'driver' | 'casual' | 'inspector';
  scene?: 'qr' | 'reader' | 'cash' | 'counterfeit' | 'cards' | 'phone' | 'tap' | 'receipt' | 'pos';
}

export const ROUNDS = [
  { n: 1, title: 'Texts & DMs', tagline: 'Your phone buzzes. Who is it really?' },
  { n: 2, title: 'Phone Calls', tagline: 'The host stand phone is ringing.' },
  { n: 3, title: 'At the Door', tagline: 'Someone walks up to the host stand.' },
  { n: 4, title: 'Email & Payroll', tagline: 'Fresh in your inbox.' },
  { n: 5, title: 'On the Floor', tagline: 'Eyes up during service.' },
] as const;

export const GOLDEN_RULES = [
  'Urgency + secrecy + a weird way to pay (gift cards, Zelle, Venmo, Cash App, crypto, Bitcoin ATM, wire) = SCAM.',
  'Verify using a number you already have. Never the number, link or QR code they give you.',
  'Adam, Jeff and your managers will never text you asking you to buy gift cards or send money.',
  'Never share login codes or passwords, and never give anyone remote access to the POS.',
  'Real inspectors, agents and officers never collect money on the spot. Stay calm, be polite, get a manager.',
  'When in doubt, stop and get a manager. Nobody ever gets in trouble for checking.',
] as const;

export const CARDS: FraudCard[] = [
  // ─── Round 1: Texts & DMs ─────────────────────────────────────────────────
  {
    id: 'r1-adam-giftcards', round: 1, format: 'text', sender: '(614) 555-0187', app: 'sms', answer: 'scam', rule: 3,
    content: "Hey it's Adam. Stuck in a meeting, can't talk. Need 4 Visa gift cards ($200 each) for a client. Scratch the backs and text me pics. I'll pay you back tonight.",
    redFlag: "New number, a rush, \"can't talk,\" and gift cards. That's the classic boss scam.",
    whatToDo: "Don't reply. Call Adam or your manager on a number you already have.",
  },
  {
    id: 'r1-jeff-venmo', round: 1, format: 'text', sender: '(380) 555-0129', app: 'sms', answer: 'scam', rule: 3,
    content: "Jeff here, new phone, save this number. Can you Venmo our linen vendor $300? They're about to cancel us. I'll reimburse you Friday.",
    redFlag: 'Owners never ask staff to pay vendors, especially with your own money. "New phone" is the setup.',
    whatToDo: "Don't send a dime. Check with your manager, or call Jeff on the number you already have.",
  },
  {
    id: 'r1-usps-fee', round: 1, format: 'text', sender: '28777', app: 'sms', answer: 'scam', rule: 2,
    content: 'USPS: Your package is on hold due to an incomplete address. Pay the $1.99 redelivery fee within 12 hrs: usps-redeliver-help.com',
    redFlag: "USPS doesn't text you for fees, and that's not usps.com. The $1.99 is bait for your card number.",
    whatToDo: 'Delete it. Track packages on usps.com or the USPS app yourself.',
  },
  {
    id: 'r1-turnpike-toll', round: 1, format: 'text', sender: '(937) 555-0144', app: 'sms', answer: 'scam', rule: 2,
    content: 'Ohio Turnpike: You have an unpaid toll of $6.89. Pay today to avoid a $50 late fee: ohioturnpike-tolls.info',
    redFlag: 'A look-alike link plus a scary late fee. Toll agencies send bills, not panic texts.',
    whatToDo: "Don't tap it. If you're worried, go to the real Ohio Turnpike site yourself.",
  },
  {
    id: 'r1-bank-code', round: 1, format: 'text', sender: 'Your Bank Alerts', app: 'sms', answer: 'scam', rule: 4,
    content: 'Fraud alert: we blocked a $482.19 charge. To unlock your card, reply with the 6-digit code we just sent you.',
    redFlag: "That code is the key to your account. Your real bank will never ask you to send it back.",
    whatToDo: 'Never share it. Call the number on the back of your card.',
  },
  {
    id: 'r1-recruiter', round: 1, format: 'text', sender: '+1 (213) 555-0176', app: 'sms', answer: 'scam',
    content: 'Hi! Recruiter here, we saw your resume. Remote job, $500/day, no experience needed. Message me on WhatsApp to start today!',
    redFlag: '$500 a day, no experience, "move to WhatsApp." Too good to be true, every time.',
    whatToDo: 'Ignore it and block the number.',
  },
  {
    id: 'r1-insta-perks', round: 1, format: 'text', sender: 'highbank.employee.perks', app: 'instagram', answer: 'scam', rule: 4,
    content: 'Staff merch giveaway! Log in with your Paycom username and password here to claim your free hoodie: hb-perks.link/claim',
    redFlag: "A random account asking for your work login. High Bank won't run giveaways through DMs.",
    whatToDo: "Don't log in. Report the account and give your manager a heads-up.",
  },
  {
    id: 'r1-wrong-number', round: 1, format: 'text', sender: '(202) 555-0168', app: 'imessage', answer: 'scam',
    content: 'Hi Linda! Are we still on for golf Sunday? My assistant said you moved the tee time.',
    redFlag: "The friendly \"wrong number\" text is an opener. They chat for weeks, then pitch crypto or ask for money.",
    whatToDo: "Don't reply, not even to say wrong number. Delete and block.",
  },
  {
    id: 'r1-it-code', round: 1, format: 'text', sender: '(614) 555-0133', app: 'sms', answer: 'scam', rule: 4,
    content: "Hey this is Kyle from IT. We're resetting Toast logins tonight. Text me the 6-digit code you just got so your account doesn't lock.",
    redFlag: 'Nobody needs the code sent to your phone. Whoever has it can get into your account.',
    whatToDo: "Don't send it. Tell your manager someone is fishing for codes.",
  },
  {
    id: 'r1-gm-meeting', round: 1, format: 'text', sender: 'Grandview Staff', app: 'group', answer: 'legit',
    content: 'Maria (GM): Reminder: all-staff meeting Tuesday at 3pm. Wear your black tee.',
    whyLegit: 'Your usual group chat, a normal reminder, no link and no money.',
    whatToDo: "Put it on your calendar. That's it!",
  },
  {
    id: 'r1-shift-swap', round: 1, format: 'text', sender: 'Jordan', app: 'imessage', answer: 'legit',
    content: "Can you take my Saturday PM? I'll put the swap in the schedule app.",
    whyLegit: 'A coworker you know, a normal favor, and the swap still goes through the schedule app.',
    whatToDo: 'Say yes or no, then approve it in the app.',
  },
  {
    id: 'r1-pharmacy', round: 1, format: 'text', sender: 'CVS Pharmacy', app: 'sms', answer: 'legit',
    content: 'CVS: Your prescription is ready for pickup at your usual store. Reply STOP to opt out.',
    whyLegit: "No link, no payment, nothing to log into. It just tells you something you expected.",
    whatToDo: 'Pick it up as normal. Not sure? Check the CVS app yourself.',
  },

  // ─── Round 2: Phone Calls ─────────────────────────────────────────────────
  {
    id: 'r2-toast-anydesk', round: 2, format: 'call', sender: 'Toast Support', from: '(855) 555-0199', answer: 'scam', rule: 4,
    content: "This is Toast Support. Your terminals need an emergency security update or they'll stop taking cards tonight. Download AnyDesk on the POS so I can connect.",
    redFlag: 'Remote access hands them the POS and your card data. Real support doesn\'t cold-call for it.',
    whatToDo: 'Hang up and tell a manager. Charles and the managers handle Toast.',
  },
  {
    id: 'r2-aep-shutoff', round: 2, format: 'call', sender: 'AEP Ohio', from: '(800) 555-0110', answer: 'scam', rule: 1,
    content: 'This is AEP Ohio. Your power will be shut off in 45 minutes for a past-due balance. Pay now by Zelle or a prepaid card.',
    redFlag: 'No utility shuts you off in 45 minutes, and none takes Zelle or prepaid cards.',
    whatToDo: 'Hang up. A manager can call the number on the real AEP bill.',
  },
  {
    id: 'r2-fake-gm-refund', round: 2, format: 'call', sender: 'Unknown', from: '(614) 555-0152', answer: 'scam', rule: 2,
    content: "This is the GM from Westerville. I've got a VIP who was overcharged. Run a $400 refund to this card number real quick, I'll explain later.",
    redFlag: 'A rushed refund to a new card number is how thieves cash out. Even a real GM wouldn\'t do it by phone.',
    whatToDo: "Say your manager will call back on the store's number. Refunds go through the manager on site.",
  },
  {
    id: 'r2-double-charge', round: 2, format: 'call', sender: 'Unknown', from: '(740) 555-0181', answer: 'scam',
    content: 'I ate there last night and got double charged. Can you refund it to my other card? The first one is closed.',
    redFlag: '"Send it to my other card" is a common trick. Refunds only go back to the card that paid.',
    whatToDo: 'Get a manager. Refunds go to the original payment only.',
  },
  {
    id: 'r2-ssa-suspended', round: 2, format: 'call', sender: 'Spam Risk', from: '(202) 555-0100', answer: 'scam',
    content: 'This is the Social Security Administration. Your Social Security number has been suspended due to suspicious activity. Press 1 to speak to an agent.',
    redFlag: "Social Security numbers don't get \"suspended,\" and the SSA doesn't robocall threats.",
    whatToDo: "Hang up. Don't press anything.",
  },
  {
    id: 'r2-irs-bitcoin', round: 2, format: 'call', sender: 'Unknown', from: '(202) 555-0193', answer: 'scam', rule: 1,
    content: 'This is the IRS. Your restaurant owes back taxes. Pay today with Bitcoin or agents will come to the restaurant.',
    redFlag: 'The IRS sends letters first and never takes Bitcoin or gift cards.',
    whatToDo: 'Hang up and tell a manager. The owners handle tax mail.',
  },
  {
    id: 'r2-google-listing', round: 2, format: 'call', sender: 'Google Business', from: '(650) 555-0140', answer: 'scam',
    content: 'Google Business here. Your listing will be deleted today unless you pay $299 to verify it.',
    redFlag: "Google doesn't call to charge you to keep your listing.",
    whatToDo: 'Hang up. Managers handle our Google listing.',
  },
  {
    id: 'r2-bank-fraud-dept', round: 2, format: 'call', sender: 'Bank Fraud Dept', from: '(888) 555-0177', answer: 'scam', rule: 4,
    content: "This is your bank's fraud department. We see a suspicious charge. To confirm it's you, read me the code we just texted.",
    redFlag: 'Your bank already knows who you are. Anyone asking for that code is trying to get in.',
    whatToDo: 'Hang up and call the number on the back of your card.',
  },
  {
    id: 'r2-family-bail', round: 2, format: 'call', sender: 'Unknown', from: '(330) 555-0108', answer: 'scam', rule: 1,
    content: "Hey, it's me... I got in a wreck and I'm in jail. I need $1,800 for bail in gift cards tonight. Please don't tell Mom.",
    redFlag: 'Panic, secrecy and gift cards. Voices can even be faked with AI now.',
    whatToDo: 'Hang up and call your family member on the number you know.',
  },
  {
    id: 'r2-reservation', round: 2, format: 'call', sender: 'Guest', from: '(614) 555-0126', answer: 'legit',
    content: 'Hi! Can I get a reservation for 8 on Saturday at 6? And do you have a kids menu?',
    whyLegit: 'A guest asking guest questions. Nothing about money or logins.',
    whatToDo: 'Book it, and brag about the kids menu.',
  },
  {
    id: 'r2-distributor', round: 2, format: 'call', sender: 'Sam · Food Distributor', from: '(614) 555-0115', answer: 'legit',
    content: "This is Sam from your food distributor, confirming tomorrow's delivery window is 7 to 9am.",
    whyLegit: "An expected delivery confirmation. They aren't asking for money or info.",
    whatToDo: 'Thank them and let the kitchen know.',
  },
  {
    id: 'r2-health-followup', round: 2, format: 'call', sender: 'Columbus Public Health', from: '(614) 555-0123', answer: 'legit',
    content: "Hi, this is Columbus Public Health calling to schedule your routine follow-up inspection. Is the manager available?",
    whyLegit: "They want the manager, not money, codes or passwords.",
    whatToDo: 'Get the manager on the phone.',
  },

  // ─── Round 3: At the Door ─────────────────────────────────────────────────
  {
    id: 'r3-marshal-warrant', round: 3, format: 'door', sender: 'A man in a suit', look: 'suit', answer: 'scam', rule: 5,
    content: "I'm a U.S. Marshal. There's a warrant for your GM for missing jury duty. It can be cleared today with a $2,000 bond in gift cards.",
    redFlag: 'Warrants are never cleared with gift cards, and officers don\'t collect payments at the door.',
    whatToDo: "Stay calm and polite, and get a manager. Don't pay anything.",
  },
  {
    id: 'r3-oiu-cash-fine', round: 3, format: 'door', sender: 'Plainclothes "agent"', look: 'badge', answer: 'scam', rule: 5,
    content: 'Ohio Investigative Unit. Your bartender served a minor. Pay the $500 fine in cash right now and this goes away.',
    redFlag: 'Liquor-law fines are never paid in cash to an agent on the spot.',
    whatToDo: 'Stay calm, be polite, and get a manager.',
  },
  {
    id: 'r3-fire-extinguishers', round: 3, format: 'door', sender: '"Fire inspector"', look: 'uniform', answer: 'scam', rule: 5,
    content: 'Fire inspector. Your extinguishers failed. I can recertify them today for $350 cash, or I have to shut you down.',
    redFlag: "Real inspectors write up violations. They don't sell same-day fixes for cash.",
    whatToDo: 'Get a manager. Our extinguisher service is booked through the office.',
  },
  {
    id: 'r3-grease-trap', round: 3, format: 'door', sender: 'A guy in a work polo', look: 'uniform', answer: 'scam',
    content: "I'm from your grease trap company. You owe for last month's service. Card or cash now and I'm out of your hair.",
    redFlag: 'Vendors get paid through the office, never at the host stand.',
    whatToDo: 'Take their name and number and hand it to a manager.',
  },
  {
    id: 'r3-pickup-mike', round: 3, format: 'door', sender: 'A delivery driver', look: 'driver', answer: 'scam',
    content: "Pickup for Mike. App's being weird, it won't load the order. Just give me the bag, I'm in a hurry.",
    redFlag: "If the app can't show the order, it's not theirs to take.",
    whatToDo: 'Hold the bag and get a manager.',
  },
  {
    id: 'r3-charity-cash', round: 3, format: 'door', sender: 'Someone with a clipboard', look: 'casual', answer: 'scam', rule: 1,
    content: "We're collecting for the Ohio Fallen Firefighters fund. Every restaurant on this street gave $100. Can you do cash or Venmo from the register?",
    redFlag: 'Pressure, plus "pay from the register." Real charities don\'t need money from the drawer.',
    whatToDo: 'Politely say the managers handle donations, and get one if they push.',
  },
  {
    id: 'r3-gas-meter', round: 3, format: 'door', sender: '"Gas company" worker', look: 'uniform', answer: 'scam', rule: 6,
    content: "Gas company. We got a leak report and need to check the meter in your back office. Don't worry about grabbing the manager, I'll be quick.",
    redFlag: 'Anyone trying to skip the manager and get into the back office should get a manager.',
    whatToDo: 'Have them wait at the door and get a manager right away.',
  },
  {
    id: 'r3-cod-fee', round: 3, format: 'door', sender: 'A courier with a box', look: 'driver', answer: 'scam',
    content: "Delivery for the owner. There's a $25 COD fee due, card only, on my handheld.",
    redFlag: 'Surprise fees for a package nobody mentioned.',
    whatToDo: "Don't pay. Ask a manager if we're expecting it.",
  },
  {
    id: 'r3-reader-tech', round: 3, format: 'door', sender: 'A "card machine tech"', look: 'casual', answer: 'scam', rule: 4,
    content: "Hi, corporate sent me to service your credit card machines. I just need 10 minutes alone with them.",
    redFlag: "Nobody gets alone time with the card readers. That's how skimmers get installed.",
    whatToDo: "Have them wait and get a manager. We weren't told anyone was coming.",
  },
  {
    id: 'r3-health-inspector', round: 3, format: 'door', sender: 'Health department inspector', look: 'inspector', answer: 'legit', rule: 5,
    content: "Hi, I'm with the health department. Here's my ID. Can I speak with the manager on duty? I'll need to see the kitchen.",
    whyLegit: 'Official ID, asks for the manager, no money involved. That\'s a normal inspection.',
    whatToDo: 'Be polite and get the manager on duty right away.',
  },
  {
    id: 'r3-ttb-agent', round: 3, format: 'door', sender: 'TTB federal agent (DSP)', look: 'badge', answer: 'legit',
    content: "Good morning, I'm with the TTB. Here's my badge. I need to speak with the distillery manager and review your production records.",
    whyLegit: 'A federal agent asking for the distillery manager and records, not money.',
    whatToDo: "Get the DSP manager right away. Don't hand over records yourself.",
  },
  {
    id: 'r3-beer-rep', round: 3, format: 'door', sender: 'Our beer rep (you know her)', look: 'casual', answer: 'legit',
    content: "Hey! Dropping off the new seasonal table tents. Is the manager around? No rush.",
    whyLegit: 'Someone familiar, dropping off something expected, asking for a manager. No money.',
    whatToDo: 'Grab the manager or take a note for them.',
  },

  // ─── Round 4: Email & Payroll ─────────────────────────────────────────────
  {
    id: 'r4-jeff-direct-deposit', round: 4, format: 'email', sender: 'Jeff Ireland', from: 'jeff.ireland.highbank@gmail.com', subject: 'Quick favor', answer: 'scam', rule: 3,
    content: "Quick favor, I need to update my direct deposit before Friday. Who handles that? Keep it between us for now.\n\nSent from my iPhone",
    redFlag: 'A Gmail address, a secret, and a payroll change. Owners use company email and never ask for "quick favors" like this.',
    whatToDo: "Don't reply. Forward it to your manager.",
  },
  {
    id: 'r4-paycom-lookalike', round: 4, format: 'email', sender: 'HR Notice', from: 'hr@paycom-secure-login.com', subject: 'Action required: confirm direct deposit', answer: 'scam', rule: 2,
    content: 'Confirm your direct deposit at paycom-secure-login.com within 24 hours or your paycheck will be delayed.',
    redFlag: 'A look-alike link and a 24-hour scare.',
    whatToDo: "Don't click. Open the Paycom app or type the real site yourself.",
  },
  {
    id: 'r4-mailbox-full', round: 4, format: 'email', sender: 'Microsoft 365', from: 'no-reply@m365-mailbox-alerts.net', subject: 'Your mailbox is full', answer: 'scam', rule: 4,
    content: 'Your mailbox is 99% full. Incoming mail will be rejected. Click here and log in to keep receiving email.',
    redFlag: 'Fake "mailbox full" pages exist to steal your password.',
    whatToDo: "Don't log in from the link. Tell a manager if email is acting up.",
  },
  {
    id: 'r4-vendor-new-bank', round: 4, format: 'email', sender: 'Prairie Linen Co. Billing', from: 'billing@prairielinen-payments.com', subject: 'Updated remittance details', answer: 'scam', rule: 2,
    content: 'We changed banks. Please send all future payments to the new account below, effective immediately.',
    redFlag: 'Bank-change emails are the #1 way businesses lose big money.',
    whatToDo: 'Forward it to the office. They verify by calling the vendor on a number they already have.',
  },
  {
    id: 'r4-amazon-iphone', round: 4, format: 'email', sender: 'Amazon Orders', from: 'order-update@amaz0n-support.com', subject: 'Order confirmed: iPhone 16 ($1,149.00)', answer: 'scam', rule: 2,
    content: "Your order of an iPhone 16 for $1,149.00 is confirmed. If you didn't place this order, call 1-888-555-0161 now.",
    redFlag: 'Fake orders scare you into calling "support," who then want remote access to your phone or computer.',
    whatToDo: "Don't call. Check your orders in the Amazon app yourself.",
  },
  {
    id: 'r4-top-employee', round: 4, format: 'email', sender: 'Employee Rewards', from: 'rewards@staff-appreciation.co', subject: "You've won a $500 gift card!", answer: 'scam',
    content: "Congratulations! You've been selected as a top employee. Enter your info to claim your $500 gift card.",
    redFlag: "A prize you never entered, asking for your info.",
    whatToDo: 'Delete it.',
  },
  {
    id: 'r4-docusign-bonus', round: 4, format: 'email', sender: 'DocuSign', from: 'dse@docusign-review-docs.com', subject: 'Jeff Ireland sent you "Employee Bonus Agreement Q4"', answer: 'scam', rule: 4,
    content: 'Please review and sign: Employee Bonus Agreement Q4.pdf\n\nREVIEW DOCUMENT',
    redFlag: 'Fake e-sign emails lead to fake login pages. A surprise "bonus" is the bait.',
    whatToDo: "Don't click. Ask your manager if it's real.",
  },
  {
    id: 'r4-w2-request', round: 4, format: 'email', sender: 'Adam', from: 'adam.highbank.office@outlook.com', subject: 'W-2s', answer: 'scam', rule: 3,
    content: 'Please send me the W-2s for all Gahanna staff by end of day. Keep this quiet for now, it\'s for the accountant.',
    redFlag: "Everyone's tax forms, from an outside email, in secret. That's identity theft.",
    whatToDo: 'Never send employee info. Forward it to your manager.',
  },
  {
    id: 'r4-irs-refund', round: 4, format: 'email', sender: 'IRS Refunds', from: 'refunds@irs-gov-tax.com', subject: 'You are eligible for a $412.80 refund', answer: 'scam',
    content: 'Submit your bank details within 48 hours to receive your refund of $412.80.',
    redFlag: "The IRS doesn't email refund links, and that's not irs.gov.",
    whatToDo: 'Delete it.',
  },
  {
    id: 'r4-paycom-statement', round: 4, format: 'email', sender: 'Paycom', from: 'notifications@paycomonline.net', subject: 'Your pay statement is available', answer: 'legit',
    content: 'Your pay statement for this period is available. Log in to view it.\n\n(You open the Paycom app yourself, and there it is.)',
    whyLegit: 'Expected email, and you checked it in the app yourself instead of clicking.',
    whatToDo: 'Keep doing exactly that.',
  },
  {
    id: 'r4-manager-schedule', round: 4, format: 'email', sender: 'Maria (GM)', from: 'maria@highbankco.com', subject: 'Schedule for next week', answer: 'legit',
    content: "Hi all, updated schedule attached for next week. Let me know if anything looks off.",
    whyLegit: 'Real company address, expected, and it asks for nothing unusual.',
    whatToDo: 'Check your shifts.',
  },
  {
    id: 'r4-open-enrollment', round: 4, format: 'email', sender: 'High Bank HR', from: 'hr@highbankco.com', subject: 'Open enrollment closes Friday', answer: 'legit',
    content: 'Reminder: benefits open enrollment closes Friday. Questions? Stop by the office or ask your manager.',
    whyLegit: 'Company address, no login link, and it points you to people you know.',
    whatToDo: 'Ask your manager if you have questions.',
  },

  // ─── Round 5: On the Floor ────────────────────────────────────────────────
  {
    id: 'r5-qr-sticker', round: 5, format: 'floor', sender: 'Table 12', scene: 'qr', answer: 'scam', rule: 2,
    content: "The pay-at-table QR sticker looks stuck over the original. It opens a payment page that isn't Toast.",
    redFlag: 'Fake QR stickers send payments straight to scammers.',
    whatToDo: 'Peel it off and tell a manager.',
  },
  {
    id: 'r5-skimmer', round: 5, format: 'floor', sender: 'Card reader at the bar', scene: 'reader', answer: 'scam', rule: 4,
    content: 'The card reader has a bulky piece over the slot that wiggles when you touch it.',
    redFlag: 'A wiggly add-on over the slot is a skimmer, copying card numbers.',
    whatToDo: 'Stop using it and tell a manager.',
  },
  {
    id: 'r5-quick-change', round: 5, format: 'floor', sender: 'Cash at the host stand', scene: 'cash', answer: 'scam',
    content: 'A guest pays an $8 check with a $100, then keeps switching what they want back ("actually, give me two fifties...") while you count.',
    redFlag: 'Switching back and forth is meant to confuse you into handing over extra change.',
    whatToDo: 'Slow down, finish one transaction at a time, and get a manager.',
  },
  {
    id: 'r5-split-photo', round: 5, format: 'floor', sender: 'Big tab, 5 cards', scene: 'cards', answer: 'scam',
    content: 'A big tab split across 5 cards. For the last one they show a photo of a card on their phone and ask you to type it in.',
    redFlag: "A photo means the card isn't there, and it's probably stolen.",
    whatToDo: 'No manual entry from photos. Get a manager.',
  },
  {
    id: 'r5-counterfeit', round: 5, format: 'floor', sender: 'A $20 bill', scene: 'counterfeit', answer: 'scam',
    content: 'A $20 feels slick, and when you hold it to the light there\'s no watermark or security strip.',
    redFlag: 'No watermark and no strip means it\'s likely fake.',
    whatToDo: 'Politely ask for another payment and tell a manager.',
  },
  {
    id: 'r5-read-card', round: 5, format: 'floor', sender: 'A "guest" on the phone', scene: 'phone', answer: 'scam', rule: 4,
    content: "Someone calls saying they left their card at the bar and asks you to read them the number on it so they can \"cancel it.\"",
    redFlag: 'Reading out a card number gives a thief everything they need.',
    whatToDo: 'Never read card numbers. Hold the card and tell a manager.',
  },
  {
    id: 'r5-giftcard-split', round: 5, format: 'floor', sender: 'Gift card counter', scene: 'cards', answer: 'scam',
    content: 'A guest wants $500 in High Bank gift cards, paid with five different cards, and keeps rushing you.',
    redFlag: 'Big gift card buys split across many cards are a way to cash out stolen cards.',
    whatToDo: 'Slow down and get a manager.',
  },
  {
    id: 'r5-usb-pos', round: 5, format: 'floor', sender: 'At the POS', scene: 'pos', answer: 'scam', rule: 4,
    content: 'Someone who says they\'re "the new Toast tech" is plugging a USB stick into the POS. "Your manager said it\'s fine."',
    redFlag: 'Nobody plugs anything into the POS unless a manager is standing right there.',
    whatToDo: 'Politely stop them and get a manager.',
  },
  {
    id: 'r5-tip-adjust', round: 5, format: 'floor', sender: 'Closed check', scene: 'receipt', answer: 'scam',
    content: "A friend of a server asks you to \"fix\" last night's tips by adding $40 to a closed check.",
    redFlag: "Changing tips on closed checks without the guest is fraud, even as a favor.",
    whatToDo: 'Say no and tell a manager.',
  },
  {
    id: 'r5-tap-to-pay', round: 5, format: 'floor', sender: 'Table 4', scene: 'tap', answer: 'legit',
    content: 'A guest taps their own card on the Toast reader, like normal.',
    whyLegit: "That's just a normal payment.",
    whatToDo: 'Say thanks and hand them the receipt.',
  },
  {
    id: 'r5-itemized-receipt', round: 5, format: 'floor', sender: 'Table 9', scene: 'receipt', answer: 'legit',
    content: 'A guest asks for an itemized receipt for their company expense report.',
    whyLegit: 'Totally normal. People expense meals all the time.',
    whatToDo: 'Print the itemized receipt from Toast.',
  },
  {
    id: 'r5-lost-card-pickup', round: 5, format: 'floor', sender: 'Lost card', scene: 'cards', answer: 'legit',
    content: 'A guest calls about a card left at the bar. You keep it in the safe, and they pick it up in person with a matching ID.',
    whyLegit: 'The card stays safe, nothing is read out, and ID is checked in person.',
    whatToDo: "That's the right way. Keep it up!",
  },
];
