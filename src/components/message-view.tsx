import { LocalTime } from "@/components/local-time";

type Message = {
  direction: "inbound" | "outbound";
  subject: string | null;
  body_plain: string | null;
  body_full?: string | null;
  sender_name: string | null;
  sender_email: string;
  recipient: string | null;
  received_at: string;
};

/**
 * Renders a stored message the way an email actually looks: header block,
 * body, sign-off.
 *
 * No model call is involved. Every field here was captured at intake.
 *
 * The body prefers body_full (unstripped, keeps the sender's own sign-off)
 * and falls back to body_plain (Mailgun's stripped-text) for messages stored
 * before body_full existed, or ones logged by hand.
 *
 * The attribution line is added only when the body does not already end with
 * the sender's own sign-off. Appending "Thanks and regards, X" to a message
 * whose author never wrote it would be putting words in their mouth, in a
 * record used to decide how to reply to them.
 */
export function MessageView({ message }: { message: Message }) {
  const body = (message.body_full || message.body_plain || "").trim();
  const who = message.sender_name || message.sender_email;

  // Cheap check: does the closing already name them?
  const tail = body.slice(-160).toLowerCase();
  const firstName = who.split(/[\s<@]/)[0]?.toLowerCase() ?? "";
  const alreadySigned = firstName.length > 1 && tail.includes(firstName);

  return (
    <div className="rounded-lg bg-slate-50 p-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 border-b border-slate-200 pb-3 text-xs">
        <dt className="text-slate-400">Subject</dt>
        <dd className="font-medium text-slate-800">{message.subject || "(no subject)"}</dd>

        <dt className="text-slate-400">From</dt>
        <dd className="truncate text-slate-600">
          {message.sender_name ? `${message.sender_name} ` : ""}
          &lt;{message.sender_email}&gt;
        </dd>

        {message.recipient ? (
          <>
            <dt className="text-slate-400">To</dt>
            <dd className="truncate text-slate-600">{message.recipient}</dd>
          </>
        ) : null}

        <dt className="text-slate-400">Date</dt>
        <dd className="text-slate-600">
          <LocalTime iso={message.received_at} />
        </dd>
      </dl>

      <div className="whitespace-pre-wrap pt-3 font-sans text-slate-700">
        {body || "(empty message)"}
      </div>

      {!alreadySigned && body ? (
        <p className="mt-4 text-slate-500">
          — {who}
        </p>
      ) : null}
    </div>
  );
}
