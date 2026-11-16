SET ROLE tutor_owner;
-- Helpers lock account rows in UUID order. A retirement waits for in-flight writes.
CREATE FUNCTION private.require_user(p_user uuid, p_role text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_user FOR SHARE;
 IF NOT FOUND OR u.retired_at IS NOT NULL OR (p_role IS NOT NULL AND u.role_code<>p_role) THEN
  RAISE EXCEPTION 'Active account with required role is needed' USING ERRCODE='23514', CONSTRAINT='active_account_required';
 END IF;
END $$;
CREATE FUNCTION private.require_link(p_link uuid) RETURNS public.tutor_students
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE l public.tutor_students%ROWTYPE; uid uuid;
BEGIN
 SELECT * INTO l FROM public.tutor_students WHERE id=p_link;
 IF NOT FOUND OR l.ended_at IS NOT NULL THEN RAISE EXCEPTION 'An active tutor/student link is required' USING ERRCODE='23514'; END IF;
 FOR uid IN SELECT id FROM public.users WHERE id IN(l.tutor_id,l.student_id) ORDER BY id LOOP
  PERFORM private.require_user(uid);
 END LOOP;
 -- Recheck and lock after account locks; serialize unlinking with new session/work writes.
 SELECT * INTO l FROM public.tutor_students WHERE id=p_link FOR SHARE;
 IF l.ended_at IS NOT NULL THEN RAISE EXCEPTION 'Tutor/student link has ended' USING ERRCODE='23514'; END IF;
 RETURN l;
END $$;
CREATE FUNCTION private.reject_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE='23514', CONSTRAINT='immutable_record'; END $$;
CREATE FUNCTION private.guard_user() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retire accounts instead of deleting them' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.retired_at IS NOT NULL OR NEW.auth_epoch<>0 OR lower(NEW.username) LIKE 'retired-%' THEN
   RAISE EXCEPTION 'New account must be active with a non-reserved username' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.role_code<>OLD.role_code OR NEW.created_at<>OLD.created_at OR OLD.retired_at IS NOT NULL THEN
   RAISE EXCEPTION 'Account identity/role or retired record cannot be changed' USING ERRCODE='23514'; END IF;
  IF (NEW.retired_at IS DISTINCT FROM OLD.retired_at OR NEW.auth_epoch<>OLD.auth_epoch OR lower(NEW.username) LIKE 'retired-%') AND current_user<>'tutor_owner' THEN
   RAISE EXCEPTION 'Use retire_account for account retirement' USING ERRCODE='42501'; END IF;
  NEW.updated_at=clock_timestamp();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=NEW.timezone) THEN RAISE EXCEPTION 'Unknown IANA timezone' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER users_guard BEFORE INSERT OR UPDATE OR DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION private.guard_user();
CREATE FUNCTION private.guard_credentials() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.user_id<>OLD.user_id THEN RAISE EXCEPTION 'Cannot move credentials' USING ERRCODE='23514'; END IF;
 PERFORM private.require_user(NEW.user_id); RETURN NEW;
END $$;
CREATE TRIGGER credentials_guard BEFORE INSERT OR UPDATE ON private.user_credentials FOR EACH ROW EXECUTE FUNCTION private.guard_credentials();
CREATE FUNCTION private.guard_link() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE uid uuid;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.tutor_id<>OLD.tutor_id OR NEW.student_id<>OLD.student_id OR NEW.linked_at<>OLD.linked_at OR OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL THEN
   RAISE EXCEPTION 'Link identity is immutable; ended links cannot reopen' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.sessions WHERE tutor_student_id=OLD.id AND state_code='active') THEN RAISE EXCEPTION 'End active sessions before closing the tutor link' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 FOR uid IN SELECT id FROM public.users WHERE id IN(NEW.tutor_id,NEW.student_id) ORDER BY id LOOP PERFORM private.require_user(uid); END LOOP;
 PERFORM private.require_user(NEW.tutor_id,'TUTOR'); PERFORM private.require_user(NEW.student_id,'STUDENT'); RETURN NEW;
END $$;
CREATE TRIGGER tutor_students_guard BEFORE INSERT OR UPDATE ON public.tutor_students FOR EACH ROW EXECUTE FUNCTION private.guard_link();
CREATE FUNCTION private.guard_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.tutor_id<>OLD.tutor_id OR NEW.token_hash<>OLD.token_hash OR NEW.created_at<>OLD.created_at OR NEW.expires_at<>OLD.expires_at OR
     OLD.revoked_at IS NOT NULL OR OLD.accepted_at IS NOT NULL THEN
   RAISE EXCEPTION 'Invitation identity/outcome is immutable' USING ERRCODE='23514'; END IF;
  -- Retirement can revoke an unaccepted invitation, even though its owner is now retired.
  IF NEW.revoked_at IS NOT NULL AND NEW.accepted_at IS NULL THEN RETURN NEW; END IF;
 END IF;
 PERFORM private.require_user(NEW.tutor_id,'TUTOR');
 IF NEW.accepted_student_id IS NOT NULL THEN
  PERFORM private.require_user(NEW.accepted_student_id,'STUDENT');
  IF NEW.revoked_at IS NOT NULL OR NEW.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Invitation is no longer valid' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tutor_students WHERE tutor_id=NEW.tutor_id AND student_id=NEW.accepted_student_id AND ended_at IS NULL) THEN
   RAISE EXCEPTION 'Create the matching link in the acceptance transaction first' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invitation_guard BEFORE INSERT OR UPDATE ON public.tutor_invitations FOR EACH ROW EXECUTE FUNCTION private.guard_invitation();
