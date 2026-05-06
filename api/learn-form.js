// api/learn-form.js
//
// Vercel serverless function — single intake endpoint for all
// Legion Claw School lead-capture forms.
//
// Architecture: 05-Platform-Build/Routines-Replace-Zapier.md
// (Vercel serverless pivot, 2026-04-16). Replaces the deprecated
// Zapier Zaps A/B/C and the dropped scheduled A0/B0/C0 routines.
//
// Branches by `form_type`:
//   "aisk"                    — AI Agent Starter Kit lead magnet
//   "legion_launch"           — Legion Launch (virtual course) waitlist tile on /learn
//   "cre_syndication"         — CRE Syndication Playbook waitlist tile on /learn
//   "legion_launch_applicant" — Legion Launch INCUBATOR application
//                               (live cohort program — distinct from the
//                                virtual-course waitlist above)
//
// Env vars (Vercel → Project Settings → Environment Variables):
//   HUBSPOT_TOKEN     — HubSpot Private App bearer (pat-na2-...)
//   ZEPTOMAIL_TOKEN   — ZeptoMail send token (no "Zoho-enczapikey " prefix)
//
// HubSpot portal: 245698216
// ZeptoMail Mail Agent: agent_1, sender nathan@legionclawschool.com
//
// Returns:
//   200 {status:"ok", action, hubspot_id, zeptomail_message_id?}
//   400 {status:"error", reason:"bad_payload"|"unknown_form_type"|...}
//   500 {status:"error", stage, detail}

const HUBSPOT_BASE = "https://api.hubapi.com";
const ZEPTOMAIL_URL = "https://api.zeptomail.com/v1.1/email";
const SENDER = { address: "nathan@legionclawschool.com", name: "Nathan Pancake" };
// No Reply-To override — keep one consistent identity for the applicant.
// Mail forwarding from nathan@legionclawschool.com → nathanpancake@legionreit.com
// is set up at the mail host so Nathan still gets a centralized inbox.

// ---------- main handler ----------
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", reason: "method_not_allowed" });
  }

  // --- preflight ---
  if (!process.env.HUBSPOT_TOKEN || !process.env.ZEPTOMAIL_TOKEN) {
    return res.status(500).json({ status: "error", reason: "missing_env" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ status: "error", reason: "bad_json" }); }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ status: "error", reason: "bad_payload" });
  }

  const email     = (body.email || "").trim().toLowerCase();
  const firstName = (body.first_name || body.firstname || "").trim();
  const formType  = (body.form_type || "").trim();

  if (!email || !firstName || !formType) {
    return res.status(400).json({ status: "error", reason: "missing_fields" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ status: "error", reason: "bad_email" });
  }

  try {
    switch (formType) {
      case "aisk":
        return await handleAisk(req, res, body, email, firstName);
      case "legion_launch":
        return await handleWaitlist(req, res, body, email, firstName, "legion_launch");
      case "cre_syndication":
        return await handleWaitlist(req, res, body, email, firstName, "cre_syndication");
      case "legion_launch_applicant":
        return await handleLegionLaunchApplicant(req, res, body, email, firstName);
      default:
        return res.status(400).json({ status: "error", reason: "unknown_form_type", form_type: formType });
    }
  } catch (err) {
    console.error("learn-form unhandled error", err);
    return res.status(500).json({ status: "error", stage: "unhandled", detail: String(err && err.message || err) });
  }
};

// ---------- AISK lead-magnet branch (existing) ----------
async function handleAisk(req, res, body, email, firstName) {
  const nowMs = Date.now();
  // NOTE: aisk_last_email_sent is intentionally NOT set here. We only bump it
  // AFTER zeptoSend succeeds, so a failed send leaves the counter at 0 and the
  // next intake POST will retry rather than skip on idempotency. (Bug fix
  // 2026-05-05 — see Session-Log.md "ll_last_email_sent=1 even on send fail".)
  const upsertProps = {
    email,
    firstname: firstName,
    lifecyclestage: "lead",
    lead_source: "lead_magnet_aisk",
    aisk_downloaded_at: String(nowMs)
  };
  const { hubspotId, alreadySent } = await hubspotUpsertWithIdempotency({
    email, props: upsertProps,
    idempotencyCheck: (existing) => Number(existing.aisk_last_email_sent || 0) >= 1
  });
  if (alreadySent) {
    return res.status(200).json({ status: "skipped", reason: "already_sent_day0", hubspot_id: hubspotId });
  }

  const html = renderAiskDay0(firstName);
  const send = await zeptoSend({
    to: { address: email, name: firstName },
    subject: "Your AI Agent Starter Kit is here",
    htmlbody: html
  });

  // Bump counter only after successful send.
  await hubspotPatchProps(hubspotId, { aisk_last_email_sent: "1" });

  return res.status(200).json({ status: "ok", action: "aisk_day0", hubspot_id: hubspotId, zeptomail_message_id: send.message_id });
}

