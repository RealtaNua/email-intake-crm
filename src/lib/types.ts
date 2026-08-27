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
  first_seen_at: string;
  last_seen_at: string;
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
  body_html: string | null;
  status: string;
  priority: "urgent" | "high" | "normal" | "low" | null;
  priority_reasoning: string | null;
  priority_signals: string[] | null;
  respond_by: string | null;
  classification_status: string;
  classified_at: string | null;
};

/** A contact as rendered on the list page, with its company and enquiries. */
export type ContactWithRelations = Contact & {
  companies: Pick<Company, "domain" | "profile" | "enrichment_status"> | null;
  enquiries: Pick<Enquiry, "id" | "subject" | "priority" | "received_at">[];
};

export const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-900 ring-red-200",
  high: "bg-orange-100 text-orange-900 ring-orange-200",
  normal: "bg-sky-100 text-sky-900 ring-sky-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};

const PRIORITY_RANK: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };

/** The most urgent rating across a contact's enquiries drives the list badge. */
export function topPriority(
  enquiries: { priority: string | null }[],
): string | null {
  let best: string | null = null;
  for (const e of enquiries) {
    if (!e.priority) continue;
    if (!best || (PRIORITY_RANK[e.priority] ?? 0) > (PRIORITY_RANK[best] ?? 0)) best = e.priority;
  }
  return best;
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