CREATE FUNCTION private.guard_owned_item() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.owner_id<>OLD.owner_id OR NEW.created_at<>OLD.created_at) THEN
  RAISE EXCEPTION 'Owner and creation identity cannot be changed' USING ERRCODE='23514'; END IF;
 PERFORM private.require_user(NEW.owner_id,'TUTOR'); RETURN NEW;
END $$;
CREATE TRIGGER assets_owner_guard BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION private.guard_owned_item();
CREATE TRIGGER assets_immutable BEFORE UPDATE OR DELETE ON public.assets FOR EACH ROW EXECUTE FUNCTION private.reject_change();
CREATE TRIGGER tasks_owner_guard BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION private.guard_owned_item();
CREATE TRIGGER lessons_owner_guard BEFORE INSERT OR UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION private.guard_owned_item();

CREATE FUNCTION private.require_task_draft(p_version uuid) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v public.task_versions%ROWTYPE; owner_user uuid;
BEGIN
 SELECT * INTO v FROM public.task_versions WHERE id=p_version FOR UPDATE;
 SELECT owner_id INTO owner_user FROM public.tasks WHERE id=v.task_id;
 PERFORM private.require_user(owner_user,'TUTOR');
 IF v.published_at IS NOT NULL THEN RAISE EXCEPTION 'Published task and children are immutable' USING ERRCODE='23514'; END IF;
