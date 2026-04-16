/**
 * Vercel Serverless Function — /api/learn-form
 *
 * Handles all three /learn bridge page form submissions:
 *   - AI Agent Starter Kit (lead magnet) → Day 0 PDF confirmation email
 *   - Legion Launch waitlist → waitlist confirmation email
 *   - CRE Syndication waitlist → waitlist confirmation email
 *
 * Receives POST from legionsecurities.com/learn, creates/updates HubSpot
 * contact, sends appropriate email via ZeptoMail. Zero Zapier.
 *
 * Environment variables (set in Vercel dashboard):
 *   HUBSPOT_TOKEN     — HubSpot private app token (portal 245698216)
 *   ZEPTOMAIL_TOKEN   — ZeptoMail API key (Zoho-enczapikey format)
 *
 * Deploy: drop this file into /api/ in the legionclawschool.com repo.
 *         Vercel auto-deploys as a serverless function at
 *         https://www.legionclawschool.com/api/learn-form
 */

// ---- CORS ----
const ALLOWED_ORIGINS = [
  'https://legionsecurities.com',
  'https://www.legionsecurities.com',
  'https://stage-web.legionsecurities.com',
  'https://legionclawschool.com',
  'https://www.legionclawschool.com',
  'http://localhost:3000',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ---- Form type configs ----
const FORM_CONFIGS = {
  aisk: {
    lead_source: 'lead_magnet_aisk',
    extraProps: (timestamp) => ({
      aisk_downloaded_at: String(timestamp),
      aisk_last_email_sent: '',        // empty = not yet sent; A0-equivalent sends Day 0 inline
    }),
    subject: 'Your AI Agent Starter Kit is here',
    htmlBody: (fn) => `
<p>Hey ${fn},</p>
<p>Here's your copy of the AI Agent Starter Kit:</p>
<p><strong><a href="https://www.legionclawschool.com/downloads/ai-agent-starter-kit.pdf">&rarr; Download the AI Agent Starter Kit (PDF)</a></strong></p>
<p>Quick suggestion before you dive in. The Starter Kit lays out the 5-role agent framework we use inside Legion Securities &mdash; Recon, Ghost, Ops, Closer, and Sentinel. If you try to build all five this week, you'll burn out. Build one.</p>
<p>Start with <strong>Recon</strong> (the research agent). It's the easiest to set up, the hardest to mess up, and the one that proves the concept fastest. Within a day or two you'll have an agent that reads the internet for you and comes back with briefs you actually want to read. That's the &quot;aha&quot; moment. Everything else gets easier from there.</p>
<p>If you want to see the full system &mdash; all five agents working together, the prompt library, the workflow templates, the whole operating manual &mdash; that's what we teach in Build Your AI Workforce.</p>
<p><strong><a href="https://www.legionclawschool.com/">&rarr; See the full course</a></strong></p>
<p>More from me in a couple of days.</p>
<p>&mdash; Nathan<br>Co-Founder &amp; CEO, Legion Securities</p>`.trim(),
    postSendPatch: { aisk_last_email_sent: '1' },
  },

  legion_launch: {
    lead_source: 'waitlist_legion_launch',
    extraProps: () => ({}),
    subject: "You're on the Legion Launch waitlist \u2014 here's what you just got in line for",
    htmlBody: (fn) => `
<p>Hey ${fn},</p>
<p>Thanks for raising your hand for Legion Launch. You're on the list.</p>
<p>Quick context on what you're waiting for, because &quot;founder program&quot; is a phrase that's been loved to death.</p>
<p>Legion Launch is the internal program Legion Securities runs to build new businesses &mdash; the same process we used to stand up Legion itself. It is not a course about entrepreneurship in the abstract. It is the exact playbook we follow when we take an idea from &quot;this should exist&quot; to &quot;this is incorporated, funded, and shipping.&quot;</p>
<p>The virtual version launches in <strong>Q2 2026</strong>. When it does, it'll cover:</p>
<ul>
<li><strong>The Founder Fit test</strong> &mdash; whether the idea actually maps to you, or whether it's somebody else's business you're trying to wear</li>
<li><strong>Incorporation and legal structure</strong> &mdash; the shortcuts that save months, and the landmines that cost years</li>
<li><strong>The first 30 days of operations</strong> &mdash; what you actually do, in order, with no wasted motion</li>
<li><strong>Raising your first capital</strong> &mdash; with or without an accelerator, with or without a warm network</li>
<li><strong>The first five hires</strong> &mdash; including the AI ones (more on that in a minute)</li>
</ul>
<p>Legion Launch cohorts are capped. Waitlist members get first access, the best pricing, and direct input on the curriculum before it locks.</p>
<p><strong>One thing you can do right now while you wait.</strong></p>
<p>The founders we see winning in Legion Launch all share one advantage: they've already built an AI workforce inside their business before the program starts. It lets them run lean on operations and spend their attention on the things that actually matter &mdash; customers, capital, and product.</p>
<p>That's exactly what the first Legion Claw School course teaches. It's available today, it's the same system we use inside Legion, and you can finish it in a weekend.</p>
<p><strong><a href="https://www.legionclawschool.com/build-your-ai-workforce?utm_source=legionclawschool&amp;utm_medium=email&amp;utm_campaign=legion_launch_waitlist&amp;utm_content=confirmation&amp;client_reference_id=waitlist_legion_launch">&rarr; Start with Build Your AI Workforce &mdash; $147</a></strong></p>
<p>More from me as Legion Launch gets closer to launch.</p>
<p>&mdash; Nathan<br>Co-Founder &amp; CEO, Legion Securities</p>`.trim(),
    postSendPatch: { waitlist_confirmation_sent: 'true' },
  },

  cre_syndication: {
    lead_source: 'waitlist_cre_syndication',
    extraProps: () => ({}),
    subject: "You're on the CRE Syndication Playbook waitlist \u2014 and the flywheel starts here",
    htmlBody: (fn) => `
<p>Hey ${fn},</p>
<p>Thanks for raising your hand. You're on the list.</p>
<p>Here's the thing I want you to know right up front: <strong>The CRE Syndication Playbook is the course I wish existed when I started Legion Securities.</strong></p>
<p>It's a start-to-finish system for building a real syndication business &mdash; deal sourcing, structuring, investor raises, operations, compliance &mdash; taught by the team that runs the platform these deals eventually live on. And that second part is the part most syndication courses don't tell you.</p>
<p>The business you're building isn't &quot;doing deals.&quot; It's running a marketplace. You need deals on one side, investors on the other, and compliance infrastructure in the middle that doesn't collapse the first time a regulator or an LP asks a hard question. Most courses teach the deal part and wave at the rest. We teach all of it, because all of it is what we do.</p>
<p>The course launches <strong>Q3 2026</strong>. When it does, you'll learn:</p>
<ul>
<li><strong>Deal sourcing</strong> &mdash; the pipeline we use at Legion, including the signals that separate a real opportunity from a trap</li>
<li><strong>Underwriting and structuring</strong> &mdash; how to build a syndication that you'd actually want to invest in</li>
<li><strong>The investor raise</strong> &mdash; from warm intro to signed subscription agreement, with the templates we actually use</li>
<li><strong>Operations and reporting</strong> &mdash; LP communications, distributions, K-1s, the boring-but-critical stuff</li>
<li><strong>Compliance without drowning in it</strong> &mdash; what Reg D really means for you, and how to structure deals that don't trip on SEC wire</li>
<li><strong>Listing your first deal on Legion Securities</strong> &mdash; the end-to-end process, from issuer onboarding to live marketplace</li>
</ul>
<p><strong>Here's the part I want you to pay attention to.</strong></p>
<p>Waitlist members get three things:</p>
<ol>
<li><strong>First access</strong> to the course when it launches in Q3 2026</li>
<li><strong>The best price</strong> (early-cohort pricing, locked in)</li>
<li><strong>An invitation to list your first qualifying deal on the Legion Securities marketplace</strong> when you're ready to raise. That's the flywheel. You learn the playbook, you build the business, and when you're ready to raise capital, you have a home built by the people who taught you.</li>
</ol>
<p>That last one is not a standard course perk. It's the entire reason this course exists.</p>
<p><strong>One thing you can do right now while you wait.</strong></p>
<p>Every syndicator we're talking to right now is running lean &mdash; small team, lots of irons in the fire, trying to scale deal flow without drowning in ops. The ones winning are the ones who've already built an AI workforce inside their business. They spend their attention on deals and relationships; their agents handle the research, the follow-ups, the investor updates, and the reporting.</p>
<p>That's what the first Legion Claw School course teaches. It's live today. Finish it in a weekend, run it on your syndication business for a month, and you'll show up to the CRE Syndication Playbook already operating at a level most of your competitors won't reach for years.</p>
<p><strong><a href="https://www.legionclawschool.com/build-your-ai-workforce?utm_source=legionclawschool&amp;utm_medium=email&amp;utm_campaign=cre_syndication_waitlist&amp;utm_content=confirmation&amp;client_reference_id=waitlist_cre_syndication">&rarr; Start with Build Your AI Workforce &mdash; $147</a></strong></p>
<p>More from me as the course gets closer.</p>
<p>&mdash; Nathan<br>Co-Founder &amp; CEO, Legion Securities</p>`.trim(),
    postSendPatch: { waitlist_confirmation_sent: 'true' },
  },
};

// ---- HubSpot helpers ----
async function hubspotCreateOrUpdate(email, properties) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error('HUBSPOT_TOKEN not set');

  // Try to create first; if contact exists (409), update instead
  const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { email, ...properties } }),
  });

  if (createRes.ok) {
    const data = await createRes.json();
    return { id: data.id, action: 'created' };
  }

  if (createRes.status === 409) {
    // Contact exists — extract ID from error body and PATCH
    const err = await createRes.json();
    const existingId = err?.message?.match(/Existing ID:\s*(\d+)/)?.[1];
    if (!existingId) throw new Error('HubSpot 409 but could not extract existing contact ID');

    const patchRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ properties }),
      }
    );
    if (!patchRes.ok) {
      const patchErr = await patchRes.text();
      throw new Error(`HubSpot PATCH failed: ${patchRes.status} ${patchErr}`);
    }
    return { id: existingId, action: 'updated' };
  }

  const errText = await createRes.text();
  throw new Error(`HubSpot create failed: ${createRes.status} ${errText}`);
}

