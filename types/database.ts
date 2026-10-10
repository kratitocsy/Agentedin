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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
