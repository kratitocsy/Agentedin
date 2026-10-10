// Generated from Supabase. Regenerate after schema changes:
//   npx supabase gen types typescript --project-id cwhvagquaxllqdohcqbw > types/database.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];


export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      humans: {
        Row: { id: string; github_login: string | null; display_name: string | null; photo_url: string | null; email: string | null; whatsapp_e164: string | null; whatsapp_verified_at: string | null; created_at: string; consent_version: string | null; consented_at: string | null; onboarded_at: string | null };
        Insert: { id: string; github_login?: string | null; display_name?: string | null; photo_url?: string | null; email?: string | null; whatsapp_e164?: string | null; whatsapp_verified_at?: string | null; created_at?: string; consent_version?: string | null; consented_at?: string | null; onboarded_at?: string | null };
        Update: { id?: string; github_login?: string | null; display_name?: string | null; photo_url?: string | null; email?: string | null; whatsapp_e164?: string | null; whatsapp_verified_at?: string | null; created_at?: string; consent_version?: string | null; consented_at?: string | null; onboarded_at?: string | null };
        Relationships: [];
      };
      agents: {
        Row: { id: string; human_id: string; pet_name: string; avatar_seed: string; trust_level: number; created_at: string };
        Insert: { id?: string; human_id: string; pet_name: string; avatar_seed?: string; trust_level?: number; created_at?: string };
        Update: { id?: string; human_id?: string; pet_name?: string; avatar_seed?: string; trust_level?: number; created_at?: string };
        Relationships: [];
      };
      identities: {
        Row: { id: string; human_id: string; provider: string; external_id: string; handle: string | null; verified: boolean; created_at: string };
        Insert: { id?: string; human_id: string; provider: string; external_id: string; handle?: string | null; verified?: boolean; created_at?: string };
        Update: { id?: string; human_id?: string; provider?: string; external_id?: string; handle?: string | null; verified?: boolean; created_at?: string };
        Relationships: [];
      };
      evidence: {
        Row: { id: string; human_id: string; kind: string; title: string; summary: string | null; source: string; status: string; data: Json; created_at: string };
        Insert: { id?: string; human_id: string; kind: string; title: string; summary?: string | null; source: string; status: string; data?: Json; created_at?: string };
        Update: { id?: string; human_id?: string; kind?: string; title?: string; summary?: string | null; source?: string; status?: string; data?: Json; created_at?: string };
        Relationships: [];
      };
      consents: {
        Row: { id: string; human_id: string; kind: string; scope: Json; expires_at: string | null; granted_at: string; revoked_at: string | null };
        Insert: { id?: string; human_id: string; kind: string; scope?: Json; expires_at?: string | null; granted_at?: string; revoked_at?: string | null };
        Update: { id?: string; human_id?: string; kind?: string; scope?: Json; expires_at?: string | null; granted_at?: string; revoked_at?: string | null };
        Relationships: [];
      };
      audit_events: {
        Row: { id: number; actor: string; human_id: string | null; action: string; entity: string | null; entity_id: string | null; details: Json; created_at: string };
        Insert: { actor: string; human_id?: string | null; action: string; entity?: string | null; entity_id?: string | null; details?: Json; created_at?: string };
        Update: { actor?: string; human_id?: string | null; action?: string; entity?: string | null; entity_id?: string | null; details?: Json; created_at?: string };
        Relationships: [];
      };
      github_installations: {
        Row: { installation_id: number; human_id: string; account_login: string; created_at: string };
        Insert: { installation_id: number; human_id: string; account_login: string; created_at?: string };
        Update: { installation_id?: number; human_id?: string; account_login?: string; created_at?: string };
        Relationships: [];
      };
      whatsapp_challenges: {
        Row: { human_id: string; code: string; expires_at: string; created_at: string };
        Insert: { human_id: string; code: string; expires_at: string; created_at?: string };
        Update: { human_id?: string; code?: string; expires_at?: string; created_at?: string };
        Relationships: [];
      };
      agent_tokens: {
        Row: { id: string; human_id: string | null; company_id: string | null; name: string; token_hash: string; scopes: string[]; created_at: string; last_used_at: string | null; expires_at: string; revoked_at: string | null };
        Insert: { id?: string; human_id?: string | null; company_id?: string | null; name: string; token_hash: string; scopes: string[]; created_at?: string; last_used_at?: string | null; expires_at: string; revoked_at?: string | null };
        Update: { id?: string; human_id?: string | null; company_id?: string | null; name?: string; token_hash?: string; scopes?: string[]; created_at?: string; last_used_at?: string | null; expires_at?: string; revoked_at?: string | null };
        Relationships: [];
      };
      approvals: {
        Row: { id: string; human_id: string | null; company_id: string | null; thread_id: string | null; action: string; risk: string; summary: string; payload: Json; status: string; expires_at: string; decided_at: string | null; created_at: string };
        Insert: { id?: string; human_id?: string | null; company_id?: string | null; thread_id?: string | null; action: string; risk: string; summary: string; payload?: Json; status?: string; expires_at: string; decided_at?: string | null; created_at?: string };
        Update: { id?: string; human_id?: string | null; company_id?: string | null; thread_id?: string | null; action?: string; risk?: string; summary?: string; payload?: Json; status?: string; expires_at?: string; decided_at?: string | null; created_at?: string };
        Relationships: [];
      };
      companies: {
        Row: { id: string; name: string; domain: string; status: string; slack_team_id: string | null; created_at: string; approved_at: string | null };
        Insert: { id?: string; name: string; domain: string; status?: string; slack_team_id?: string | null; created_at?: string; approved_at?: string | null };
        Update: { id?: string; name?: string; domain?: string; status?: string; slack_team_id?: string | null; created_at?: string; approved_at?: string | null };
        Relationships: [];
      };
      company_members: {
        Row: { company_id: string; slack_user_id: string; email: string | null; created_at: string };
        Insert: { company_id: string; slack_user_id: string; email?: string | null; created_at?: string };
        Update: { company_id?: string; slack_user_id?: string; email?: string | null; created_at?: string };
        Relationships: [];
      };
      developer_private_limits: {
        Row: { human_id: string; min_ctc: number | null; notice_days: number | null };
        Insert: { human_id: string; min_ctc?: number | null; notice_days?: number | null };
        Update: { human_id?: string; min_ctc?: number | null; notice_days?: number | null };
        Relationships: [];
      };
      fit_checks: {
        Row: { match_id: string; result: string; checked_at: string };
        Insert: { match_id: string; result: string; checked_at?: string };
        Update: { match_id?: string; result?: string; checked_at?: string };
        Relationships: [];
      };
      hunts: {
        Row: { id: string; human_id: string; mode: string; role_types: string[]; places: string[]; daily_limit: number; blocked_domains: string[]; status: string; expires_at: string; created_at: string };
        Insert: { id?: string; human_id: string; mode?: string; role_types?: string[]; places?: string[]; daily_limit?: number; blocked_domains?: string[]; status?: string; expires_at: string; created_at?: string };
        Update: { id?: string; human_id?: string; mode?: string; role_types?: string[]; places?: string[]; daily_limit?: number; blocked_domains?: string[]; status?: string; expires_at?: string; created_at?: string };
        Relationships: [];
      };
      jobs: {
        Row: { id: number; kind: string; dedupe_key: string | null; payload: Json; run_at: string; status: string; attempts: number; locked_until: string | null; last_error: string | null; created_at: string; finished_at: string | null };
        Insert: { id?: number; kind: string; dedupe_key?: string | null; payload?: Json; run_at?: string; status?: string; attempts?: number; locked_until?: string | null; last_error?: string | null; created_at?: string; finished_at?: string | null };
        Update: { id?: number; kind?: string; dedupe_key?: string | null; payload?: Json; run_at?: string; status?: string; attempts?: number; locked_until?: string | null; last_error?: string | null; created_at?: string; finished_at?: string | null };
        Relationships: [];
      };
      matches: {
        Row: { id: string; role_id: string; human_id: string; score: number; reasons: Json; status: string; created_at: string };
        Insert: { id?: string; role_id: string; human_id: string; score: number; reasons?: Json; status?: string; created_at?: string };
        Update: { id?: string; role_id?: string; human_id?: string; score?: number; reasons?: Json; status?: string; created_at?: string };
        Relationships: [];
      };
      offers: {
        Row: { id: string; thread_id: string; package: Json; status: string; created_at: string; decided_at: string | null };
        Insert: { id?: string; thread_id: string; package: Json; status?: string; created_at?: string; decided_at?: string | null };
        Update: { id?: string; thread_id?: string; package?: Json; status?: string; created_at?: string; decided_at?: string | null };
        Relationships: [];
      };
      placements: {
        Row: { thread_id: string; company_id: string; human_id: string; joined_on: string | null; fee_inr: number | null; fee_status: string; created_at: string };
        Insert: { thread_id: string; company_id: string; human_id: string; joined_on?: string | null; fee_inr?: number | null; fee_status?: string; created_at?: string };
        Update: { thread_id?: string; company_id?: string; human_id?: string; joined_on?: string | null; fee_inr?: number | null; fee_status?: string; created_at?: string };
        Relationships: [];
      };
      role_private_limits: {
        Row: { role_id: string; budget_max_ctc: number };
        Insert: { role_id: string; budget_max_ctc: number };
        Update: { role_id?: string; budget_max_ctc?: number };
        Relationships: [];
      };
      roles: {
        Row: { id: string; company_id: string; title: string; description: string | null; skills: string[]; locations: string[]; remote: boolean; status: string; created_at: string; updated_at: string };
        Insert: { id?: string; company_id: string; title: string; description?: string | null; skills?: string[]; locations?: string[]; remote?: boolean; status?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; company_id?: string; title?: string; description?: string | null; skills?: string[]; locations?: string[]; remote?: boolean; status?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      thread_messages: {
        Row: { id: number; thread_id: string; sender: string; kind: string; body: Json; created_at: string };
        Insert: { id?: number; thread_id: string; sender: string; kind: string; body?: Json; created_at?: string };
        Update: { id?: number; thread_id?: string; sender?: string; kind?: string; body?: Json; created_at?: string };
        Relationships: [];
      };
      threads: {
        Row: { id: string; match_id: string; role_id: string; human_id: string; company_id: string; stage: string; created_at: string; updated_at: string };
        Insert: { id?: string; match_id: string; role_id: string; human_id: string; company_id: string; stage?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; match_id?: string; role_id?: string; human_id?: string; company_id?: string; stage?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      engine_fit_check: { Args: { p_match: string }; Returns: string };
      engine_create_match: { Args: { p_role: string; p_human: string; p_score: number; p_reasons: Json }; Returns: string };
      engine_share_match: { Args: { p_match: string }; Returns: string | null };
      engine_request_interview: { Args: { p_company: string; p_match: string }; Returns: string };
      engine_propose_offer: { Args: { p_company: string; p_thread: string; p_package: Json }; Returns: string };
      engine_expire_approvals: { Args: Record<string, never>; Returns: number };
      engine_expire_hunts: { Args: Record<string, never>; Returns: number };
      engine_decide_approval: { Args: { p_approval: string; p_human: string | null; p_company: string | null; p_approve: boolean }; Returns: Json };
      claim_jobs: { Args: { batch: number; lease_seconds?: number }; Returns: { id: number; kind: string; dedupe_key: string | null; payload: Json; run_at: string; status: string; attempts: number; locked_until: string | null; last_error: string | null; created_at: string; finished_at: string | null }[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
