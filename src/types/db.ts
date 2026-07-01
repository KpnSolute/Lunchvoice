export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      orders: {
        Row: {
          created_at: string;
          id: string;
          item_name: string;
          status: string;
          store_item_id: string | null;
          student_id: string;
          token_cost: number;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: { status?: string; updated_at?: string };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          last_survey_date: string | null;
          points: number;
          role: string;
          streak: number;
        };
        Insert: { id: string };
        Update: { display_name?: string | null };
        Relationships: [];
      };
      response_ratings: {
        Row: { dish_name: string; id: string; rating: number; response_id: string; slot: string };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      responses: {
        Row: {
          feedback: string | null;
          id: string;
          idea: string | null;
          menu_day: number | null;
          points_awarded: number;
          session_id: string;
          student_id: string;
          submitted_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      session_members: {
        Row: { joined_at: string; session_id: string; student_id: string };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      sessions: {
        Row: {
          closes_at: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          join_code: string;
          menu_day: number | null;
          opens_at: string | null;
          points_reward: number;
          title: string;
        };
        Insert: {
          title: string;
          join_code: string;
          description?: string | null;
          menu_day?: number | null;
          points_reward?: number;
          is_active?: boolean;
          opens_at?: string | null;
          closes_at?: string | null;
          created_by?: string | null;
        };
        Update: { is_active?: boolean; title?: string; description?: string | null };
        Relationships: [];
      };
      store_items: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_active: boolean;
          name: string;
          stock: number | null;
          token_cost: number;
        };
        Insert: {
          name: string;
          token_cost: number;
          description?: string | null;
          image_url?: string | null;
          stock?: number | null;
          is_active?: boolean;
        };
        Update: {
          name?: string;
          token_cost?: number;
          description?: string | null;
          stock?: number | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
    };
    Views: {
      dish_stats: {
        Row: { avg_rating: number | null; dish_name: string | null; slot: string | null; votes: number | null };
        Relationships: [];
      };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      join_session: { Args: { p_code: string }; Returns: string };
      redeem_item: { Args: { p_item_id: string }; Returns: string };
      submit_response: {
        Args: { p_session_id: string; p_ratings: Json; p_feedback?: string; p_idea?: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Session = Database["public"]["Tables"]["sessions"]["Row"];
export type StoreItem = Database["public"]["Tables"]["store_items"]["Row"];
export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type DishStat = Database["public"]["Views"]["dish_stats"]["Row"];
