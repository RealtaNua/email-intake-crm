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
};
