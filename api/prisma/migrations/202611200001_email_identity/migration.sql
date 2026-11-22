SET ROLE tutor_owner;
-- Real identity cannot be inferred from a legacy username. Refuse an unsafe backfill.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.users) THEN
  RAISE EXCEPTION 'Identity migration requires an empty users table; provide an explicit verified identity backfill for populated installations';
 END IF;
END $$;
ALTER TABLE public.users DROP COLUMN username, DROP COLUMN display_name;
ALTER TABLE public.users
 ADD COLUMN email varchar(254) NOT NULL,
 ADD COLUMN name varchar(100) NOT NULL,
 ADD COLUMN lastname varchar(100) NOT NULL,
 ADD CONSTRAINT users_email_check CHECK (email = lower(btrim(email)) AND email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 ADD CONSTRAINT users_name_check CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 100 AND name !~ '[[:cntrl:][:digit:]]'),
 ADD CONSTRAINT users_lastname_check CHECK (lastname = btrim(lastname) AND char_length(lastname) BETWEEN 1 AND 100 AND lastname !~ '[[:cntrl:][:digit:]]');
CREATE UNIQUE INDEX users_email_ci_key ON public.users(lower(email));
CREATE OR REPLACE FUNCTION private.guard_user() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retire accounts instead of deleting them' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.retired_at IS NOT NULL OR NEW.auth_epoch<>0 OR NEW.email LIKE '%@retired.invalid' THEN
   RAISE EXCEPTION 'New account must be active with a valid identity' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.role_code<>OLD.role_code OR NEW.created_at<>OLD.created_at OR OLD.retired_at IS NOT NULL THEN
   RAISE EXCEPTION 'Account identity/role or retired record cannot be changed' USING ERRCODE='23514'; END IF;
  IF (NEW.retired_at IS DISTINCT FROM OLD.retired_at OR NEW.auth_epoch<>OLD.auth_epoch) AND current_user<>'tutor_owner' THEN
   RAISE EXCEPTION 'Use retire_account for account retirement' USING ERRCODE='42501'; END IF;
  NEW.updated_at=clock_timestamp();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=NEW.timezone) THEN RAISE EXCEPTION 'Unknown IANA timezone' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.retire_account(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='23503'; END IF;
 IF u.retired_at IS NOT NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.sessions s JOIN public.tutor_students l ON l.id=s.tutor_student_id WHERE s.state_code='active' AND p_user IN(l.tutor_id,l.student_id)) THEN RAISE EXCEPTION 'End active lessons before retiring an account' USING ERRCODE='23514'; END IF;
 DELETE FROM private.user_credentials WHERE user_id=p_user;
 UPDATE public.tutor_invitations SET revoked_at=clock_timestamp() WHERE tutor_id=p_user AND accepted_at IS NULL AND revoked_at IS NULL;
 UPDATE public.tutor_students SET ended_at=clock_timestamp() WHERE p_user IN(tutor_id,student_id) AND ended_at IS NULL;
 UPDATE public.users SET email='retired-'||id::text||'@retired.invalid',name='Retired',lastname='Account',timezone='UTC',retired_at=clock_timestamp(),auth_epoch=auth_epoch+1 WHERE id=p_user;
END $$;
COMMENT ON FUNCTION public.retire_account(uuid) IS 'Idempotent identity retirement, not free-text/backup erasure. Backend must invalidate session/socket auth using retired_at/auth_epoch.';
GRANT UPDATE(timezone) ON public.users TO tutor_app;
RESET ROLE;