END $$;
CREATE FUNCTION private.guard_task_part() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE version_id uuid; other_version uuid; input public.task_inputs%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME IN ('task_inputs','task_choices') THEN
  IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.task_version_id<>OLD.task_version_id) THEN RAISE EXCEPTION 'Cannot move task child' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN version_id=OLD.task_version_id; ELSE version_id=NEW.task_version_id; END IF;
 ELSE
  IF TG_OP='UPDATE' AND NEW.input_id<>OLD.input_id THEN RAISE EXCEPTION 'Cannot move input child' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN SELECT * INTO input FROM public.task_inputs WHERE id=OLD.input_id;
  ELSE SELECT * INTO input FROM public.task_inputs WHERE id=NEW.input_id; END IF;
  version_id=input.task_version_id;
  IF TG_OP<>'DELETE' AND TG_TABLE_NAME IN ('task_input_choices','task_choice_keys') THEN
   SELECT task_version_id INTO other_version FROM public.task_choices WHERE id=NEW.choice_id;
   IF other_version IS DISTINCT FROM version_id THEN RAISE EXCEPTION 'Input and choice must share a version' USING ERRCODE='23514'; END IF;
  END IF;
 END IF;
 PERFORM private.require_task_draft(version_id);
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER task_inputs_guard BEFORE INSERT OR UPDATE OR DELETE ON public.task_inputs FOR EACH ROW EXECUTE FUNCTION private.guard_task_part();
CREATE TRIGGER task_choices_guard BEFORE INSERT OR UPDATE OR DELETE ON public.task_choices FOR EACH ROW EXECUTE FUNCTION private.guard_task_part();
CREATE TRIGGER task_input_choices_guard BEFORE INSERT OR UPDATE OR DELETE ON public.task_input_choices FOR EACH ROW EXECUTE FUNCTION private.guard_task_part();
CREATE TRIGGER task_text_keys_guard BEFORE INSERT OR UPDATE OR DELETE ON private.task_text_keys FOR EACH ROW EXECUTE FUNCTION private.guard_task_part();
CREATE TRIGGER task_choice_keys_guard BEFORE INSERT OR UPDATE OR DELETE ON private.task_choice_keys FOR EACH ROW EXECUTE FUNCTION private.guard_task_part();
CREATE FUNCTION private.guard_task_version() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE owner_user uuid; input record; expected_kind text; input_count integer; choices integer; keys integer; text_keys integer; ordered_keys integer;
BEGIN
 IF TG_OP='DELETE' THEN PERFORM private.require_task_draft(OLD.id); RETURN OLD; END IF;
 SELECT owner_id INTO owner_user FROM public.tasks WHERE id=NEW.task_id;
 PERFORM private.require_user(owner_user,'TUTOR');
 IF TG_OP='INSERT' THEN
  IF NEW.published_at IS NOT NULL THEN RAISE EXCEPTION 'Create a draft, configure it, then publish' USING ERRCODE='23514'; END IF;
 ELSE
  IF OLD.published_at IS NOT NULL OR NEW.id<>OLD.id OR NEW.task_id<>OLD.task_id OR NEW.version_no<>OLD.version_no OR NEW.created_at<>OLD.created_at THEN
   RAISE EXCEPTION 'Task identity or published content is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.image_asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.assets WHERE id=NEW.image_asset_id AND owner_id=owner_user) THEN
  RAISE EXCEPTION 'Task image must belong to tutor' USING ERRCODE='23514'; END IF;
 IF NEW.published_at IS NOT NULL THEN
  SELECT count(*) INTO input_count FROM public.task_inputs WHERE task_version_id=NEW.id;
  IF input_count=0 OR (NEW.type_code IN ('single_choice','written_response','multiple_selection','word_ordering','error_correction') AND input_count<>1) THEN
   RAISE EXCEPTION 'Task input count is invalid for format' USING ERRCODE='23514'; END IF;
  expected_kind=CASE WHEN NEW.type_code IN ('fill_blanks','written_response','error_correction','image_labeling') THEN 'text'
    WHEN NEW.type_code='multiple_selection' THEN 'multi_choice' WHEN NEW.type_code='word_ordering' THEN 'ordered_choices' ELSE 'single_choice' END;
  FOR input IN SELECT * FROM public.task_inputs WHERE task_version_id=NEW.id LOOP
   IF input.kind_code<>expected_kind OR ((NEW.type_code='image_labeling') <> (input.marker_x IS NOT NULL)) THEN RAISE EXCEPTION 'Input kind/marker does not match format' USING ERRCODE='23514'; END IF;
   SELECT count(*) INTO choices FROM public.task_input_choices WHERE input_id=input.id;
   SELECT count(*),count(expected_position) INTO keys,ordered_keys FROM private.task_choice_keys WHERE input_id=input.id;
   SELECT count(*) INTO text_keys FROM private.task_text_keys WHERE input_id=input.id;
   IF expected_kind='text' THEN
    IF choices<>0 OR keys<>0 OR (NEW.type_code='written_response' AND text_keys<>0) OR (NEW.type_code<>'written_response' AND text_keys=0) THEN
     RAISE EXCEPTION 'Text/manual answer-key configuration is invalid' USING ERRCODE='23514'; END IF;
   ELSE
    IF text_keys<>0 OR choices=0 OR keys=0 OR (expected_kind='single_choice' AND keys<>1) OR
       (NEW.type_code IN ('single_choice','multiple_selection','word_ordering') AND choices<2) OR
       (expected_kind<>'ordered_choices' AND ordered_keys<>0) THEN RAISE EXCEPTION 'Choice configuration is invalid' USING ERRCODE='23514'; END IF;
    IF expected_kind='ordered_choices' AND (keys<>choices OR ordered_keys<>keys OR (SELECT max(expected_position) FROM private.task_choice_keys WHERE input_id=input.id)<>keys) THEN
     RAISE EXCEPTION 'Ordered key must contain all choices in contiguous order' USING ERRCODE='23514'; END IF;
    IF NEW.type_code='true_false' AND (choices<>2 OR (SELECT count(DISTINCT lower(c.label)) FROM public.task_input_choices ic JOIN public.task_choices c ON c.id=ic.choice_id WHERE ic.input_id=input.id AND lower(c.label) IN ('true','false'))<>2) THEN
     RAISE EXCEPTION 'True/false requires labelled boolean choices' USING ERRCODE='23514'; END IF;
   END IF;
  END LOOP;
  NEW.published_at=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_version_guard BEFORE INSERT OR UPDATE OR DELETE ON public.task_versions FOR EACH ROW EXECUTE FUNCTION private.guard_task_version();
CREATE FUNCTION private.require_lesson_draft(p_version uuid) RETURNS uuid LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE v public.lesson_versions%ROWTYPE; owner_user uuid;
BEGIN
 SELECT * INTO v FROM public.lesson_versions WHERE id=p_version FOR UPDATE;
 SELECT owner_id INTO owner_user FROM public.lessons WHERE id=v.lesson_id;
 PERFORM private.require_user(owner_user,'TUTOR');
 IF v.published_at IS NOT NULL THEN RAISE EXCEPTION 'Published lesson and children are immutable' USING ERRCODE='23514'; END IF;
 RETURN owner_user;
