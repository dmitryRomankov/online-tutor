SET ROLE tutor_owner;
CREATE TABLE private.auth_sessions (
 sid varchar NOT NULL PRIMARY KEY,
 sess json NOT NULL,
 expire timestamptz(6) NOT NULL
);
CREATE INDEX auth_sessions_expire_idx ON private.auth_sessions(expire);
COMMENT ON TABLE private.auth_sessions IS 'Backend-only cookie sessions; distinct from public.sessions (lessons). No passwords or answer keys.';
CREATE TABLE private.auth_rate_limits (
 key_hash varchar(64) PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
 attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 21),
 expires_at timestamptz(6) NOT NULL
);
CREATE INDEX auth_rate_limits_expiry_idx ON private.auth_rate_limits(expires_at);
COMMENT ON TABLE private.auth_rate_limits IS 'Shared fixed-window authentication counters; keys are HMAC-SHA256 of client IP using session secret. No raw IPs.';
REVOKE ALL ON private.auth_sessions, private.auth_rate_limits FROM PUBLIC, tutor_reporter;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.auth_sessions, private.auth_rate_limits TO tutor_app;
RESET ROLE;
