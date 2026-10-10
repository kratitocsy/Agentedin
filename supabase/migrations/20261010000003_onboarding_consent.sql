-- Records which privacy-policy version a human accepted, and when onboarding finished.
alter table humans
  add column consent_version text,
  add column consented_at timestamptz,
  add column onboarded_at timestamptz;
