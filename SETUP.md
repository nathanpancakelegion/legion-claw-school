# LegionClawSchool.com — Setup Guide

## 1. Supabase Setup

### Create Project
1. Go to [supabase.com](https://supabase.com) and sign up / log in
2. Create a new project (free tier is fine)
3. Choose **US East** region
4. Copy your **Project URL** and **anon/public key** from Settings → API

### Update Config
Open `js/config.js` and replace the placeholder values:
```javascript
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...your-anon-key';
```

### Create Database Tables
Go to **SQL Editor** in your Supabase dashboard and run this:

```sql
-- Profiles table (stores user data)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  city TEXT,
  state TEXT,
  account_tier TEXT DEFAULT 'free' CHECK (account_tier IN ('free', 'paid')),
  lead_source TEXT DEFAULT 'free_preview',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Progress table (tracks module completion)
CREATE TABLE progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  module_number INTEGER NOT NULL CHECK (module_number >= 0 AND module_number <= 8),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, module_number)
);

-- Starter Kit leads (separate from course registrants)
CREATE TABLE starter_kit_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  lead_source TEXT DEFAULT 'starter_kit_download',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE starter_kit_leads ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Progress: users can read/write their own progress
CREATE POLICY "Users can view own progress" ON progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own progress" ON progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own progress" ON progress FOR UPDATE USING (auth.uid() = user_id);

-- Starter kit: anyone can insert (public form)
CREATE POLICY "Anyone can submit starter kit form" ON starter_kit_leads FOR INSERT WITH CHECK (true);
```

### Configure Auth
In Supabase Dashboard → Authentication → URL Configuration:
- **Site URL**: `https://www.legionclawschool.com`
- **Redirect URLs**: Add `https://www.legionclawschool.com/dashboard.html`

In Authentication → Email Templates:
- Customize the confirmation email to match Legion Claw School branding

---

## 2. PostHog Setup

1. Sign up at [posthog.com](https://us.posthog.com) (US Cloud)
2. Create a project for LegionClawSchool.com
3. Copy your **Project API Key**
4. Open `js/config.js` and replace:
```javascript
const POSTHOG_KEY = 'phc_your_actual_key';
```

### Create Dashboards
In PostHog, create these dashboards:

**Funnel Dashboard:**
- Homepage → Registration → Module 00 → Module 01 → Upgrade Clicked → Purchase → Course Completed

**Engagement Dashboard:**
- Module completion rates (filter by module_number)
- Drop-off points between modules

**Acquisition Dashboard:**
- Registration conversion rate
- Starter Kit download rate
- Traffic sources

### Enable Session Replays
Go to Session Replay settings and enable recording.

---

## 3. Stripe Configuration

In your Stripe Dashboard, update the **Success URL** for your checkout link:
- **Success URL**: `https://www.legionclawschool.com/activate.html`
- **Cancel URL**: `https://www.legionclawschool.com/#pricing`

This ensures users are redirected to the account activation page after purchase.

---

## 4. HubSpot Integration (Phase 2)

For now, leads are stored in Supabase. To export to HubSpot:
1. Go to Supabase → Table Editor → profiles
2. Export as CSV
3. Import into HubSpot contacts

Two lead sources to segment:
- `free_preview` — registered for free course access
- `starter_kit_download` — downloaded the Starter Kit only

Later: connect Supabase to HubSpot via Zapier or direct API integration.

---

## 5. Deployment

The site auto-deploys from GitHub to Vercel. Just push to `main`:
```bash
git add -A
git commit -m "Add registration, dashboard, module pages, analytics"
git push origin main
```

Vercel will build and deploy automatically.