END $$;
CREATE FUNCTION private.guard_lesson_version() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE owner_user uuid;
BEGIN
 IF TG_OP='DELETE' THEN PERFORM private.require_lesson_draft(OLD.id); RETURN OLD; END IF;
 SELECT owner_id INTO owner_user FROM public.lessons WHERE id=NEW.lesson_id; PERFORM private.require_user(owner_user,'TUTOR');
 IF TG_OP='INSERT' AND NEW.published_at IS NOT NULL THEN RAISE EXCEPTION 'Create lesson draft before publishing' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (OLD.published_at IS NOT NULL OR NEW.id<>OLD.id OR NEW.lesson_id<>OLD.lesson_id OR NEW.version_no<>OLD.version_no OR NEW.created_at<>OLD.created_at) THEN RAISE EXCEPTION 'Lesson version is immutable' USING ERRCODE='23514'; END IF;
 IF NEW.published_at IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.lesson_items WHERE lesson_version_id=NEW.id) THEN RAISE EXCEPTION 'A lesson must contain an item' USING ERRCODE='23514'; END IF;
  NEW.published_at=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lesson_version_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lesson_versions FOR EACH ROW EXECUTE FUNCTION private.guard_lesson_version();
CREATE FUNCTION private.guard_lesson_item() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE owner_user uuid;
BEGIN
 IF TG_OP='DELETE' THEN PERFORM private.require_lesson_draft(OLD.lesson_version_id); RETURN OLD; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.lesson_version_id<>OLD.lesson_version_id) THEN RAISE EXCEPTION 'Cannot move lesson item' USING ERRCODE='23514'; END IF;
 owner_user=private.require_lesson_draft(NEW.lesson_version_id);
 IF NEW.task_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.task_versions v JOIN public.tasks t ON t.id=v.task_id WHERE v.id=NEW.task_version_id AND v.published_at IS NOT NULL AND t.owner_id=owner_user AND t.archived_at IS NULL) THEN RAISE EXCEPTION 'Attach a published task belonging to tutor' USING ERRCODE='23514'; END IF;
 IF NEW.asset_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.assets WHERE id=NEW.asset_id AND owner_id=owner_user) THEN RAISE EXCEPTION 'Lesson image must belong to tutor' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lesson_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lesson_items FOR EACH ROW EXECUTE FUNCTION private.guard_lesson_item();

CREATE FUNCTION private.guard_session() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE l public.tutor_students%ROWTYPE;
BEGIN
 l=private.require_link(NEW.tutor_student_id);
 IF NOT EXISTS(SELECT 1 FROM public.lessons WHERE id=NEW.planned_lesson_id AND owner_id=l.tutor_id) THEN RAISE EXCEPTION 'Lesson must belong to this tutor' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.state_code<>'scheduled' THEN RAISE EXCEPTION 'New session must be scheduled' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.tutor_student_id<>OLD.tutor_student_id OR NEW.created_at<>OLD.created_at OR OLD.state_code IN ('ended','cancelled') THEN RAISE EXCEPTION 'Session identity/history is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.state_code='active' AND (NEW.planned_lesson_id<>OLD.planned_lesson_id OR NEW.scheduled_start<>OLD.scheduled_start OR NEW.duration_minutes<>OLD.duration_minutes OR NEW.started_at<>OLD.started_at) THEN RAISE EXCEPTION 'Active session schedule/content is frozen' USING ERRCODE='23514'; END IF;
  IF NOT ((OLD.state_code='scheduled' AND NEW.state_code IN ('scheduled','active','cancelled')) OR (OLD.state_code='active' AND NEW.state_code='ended')) THEN RAISE EXCEPTION 'Invalid session transition' USING ERRCODE='23514'; END IF;
  IF OLD.state_code='scheduled' AND NEW.state_code='active' THEN NEW.started_at=clock_timestamp(); END IF;
  IF NEW.state_code='ended' THEN NEW.ended_at=clock_timestamp(); END IF;
  IF NEW.state_code='cancelled' THEN NEW.cancelled_at=clock_timestamp(); END IF;
  IF NEW.state_code='active' AND NOT EXISTS(SELECT 1 FROM public.session_content WHERE session_id=NEW.id) THEN RAISE EXCEPTION 'Use start_session to pin prepared content first' USING ERRCODE='23514'; END IF;
  IF NEW.state_code='ended' AND EXISTS(SELECT 1 FROM public.session_active_items WHERE session_id=NEW.id) THEN RAISE EXCEPTION 'Clear active item before ending session' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER session_guard BEFORE INSERT OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION private.guard_session();
CREATE FUNCTION private.guard_session_content() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE s public.sessions%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.sessions WHERE id=NEW.session_id FOR UPDATE; PERFORM private.require_link(s.tutor_student_id);
 IF s.state_code<>'scheduled' OR NOT EXISTS(SELECT 1 FROM public.lesson_versions WHERE id=NEW.lesson_version_id AND lesson_id=s.planned_lesson_id AND published_at IS NOT NULL) THEN RAISE EXCEPTION 'Pin a published version of the scheduled lesson before start' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER session_content_guard BEFORE INSERT ON public.session_content FOR EACH ROW EXECUTE FUNCTION private.guard_session_content();
