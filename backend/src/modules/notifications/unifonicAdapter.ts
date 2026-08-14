/**
 * Minimal client for Unifonic's REST SMS API (https://unifonic.com). Unifonic's send-SMS
 * endpoint authenticates with just an AppSid (no separate API key/secret) plus an approved
 * SenderID for the "from" name, and returns a JSON body with `success` and either a message
 * ID or an error. We only need send-and-log here, so this stays a single function rather than
 * a full SDK wrapper.
 */

const UNIFONIC_SEND_URL = "https://el.cloud.unifonic.com/rest/SMS/messages";

export interface UnifonicSendResult {
  success: boolean;
  messageId?: string;
  errorMessage?: string;
  rawResponse: string;
}

export async function sendUnifonicSms(appSid: string, senderId: string, recipient: string, body: string): Promise<UnifonicSendResult> {
  const params = new URLSearchParams({
    AppSid: appSid,
    SenderID: senderId,
    Recipient: recipient,
    Body: body,
    responseType: "JSON",
  });

  let response: Response;
  try {
    response = await fetch(UNIFONIC_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    return { success: false, errorMessage: err instanceof Error ? err.message : "Network error contacting Unifonic", rawResponse: "" };
  }

  const rawText = await response.text();
  if (!response.ok) {
    return { success: false, errorMessage: `Unifonic HTTP ${response.status}`, rawResponse: rawText };
  }

  try {
    const json = JSON.parse(rawText) as { success?: boolean; message?: string; data?: { MessageID?: string } };
    if (json.success) {
      return { success: true, messageId: json.data?.MessageID, rawResponse: rawText };
    }
    return { success: false, errorMessage: json.message ?? "Unifonic reported failure", rawResponse: rawText };
  } catch {
    return { success: false, errorMessage: "Could not parse Unifonic response", rawResponse: rawText };
  }
}
