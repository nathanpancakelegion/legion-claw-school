/**
 * auth.js — Authentication & Data Helper Functions
 *
 * Provides all auth, data access, and analytics functions for LegionClawSchool.com
 * Functions are defined as globals for easy access across pages.
 * Requires: config.js loaded first (for supabase and posthog)
 */

// ===== MODULE DATA =====

const MODULES = [
  { num: 0, title: 'Welcome & The AI Workforce Mindset', tier: 'free' },
  { num: 1, title: 'The AI Agent Landscape', tier: 'free' },
  { num: 2, title: 'Your First AI Agent Setup', tier: 'paid' },
  { num: 3, title: 'The Prompt Engineering Framework (RICO)', tier: 'paid' },
  { num: 4, title: 'Building Your Agent Team', tier: 'paid' },
  { num: 5, title: 'Automating Research & Market Intel', tier: 'paid' },
  { num: 6, title: 'Automating Operations & Admin', tier: 'paid' },
  { num: 7, title: 'Automating Sales & Outreach', tier: 'paid' },
  { num: 8, title: 'Scaling & Managing Your AI Workforce', tier: 'paid' }
];

// ===== AUTH HELPERS =====

// Get current user session
async function getUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// Get user profile from profiles table
async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

// Get user's module progress
async function getProgress(userId) {
  const { data, error } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', userId)
    .order('module_number', { ascending: true });
  if (error) return [];
  return data;
}

// Mark module as started
async function markModuleStarted(userId, moduleNumber) {
  const existing = await supabase
    .from('progress')
    .select('id')
    .eq('user_id', userId)
    .eq('module_number', moduleNumber)
    .single();

  if (existing.data) return; // already tracked

  await supabase.from('progress').insert({
    user_id: userId,
    module_number: moduleNumber,
    started_at: new Date().toISOString()
  });

  // PostHog event
  if (window.posthog) {
    const profile = await getProfile(userId);
    posthog.capture('module_started', {
      module_number: moduleNumber,
      module_title: MODULES[moduleNumber]?.title,
      account_tier: profile?.account_tier || 'free'
    });
  }
}

// Mark module as completed
async function markModuleCompleted(userId, moduleNumber) {
  await supabase
    .from('progress')
    .update({ completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('module_number', moduleNumber);

  // PostHog event
  if (window.posthog) {
    const profile = await getProfile(userId);
    posthog.capture('module_completed', {
      module_number: moduleNumber,
      module_title: MODULES[moduleNumber]?.title,
      account_tier: profile?.account_tier || 'free'
    });
  }

  // Check if course completed (all 9 modules done)
  if (moduleNumber === 8) {
    posthog.capture('course_completed');
  }
}

// Check if user can access a module
function canAccessModule(moduleNumber, accountTier) {
  const mod = MODULES[moduleNumber];
  if (!mod) return false;
  if (mod.tier === 'free') return true;
  return accountTier === 'paid';
}

// Get next unfinished module
function getNextModule(progressData, accountTier) {
  const completedNums = new Set(
    progressData.filter(p => p.completed_at).map(p => p.module_number)
  );
  for (let i = 0; i < MODULES.length; i++) {
    if (!completedNums.has(i) && canAccessModule(i, accountTier)) {
      return i;
    }
  }
  // All accessible modules complete - return first locked or null
  if (accountTier !== 'paid') return 2; // first paid module
  return null; // all done
}

// Register a new user
async function registerUser(email, password, name, city, state) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, city, state }
    }
  });

  if (error) throw error;

  // Create profile
  if (data.user) {
    await supabase.from('profiles').upsert({
      id: data.user.id,
      name,
      email,
      city: city || null,
      state: state || null,
      account_tier: 'free',
      lead_source: 'free_preview',
      created_at: new Date().toISOString()
    });

    // PostHog identify + event
    if (window.posthog) {
      posthog.identify(data.user.id, { email, name, account_tier: 'free', lead_source: 'free_preview' });
      posthog.capture('registration_completed', { lead_source: 'free_preview', city, state });
    }
  }

  return data;
}

// Login
async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  if (data.user && window.posthog) {
    const profile = await getProfile(data.user.id);
    posthog.identify(data.user.id, { email, name: profile?.name, account_tier: profile?.account_tier });
  }

  return data;
}

// Logout
async function logoutUser() {
  await supabase.auth.signOut();
  if (window.posthog) posthog.reset();
  window.location.href = '/';
}

// Upgrade user to paid tier
async function upgradeUserToPaid(userId) {
  await supabase
    .from('profiles')
    .update({ account_tier: 'paid' })
    .eq('id', userId);

  if (window.posthog) {
    posthog.capture('purchase_completed');
    posthog.people?.set({ account_tier: 'paid' });
  }
}

// Track upgrade click
function trackUpgradeClick(source, sourceModule) {
  if (window.posthog) {
    posthog.capture('upgrade_clicked', {
      source_module: sourceModule || null,
      location: source || 'unknown'
    });
  }
}

// Track starter kit download
function trackStarterKitDownload(email) {
  if (window.posthog) {
    posthog.capture('starter_kit_downloaded', { email });
  }
}

// Require auth — redirect to login if not authenticated
async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
    return null;
  }
  return user;
}

// Redirect if already logged in
async function redirectIfLoggedIn() {
  const user = await getUser();
  if (user) {
    window.location.href = '/dashboard.html';
    return true;
  }
  return false;
}

// ===== UI HELPERS =====

// Show toast notification
function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  });
}

// ===== STARTER KIT FORM (for homepage) =====

async function handleStarterKitForm(email) {
  // Save to Supabase
  await supabase.from('starter_kit_leads').insert({
    email,
    lead_source: 'starter_kit_download',
    created_at: new Date().toISOString()
  });

  trackStarterKitDownload(email);
  showToast('Starter Kit is on the way! Check your email.');
}
