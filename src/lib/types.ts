import type { CompanyProfile } from "@/lib/enrichment";

export type Enquiry = {
  id: string;
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
  company_profile: CompanyProfile | null;
  enrichment_status: string;
  enrichment_error: string | null;
  enriched_at: string | null;
  priority: "urgent" | "high" | "normal" | "low" | null;
  priority_reasoning: string | null;
  priority_signals: string[] | null;
  respond_by: string | null;
  classification_status: string;
  classified_at: string | null;
};