// ---------- Generic waitlist branch (existing — handles legion_launch + cre_syndication) ----------
async function handleWaitlist(req, res, body, email, firstName, kind) {
  const leadSource = kind === "legion_launch" ? "waitlist_legion_launch" : "waitlist_cre_syndication";
  // NOTE: waitlist_confirmation_sent flag intentionally NOT set here — only after
  // successful zeptoSend (see counter-after-send fix 2026-05-05).
  const upsertProps = {
    email,
    firstname: firstName,
    lifecyclestage: "lead",
    lead_source: leadSource
  };
  const { hubspotId, alreadySent } = await hubspotUpsertWithIdempotency({
    email, props: upsertProps,
    idempotencyCheck: (existing) => existing.waitlist_confirmation_sent === "true"
  });
  if (alreadySent) {
    return res.status(200).json({ status: "skipped", reason: "already_confirmed", hubspot_id: hubspotId });
  }

  const isLL = kind === "legion_launch";
  const subject = isLL
    ? "You're on the Legion Launch waitlist — here's what you just got in line for"
    : "You're on the CRE Syndication Playbook waitlist — and the flywheel starts here";
  const html = isLL ? renderLegionLaunchWaitlist(firstName) : renderCreSyndicationWaitlist(firstName);

  const send = await zeptoSend({ to: { address: email, name: firstName }, subject, htmlbody: html });

  // Set confirmation flag only after successful send.
  await hubspotPatchProps(hubspotId, { waitlist_confirmation_sent: "true" });

  return res.status(200).json({
    status: "ok",
    action: isLL ? "legion_launch_waitlist" : "cre_syndication_waitlist",
    hubspot_id: hubspotId,
    zeptomail_message_id: send.message_id
  });
}

// ---------- Legion Launch INCUBATOR applicant branch (NEW — 2026-04-25) ----------
async function handleLegionLaunchApplicant(req, res, body, email, firstName) {
  const nowMs = Date.now();

  // Capture all applicant fields onto the HubSpot contact record so
  // Nathan can review applications inside HubSpot without leaving the CRM.
  // NOTE: ll_last_email_sent intentionally NOT set here — only after a
  // successful zeptoSend (see counter-after-send fix 2026-05-05). If
  // ZeptoMail throws, the counter stays at 0 so the next intake POST
  // retries the Day-0 confirm rather than skipping it.
  const upsertProps = {
    email,
    firstname: firstName,
    lastname: (body.last_name || "").trim(),
    phone: (body.phone || "").trim(),
    lifecyclestage: "lead",
    lead_source: "legion_launch_applicant_june_2026",
    ll_application_received_at: String(nowMs),
    ll_status: "applied",
    ll_cohort: (body.ll_cohort || "june_2026"),
    ll_location: (body.location || "").trim(),
    ll_business_stage: (body.business_stage || "").trim(),
    ll_business_description: (body.business_description || "").trim(),
    ll_ikigai_prompt: (body.ikigai_prompt || "").trim(),
    ll_why_legion: (body.why_legion || "").trim(),
    ll_full_time_commit: (body.full_time_commit || "").trim(),
    ll_rev_share_accept: (body.rev_share_accept || "").trim(),
    ll_referral_source: (body.referral_source || "").trim()
  };

  const { hubspotId, alreadySent } = await hubspotUpsertWithIdempotency({
    email, props: upsertProps,
    idempotencyCheck: (existing) => Number(existing.ll_last_email_sent || 0) >= 1
  });
  if (alreadySent) {
    return res.status(200).json({ status: "skipped", reason: "already_sent_day0_applicant", hubspot_id: hubspotId });
  }

  const html = renderLegionLaunchApplicantDay0(firstName);
  const send = await zeptoSend({
    to: { address: email, name: firstName },
    subject: "Got it — your Legion Launch application is in",
    htmlbody: html
  });

  // Bump counter only after successful send.
  await hubspotPatchProps(hubspotId, { ll_last_email_sent: "1" });

  return res.status(200).json({
    status: "ok",
    action: "legion_launch_applicant_day0",
    hubspot_id: hubspotId,
    zeptomail_message_id: send.message_id
  });
}