async function hubspotPatch(contactId, properties) {
  const token = process.env.HUBSPOT_TOKEN;
  const res = await fetch(
    `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HubSpot post-send PATCH failed: ${res.status} ${errText}`);
  }
}

// ---- ZeptoMail helper ----
async function sendZeptoMail(toEmail, toName, subject, htmlbody) {
  const token = process.env.ZEPTOMAIL_TOKEN;
  if (!token) throw new Error('ZEPTOMAIL_TOKEN not set');

  const res = await fetch('https://api.zeptomail.com/v1.1/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Zoho-enczapikey ${token}`,
    },
    body: JSON.stringify({
      from: { address: 'nathan@legionclawschool.com', name: 'Nathan Pancake' },
      to: [{ email_address: { address: toEmail, name: toName } }],
      subject,
      htmlbody,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`ZeptoMail failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

// ---- Main handler ----
export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const cors = corsHeaders(origin);
  Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, first_name, form_type } = req.body || {};

    // Validate
    if (!email || !form_type) {
      return res.status(400).json({ error: 'Missing required fields: email, form_type' });
    }
    if (!FORM_CONFIGS[form_type]) {
      return res.status(400).json({
        error: `Invalid form_type. Must be one of: ${Object.keys(FORM_CONFIGS).join(', ')}`,
      });
    }

    const config = FORM_CONFIGS[form_type];
    const fn = first_name || 'there';
    const now = Date.now();

    // 1. Create/update HubSpot contact
    const contactProps = {
      firstname: fn === 'there' ? '' : fn,
      lead_source: config.lead_source,
      lifecyclestage: 'lead',
      ...config.extraProps(now),
    };

    const contact = await hubspotCreateOrUpdate(email, contactProps);

    // 2. Send email via ZeptoMail
    const emailHtml = config.htmlBody(fn);
    const emailResult = await sendZeptoMail(email, fn, config.subject, emailHtml);

    // 3. Post-send PATCH (stamp "email sent" flag)
    if (config.postSendPatch && contact.id) {
      await hubspotPatch(contact.id, config.postSendPatch);
    }

    // 4. Return success
    return res.status(200).json({
      status: 'ok',
      contact_id: contact.id,
      contact_action: contact.action,
      email_sent: true,
      form_type,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[learn-form] Error:', err.message);
    return res.status(500).json({
      status: 'error',
      message: err.message,
      ts: new Date().toISOString(),
    });
  }
}
