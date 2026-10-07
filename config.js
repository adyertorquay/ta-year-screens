/* Year group screens settings.
   Leave the URL and key blank to run in demo mode (sample data, changes stay in the browser).
   To go live in the Tutor Slides Supabase project: run supabase/schema-tutor-slides.sql there, add "screens" to
   Exposed schemas (Project Settings, Data API), then paste its Project URL and anon public key below and keep
   TUTOR_SLIDES: true. House points, birthdays and homework then come from Tutor Slides' own tables.
   (For a separate screens-only project instead, run supabase/schema.sql and set TUTOR_SLIDES: false.)
   The anon key is safe to publish; the database's row-level security decides who can read and write. */
window.SCREENS_CONFIG = {
  SUPABASE_URL: 'https://ndtkywnmlgvycjnynyol.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_qBUizGF0KPv5LsgSALQpOw_Qz7B8f8q',
  TUTOR_SLIDES: true,
};
