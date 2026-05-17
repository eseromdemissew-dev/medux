
-- Extend calls table for group + invite
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS host_id UUID,
  ALTER COLUMN callee_id DROP NOT NULL;

UPDATE public.calls SET host_id = initiator_id WHERE host_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_calls_invite_code ON public.calls(invite_code);

-- Generate unique 6-char invite codes (A-Z0-9, no 0/O/1/I confusion)
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code TEXT;
  exists_check INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, (random()*length(chars))::int + 1, 1);
    END LOOP;
    SELECT COUNT(*) INTO exists_check FROM public.calls WHERE invite_code = code;
    EXIT WHEN exists_check = 0;
  END LOOP;
  RETURN code;
END;
$$;

-- Participants table for group calls
CREATE TABLE IF NOT EXISTS public.call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  UNIQUE(call_id, user_id)
);

ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View participants of calls you're in"
ON public.call_participants FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.call_participants p2 WHERE p2.call_id = call_participants.call_id AND p2.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.calls c WHERE c.id = call_id AND (c.host_id = auth.uid() OR c.initiator_id = auth.uid()))
);

CREATE POLICY "Join calls as self"
ON public.call_participants FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Update own participation"
ON public.call_participants FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_call_participants_call ON public.call_participants(call_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_user ON public.call_participants(user_id);

-- Allow looking up calls by invite code (read-only, no PII beyond what's needed to join)
CREATE POLICY "Lookup calls by invite code"
ON public.calls FOR SELECT TO authenticated
USING (invite_code IS NOT NULL AND status IN ('ringing','active'));

-- Allow users to insert their own notifications + system fn
CREATE POLICY "Insert own notifications"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM public.calls c WHERE (c.id::text = (data->>'call_id')) AND (c.host_id = auth.uid() OR c.initiator_id = auth.uid())
));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;

-- Helpful: update updated_at on profiles
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_profiles_touch ON public.profiles;
CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