CREATE TRIGGER session_content_immutable BEFORE UPDATE OR DELETE ON public.session_content FOR EACH ROW EXECUTE FUNCTION private.reject_change();
CREATE FUNCTION public.start_session(p_session uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE s public.sessions%ROWTYPE; version_id uuid;
BEGIN
 SELECT * INTO s FROM public.sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR s.state_code<>'scheduled' THEN RAISE EXCEPTION 'Session must be scheduled' USING ERRCODE='23514'; END IF;
 PERFORM private.require_link(s.tutor_student_id);
 SELECT id INTO version_id FROM public.lesson_versions WHERE lesson_id=s.planned_lesson_id AND published_at IS NOT NULL ORDER BY version_no DESC LIMIT 1;
 IF version_id IS NULL THEN RAISE EXCEPTION 'Publish a lesson before starting' USING ERRCODE='23514'; END IF;
 INSERT INTO public.session_content(session_id,lesson_version_id) VALUES(p_session,version_id);
 UPDATE public.sessions SET state_code='active',started_at=clock_timestamp() WHERE id=p_session;
END $$;
CREATE FUNCTION private.lock_live_session(p_session uuid) RETURNS public.sessions LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE s public.sessions%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.sessions WHERE id=p_session;
 PERFORM private.require_link(s.tutor_student_id);
 SELECT * INTO s FROM public.sessions WHERE id=p_session FOR UPDATE;
 IF s.state_code<>'active' THEN RAISE EXCEPTION 'Session is not active' USING ERRCODE='23514', CONSTRAINT='active_session_required'; END IF;
 RETURN s;
END $$;
CREATE FUNCTION public.end_session(p_session uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
 PERFORM private.lock_live_session(p_session);
 DELETE FROM public.session_active_items WHERE session_id=p_session;
 UPDATE public.sessions SET state_code='ended',ended_at=clock_timestamp() WHERE id=p_session;
END $$;
CREATE FUNCTION private.guard_session_item() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 PERFORM private.lock_live_session(NEW.session_id);
 IF NOT EXISTS(SELECT 1 FROM public.lesson_items i JOIN public.session_content c ON c.lesson_version_id=i.lesson_version_id WHERE c.session_id=NEW.session_id AND i.id=NEW.lesson_item_id) THEN RAISE EXCEPTION 'Reveal only an item from the pinned lesson version' USING ERRCODE='23514'; END IF;
 NEW.revealed_at=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER session_item_guard BEFORE INSERT ON public.session_items FOR EACH ROW EXECUTE FUNCTION private.guard_session_item();
CREATE TRIGGER session_item_immutable BEFORE UPDATE OR DELETE ON public.session_items FOR EACH ROW EXECUTE FUNCTION private.reject_change();
CREATE FUNCTION private.guard_active_item() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN PERFORM private.lock_live_session(OLD.session_id); RETURN OLD; END IF;
 PERFORM private.lock_live_session(NEW.session_id);
 IF TG_OP='UPDATE' AND NEW.session_id<>OLD.session_id THEN RAISE EXCEPTION 'Cannot move active item' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.session_items WHERE id=NEW.session_item_id AND session_id=NEW.session_id) THEN RAISE EXCEPTION 'Active item belongs to another session' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER active_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.session_active_items FOR EACH ROW EXECUTE FUNCTION private.guard_active_item();
CREATE FUNCTION private.guard_chat() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE s public.sessions%ROWTYPE; l public.tutor_students%ROWTYPE;
BEGIN
 s=private.lock_live_session(NEW.session_id); SELECT * INTO l FROM public.tutor_students WHERE id=s.tutor_student_id;
 IF NEW.sender_id NOT IN(l.tutor_id,l.student_id) THEN RAISE EXCEPTION 'Chat sender is not a participant' USING ERRCODE='23514'; END IF;
 NEW.created_at=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER chat_guard BEFORE INSERT ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION private.guard_chat();
CREATE TRIGGER chat_immutable BEFORE UPDATE OR DELETE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION private.reject_change();
CREATE FUNCTION private.create_lesson_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN INSERT INTO public.lesson_notifications(session_id) VALUES(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER session_creation_notification AFTER INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION private.create_lesson_notification();
CREATE FUNCTION private.guard_notification() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF NEW.session_id<>OLD.session_id OR OLD.read_at IS NOT NULL OR NEW.read_at IS NULL THEN RAISE EXCEPTION 'Notification can only transition once to read' USING ERRCODE='23514'; END IF;
 NEW.read_at=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER notification_guard BEFORE UPDATE ON public.lesson_notifications FOR EACH ROW EXECUTE FUNCTION private.guard_notification();

CREATE FUNCTION private.guard_assignment() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 PERFORM private.require_link(NEW.tutor_student_id);
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.tutor_student_id<>OLD.tutor_student_id OR NEW.created_at<>OLD.created_at OR EXISTS(SELECT 1 FROM public.homework_revisions WHERE assignment_id=OLD.id)) THEN RAISE EXCEPTION 'Assigned homework identity/content is frozen once work begins' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assignment_guard BEFORE INSERT OR UPDATE ON public.homework_assignments FOR EACH ROW EXECUTE FUNCTION private.guard_assignment();
CREATE FUNCTION private.guard_homework_item() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE a public.homework_assignments%ROWTYPE; l public.tutor_students%ROWTYPE; aid uuid;
BEGIN
 IF TG_OP='DELETE' THEN aid=OLD.assignment_id; ELSE aid=NEW.assignment_id; END IF;
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.assignment_id<>OLD.assignment_id) THEN RAISE EXCEPTION 'Cannot move homework item' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM public.homework_assignments WHERE id=aid FOR UPDATE; l=private.require_link(a.tutor_student_id);
 IF EXISTS(SELECT 1 FROM public.homework_revisions WHERE assignment_id=aid) THEN RAISE EXCEPTION 'Homework tasks are frozen after revision creation' USING ERRCODE='23514'; END IF;
 IF TG_OP<>'DELETE' AND NOT EXISTS(SELECT 1 FROM public.task_versions v JOIN public.tasks t ON t.id=v.task_id WHERE v.id=NEW.task_version_id AND v.published_at IS NOT NULL AND t.owner_id=l.tutor_id AND t.archived_at IS NULL) THEN RAISE EXCEPTION 'Assign published task versions belonging to tutor' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER homework_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.homework_items FOR EACH ROW EXECUTE FUNCTION private.guard_homework_item();
