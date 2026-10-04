
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'agent');
CREATE TYPE public.plan_type AS ENUM ('free', 'team', 'business');
CREATE TYPE public.item_type AS ENUM ('checkbox', 'text', 'number', 'dropdown');
CREATE TYPE public.run_status AS ENUM ('in_progress', 'completed');
CREATE TYPE public.template_status AS ENUM ('active', 'archived');

-- Organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  plan public.plan_type NOT NULL DEFAULT 'free',
  seats integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX ON public.org_members (user_id);

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE TABLE public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text,
  status public.template_status NOT NULL DEFAULT 'active',
  current_version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.templates (org_id);

CREATE TABLE public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version integer NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version)
);

CREATE TABLE public.template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.template_versions(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section text,
  position integer NOT NULL DEFAULT 0,
  type public.item_type NOT NULL DEFAULT 'checkbox',
  label text NOT NULL,
  help_text text,
  required boolean NOT NULL DEFAULT false,
  allow_note boolean NOT NULL DEFAULT false,
  allow_photo boolean NOT NULL DEFAULT false,
  options jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX ON public.template_items (version_id);

CREATE TABLE public.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.template_versions(id) ON DELETE CASCADE,
  reference text,
  status public.run_status NOT NULL DEFAULT 'in_progress',
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX ON public.runs (org_id, status);

CREATE TABLE public.run_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.template_items(id) ON DELETE CASCADE,
  value jsonb,
  note text,
  photo_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, item_id)
);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.audit_log (org_id, created_at DESC);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_answers TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.organizations, public.profiles, public.org_members, public.invitations,
  public.templates, public.template_versions, public.template_items, public.runs,
  public.run_answers, public.audit_log TO service_role;

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.org_members WHERE org_id = _org AND user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_org uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = _org AND user_id = auth.uid() AND role = ANY(_roles)
  );
$$;

-- RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read org" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id));
CREATE POLICY "admins update org" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['admin']::public.app_role[]));

CREATE POLICY "read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.org_members m1
    JOIN public.org_members m2 ON m1.org_id = m2.org_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = public.profiles.id
  ));
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "read org members" ON public.org_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_member(org_id));
CREATE POLICY "admins manage members" ON public.org_members FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['admin']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['admin']::public.app_role[]));

CREATE POLICY "admins manage invites" ON public.invitations FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['admin','manager']::public.app_role[]));

CREATE POLICY "members read templates" ON public.templates FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "managers write templates" ON public.templates FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['admin','manager']::public.app_role[]));

CREATE POLICY "members read versions" ON public.template_versions FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "managers write versions" ON public.template_versions FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['admin','manager']::public.app_role[]));

CREATE POLICY "members read items" ON public.template_items FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "managers write items" ON public.template_items FOR ALL TO authenticated
  USING (public.has_org_role(org_id, ARRAY['admin','manager']::public.app_role[]))
  WITH CHECK (public.has_org_role(org_id, ARRAY['admin','manager']::public.app_role[]));

CREATE POLICY "members read runs" ON public.runs FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "members write runs" ON public.runs FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND started_by = auth.uid());
CREATE POLICY "members update runs" ON public.runs FOR UPDATE TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "managers delete runs" ON public.runs FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, ARRAY['admin','manager']::public.app_role[]));

CREATE POLICY "members read answers" ON public.run_answers FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "members write answers" ON public.run_answers FOR ALL TO authenticated
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "members read audit" ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));
CREATE POLICY "members insert audit" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(org_id) AND actor_id = auth.uid());
