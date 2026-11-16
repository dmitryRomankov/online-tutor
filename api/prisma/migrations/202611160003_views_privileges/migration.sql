SET ROLE tutor_owner;
CREATE VIEW public.latest_responses AS
SELECT r.id AS response_id,r.input_id,r.session_item_id,r.homework_revision_id,r.homework_item_id,
       rr.id AS response_revision_id,rr.revision_no,rr.text_value,rr.created_at AS saved_at,
       CASE WHEN i.kind_code='text' THEN coalesce(btrim(rr.text_value)<>'',false)
            ELSE EXISTS(SELECT 1 FROM public.response_choice_values cv WHERE cv.response_revision_id=rr.id) END AS is_answered
FROM public.responses r JOIN public.task_inputs i ON i.id=r.input_id
LEFT JOIN LATERAL(SELECT v.* FROM public.response_revisions v WHERE v.response_id=r.id ORDER BY v.revision_no DESC LIMIT 1) rr ON true;

CREATE VIEW public.live_task_progress AS
SELECT si.id AS session_item_id,count(i.id) FILTER(WHERE i.required) AS required_inputs,
 count(i.id) FILTER(WHERE i.required AND lr.is_answered) AS answered_inputs,
 round(100.0*count(i.id) FILTER(WHERE i.required AND lr.is_answered)/nullif(count(i.id) FILTER(WHERE i.required),0),2) AS answered_percent
FROM public.session_items si JOIN public.lesson_items li ON li.id=si.lesson_item_id
JOIN public.task_inputs i ON i.task_version_id=li.task_version_id
LEFT JOIN public.latest_responses lr ON lr.session_item_id=si.id AND lr.input_id=i.id
GROUP BY si.id;

CREATE VIEW public.session_summaries AS
SELECT s.id AS session_id,l.tutor_id,l.student_id,s.state_code,s.scheduled_start,
 s.scheduled_start+make_interval(mins=>s.duration_minutes) AS scheduled_end,
 s.started_at,s.ended_at,s.cancelled_at,s.planned_lesson_id,c.lesson_version_id,
 (SELECT count(*) FROM public.session_items si WHERE si.session_id=s.id) AS revealed_items
FROM public.sessions s JOIN public.tutor_students l ON l.id=s.tutor_student_id
LEFT JOIN public.session_content c ON c.session_id=s.id;

CREATE VIEW public.classroom_revealed_content AS
SELECT si.session_id,si.id AS session_item_id,li.id AS lesson_item_id,li.position,li.kind_code,
 li.text_content,li.asset_id,li.link_url,li.task_version_id,tv.title AS task_title,tv.prompt,tv.type_code,
 si.revealed_at,coalesce(ai.session_item_id=si.id,false) AND s.state_code='active' AS is_active
FROM public.session_items si JOIN public.sessions s ON s.id=si.session_id
JOIN public.lesson_items li ON li.id=si.lesson_item_id
LEFT JOIN public.task_versions tv ON tv.id=li.task_version_id
LEFT JOIN public.session_active_items ai ON ai.session_id=s.id
WHERE s.state_code IN ('active','ended');
COMMENT ON VIEW public.classroom_revealed_content IS 'No keys or hidden items. Backend must still filter/authorize session_id for its authenticated web user.';

CREATE VIEW private.response_evaluations AS
SELECT lr.response_id,lr.response_revision_id,lr.is_answered,
 CASE WHEN tv.type_code='written_response' THEN NULL
      WHEN NOT lr.is_answered THEN false
      WHEN i.kind_code='text' THEN EXISTS(SELECT 1 FROM private.task_text_keys k WHERE k.input_id=i.id AND lower(btrim(k.accepted_text))=lower(btrim(lr.text_value)))
      ELSE (SELECT count(*) FROM public.response_choice_values cv WHERE cv.response_revision_id=lr.response_revision_id)=(SELECT count(*) FROM private.task_choice_keys k WHERE k.input_id=i.id)
           AND NOT EXISTS(SELECT 1 FROM public.response_choice_values cv LEFT JOIN private.task_choice_keys k ON k.input_id=i.id AND k.choice_id=cv.choice_id
             WHERE cv.response_revision_id=lr.response_revision_id AND (k.choice_id IS NULL OR (i.kind_code='ordered_choices' AND k.expected_position<>cv.position)))
 END AS is_correct
