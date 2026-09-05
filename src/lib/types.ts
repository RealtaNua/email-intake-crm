import type { CompanyProfile } from "@/lib/enrichment";

export type { CompanyProfile };

export type Company = {
  id: string;
  domain: string;
  profile: CompanyProfile | null;
  enrichment_status: string;
  enrichment_error: string | null;
  enriched_at: string | null;
};

/** Appended by the chat interface. Never rewritten in place. */
export type ContactNote = {
  text: string;
  created_at: string;
  source: string;
};

export type Contact = {
  id: string;
  email: string;
  name: string | null;
  domain: string | null;
  company_id: string | null;
  status: string;
  notes: ContactNote[];
  total_received: number;
  remarks: string | null;
  next_step: string | null;
  conversation_status: string | null;
  summary_updated_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export const CONVERSATION_LABELS: Record<string, string> = {
  awaiting_our_reply: "Waiting on us",
  awaiting_their_reply: "Waiting on them",
  scheduled: "Scheduled",
  closed_won: "Won",
  closed_lost: "Lost",
  no_action_needed: "No action needed",
};

export const CONVERSATION_STYLES: Record<string, string> = {
  awaiting_our_reply: "bg-amber-100 text-amber-900 ring-amber-200",
  awaiting_their_reply: "bg-slate-100 text-slate-600 ring-slate-200",
  scheduled: "bg-sky-100 text-sky-900 ring-sky-200",
  closed_won: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  closed_lost: "bg-slate-100 text-slate-500 ring-slate-200",
  no_action_needed: "bg-slate-100 text-slate-500 ring-slate-200",
};

export type Enquiry = {
  id: string;
  contact_id: string | null;
  received_at: string;
  message_id: string | null;
  sender_email: string;
  sender_name: string | null;
  sender_domain: string | null;
  recipient: string | null;
  subject: string | null;
  body_plain: string | null;
  body_full: string | null;
  body_html: string | null;
  status: string;
  direction: "inbound" | "outbound";
  /** Outbound only. Null on inbound. */
  origin: "crm" | "email_client" | "manual" | null;
  summary: string | null;
  priority: "urgent" | "high" | "normal" | "low" | null;
  priority_reasoning: string | null;
  priority_signals: string[] | null;
  respond_by: string | null;
  classification_status: string;
  classified_at: string | null;
  suspected_phishing: boolean;
  phishing_reasoning: string | null;
};

/** A contact as rendered on the list page, with its company and enquiries. */
export type ContactWithRelations = Contact & {
  companies: Pick<Company, "domain" | "profile" | "enrichment_status"> | null;
  enquiries: Pick<
    Enquiry,
    | "id" | "subject" | "priority" | "received_at" | "direction"
    | "body_plain" | "body_full" | "summary" | "sender_name" | "sender_email" | "recipient"
    | "suspected_phishing" | "phishing_reasoning"
  >[];
};

/** How a rating is written where it stands on its own, as a contact's badge. */
/**
 * Where an outbound message came from. Shown on every reply, because "did I
 * send that from here or from my phone?" is a question the timeline should
 * answer rather than leave to memory.
 */
export const ORIGIN_LABELS: Record<string, string> = {
  crm: "Sent from CRM",
  email_client: "Sent from email",
  manual: "Logged by hand",
};

/**
 * The subject to answer a message with. Collapses any run of existing "Re:"
 * prefixes to one rather than stacking them, and adds one where the original
 * had none — a first reply otherwise went out with a bare subject and read as
 * a new conversation in their client.
 */
export function replySubjectFor(subject: string | null | undefined): string {
  const base = (subject ?? "").replace(/^\s*(re\s*:\s*)+/i, "").trim();
  return base ? `Re: ${base}` : "";
}

/** Shown in the composer's dialog and returned by the server. One wording. */
export const DEMO_THREAD_MESSAGE =
  "This is a demo email thread. You can't reply to it, because no message in " +
  "it ever passed through the mail server — replying would send real email to " +
  "an address that was made up for testing.";

export const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High priority",
  normal: "Normal",
  low: "Low",
};

export const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-900 ring-red-200",
  high: "bg-orange-100 text-orange-900 ring-orange-200",
  normal: "bg-sky-100 text-sky-900 ring-sky-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** The shape the tiles and badges need from a message to judge a contact. */
export type MessageState = {
  direction: string;
  priority: string | null;
  received_at: string;
};

/**
 * The rating on the latest message they sent us.
 *
 * Priority judges a message, not a person, so a contact's badge has to be the
 * rating of whatever is actually on our plate now. Taking the highest rating
 * across the whole thread left a contact marked urgent forever, long after the
 * message that earned it had been answered.
 *
 * Our own replies carry no rating, so they are skipped rather than counted as
 * an absence of urgency.
 */
export function currentPriority(messages: MessageState[]): string | null {
  let latest: MessageState | null = null;
  for (const m of messages) {
    if (m.direction === "outbound" || !m.priority) continue;
    if (!latest || +new Date(m.received_at) > +new Date(latest.received_at)) latest = m;
  }
  return latest?.priority ?? null;
}

/**
 * Whether we owe this contact a reply.
 *
 * The classifier's verdict wins when it has one. Until then — a message that
 * has only just landed, or one classification could not finish — the messages
 * themselves still say whose turn it is, and an unanswered inbound email is
 * ours. Reading the column alone reported "0 waiting on us" with a fresh
 * enquiry sitting unread.
 */
export function ballInOurCourt(
  contact: { conversation_status: string | null },
  messages: MessageState[],
): boolean {
  if (contact.conversation_status) {
    return contact.conversation_status === "awaiting_our_reply";
  }
  let latest: MessageState | null = null;
  for (const m of messages) {
    if (!latest || +new Date(m.received_at) > +new Date(latest.received_at)) latest = m;
  }
  return latest?.direction === "inbound";
}

/**
 * What a contact needs from us: the rating of their latest message and whose
 * turn it is, judged together.
 *
 * A thread rated urgent that is waiting on THEM is not urgent for us — there is
 * nothing to reply to today, and marking it red says there is. It is still the
 * most important kind of thing to keep an eye on, so it reads as high priority
 * rather than being flattened in with everything else.
 *
 * So `urgent` here means exactly one thing: rated urgent and on our desk.
 */
export function attentionLevel(
  contact: { conversation_status: string | null },
  messages: MessageState[],
): string | null {
  const priority = currentPriority(messages);
  if (priority === "urgent" && !ballInOurCourt(contact, messages)) return "high";
  return priority;
}
