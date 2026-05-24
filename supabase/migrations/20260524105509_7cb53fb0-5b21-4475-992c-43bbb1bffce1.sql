CREATE TABLE public.call_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (call_id, user_id)
);

CREATE INDEX idx_cjr_call_status ON public.call_join_requests(call_id, status);

ALTER TABLE public.call_join_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Request to join as self"
  ON public.call_join_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Requester or host can view"
  ON public.call_join_requests FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_id
        AND (c.host_id = auth.uid() OR c.initiator_id = auth.uid())
    )
  );

CREATE POLICY "Host decides on requests"
  ON public.call_join_requests FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.calls c
      WHERE c.id = call_id
        AND (c.host_id = auth.uid() OR c.initiator_id = auth.uid())
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.call_join_requests;