FROM public.latest_responses lr JOIN public.task_inputs i ON i.id=lr.input_id JOIN public.task_versions tv ON tv.id=i.task_version_id;

CREATE VIEW public.released_live_results AS
SELECT lr.session_item_id,lr.response_id,lr.response_revision_id,e.is_answered,e.is_correct,fr.released_at
FROM public.latest_responses lr JOIN private.response_evaluations e ON e.response_id=lr.response_id
JOIN public.feedback_releases fr ON fr.session_item_id=lr.session_item_id;
CREATE VIEW public.released_live_comments AS
SELECT si.session_id,c.id AS comment_id,c.response_revision_id,c.comment,c.released_at
FROM public.live_feedback_comments c JOIN public.response_revisions rr ON rr.id=c.response_revision_id
JOIN public.responses r ON r.id=rr.response_id JOIN public.session_items si ON si.id=r.session_item_id
WHERE c.released_at IS NOT NULL;

CREATE VIEW public.homework_revision_status AS
SELECT hr.id AS homework_revision_id,hr.assignment_id,hr.revision_no,hr.submitted_at,hr.returned_at,
 CASE WHEN hr.submitted_at IS NULL THEN 'draft' WHEN hr.returned_at IS NOT NULL THEN 'returned'
 WHEN EXISTS(SELECT 1 FROM public.homework_items hi JOIN public.task_versions tv ON tv.id=hi.task_version_id
   JOIN public.task_inputs i ON i.task_version_id=tv.id AND i.required
   LEFT JOIN public.latest_responses lr ON lr.homework_revision_id=hr.id AND lr.homework_item_id=hi.id AND lr.input_id=i.id
   WHERE hi.assignment_id=hr.assignment_id AND tv.type_code='written_response'
    AND NOT EXISTS(SELECT 1 FROM public.homework_feedback_comments f WHERE f.response_revision_id=lr.response_revision_id)) THEN 'awaiting_review'
 ELSE 'reviewed' END AS status,
 coalesce(hr.submitted_at>a.due_at,false) AS submitted_late,
 coalesce(hr.submitted_at IS NULL AND a.due_at<now(),false) AS overdue
FROM public.homework_revisions hr JOIN public.homework_assignments a ON a.id=hr.assignment_id;

CREATE VIEW public.unread_lesson_notifications AS
SELECT n.session_id,l.student_id AS recipient_id,s.created_at,s.scheduled_start,s.state_code
FROM public.lesson_notifications n JOIN public.sessions s ON s.id=n.session_id
JOIN public.tutor_students l ON l.id=s.tutor_student_id WHERE n.read_at IS NULL;

-- Reporting excludes raw names, tokens, credentials, answers, comments, chat and asset locations.
CREATE VIEW reporting.account_activity AS
SELECT 'account-'||md5(u.id::text) AS masked_account,u.role_code,u.retired_at IS NOT NULL AS retired,
 (SELECT count(*) FROM public.sessions s JOIN public.tutor_students l ON l.id=s.tutor_student_id WHERE u.id IN(l.tutor_id,l.student_id) AND s.state_code='ended') AS completed_sessions,
 (SELECT count(*) FROM public.homework_revisions hr JOIN public.homework_assignments a ON a.id=hr.assignment_id JOIN public.tutor_students l ON l.id=a.tutor_student_id WHERE u.id IN(l.tutor_id,l.student_id) AND hr.submitted_at IS NOT NULL) AS submitted_homework
FROM public.users u;
CREATE VIEW reporting.session_counts AS SELECT state_code,count(*) AS session_count FROM public.sessions GROUP BY state_code;
COMMENT ON VIEW reporting.account_activity IS 'Stable pseudonymous labels, not irreversible anonymization. No base-table access is granted to reporter.';