// ---------- HubSpot helpers ----------
async function hubspotUpsertWithIdempotency({ email, props, idempotencyCheck }) {
  // Try the create-or-update pattern: POST to /contacts; if 409 conflict,
  // GET the existing record by email and either skip (if idempotency
  // says we've already done the work) or PATCH with the new props.
  const createRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
    method: "POST",
    headers: hubspotHeaders(),
    body: JSON.stringify({ properties: props })
  });

  if (createRes.ok) {
    const created = await createRes.json();
    return { hubspotId: created.id, alreadySent: false };
  }

  if (createRes.status !== 409) {
    const errText = await createRes.text();
    throw new Error("hubspot_create_failed:" + createRes.status + ":" + errText.slice(0, 200));
  }

  // 409: contact already exists. Look it up by email and inspect.
  const lookupUrl = `${HUBSPOT_BASE}/crm/v3/objects/contacts/${encodeURIComponent(email)}` +
    `?idProperty=email&properties=${encodeURIComponent(Object.keys(props).join(","))}`;
  const lookupRes = await fetch(lookupUrl, { headers: hubspotHeaders() });
  if (!lookupRes.ok) {
    throw new Error("hubspot_lookup_failed:" + lookupRes.status);
  }
  const lookup = await lookupRes.json();
  const existing = lookup.properties || {};
  const hubspotId = lookup.id;

  if (idempotencyCheck && idempotencyCheck(existing)) {
    return { hubspotId, alreadySent: true };
  }

  // Patch — but never overwrite a non-empty firstname.
  const patchProps = { ...props };
  if (existing.firstname && existing.firstname.trim()) delete patchProps.firstname;
  // email is the lookup key — not patchable.
  delete patchProps.email;

  const patchRes = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${hubspotId}`, {
    method: "PATCH",
    headers: hubspotHeaders(),
    body: JSON.stringify({ properties: patchProps })
  });
  if (!patchRes.ok) {
    const errText = await patchRes.text();
    throw new Error("hubspot_patch_failed:" + patchRes.status + ":" + errText.slice(0, 200));
  }

  return { hubspotId, alreadySent: false };
}

function hubspotHeaders() {
  return {
    "Authorization": `Bearer ${process.env.HUBSPOT_TOKEN}`,
    "Content-Type": "application/json"
  };
}

// Small helper used post-send to bump per-branch counters/flags only after
// the email actually went out. Throws on non-2xx so the caller surfaces it.
async function hubspotPatchProps(hubspotId, props) {
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${hubspotId}`, {
    method: "PATCH",
    headers: hubspotHeaders(),
    body: JSON.stringify({ properties: props })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("hubspot_patch_props_failed:" + res.status + ":" + errText.slice(0, 200));
  }
  return res.json();
}

