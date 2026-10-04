
-- Seed demo templates for a new organization
CREATE OR REPLACE FUNCTION public.seed_demo_templates(_org uuid, _user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_id uuid; v_id uuid;
BEGIN
  -- Kundonboarding
  INSERT INTO public.templates (org_id, title, description, category, created_by)
  VALUES (_org, 'Kundonboarding', 'Steg för att välkomna en ny kund.', 'Onboarding', _user)
  RETURNING id INTO t_id;
  INSERT INTO public.template_versions (template_id, org_id, version, created_by)
  VALUES (t_id, _org, 1, _user) RETURNING id INTO v_id;
  INSERT INTO public.template_items (version_id, org_id, section, position, type, label, required, allow_note, options) VALUES
    (v_id, _org, 'Förberedelse', 0, 'text', 'Kundens namn', true, false, '[]'),
    (v_id, _org, 'Förberedelse', 1, 'text', 'Kontaktperson och e-post', true, false, '[]'),
    (v_id, _org, 'Förberedelse', 2, 'dropdown', 'Kundsegment', true, false, '["Små företag","Mellanstort","Enterprise"]'),
    (v_id, _org, 'Uppstart', 3, 'checkbox', 'Välkomstmail skickat', true, true, '[]'),
    (v_id, _org, 'Uppstart', 4, 'checkbox', 'Konto skapat i systemet', true, false, '[]'),
    (v_id, _org, 'Uppstart', 5, 'checkbox', 'Uppstartsmöte bokat', false, true, '[]'),
    (v_id, _org, 'Uppföljning', 6, 'number', 'Antal användare som utbildats', false, false, '[]'),
    (v_id, _org, 'Uppföljning', 7, 'checkbox', 'Uppföljning bokad om 30 dagar', false, true, '[]');

  -- Klagomålshantering
  INSERT INTO public.templates (org_id, title, description, category, created_by)
  VALUES (_org, 'Klagomålshantering', 'Hantera ett kundklagomål på ett enhetligt sätt.', 'Kundservice', _user)
  RETURNING id INTO t_id;
  INSERT INTO public.template_versions (template_id, org_id, version, created_by)
  VALUES (t_id, _org, 1, _user) RETURNING id INTO v_id;
  INSERT INTO public.template_items (version_id, org_id, section, position, type, label, required, allow_note, allow_photo, options) VALUES
    (v_id, _org, 'Registrering', 0, 'text', 'Ärendenummer', true, false, false, '[]'),
    (v_id, _org, 'Registrering', 1, 'dropdown', 'Typ av klagomål', true, false, false, '["Leverans","Produkt","Fakturering","Bemötande","Övrigt"]'),
    (v_id, _org, 'Registrering', 2, 'checkbox', 'Klagomålet dokumenterat i ärendet', true, true, true, '[]'),
    (v_id, _org, 'Utredning', 3, 'checkbox', 'Kontakt tagen med kunden inom 24 timmar', true, true, false, '[]'),
    (v_id, _org, 'Utredning', 4, 'text', 'Orsak till problemet', true, false, false, '[]'),
    (v_id, _org, 'Åtgärd', 5, 'dropdown', 'Beslutad åtgärd', true, false, false, '["Återbetalning","Ersättningsprodukt","Rabatt","Ingen åtgärd"]'),
    (v_id, _org, 'Åtgärd', 6, 'checkbox', 'Kunden informerad om beslutet', true, true, false, '[]'),
    (v_id, _org, 'Avslut', 7, 'number', 'Nöjdhet efter hantering (1-5)', false, false, false, '[]');
END;
$$;

-- Create organization for the current user and make them admin
CREATE OR REPLACE FUNCTION public.create_organization(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org uuid;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.organizations (name) VALUES (coalesce(nullif(trim(p_name), ''), 'Min organisation'))
  RETURNING id INTO new_org;

  INSERT INTO public.profiles (id, email)
  VALUES (uid, (SELECT email FROM auth.users WHERE id = uid))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.org_members (org_id, user_id, role) VALUES (new_org, uid, 'admin');

  PERFORM public.seed_demo_templates(new_org, uid);

  INSERT INTO public.audit_log (org_id, actor_id, action, entity, entity_id)
  VALUES (new_org, uid, 'organization.created', 'organization', new_org);

  RETURN new_org;
END;
$$;

-- Ensure a profile row exists for the signed-in user
CREATE OR REPLACE FUNCTION public.ensure_profile(p_full_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (uid, (SELECT email FROM auth.users WHERE id = uid), p_full_name)
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
END;
$$;

-- Accept any pending invitations matching the signed-in user's email
CREATE OR REPLACE FUNCTION public.accept_pending_invitations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  user_email text;
  inv record;
  joined integer := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT email INTO user_email FROM auth.users WHERE id = uid;

  FOR inv IN SELECT * FROM public.invitations
    WHERE lower(email) = lower(user_email) AND status = 'pending'
  LOOP
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (inv.org_id, uid, inv.role)
    ON CONFLICT (org_id, user_id) DO NOTHING;
    UPDATE public.invitations SET status = 'accepted' WHERE id = inv.id;
    INSERT INTO public.audit_log (org_id, actor_id, action, entity, entity_id)
    VALUES (inv.org_id, uid, 'member.joined', 'org_member', uid);
    joined := joined + 1;
  END LOOP;
  RETURN joined;
END;
$$;

-- Create a new template version by cloning the current one
CREATE OR REPLACE FUNCTION public.clone_template_version(p_template_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  t record;
  src uuid;
  new_v uuid;
  next_version integer;
BEGIN
  SELECT * INTO t FROM public.templates WHERE id = p_template_id;
  IF t IS NULL THEN RAISE EXCEPTION 'Template not found'; END IF;
  IF NOT public.has_org_role(t.org_id, ARRAY['admin','manager']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT id INTO src FROM public.template_versions
    WHERE template_id = p_template_id ORDER BY version DESC LIMIT 1;
  next_version := t.current_version + 1;

  INSERT INTO public.template_versions (template_id, org_id, version, created_by)
  VALUES (p_template_id, t.org_id, next_version, uid) RETURNING id INTO new_v;

  INSERT INTO public.template_items (version_id, org_id, section, position, type, label, help_text, required, allow_note, allow_photo, options)
  SELECT new_v, org_id, section, position, type, label, help_text, required, allow_note, allow_photo, options
  FROM public.template_items WHERE version_id = src;

  UPDATE public.templates SET current_version = next_version, updated_at = now() WHERE id = p_template_id;
  RETURN new_v;
END;
$$;
