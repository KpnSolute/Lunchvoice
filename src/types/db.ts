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
          is_staff: boolean;
          mjcc_username: string | null;
        };
        Insert: { id: string };
        Update: { display_name?: string | null };
        Relationships: [];
      };
      dish_ratings: {
        Row: {
          student_id: string;
          dish_key: string;
          dish_name: string;
          category: string;
          rating: number;
          updated_at: string;
        };
        Insert: {
          dish_key: string;
          dish_name: string;
          category: string;
          rating: number;
          updated_at?: string;
        };
        Update: { rating?: number; updated_at?: string };
        Relationships: [];
      };
      voice_notes: {
        Row: { id: string; student_id: string; kind: string; body: string; created_at: string };
        Insert: { kind: string; body: string };
        Update: Record<string, never>;
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
      menu_cycles: {
        Row: {
          id: string;
          title: string;
          version_label: string | null;
          starts_on: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          version_label?: string | null;
          starts_on?: string | null;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: {
          title?: string;
          version_label?: string | null;
          starts_on?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
      menu_cycle_days: {
        Row: {
          id: string;
          cycle_id: string;
          day_number: number;
          weekday: string | null;
          breakfast: Json;
          lunch: Json;
          dinner: Json;
          notes: string | null;
          updated_at: string;
        };
        Insert: {
          cycle_id: string;
          day_number: number;
          weekday?: string | null;
          breakfast?: Json;
          lunch?: Json;
          dinner?: Json;
          notes?: string | null;
        };
        Update: {
          weekday?: string | null;
          breakfast?: Json;
          lunch?: Json;
          dinner?: Json;
          notes?: string | null;
        };
        Relationships: [];
      };
      survey_templates: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          audience: string;
          status: string;
          points_reward: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          description?: string | null;
          audience?: string;
          status?: string;
          points_reward?: number;
          created_by?: string | null;
        };
        Update: {
          title?: string;
          description?: string | null;
          audience?: string;
          status?: string;
          points_reward?: number;
        };
        Relationships: [];
      };
      survey_questions: {
        Row: {
          id: string;
          template_id: string;
          position: number;
          type: string;
          prompt: string;
          help_text: string | null;
          required: boolean;
          options: Json;
          scale_min: number;
          scale_max: number;
          category: string | null;
          created_at: string;
        };
        Insert: {
          template_id: string;
          position?: number;
          type: string;
          prompt: string;
          help_text?: string | null;
          required?: boolean;
          options?: Json;
          scale_min?: number;
          scale_max?: number;
          category?: string | null;
        };
        Update: {
          position?: number;
          type?: string;
          prompt?: string;
          help_text?: string | null;
          required?: boolean;
          options?: Json;
          scale_min?: number;
          scale_max?: number;
          category?: string | null;
        };
        Relationships: [];
      };
      survey_answers: {
        Row: {
          id: string;
          response_id: string;
          question_id: string;
          value: Json;
          text_value: string | null;
          numeric_value: number | null;
          option_values: string[] | null;
          created_at: string;
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
          menu_cycle_id: string | null;
          menu_day: number | null;
          opens_at: string | null;
          points_reward: number;
          template_id: string | null;
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
          template_id?: string | null;
          menu_cycle_id?: string | null;
        };
        Update: {
          is_active?: boolean;
          title?: string;
          description?: string | null;
          template_id?: string | null;
          menu_cycle_id?: string | null;
        };
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
      dish_rating_stats: {
        Row: {
          dish_key: string | null;
          dish_name: string | null;
          category: string | null;
          avg_rating: number | null;
          votes: number | null;
        };
        Relationships: [];
      };
      dish_stats: {
        Row: { avg_rating: number | null; dish_name: string | null; slot: string | null; votes: number | null };
        Relationships: [];
      };
      student_roster: {
        Row: {
          id: string;
          display_name: string | null;
          email: string | null;
          points: number;
          streak: number;
          created_at: string;
          responses: number;
          orders: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean };
      join_session: { Args: { p_code: string }; Returns: string };
      redeem_item: { Args: { p_item_id: string }; Returns: string };
      submit_response: {
        Args: { p_session_id: string; p_ratings: Json; p_feedback?: string; p_idea?: string; p_answers?: Json };
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
export type MenuCycle = Database["public"]["Tables"]["menu_cycles"]["Row"];
export type MenuCycleDay = Database["public"]["Tables"]["menu_cycle_days"]["Row"];
export type SurveyTemplate = Database["public"]["Tables"]["survey_templates"]["Row"];
export type SurveyQuestion = Database["public"]["Tables"]["survey_questions"]["Row"];