CREATE FUNCTION private.lock_homework_revision(p_revision uuid) RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r public.homework_revisions%ROWTYPE; link_id uuid;
BEGIN
 SELECT * INTO r FROM public.homework_revisions WHERE id=p_revision;
 SELECT tutor_student_id INTO link_id FROM public.homework_assignments WHERE id=r.assignment_id;
 PERFORM private.require_link(link_id);
 SELECT * INTO r FROM public.homework_revisions WHERE id=p_revision FOR UPDATE;
 IF r.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Submitted homework is locked' USING ERRCODE='23514', CONSTRAINT='homework_draft_required'; END IF;
END $$;
CREATE FUNCTION private.guard_homework_revision() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE a public.homework_assignments%ROWTYPE; previous public.homework_revisions%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.homework_assignments WHERE id=NEW.assignment_id; PERFORM private.require_link(a.tutor_student_id);
 IF TG_OP='INSERT' THEN
  PERFORM 1 FROM public.homework_assignments WHERE id=NEW.assignment_id FOR UPDATE;
  SELECT * INTO previous FROM public.homework_revisions WHERE assignment_id=NEW.assignment_id ORDER BY revision_no DESC LIMIT 1;
  IF NEW.revision_no<>coalesce(previous.revision_no,0)+1 OR (previous.id IS NOT NULL AND previous.returned_at IS NULL) OR NEW.submitted_at IS NOT NULL OR NEW.returned_at IS NOT NULL THEN
   RAISE EXCEPTION 'New revision must follow a returned submission and start as a draft' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.homework_items WHERE assignment_id=NEW.assignment_id) THEN RAISE EXCEPTION 'Homework needs an assigned task' USING ERRCODE='23514'; END IF;
 ELSE
  IF NEW.id<>OLD.id OR NEW.assignment_id<>OLD.assignment_id OR NEW.revision_no<>OLD.revision_no OR NEW.created_at<>OLD.created_at OR OLD.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Revision identity/returned history is immutable' USING ERRCODE='23514'; END IF;
  IF OLD.submitted_at IS NOT NULL THEN
   IF NEW.submitted_at<>OLD.submitted_at OR NEW.returned_at IS NULL THEN RAISE EXCEPTION 'Only returning a submitted revision is allowed' USING ERRCODE='23514'; END IF;
   NEW.returned_at=clock_timestamp();
  ELSE
   IF NEW.submitted_at IS NULL OR NEW.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Only submission can close a draft' USING ERRCODE='23514'; END IF;
   NEW.submitted_at=clock_timestamp();
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER homework_revision_guard BEFORE INSERT OR UPDATE ON public.homework_revisions FOR EACH ROW EXECUTE FUNCTION private.guard_homework_revision();

CREATE FUNCTION private.lock_response_context(p_response uuid) RETURNS public.responses LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r public.responses%ROWTYPE; sid uuid;
BEGIN
 SELECT * INTO r FROM public.responses WHERE id=p_response;
 IF r.session_item_id IS NOT NULL THEN SELECT session_id INTO sid FROM public.session_items WHERE id=r.session_item_id; PERFORM private.lock_live_session(sid);
 ELSE PERFORM private.lock_homework_revision(r.homework_revision_id); END IF;
 RETURN r;
