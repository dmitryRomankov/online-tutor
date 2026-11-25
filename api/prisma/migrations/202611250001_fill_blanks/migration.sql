SET ROLE tutor_owner;

-- Legacy fill-in-the-blanks versions have input labels but no continuous passage.
ALTER TABLE public.task_versions ADD COLUMN passage text;
ALTER TABLE public.task_versions ADD CONSTRAINT task_versions_passage_check
  CHECK (passage IS NULL OR (type_code = 'fill_blanks' AND btrim(passage) <> ''));
GRANT UPDATE(passage) ON public.task_versions TO tutor_app;

-- Match the authoring form's String.trim() whitespace set.
CREATE FUNCTION private.trim_answer(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog
RETURN btrim(value, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
REVOKE ALL ON FUNCTION private.trim_answer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.trim_answer(text) TO tutor_app, tutor_reporter;

CREATE OR REPLACE VIEW public.latest_responses AS
SELECT r.id AS response_id,r.input_id,r.session_item_id,r.homework_revision_id,r.homework_item_id,
       rr.id AS response_revision_id,rr.revision_no,rr.text_value,rr.created_at AS saved_at,
       CASE WHEN i.kind_code='text' THEN coalesce(private.trim_answer(rr.text_value)<>'',false)
            ELSE EXISTS(SELECT 1 FROM public.response_choice_values cv WHERE cv.response_revision_id=rr.id) END AS is_answered
FROM public.responses r JOIN public.task_inputs i ON i.id=r.input_id
LEFT JOIN LATERAL(SELECT v.* FROM public.response_revisions v WHERE v.response_id=r.id ORDER BY v.revision_no DESC LIMIT 1) rr ON true;

CREATE OR REPLACE VIEW private.response_evaluations AS
SELECT lr.response_id,lr.response_revision_id,lr.is_answered,
 CASE WHEN tv.type_code='written_response' THEN NULL
      WHEN NOT lr.is_answered THEN false
      WHEN i.kind_code='text' THEN EXISTS(SELECT 1 FROM private.task_text_keys k WHERE k.input_id=i.id AND lower(private.trim_answer(k.accepted_text))=lower(private.trim_answer(lr.text_value)))
      ELSE (SELECT count(*) FROM public.response_choice_values cv WHERE cv.response_revision_id=lr.response_revision_id)=(SELECT count(*) FROM private.task_choice_keys k WHERE k.input_id=i.id)
           AND NOT EXISTS(SELECT 1 FROM public.response_choice_values cv LEFT JOIN private.task_choice_keys k ON k.input_id=i.id AND k.choice_id=cv.choice_id
             WHERE cv.response_revision_id=lr.response_revision_id AND (k.choice_id IS NULL OR (i.kind_code='ordered_choices' AND k.expected_position<>cv.position)))
 END AS is_correct
FROM public.latest_responses lr JOIN public.task_inputs i ON i.id=lr.input_id JOIN public.task_versions tv ON tv.id=i.task_version_id;

RESET ROLE;
