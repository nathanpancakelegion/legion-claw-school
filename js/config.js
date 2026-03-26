/**
 * config.js — Supabase & PostHog Configuration
 *
 * Initializes the Supabase client and PostHog analytics.
 * Replace placeholder values with your actual API keys before deploying.
 *
 * Required: Supabase JS library must be loaded in HTML before this script
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */

// ===== SUPABASE CONFIGURATION =====
// Replace these with your Supabase project values from: https://supabase.com/dashboard
const SUPABASE_URL = 'https://ocoyzdkzzqlksqdcqzke.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4T-u1Pn7d62kSAUdFzy8uw_aQ8e7x3T';

// Initialize Supabase client
// Note: CDN creates global 'var supabase' (the library), so we use a temp name
const _sbClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (!_sbClient) {
  console.error('Supabase client failed to initialize. Ensure @supabase/supabase-js is loaded before config.js');
}

// Export as globals for use in auth.js (uses 'supabase') and inline scripts (use 'supabaseClient')
window.supabaseClient = _sbClient;
window.supabase = _sbClient;

// ===== POSTHOG CONFIGURATION =====
// Replace with your PostHog project API key from: https://us.posthog.com
const POSTHOG_KEY = 'phc_rzW3WzFnaSpZlzjOQ7hzeLSd5iIyzQaKW5tJGke0Y7p';

// PostHog array initialization (before loading)
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing startSessionRecording stopSessionRecording sessionRecordingStarted isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId setPersonProperties".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

// Initialize PostHog only if API key is configured
if (POSTHOG_KEY && POSTHOG_KEY !== 'YOUR_POSTHOG_KEY') {
  posthog.init(POSTHOG_KEY, {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      recordCrossOriginIframes: true
    }
  });
} else {
  console.warn('PostHog key not configured. Analytics disabled.');
}

// Export as global for use in other modules
window.posthog = posthog;