CREATE FUNCTION private.validate_submission_complete() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.homework_items hi JOIN public.task_inputs i ON i.task_version_id=hi.task_version_id AND i.required
  LEFT JOIN public.latest_responses lr ON lr.homework_revision_id=NEW.id AND lr.homework_item_id=hi.id AND lr.input_id=i.id
  WHERE hi.assignment_id=NEW.assignment_id AND NOT coalesce(lr.is_answered,false)) THEN
   RAISE EXCEPTION 'Complete required homework inputs before submission' USING ERRCODE='23514', CONSTRAINT='homework_required_answers';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER homework_submission_complete AFTER UPDATE ON public.homework_revisions
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL)
EXECUTE FUNCTION private.validate_submission_complete();

GRANT USAGE ON SCHEMA public,private TO tutor_app;
GRANT USAGE ON SCHEMA reporting TO tutor_reporter;
-- Grant only owner-managed application relations, excluding Prisma migration metadata.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','v') AND c.relowner='tutor_owner'::regrole LOOP
  EXECUTE format('GRANT SELECT ON %I.%I TO tutor_app',r.nspname,r.relname);
 END LOOP;
END $$;
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO tutor_reporter;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO tutor_app;
GRANT EXECUTE ON FUNCTION public.start_session(uuid), public.end_session(uuid), public.retire_account(uuid) TO tutor_app;

GRANT INSERT ON public.users, private.user_credentials, public.tutor_students, public.tutor_invitations,
 public.assets,public.tasks,public.task_versions,public.task_inputs,public.task_choices,public.task_input_choices,
 private.task_text_keys,private.task_choice_keys,public.lessons,public.lesson_versions,public.lesson_items,
 public.sessions,public.session_items,public.session_active_items,public.chat_messages,public.feedback_releases,
 public.homework_assignments,public.homework_items,public.homework_revisions,public.responses,public.response_revisions,
 public.response_choice_values,public.live_feedback_comments,public.homework_feedback_comments TO tutor_app;
GRANT UPDATE(username,display_name,timezone) ON public.users TO tutor_app;
GRANT UPDATE(password_hash) ON private.user_credentials TO tutor_app;
GRANT UPDATE(ended_at) ON public.tutor_students TO tutor_app;
GRANT UPDATE(revoked_at,accepted_student_id,accepted_at) ON public.tutor_invitations TO tutor_app;
GRANT UPDATE(archived_at) ON public.tasks,public.lessons TO tutor_app;
GRANT UPDATE(title,prompt,image_asset_id,published_at) ON public.task_versions TO tutor_app;
GRANT UPDATE(position,kind_code,label,required,marker_x,marker_y) ON public.task_inputs TO tutor_app;
GRANT UPDATE(position,label) ON public.task_choices TO tutor_app;
GRANT UPDATE(accepted_text) ON private.task_text_keys TO tutor_app;
GRANT UPDATE(expected_position) ON private.task_choice_keys TO tutor_app;
GRANT UPDATE(title,published_at) ON public.lesson_versions TO tutor_app;
GRANT UPDATE(position,kind_code,text_content,asset_id,link_url,task_version_id) ON public.lesson_items TO tutor_app;
GRANT UPDATE(planned_lesson_id,scheduled_start,duration_minutes,state_code,started_at,ended_at,cancelled_at) ON public.sessions TO tutor_app;
GRANT UPDATE(session_item_id) ON public.session_active_items TO tutor_app;
GRANT UPDATE(title,due_at) ON public.homework_assignments TO tutor_app;
GRANT UPDATE(position,task_version_id) ON public.homework_items TO tutor_app;
GRANT UPDATE(submitted_at,returned_at,return_note) ON public.homework_revisions TO tutor_app;
GRANT UPDATE(comment,released_at) ON public.live_feedback_comments TO tutor_app;
GRANT UPDATE(read_at) ON public.lesson_notifications TO tutor_app;
-- Only draft-owned child deletion is exposed; guard triggers reject published content.
GRANT DELETE ON public.task_versions,public.task_inputs,public.task_choices,public.task_input_choices,
 private.task_text_keys,private.task_choice_keys,public.lesson_versions,public.lesson_items,public.homework_items,
 public.session_active_items TO tutor_app;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public,private FROM PUBLIC;
RESET ROLE;