END $$;
CREATE FUNCTION private.guard_response() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE version_id uuid; aid uuid; item_assignment uuid; sid uuid;
BEGIN
 IF NEW.session_item_id IS NOT NULL THEN
  SELECT si.session_id,li.task_version_id INTO sid,version_id FROM public.session_items si JOIN public.lesson_items li ON li.id=si.lesson_item_id WHERE si.id=NEW.session_item_id;
  PERFORM private.lock_live_session(sid);
 ELSE
  PERFORM private.lock_homework_revision(NEW.homework_revision_id);
  SELECT assignment_id INTO aid FROM public.homework_revisions WHERE id=NEW.homework_revision_id;
  SELECT assignment_id,task_version_id INTO item_assignment,version_id FROM public.homework_items WHERE id=NEW.homework_item_id;
  IF aid IS DISTINCT FROM item_assignment THEN RAISE EXCEPTION 'Homework item and revision belong to different assignments' USING ERRCODE='23514'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.task_inputs WHERE id=NEW.input_id AND task_version_id=version_id) THEN RAISE EXCEPTION 'Response input is not assigned in this context' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER response_guard BEFORE INSERT ON public.responses FOR EACH ROW EXECUTE FUNCTION private.guard_response();
CREATE TRIGGER response_identity_immutable BEFORE UPDATE OR DELETE ON public.responses FOR EACH ROW EXECUTE FUNCTION private.reject_change();
CREATE FUNCTION private.guard_response_revision() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r public.responses%ROWTYPE; last_no integer; kind text;
BEGIN
 r=private.lock_response_context(NEW.response_id);
 -- The live session/homework revision lock above serializes this response stream.
 SELECT coalesce(max(revision_no),0) INTO last_no FROM public.response_revisions WHERE response_id=NEW.response_id;
 IF NEW.revision_no<>last_no+1 THEN RAISE EXCEPTION 'Stale/out-of-order answer revision' USING ERRCODE='23514'; END IF;
 SELECT kind_code INTO kind FROM public.task_inputs WHERE id=r.input_id;
 IF kind<>'text' AND NEW.text_value IS NOT NULL THEN RAISE EXCEPTION 'Choice answers use relational choice values' USING ERRCODE='23514'; END IF;
 NEW.write_transaction=pg_current_xact_id()::text::bigint; NEW.created_at=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER response_revision_guard BEFORE INSERT ON public.response_revisions FOR EACH ROW EXECUTE FUNCTION private.guard_response_revision();
CREATE TRIGGER response_revision_immutable BEFORE UPDATE OR DELETE ON public.response_revisions FOR EACH ROW EXECUTE FUNCTION private.reject_change();
CREATE FUNCTION private.guard_response_choice() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE rr public.response_revisions%ROWTYPE; r public.responses%ROWTYPE;
BEGIN
 SELECT * INTO rr FROM public.response_revisions WHERE id=NEW.response_revision_id;
 r=private.lock_response_context(rr.response_id);
 IF rr.write_transaction<>pg_current_xact_id()::text::bigint THEN RAISE EXCEPTION 'Choice values must be inserted atomically with their revision' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.task_input_choices WHERE input_id=r.input_id AND choice_id=NEW.choice_id) THEN RAISE EXCEPTION 'Selected choice is not allowed for this input' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER response_choice_guard BEFORE INSERT ON public.response_choice_values FOR EACH ROW EXECUTE FUNCTION private.guard_response_choice();
CREATE TRIGGER response_choice_immutable BEFORE UPDATE OR DELETE ON public.response_choice_values FOR EACH ROW EXECUTE FUNCTION private.reject_change();
CREATE FUNCTION private.validate_response_shape() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE rid uuid; kind text; n integer; largest integer; allowed integer; answer_input uuid;
BEGIN
 IF TG_TABLE_NAME='response_revisions' THEN rid=NEW.id; ELSE rid=NEW.response_revision_id; END IF;
 SELECT i.kind_code,i.id INTO kind,answer_input FROM public.response_revisions rr JOIN public.responses r ON r.id=rr.response_id JOIN public.task_inputs i ON i.id=r.input_id WHERE rr.id=rid;
 SELECT count(*),max(position) INTO n,largest FROM public.response_choice_values WHERE response_revision_id=rid;
 SELECT count(*) INTO allowed FROM public.task_input_choices WHERE input_id=answer_input;
 IF (kind='text' AND n<>0) OR (kind='single_choice' AND n>1) OR (n>0 AND largest<>n) OR (kind='ordered_choices' AND n>0 AND n<>allowed) THEN RAISE EXCEPTION 'Answer shape does not match input kind' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER response_shape_after_revision AFTER INSERT ON public.response_revisions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.validate_response_shape();
