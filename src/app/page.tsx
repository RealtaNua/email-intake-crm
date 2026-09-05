import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Bricolage_Grotesque, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import styles from "./page.module.css";

const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-display",
});

const bodyFont = Public_Sans({
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  variable: "--font-body",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono-display",
});

export const metadata: Metadata = {
  title: "Intake CRM — Turn Your Inbox Into Qualified Leads With AI",
  description:
    "Save hours every week with Intake AI CRM. Research, qualify, and act on every opportunity, instantly.",
};

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Home() {
  return (
    <>
      <div
        className={cx(
          styles.page,
          displayFont.variable,
          bodyFont.variable,
          monoFont.variable
        )}
      >
        <nav className={styles.nav}>
          <div className={cx(styles.wrap, styles.navIn)}>
            <a className={styles.brand} href="#top">
              <Image src="/logo-white.png" alt="" width={28} height={28} />
              Intake CRM
            </a>
            <div className={styles.navLinks}>
              <a href="#how">How it works</a>
              <a href="#features">Features</a>
              <a href="#reviews">In practice</a>
              <Link href="/login" className={styles.navCta}>
                Get Intake CRM
              </Link>
            </div>
          </div>
        </nav>

        <header className={styles.hero} id="top">
          <div className={styles.wrap}>
            <h1>Turn Your Inbox Into Qualified Leads With AI</h1>
            <p className={styles.heroSub}>
              Save hours every week with Intake AI CRM. Research, qualify, and
              act on every opportunity, instantly.
            </p>
            <div className={styles.heroCta}>
              <div className={styles.btnRow}>
                <Link href="/login" className={styles.btn}>
                  Get Intake CRM
                </Link>
                <a className={cx(styles.btn, styles.btnGhost)} href="#how">
                  See how it works
                </a>
              </div>
              <p className={styles.heroNote}>
                One email address. No inbox migration.
              </p>
            </div>
          </div>
        </header>

        <div className={cx(styles.wrap, styles.shotLift)}>
          <div className={styles.frame}>
            <div className={styles.frameBar}>
              <Image src="/logo-white.png" alt="" width={24} height={24} />
              <b>Intake CRM</b>
              <div className={styles.tabs}>
                <span className={cx(styles.tab, styles.tabOn)}>Leads</span>
                <span className={styles.tab}>Companies</span>
                <span className={styles.tab}>Usage</span>
              </div>
              <span className={styles.spend}>$1.05 today</span>
            </div>
            <div className={styles.frameBody}>
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <div className={styles.k}>Leads</div>
                  <div className={styles.v}>6</div>
                  <div className={styles.rule}></div>
                  <div className={styles.c}>&nbsp;</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.k}>Waiting on us</div>
                  <div className={cx(styles.v, styles.vAmber)}>4</div>
                  <div className={cx(styles.rule, styles.ruleAmber)}></div>
                  <div className={styles.c}>Ball in our court</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.k}>Urgent</div>
                  <div className={cx(styles.v, styles.vRose)}>0</div>
                  <div className={cx(styles.rule, styles.ruleRose)}></div>
                  <div className={styles.c}>Needs a reply today</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.k}>High priority</div>
                  <div className={cx(styles.v, styles.vOrange)}>1</div>
                  <div className={cx(styles.rule, styles.ruleOrange)}></div>
                  <div className={styles.c}>Important, not due today</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.k}>Messages</div>
                  <div className={styles.v}>10</div>
                  <div className={cx(styles.rule, styles.ruleGrey)}></div>
                  <div className={styles.c}>Both directions</div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h4>Daniel Lim</h4>
                    <div className={styles.emailLine}>
                      daniel.lim@grabtaxi.com
                    </div>
                  </div>
                  <div className={styles.badges}>
                    <span className={cx(styles.pill, styles.pGrey)}>
                      Waiting on them
                    </span>
                    <span className={cx(styles.pill, styles.pOrange)}>
                      HIGH PRIORITY
                    </span>
                    <span className={styles.ago}>1d ago</span>
                  </div>
                </div>
                <p className={styles.org}>
                  <b>
                    Grab Holdings Limited (GrabTaxi Holdings Pte. Ltd.)
                  </b>{" "}
                  <span>
                    · Technology / mobility, on-demand delivery and digital
                    financial services
                  </span>
                </p>
                <div className={styles.thread}>
                  <div className={styles.msg}>
                    <span className={styles.t}>27 Aug, 16:48</span>
                    <span className={styles.dot}></span>
                    <p>
                      <span className={styles.who}>They:</span> Daniel Lim, a
                      colleague of Jane Tan at Grab, picked up the
                      storytelling workshop thread, said they want to proceed
                      with the March cohort and asked us to confirm
                      availability.
                    </p>
                  </div>
                  <div className={styles.msg}>
                    <span className={styles.t}>27 Aug, 17:06</span>
                    <span className={cx(styles.dot, styles.dotUs)}></span>
                    <p>
                      <span className={cx(styles.who, styles.whoUs)}>
                        We:
                      </span>{" "}
                      Told Daniel we can hold 12–14 March for the first
                      cohort and asked him to forward Jane&apos;s original
                      thread and confirm the internal sponsor before we issue
                      a revised proposal.
                    </p>
                  </div>
                  <div className={styles.msg}>
                    <span className={styles.t}>27 Aug, 17:46</span>
                    <span className={cx(styles.dot, styles.dotUs)}></span>
                    <p>
                      <span className={cx(styles.who, styles.whoUs)}>
                        We:
                      </span>{" "}
                      Sent the revised proposal covering three cohorts of
                      65–70 staff on 12–14 March at SGD 42,000 all in,
                      confirmed the dates are held, and asked Daniel to raise
                      the PO so we can issue the pre-work brief.
                    </p>
                  </div>
                </div>
                <div className={styles.next}>
                  <div className={styles.k}>● Next step</div>
                  <p>
                    Daniel to raise the PO against the revised proposal; we
                    then send the pre-work brief.
                  </p>
                </div>
                <div className={styles.footLine}>
                  5 messages ·{" "}
                  <Link href="/login">Open record</Link>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h4>Priya Menon</h4>
                    <div className={styles.emailLine}>
                      priya.menon.hr@gmail.com
                    </div>
                  </div>
                  <div className={styles.badges}>
                    <span className={cx(styles.pill, styles.pRose)}>
                      ⚠ Suspected phishing
                    </span>
                    <span className={cx(styles.pill, styles.pAmber)}>
                      Waiting on us
                    </span>
                    <span className={styles.ago}>1d ago</span>
                  </div>
                </div>
                <div className={styles.alert}>
                  <div className={styles.k}>⚠ Suspected scam or phishing</div>
                  <p>
                    Claims to be writing on behalf of a Ministry of Education
                    division with an approved SGD 55,000 procurement budget,
                    but sends from a personal gmail.com address rather than a
                    gov.sg domain, with no division named and no officer
                    title; fiscal-year urgency plus a large committed sum
                    fits the pattern of a fabricated procurement approach.
                  </p>
                </div>
                <div className={styles.next}>
                  <div className={styles.k}>● Next step</div>
                  <p>
                    Do not share proposals or accept the call yet — ask for
                    the officer&apos;s gov.sg email and division, or verify
                    via an official MOE channel, before scoping.
                  </p>
                </div>
                <div className={styles.footLine}>
                  1 message · <Link href="/login">Open record</Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section className={styles.section} id="how">
          <div className={styles.wrap}>
            <div className={cx(styles.secHead, styles.center)}>
              <p className={styles.eyebrow}>How it works</p>
              <h2>Forward one address. Get a qualified pipeline.</h2>
              <p>
                Nothing to install, no inbox migration, no rules to
                maintain. Point your enquiry address at Intake CRM and every
                message that arrives is worked before you read it.
              </p>
            </div>
            <div className={styles.steps}>
              <div className={styles.step}>
                <div className={styles.n}>01</div>
                <h3>An enquiry lands</h3>
                <p>
                  Someone emails your dedicated intake address, or you
                  forward one in. That is the whole setup.
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.n}>02</div>
                <h3>The company gets researched</h3>
                <p>
                  Intake CRM looks up who they are and what they do, so the
                  record has context the message never contained.
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.n}>03</div>
                <h3>Priority with reasoning</h3>
                <p>
                  Every lead is ranked urgent, high, normal or low, with the
                  reasoning attached so you can disagree with it.
                </p>
              </div>
              <div className={styles.step}>
                <div className={styles.n}>04</div>
                <h3>You get a next step</h3>
                <p>
                  Each record ends with the specific move to make, and who
                  the ball is with right now.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sectionTight}>
          <div className={styles.wrap}>
            <div className={cx(styles.secHead, styles.center)}>
              <p className={styles.eyebrow}>The difference</p>
              <h2>A contact form takes a message. Intake CRM works it.</h2>
            </div>
            <div className={styles.vs}>
              <div className={cx(styles.vsCol, styles.vsColDim)}>
                <h3>Contact form + inbox</h3>
                <ul>
                  <li>
                    <span className={cx(styles.tick, styles.cross)}>—</span>{" "}
                    Sends you a notification and stops there
                  </li>
                  <li>
                    <span className={cx(styles.tick, styles.cross)}>—</span>{" "}
                    You research the company yourself, if you get to it
                  </li>
                  <li>
                    <span className={cx(styles.tick, styles.cross)}>—</span>{" "}
                    Keyword rules that treat every sender the same
                  </li>
                  <li>
                    <span className={cx(styles.tick, styles.cross)}>—</span>{" "}
                    Threads scatter, so nobody knows whose move it is
                  </li>
                  <li>
                    <span className={cx(styles.tick, styles.cross)}>—</span>{" "}
                    Scam enquiries look exactly like real ones
                  </li>
                </ul>
              </div>
              <div className={cx(styles.vsCol, styles.vsColOn)}>
                <h3>Intake CRM</h3>
                <ul>
                  <li>
                    <span className={styles.tick}>✓</span> Writes a
                    structured record before you open it
                  </li>
                  <li>
                    <span className={styles.tick}>✓</span> Pulls in company
                    context beyond the message itself
                  </li>
                  <li>
                    <span className={styles.tick}>✓</span> Judgment tuned to
                    your business, not generic rules
                  </li>
                  <li>
                    <span className={styles.tick}>✓</span> Every thread
                    tagged waiting on us or waiting on them
                  </li>
                  <li>
                    <span className={styles.tick}>✓</span> Flags suspected
                    phishing with the reasoning shown
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sectionTight} id="features">
          <div className={styles.wrap}>
            <div className={cx(styles.secHead, styles.center)}>
              <p className={styles.eyebrow}>Features</p>
              <h2>Everything a lead needs before it reaches you</h2>
            </div>

            <div className={styles.feat}>
              <div className={styles.featTxt}>
                <p className={styles.eyebrow}>Qualification</p>
                <h3>Know which leads are worth your morning</h3>
                <p className={styles.featLead}>
                  Every enquiry is scored and labelled the moment it arrives.
                  Urgent means today. High priority means important but not
                  due. Low means you can decline it in one line. The
                  reasoning sits on the record, so a wrong call is one you
                  can see and correct.
                </p>
              </div>
              <div className={styles.mini}>
                <div
                  className={styles.cardHead}
                  style={{ marginBottom: "14px" }}
                >
                  <div>
                    <h4>Farhan Aziz</h4>
                    <div className={styles.emailLine}>
                      farhan.aziz88@gmail.com
                    </div>
                  </div>
                  <div className={styles.badges}>
                    <span className={cx(styles.pill, styles.pAmber)}>
                      Waiting on us
                    </span>
                    <span className={cx(styles.pill, styles.pBlue)}>
                      NORMAL
                    </span>
                  </div>
                </div>
                <div
                  className={styles.msg}
                  style={{ gridTemplateColumns: "1fr" }}
                >
                  <p>
                    <span className={styles.who}>They:</span> Asked whether
                    the storytelling workshop format supports a hybrid
                    in-person/remote group, with no fixed date yet — early
                    scoping, not a firm booking.
                  </p>
                </div>
                <div className={styles.next}>
                  <div className={styles.k}>● Next step</div>
                  <p>
                    We should reply confirming the hybrid format works and
                    ask about headcount and rough timing.
                  </p>
                </div>
              </div>
            </div>

            <div className={cx(styles.feat, styles.featFlip)}>
              <div className={styles.featTxt}>
                <p className={styles.eyebrow}>Enrichment</p>
                <h3>The company research, already done</h3>
                <p className={styles.featLead}>
                  A name and a gmail address tell you nothing. Intake CRM
                  identifies the company behind the enquiry, what industry it
                  sits in and what it does, and writes that onto the record.
                  You open the lead already knowing whether it is worth a
                  call.
                </p>
              </div>
              <div className={styles.mini}>
                <p className={styles.eyebrow}>Company</p>
                <h4
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: "19px",
                    marginTop: "8px",
                  }}
                >
                  Grab Holdings Limited
                </h4>
                <p
                  className={styles.emailLine}
                  style={{ marginTop: "4px" }}
                >
                  GrabTaxi Holdings Pte. Ltd.
                </p>
                <p
                  style={{
                    fontSize: "14.5px",
                    color: "var(--ink-2)",
                    marginTop: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  Technology / mobility, on-demand delivery and digital
                  financial services.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    marginTop: "16px",
                    flexWrap: "wrap",
                  }}
                >
                  <span className={cx(styles.pill, styles.pBlue)}>
                    2 contacts
                  </span>
                  <span className={cx(styles.pill, styles.pOrange)}>
                    HIGH PRIORITY
                  </span>
                  <span className={cx(styles.pill, styles.pGrey)}>
                    Corporate domain
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.feat}>
              <div className={styles.featTxt}>
                <p className={styles.eyebrow}>Thread tracking</p>
                <h3>Always know whose move it is</h3>
                <p className={styles.featLead}>
                  Both sides of every conversation are captured in one
                  timeline and summarised in a line each. The dashboard
                  splits your pipeline into waiting on us and waiting on
                  them, so nothing sits for three weeks because each side
                  assumed the other would reply.
                </p>
              </div>
              <div className={styles.mini}>
                <p className={styles.eyebrow}>To-do items</p>
                <p
                  className={styles.eyebrow}
                  style={{ color: "var(--amber-dot)", marginTop: "16px" }}
                >
                  Waiting on us · 2
                </p>
                <div style={{ marginTop: "8px" }}>
                  <b style={{ fontSize: "15px" }}>Farhan Aziz</b>
                  <p
                    style={{
                      fontSize: "13.5px",
                      color: "var(--muted)",
                      lineHeight: 1.45,
                    }}
                  >
                    Reply confirming the hybrid format works and ask about
                    headcount.
                  </p>
                </div>
                <div style={{ marginTop: "12px" }}>
                  <b style={{ fontSize: "15px" }}>⚠ Priya Menon</b>
                  <p
                    style={{
                      fontSize: "13.5px",
                      color: "var(--muted)",
                      lineHeight: 1.45,
                    }}
                  >
                    Verify the officer&apos;s division through an official
                    channel before scoping.
                  </p>
                </div>
                <p
                  className={styles.eyebrow}
                  style={{ marginTop: "20px" }}
                >
                  Waiting on them · 1
                </p>
                <div style={{ marginTop: "8px" }}>
                  <b style={{ fontSize: "15px" }}>Daniel Lim</b>
                  <p
                    style={{
                      fontSize: "13.5px",
                      color: "var(--muted)",
                      lineHeight: 1.45,
                    }}
                  >
                    Daniel to raise the PO; we then send the pre-work brief.
                  </p>
                </div>
              </div>
            </div>

            <div className={cx(styles.feat, styles.featFlip)}>
              <div className={styles.featTxt}>
                <p className={styles.eyebrow}>Fraud screening</p>
                <h3>Catches the enquiry that is too good to be true</h3>
                <p className={styles.featLead}>
                  Large budget, tight deadline, personal email domain, no
                  verifiable name. Intake CRM flags the pattern and shows its
                  working, so you can check it yourself instead of finding
                  out after you have sent a proposal.
                </p>
              </div>
              <div className={styles.mini}>
                <div
                  className={styles.badges}
                  style={{ margin: "0 0 12px" }}
                >
                  <span className={cx(styles.pill, styles.pRose)}>
                    ⚠ Suspected phishing
                  </span>
                </div>
                <div className={styles.alert} style={{ marginTop: 0 }}>
                  <div className={styles.k}>⚠ Suspected scam or phishing</div>
                  <p>
                    Personal gmail.com address rather than a gov.sg domain,
                    no division named, no officer title. Fiscal-year urgency
                    plus a large committed sum fits the pattern of a
                    fabricated procurement approach.
                  </p>
                </div>
              </div>
            </div>

            <div className={styles.feat}>
              <div className={styles.featTxt}>
                <p className={styles.eyebrow}>Plain language updates</p>
                <h3>Update a record by typing a sentence</h3>
                <p className={styles.featLead}>
                  No fields, no dropdowns, no data entry. Tell Intake CRM
                  what happened in the words you would use with a colleague,
                  and the record, the priority and the next step update
                  themselves.
                </p>
              </div>
              <div className={styles.mini}>
                <div className={styles.chatline}>
                  <span className={cx(styles.bub, styles.bubYou)}>
                    Daniel called. PO is approved, they want the pre-work
                    brief by Friday.
                  </span>
                </div>
                <div className={styles.chatline}>
                  <span className={cx(styles.bub, styles.bubApp)}>
                    Updated Daniel Lim: moved to <b>Waiting on us</b>,
                    priority raised to <b>Urgent</b>. Next step: send the
                    pre-work brief before Friday.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sectionTight}>
          <div className={styles.wrap}>
            <div className={styles.band}>
              <div>
                <div className={styles.n}>Under 60s</div>
                <div className={styles.l}>Enquiry to qualified record</div>
              </div>
              <div>
                <div className={styles.n}>4 hrs</div>
                <div className={styles.l}>Saved per week on triage</div>
              </div>
              <div>
                <div className={styles.n}>$1.05</div>
                <div className={styles.l}>Typical daily running cost</div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sectionTight} id="reviews">
          <div className={styles.wrap}>
            <div className={cx(styles.secHead, styles.center)}>
              <p className={styles.eyebrow}>In practice</p>
              <h2>What it catches in practice</h2>
            </div>
            <div className={styles.reviews}>
              <div className={styles.review}>
                <p className={cx(styles.eyebrow, styles.reviewTag)}>
                  Enrichment
                </p>
                <p className={styles.reviewBody}>
                  The company research is already sitting on the record when
                  you open the enquiry — no more starting from a name and a
                  gmail address with no idea who you&apos;re dealing with.
                </p>
              </div>
              <div className={styles.review}>
                <p className={cx(styles.eyebrow, styles.reviewTag)}>
                  Thread tracking
                </p>
                <p className={styles.reviewBody}>
                  The waiting-on-us list catches deals that stall for weeks
                  because both sides assumed it was the other&apos;s turn to
                  reply.
                </p>
              </div>
              <div className={styles.review}>
                <p className={cx(styles.eyebrow, styles.reviewTag)}>
                  Fraud screening
                </p>
                <p className={styles.reviewBody}>
                  A fabricated procurement enquiry gets flagged with the
                  specific mismatch spelled out — before a proposal goes out
                  the door, not after.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.sectionTight} id="get">
          <div className={styles.wrap}>
            <div className={styles.final}>
              <h2>Stop Waiting. Start Closing.</h2>
              <p>
                Point your email address at Intake CRM and every lead
                arrives researched, qualified and action-ready.
              </p>
              <div className={styles.heroCta}>
                <Link href="/login" className={styles.btn}>
                  Get Intake CRM
                </Link>
                <p className={styles.heroNote}>Live demo · No credit card</p>
              </div>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={cx(styles.wrap, styles.foot)}>
            <p>
              Intake CRM — an inbound enquiry handling system by Storyworks
              Consulting.
            </p>
            <div className={styles.stack}>
              <span className={styles.chip}>Next.js</span>
              <span className={styles.chip}>Vercel</span>
              <span className={styles.chip}>Supabase</span>
              <span className={styles.chip}>Claude</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