// ---------- ZeptoMail helper ----------
async function zeptoSend({ to, subject, htmlbody }) {
  const res = await fetch(ZEPTOMAIL_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Zoho-enczapikey ${process.env.ZEPTOMAIL_TOKEN}`
    },
    body: JSON.stringify({
      from: SENDER,
      to: [{ email_address: to }],
      subject,
      htmlbody
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error("zeptomail_send_failed:" + res.status + ":" + errText.slice(0, 200));
  }
  const out = await res.json();
  // ZeptoMail returns { data: [{ message_id, ... }], ... }
  const messageId = out && out.data && out.data[0] && out.data[0].message_id;
  return { message_id: messageId || null, raw: out };
}

// ---------- Email body renderers ----------
function escape(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

function renderAiskDay0(firstName) {
  const fn = escape(firstName);
  return `<p>Hey ${fn},</p>
<p>Here's your copy of the AI Agent Starter Kit:</p>
<p><strong><a href="https://www.legionclawschool.com/downloads/Lead-Magnet-AI-Agent-Starter-Kit.pdf">→ Download the AI Agent Starter Kit (PDF)</a></strong></p>
<p>Quick suggestion before you dive in. The Starter Kit lays out the 5-role agent framework we use inside Legion Securities — Recon, Ghost, Ops, Closer, and Sentinel. If you try to build all five this week, you'll burn out. Build one.</p>
<p>Start with <strong>Recon</strong> (the research agent). It's the easiest to set up, the hardest to mess up, and the one that proves the concept fastest. Within a day or two you'll have an agent that reads the internet for you and comes back with briefs you actually want to read. That's the "aha" moment. Everything else gets easier from there.</p>
<p>If you want to see the full system — all five agents working together, the prompt library, the workflow templates, the whole operating manual — that's what we teach in Build Your AI Workforce.</p>
<p><strong><a href="https://legionclawschool.com">→ See the full course</a></strong></p>
<p>More from me in a couple of days.</p>
<p>— Nathan<br>Co-Founder &amp; CEO, Legion Securities</p>`;
}

function renderLegionLaunchWaitlist(firstName) {
  // Same body as Email #1 in 01-Playbooks/Legion-Claw-School-Email-Copy.md §2.
  // Kept verbatim per CLAUDE.md Rule 4 — do not rewrite vault content.
  const fn = escape(firstName);
  return `<p>Hey ${fn},</p>
<p>Thanks for raising your hand for Legion Launch. You're on the list.</p>
<p>Quick context on what you're waiting for, because "founder program" is a phrase that's been loved to death.</p>
<p>Legion Launch is the internal program Legion Securities runs to build new businesses — the same process we used to stand up Legion itself. It is not a course about entrepreneurship in the abstract. It is the exact playbook we follow when we take an idea from "this should exist" to "this is incorporated, funded, and shipping."</p>
<p>The virtual version launches in <strong>Q2 2026</strong>. When it does, it'll cover the Founder Fit test, incorporation and legal structure, the first 30 days of operations, raising your first capital, and the first five hires (including the AI ones).</p>
<p>Waitlist members get first access, the best pricing, and direct input on the curriculum before it locks.</p>
<p><strong>One thing you can do right now while you wait.</strong></p>
<p>The founders we see winning in Legion Launch all share one advantage: they've already built an AI workforce inside their business before the program starts. That's exactly what the first Legion Claw School course teaches.</p>
<p><strong><a href="https://www.legionclawschool.com/build-your-ai-workforce">→ Start with Build Your AI Workforce — $147</a></strong></p>
<p>More from me as Legion Launch gets closer to launch.</p>
<p>— Nathan<br>Co-Founder &amp; CEO, Legion Securities</p>`;
}

function renderCreSyndicationWaitlist(firstName) {
  const fn = escape(firstName);
  return `<p>Hey ${fn},</p>
<p>Thanks for raising your hand. You're on the list.</p>
<p>The CRE Syndication Playbook is the course I wish existed when I started Legion Securities. It's a start-to-finish system for building a real syndication business — deal sourcing, structuring, investor raises, operations, compliance — taught by the team that runs the platform these deals eventually live on.</p>
<p>The course launches <strong>Q3 2026</strong>. Waitlist members get first access, the best price (early-cohort pricing, locked in), and an invitation to list your first qualifying deal on the Legion Securities marketplace when you're ready to raise.</p>
<p><strong><a href="https://www.legionclawschool.com/build-your-ai-workforce">→ Start with Build Your AI Workforce — $147</a></strong></p>
<p>More from me as the course gets closer.</p>
<p>— Nathan<br>Co-Founder &amp; CEO, Legion Securities</p>`;
}

function renderLegionLaunchApplicantDay0(firstName) {
  // Same body as Email 1 in 01-Playbooks/Legion-Launch-Applicant-Drip.md (Day 0).
  // Kept verbatim per CLAUDE.md Rule 4 — vault is the canonical source.
  const fn = escape(firstName);
  return `<p>Hey ${fn},</p>
<p>Your application landed. Thanks for raising your hand.</p>
<p>Here's what happens next:</p>
<ol>
  <li><strong>Within 72 hours</strong>, I personally read every application that comes in for the June pilot.</li>
  <li>If your application is a fit, I'll email you to schedule a 30-minute fit call. That call is for both of us — I want to know we can help you, and you want to know exactly what you're signing up for.</li>
  <li>After the fit call, you'll get an offer letter and the participant agreement (3% or 5% rev-share terms, IP, confidentiality, reporting cadence — all of it spelled out).</li>
</ol>
<p>While you wait, I want to share something with you. Most founders applying to programs like this are stuck on the same wall:</p>
<blockquote><p>"I know I should be using AI in my business, but I keep building one chatbot at a time and it never adds up to anything."</p></blockquote>
<p>The next email (in a couple of days) walks through the difference between "using AI in your business" and <strong>building an AI-native business</strong> — which is the entire point of Legion Launch.</p>
<p>More from me in a couple of days.</p>
<p>— Nathan<br>Co-Founder &amp; CEO, Legion Securities<br><a href="mailto:nathan@legionclawschool.com">nathan@legionclawschool.com</a></p>`;
}