CREATE CONSTRAINT TRIGGER response_shape_after_choice AFTER INSERT ON public.response_choice_values DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.validate_response_shape();
CREATE FUNCTION private.guard_feedback() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r public.responses%ROWTYPE; sid uuid; h public.homework_revisions%ROWTYPE; link_id uuid;
BEGIN
 SELECT r0.* INTO r FROM public.responses r0 JOIN public.response_revisions rr ON rr.response_id=r0.id WHERE rr.id=NEW.response_revision_id;
 IF TG_TABLE_NAME='live_feedback_comments' THEN
  IF r.session_item_id IS NULL THEN RAISE EXCEPTION 'Live feedback requires a live answer' USING ERRCODE='23514'; END IF;
  SELECT session_id INTO sid FROM public.session_items WHERE id=r.session_item_id; PERFORM private.lock_live_session(sid);
  IF TG_OP='UPDATE' AND (OLD.released_at IS NOT NULL OR NEW.id<>OLD.id OR NEW.response_revision_id<>OLD.response_revision_id OR NEW.created_at<>OLD.created_at) THEN RAISE EXCEPTION 'Released comment/reviewed answer cannot be rewritten' USING ERRCODE='23514'; END IF;
  IF NEW.released_at IS NOT NULL THEN NEW.released_at=clock_timestamp(); END IF;
 ELSE
  IF r.homework_revision_id IS NULL THEN RAISE EXCEPTION 'Homework feedback requires a submitted homework answer' USING ERRCODE='23514'; END IF;
  SELECT a.tutor_student_id INTO link_id FROM public.homework_assignments a JOIN public.homework_revisions hr ON hr.assignment_id=a.id WHERE hr.id=r.homework_revision_id;
  PERFORM private.require_link(link_id);
  SELECT * INTO h FROM public.homework_revisions WHERE id=r.homework_revision_id FOR UPDATE;
  IF h.submitted_at IS NULL OR h.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Review a submitted, not returned, revision' USING ERRCODE='23514'; END IF;
  IF NEW.response_revision_id<>(SELECT id FROM public.response_revisions WHERE response_id=r.id ORDER BY revision_no DESC LIMIT 1) THEN RAISE EXCEPTION 'Review the submitted answer version' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER live_feedback_guard BEFORE INSERT OR UPDATE ON public.live_feedback_comments FOR EACH ROW EXECUTE FUNCTION private.guard_feedback();
CREATE TRIGGER live_feedback_no_delete BEFORE DELETE ON public.live_feedback_comments FOR EACH ROW EXECUTE FUNCTION private.reject_change();
CREATE TRIGGER homework_feedback_guard BEFORE INSERT ON public.homework_feedback_comments FOR EACH ROW EXECUTE FUNCTION private.guard_feedback();
CREATE TRIGGER homework_feedback_immutable BEFORE UPDATE OR DELETE ON public.homework_feedback_comments FOR EACH ROW EXECUTE FUNCTION private.reject_change();
CREATE FUNCTION private.guard_release() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE sid uuid; version_id uuid;
BEGIN
 SELECT si.session_id,li.task_version_id INTO sid,version_id FROM public.session_items si JOIN public.lesson_items li ON li.id=si.lesson_item_id WHERE si.id=NEW.session_item_id;
 PERFORM private.lock_live_session(sid);
 IF version_id IS NULL THEN RAISE EXCEPTION 'Feedback release requires a task item' USING ERRCODE='23514'; END IF;
 NEW.released_at=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER feedback_release_guard BEFORE INSERT ON public.feedback_releases FOR EACH ROW EXECUTE FUNCTION private.guard_release();
CREATE TRIGGER feedback_release_immutable BEFORE UPDATE OR DELETE ON public.feedback_releases FOR EACH ROW EXECUTE FUNCTION private.reject_change();

CREATE FUNCTION public.retire_account(p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE u public.users%ROWTYPE;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found' USING ERRCODE='23503'; END IF;
 IF u.retired_at IS NOT NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.sessions s JOIN public.tutor_students l ON l.id=s.tutor_student_id WHERE s.state_code='active' AND p_user IN(l.tutor_id,l.student_id)) THEN RAISE EXCEPTION 'End active lessons before retiring an account' USING ERRCODE='23514'; END IF;
 DELETE FROM private.user_credentials WHERE user_id=p_user;
 UPDATE public.tutor_invitations SET revoked_at=clock_timestamp() WHERE tutor_id=p_user AND accepted_at IS NULL AND revoked_at IS NULL;
 UPDATE public.tutor_students SET ended_at=clock_timestamp() WHERE p_user IN(tutor_id,student_id) AND ended_at IS NULL;
 UPDATE public.users SET username='retired-'||id::text,display_name=NULL,timezone='UTC',retired_at=clock_timestamp(),auth_epoch=auth_epoch+1 WHERE id=p_user;
END $$;
COMMENT ON FUNCTION public.retire_account(uuid) IS 'Idempotent identity retirement, not free-text/backup erasure. Backend must invalidate session/socket auth using retired_at/auth_epoch.';
RESET ROLE;
